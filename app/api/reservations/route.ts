import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calculateBookingPrice } from '@/lib/pricing'
import { checkConflict, calculateCheckOut } from '@/lib/conflict'
import { requireAuth } from '@/lib/auth'
import type { UnitType } from '@/lib/types'

// GET /api/reservations?hotelId=X&from=ISO&to=ISO
// Returns bookings for the timeline view
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)

        const hotelId = searchParams.get('hotelId')
        const from = searchParams.get('from')
        const to = searchParams.get('to')

        if (!hotelId) {
            return NextResponse.json(
                { error: 'hotelId is required' },
                { status: 400 }
            )
        }

        // Default: today to +7 days (uses simulated time in dev)
        const { getDevNow } = await import('@/lib/dev-time')
        const now = getDevNow()
        const fromDate = from
            ? new Date(from)
            : now
        const toDate = to
            ? new Date(to)
            : new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)

        // Fetch all active bookings in the date range
        // Include CHECKED_IN for multi-day stays that extend into future dates
        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*, guests(id, name, phone, aadhar_number, aadhar_url_front, aadhar_url_back), unit:units(unit_number, type, base_price, hotel_id)')
            .in('status', ['PENDING', 'CONFIRMED', 'CHECKED_IN'])
            .lt('check_in', toDate.toISOString())
            .gt('check_out', fromDate.toISOString())
            .order('check_in', { ascending: true })

        if (error) {
            console.error('Reservation fetch error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch reservations' },
                { status: 500 }
            )
        }

        // Filter by hotel_id (through the unit join)
        const filtered = (bookings ?? []).filter(
            (b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.hotel_id === hotelId
        )

        return NextResponse.json({ bookings: filtered })
    } catch (err) {
        console.error('Reservations GET error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}

// POST /api/reservations — Create a pre-booking
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()

        const {
            unitId,
            unitIds,
            checkIn,
            numberOfDays,
            guests,
            expectedArrival,
            advanceAmount,
            advancePaid,
            grandTotalOverride,
            notes,
        } = body

        const days = Math.max(1, Math.floor(Number(numberOfDays) || 1))

        // Basic validation
        if (!checkIn || !guests || !Array.isArray(guests) || guests.length === 0) {
            return NextResponse.json(
                { error: 'checkIn and at least one guest are required' },
                { status: 400 }
            )
        }

        // Validate guests
        for (const guest of guests) {
            if (!guest.name || !guest.phone) {
                return NextResponse.json(
                    { error: 'Each guest must have a name and phone number' },
                    { status: 400 }
                )
            }
            const phoneDigits = guest.phone.replace(/\D/g, '')
            if (phoneDigits.length !== 10) {
                return NextResponse.json(
                    { error: `Guest ${guest.name || 'Unnamed'}'s phone number must be exactly 10 digits` },
                    { status: 400 }
                )
            }
        }

        // Look up staff ID for booking attribution
        const { data: staffProfile } = await supabase
            .from('staff')
            .select('id')
            .eq('user_id', auth.userId)
            .single()

        const isDormBulk = Array.isArray(unitIds) && unitIds.length > 0

        if (isDormBulk) {
            // ============================
            // DORM BULK BOOKING FLOW
            // ============================
            if (unitIds.length !== guests.length) {
                return NextResponse.json(
                    { error: `Number of dorm beds (${unitIds.length}) must match number of guests (${guests.length})` },
                    { status: 400 }
                )
            }

            // Fetch all selected units
            const { data: dormUnits, error: unitsError } = await supabase
                .from('units')
                .select('*')
                .in('id', unitIds)

            if (unitsError || !dormUnits || dormUnits.length !== unitIds.length) {
                return NextResponse.json(
                    { error: 'One or more dorm beds not found' },
                    { status: 404 }
                )
            }

            // Verify all are DORM type
            const nonDorm = dormUnits.find((u: { type: string }) => u.type !== 'DORM')
            if (nonDorm) {
                return NextResponse.json(
                    { error: `Unit ${(nonDorm as { unit_number: string }).unit_number} is not a dorm bed` },
                    { status: 400 }
                )
            }

            // Order units to match unitIds order (for sequential guest assignment)
            const orderedUnits = unitIds.map((id: string) =>
                dormUnits.find((u: { id: string }) => u.id === id)!
            )

            const checkInDate = new Date(checkIn)
            const checkOutDate = calculateCheckOut('DORM', checkInDate, days)

            // Check conflicts for ALL beds before creating any bookings
            for (const unit of orderedUnits) {
                const conflict = await checkConflict({
                    unitId: unit.id,
                    checkIn: checkInDate,
                    checkOut: checkOutDate,
                })
                if (conflict.hasConflict) {
                    return NextResponse.json(
                        {
                            error: `Booking conflict: Dorm bed ${unit.unit_number} is already booked for this period`,
                            conflicts: conflict.conflictingBookings,
                        },
                        { status: 409 }
                    )
                }
            }

            // Generate shared group ID
            const groupId = crypto.randomUUID()
            const createdBookings: { id: string; unit_id: string; grand_total: number }[] = []

            // Create one booking per bed with one guest each
            for (let i = 0; i < orderedUnits.length; i++) {
                const unit = orderedUnits[i]
                const guest = guests[i]

                const perDayBase = Number(unit.base_price)
                const totalBase = perDayBase * days
                const pricing = calculateBookingPrice('DORM', totalBase, 1)

                const isFirstBooking = i === 0

                const { data: booking, error: bookingError } = await supabase
                    .from('bookings')
                    .insert({
                        unit_id: unit.id,
                        check_in: checkInDate.toISOString(),
                        check_out: checkOutDate.toISOString(),
                        guest_count: 1,
                        base_amount: pricing.baseAmount,
                        surcharge: 0,
                        grand_total: pricing.grandTotal,
                        status: 'CONFIRMED',
                        expected_arrival: expectedArrival || null,
                        advance_amount: isFirstBooking ? (Number(advanceAmount) || 0) : 0,
                        advance_type: isFirstBooking ? (advancePaid || null) : null,
                        notes: isFirstBooking ? (notes || null) : null,
                        group_id: groupId,
                        created_by: staffProfile?.id || null,
                    })
                    .select()
                    .single()

                if (bookingError) {
                    console.error('Dorm booking insert error:', bookingError)
                    // Rollback: delete any bookings created so far
                    for (const b of createdBookings) {
                        await supabase.from('guests').delete().eq('booking_id', b.id)
                        await supabase.from('bookings').delete().eq('id', b.id)
                    }
                    return NextResponse.json(
                        { error: 'Failed to create dorm reservation' },
                        { status: 500 }
                    )
                }

                // Insert guest for this bed
                const { error: guestError } = await supabase
                    .from('guests')
                    .insert({
                        booking_id: booking.id,
                        name: guest.name,
                        phone: guest.phone,
                        aadhar_number: guest.aadhar_number || null,
                        aadhar_url_front: guest.aadhar_url_front || null,
                        aadhar_url_back: guest.aadhar_url_back || null,
                    })

                if (guestError) {
                    console.error('Guest insert error for dorm:', guestError)
                    // Rollback
                    await supabase.from('bookings').delete().eq('id', booking.id)
                    for (const b of createdBookings) {
                        await supabase.from('guests').delete().eq('booking_id', b.id)
                        await supabase.from('bookings').delete().eq('id', b.id)
                    }
                    return NextResponse.json(
                        { error: 'Failed to save guest details for dorm booking' },
                        { status: 500 }
                    )
                }

                createdBookings.push(booking)
            }

            const totalGrand = createdBookings.reduce((sum, b) => sum + Number(b.grand_total), 0)

            return NextResponse.json({
                success: true,
                groupId,
                bookingCount: createdBookings.length,
                totalGrandTotal: totalGrand,
                bookings: createdBookings,
            })
        } else {
            // ============================
            // REGULAR ROOM BOOKING FLOW
            // ============================
            if (!unitId) {
                return NextResponse.json(
                    { error: 'unitId is required for room bookings' },
                    { status: 400 }
                )
            }

            // Fetch unit to determine type and pricing
            const { data: unit, error: unitError } = await supabase
                .from('units')
                .select('*')
                .eq('id', unitId)
                .single()

            if (unitError || !unit) {
                return NextResponse.json(
                    { error: 'Unit not found' },
                    { status: 404 }
                )
            }

            // Calculate check-out based on unit type and number of days (uses IST internally)
            const checkInDate = new Date(checkIn)
            const checkOutDate = calculateCheckOut(unit.type as UnitType, checkInDate, days)

            // Run conflict check
            const conflict = await checkConflict({
                unitId,
                checkIn: checkInDate,
                checkOut: checkOutDate,
            })

            if (conflict.hasConflict) {
                return NextResponse.json(
                    {
                        error: `Booking conflict: ${unit.unit_number} is already booked for this period`,
                        conflicts: conflict.conflictingBookings,
                    },
                    { status: 409 }
                )
            }

            // Calculate pricing — multi-day: base_price × days
            const perDayBase = Number(unit.base_price)
            const totalBase = perDayBase * days
            const pricing = calculateBookingPrice(
                unit.type as UnitType,
                totalBase,
                guests.length
            )

            const finalGrandTotal =
                grandTotalOverride != null
                    ? Number(grandTotalOverride)
                    : pricing.grandTotal

            // Create the booking with CONFIRMED status
            const { data: booking, error: bookingError } = await supabase
                .from('bookings')
                .insert({
                    unit_id: unitId,
                    check_in: checkInDate.toISOString(),
                    check_out: checkOutDate.toISOString(),
                    guest_count: guests.length,
                    base_amount: pricing.baseAmount,
                    surcharge: pricing.surcharge,
                    grand_total: finalGrandTotal,
                    status: 'CONFIRMED',
                    expected_arrival: expectedArrival || null,
                    advance_amount: Number(advanceAmount) || 0,
                    advance_type: advancePaid || null,
                    notes: notes || null,
                    created_by: staffProfile?.id || null,
                })
                .select()
                .single()

            if (bookingError) {
                console.error('Reservation insert error:', bookingError)
                return NextResponse.json(
                    { error: 'Failed to create reservation' },
                    { status: 500 }
                )
            }

            // Insert guests
            const guestRecords = guests.map((g: { name: string; phone: string; aadhar_number?: string; aadhar_url_front?: string; aadhar_url_back?: string }) => ({
                booking_id: booking.id,
                name: g.name,
                phone: g.phone,
                aadhar_number: g.aadhar_number || null,
                aadhar_url_front: g.aadhar_url_front || null,
                aadhar_url_back: g.aadhar_url_back || null,
            }))

            const { error: guestsError } = await supabase
                .from('guests')
                .insert(guestRecords)

            if (guestsError) {
                console.error('Guests insert error:', guestsError)
                await supabase.from('bookings').delete().eq('id', booking.id)
                return NextResponse.json(
                    { error: 'Failed to save guest details' },
                    { status: 500 }
                )
            }

            return NextResponse.json({
                success: true,
                booking: {
                    ...booking,
                    pricing: {
                        baseAmount: pricing.baseAmount,
                        extraHeads: pricing.extraHeads,
                        surcharge: pricing.surcharge,
                        grandTotal: finalGrandTotal,
                    },
                },
            })
        }
    } catch (err) {
        console.error('Reservation POST error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
