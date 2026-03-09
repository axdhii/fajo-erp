import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calculateBookingPrice } from '@/lib/pricing'
import { checkConflict, calculateCheckOut } from '@/lib/conflict'
import { getDevNow } from '@/lib/dev-time'
import type { UnitType } from '@/lib/types'

// GET /api/reservations?hotelId=X&from=ISO&to=ISO
// Returns bookings for the timeline view
export async function GET(request: NextRequest) {
    try {
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
            .select('*, guests(name, phone, aadhar_url), unit:units(unit_number, type, base_price, hotel_id)')
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
            (b: any) => b.unit?.hotel_id === hotelId
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
        const supabase = await createClient()
        const body = await request.json()

        const {
            unitId,
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

        if (!unitId || !checkIn || !guests || !Array.isArray(guests) || guests.length === 0) {
            return NextResponse.json(
                { error: 'unitId, checkIn, and at least one guest are required' },
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

        // Calculate check-out based on unit type and number of days
        const checkInDate = new Date(checkIn)
        const checkOutDate = calculateCheckOut(unit.type as UnitType, checkInDate)
        if (days > 1) {
            checkOutDate.setDate(checkOutDate.getDate() + (days - 1))
        }

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
        const guestRecords = guests.map((g: any) => ({
            booking_id: booking.id,
            name: g.name,
            phone: g.phone,
            aadhar_number: g.aadhar_number || null,
            aadhar_url: g.aadhar_url || null,
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
    } catch (err) {
        console.error('Reservation POST error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
