import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calculateBookingPrice } from '@/lib/pricing'
import { checkConflict, calculateCheckOut } from '@/lib/conflict'
import { getDevNow } from '@/lib/dev-time'
import type { UnitType } from '@/lib/types'

// POST /api/bookings — Walk-in Check-in (with conflict check)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { unitId, guests, grandTotalOverride, amountCash, amountDigital, numberOfDays, checkOutOverride, payLater, bypassConflict } = body

        if (!unitId || !guests || !Array.isArray(guests) || guests.length === 0) {
            return NextResponse.json(
                { error: 'unitId and at least one guest are required' },
                { status: 400 }
            )
        }

        // Validate payment amounts are provided
        const cashAmount = Number(amountCash) || 0
        const digitalAmount = Number(amountDigital) || 0
        const days = Math.max(1, Math.floor(Number(numberOfDays) || 1))

        // Validate each guest has name and phone
        for (const guest of guests) {
            if (!guest.name || !guest.phone) {
                return NextResponse.json(
                    { error: 'Each guest must have a name and phone number' },
                    { status: 400 }
                )
            }
        }

        // Fetch the unit
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

        if (unit.status !== 'AVAILABLE') {
            return NextResponse.json(
                { error: `Unit ${unit.unit_number} is not available (current: ${unit.status})` },
                { status: 409 }
            )
        }

        // Calculate check-out time based on number of days
        const checkInDate = getDevNow()
        let checkOutDate: Date

        if (checkOutOverride) {
            const overrideDate = new Date(checkOutOverride)
            if (!isNaN(overrideDate.getTime()) && overrideDate > checkInDate) {
                checkOutDate = overrideDate
            } else {
                checkOutDate = calculateCheckOut(unit.type as UnitType, checkInDate)
            }
        } else {
            // Calculate check-out based on unit type and number of days
            checkOutDate = calculateCheckOut(unit.type as UnitType, checkInDate)
            if (days > 1) {
                checkOutDate.setDate(checkOutDate.getDate() + (days - 1))
            }
        }

        // Run conflict check against existing reservations (unless bypassed)
        if (!bypassConflict) {
            const conflict = await checkConflict({
                unitId,
                checkIn: checkInDate,
                checkOut: checkOutDate,
            })

            if (conflict.hasConflict) {
                return NextResponse.json(
                    {
                        error: `Cannot check in — conflicts with existing reservation for ${unit.unit_number}`,
                        conflicts: conflict.conflictingBookings,
                    },
                    { status: 409 }
                )
            }
        } else {
            // Auto-cancel conflicting reservations when bypass is enabled
            const conflict = await checkConflict({
                unitId,
                checkIn: checkInDate,
                checkOut: checkOutDate,
            })
            if (conflict.hasConflict) {
                const conflictIds = conflict.conflictingBookings.map(c => c.id)
                await supabase
                    .from('bookings')
                    .update({
                        status: 'CANCELLED',
                        notes: '[AUTO-CANCELLED] Overridden by CRE walk-in check-in',
                    })
                    .in('id', conflictIds)
            }
        }

        // Calculate pricing — multi-day: base_price × days for both rooms and dorms
        const isDorm = unit.type === 'DORM'
        const perDayBase = Number(unit.base_price)
        const totalBase = perDayBase * days
        const pricing = calculateBookingPrice(
            unit.type as UnitType,
            totalBase,
            guests.length
        )

        const finalGrandTotal = grandTotalOverride != null
            ? Number(grandTotalOverride)
            : pricing.grandTotal

        // Validate payment matches grand total (unless payLater)
        const totalPaid = cashAmount + digitalAmount
        if (!payLater && Math.abs(totalPaid - finalGrandTotal) > 0.01) {
            return NextResponse.json(
                { error: `Payment ₹${totalPaid} does not match grand total ₹${finalGrandTotal}` },
                { status: 400 }
            )
        }

        // Create booking with CHECKED_IN status
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
                status: 'CHECKED_IN',
            })
            .select()
            .single()

        if (bookingError) {
            console.error('Booking insert error:', bookingError)
            return NextResponse.json(
                { error: 'Failed to create booking' },
                { status: 500 }
            )
        }

        // Insert all guests
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
            // Rollback booking
            await supabase.from('bookings').delete().eq('id', booking.id)
            return NextResponse.json(
                { error: 'Failed to save guest details' },
                { status: 500 }
            )
        }

        // Insert payment record (even if payLater — records ₹0)
        const paymentTotal = payLater ? 0 : (cashAmount + digitalAmount)
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
                booking_id: booking.id,
                amount_cash: payLater ? 0 : cashAmount,
                amount_digital: payLater ? 0 : digitalAmount,
                total_paid: paymentTotal,
            })

        if (paymentError) {
            console.error('Payment insert error:', paymentError)
            // Non-fatal — booking still succeeds
        }

        // Update unit status to OCCUPIED
        const { error: unitUpdateError } = await supabase
            .from('units')
            .update({ status: 'OCCUPIED' })
            .eq('id', unitId)

        if (unitUpdateError) {
            console.error('Unit status update error:', unitUpdateError)
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
                payment: {
                    cash: cashAmount,
                    digital: digitalAmount,
                    total: totalPaid,
                },
            },
        })
    } catch (err) {
        console.error('Check-in error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
