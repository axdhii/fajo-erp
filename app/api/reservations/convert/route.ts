import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'
import type { UnitType } from '@/lib/types'

// POST /api/reservations/convert — Convert a CONFIRMED reservation to CHECKED_IN
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { bookingId, grandTotalOverride, amountCash, amountDigital, guests } = body

        if (!bookingId) {
            return NextResponse.json(
                { error: 'bookingId is required' },
                { status: 400 }
            )
        }

        // Validate payment amounts
        const cashAmount = Number(amountCash) || 0
        const digitalAmount = Number(amountDigital) || 0

        // Fetch the reservation with guests and unit
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('*, guests(*), unit:units(*)')
            .eq('id', bookingId)
            .single()

        if (bookingError || !booking) {
            return NextResponse.json(
                { error: 'Reservation not found' },
                { status: 404 }
            )
        }

        if (booking.status !== 'CONFIRMED') {
            return NextResponse.json(
                {
                    error: `Only CONFIRMED reservations can be converted. Current status: ${booking.status}`,
                },
                { status: 409 }
            )
        }

        const unit = booking.unit as any

        // Check if the unit is available
        if (unit.status !== 'AVAILABLE') {
            return NextResponse.json(
                {
                    error: `Unit ${unit.unit_number} is currently ${unit.status}. Cannot check in.`,
                },
                { status: 409 }
            )
        }

        // Use the stored grand_total from the reservation (already calculated at booking time)
        // Only override if the user explicitly provides a new total
        const finalGrandTotal =
            grandTotalOverride != null
                ? Number(grandTotalOverride)
                : Number(booking.grand_total)

        // Calculate balance due after advance deduction
        const advanceAmount = Number(booking.advance_amount) || 0
        const balanceDue = Math.max(0, finalGrandTotal - advanceAmount)

        // Validate payment matches balance due
        const totalPaid = cashAmount + digitalAmount
        if (Math.abs(totalPaid - balanceDue) > 0.01) {
            return NextResponse.json(
                { error: `Payment ₹${totalPaid} does not match balance due ₹${balanceDue}` },
                { status: 400 }
            )
        }

        // Update booking: CONFIRMED → CHECKED_IN, update check_in to NOW
        // Keep stored pricing (base_amount, surcharge, grand_total) unless overridden
        const updateData: Record<string, any> = {
            status: 'CHECKED_IN',
            check_in: getDevNow().toISOString(),
        }

        if (grandTotalOverride != null) {
            updateData.grand_total = finalGrandTotal
        }

        const { error: updateError } = await supabase
            .from('bookings')
            .update(updateData)
            .eq('id', bookingId)

        if (updateError) {
            console.error('Convert booking error:', updateError)
            return NextResponse.json(
                { error: 'Failed to convert reservation' },
                { status: 500 }
            )
        }

        // Insert payment record
        const { error: paymentError } = await supabase
            .from('payments')
            .insert({
                booking_id: booking.id,
                amount_cash: cashAmount,
                amount_digital: digitalAmount,
                total_paid: totalPaid,
            })

        if (paymentError) {
            console.error('Payment insert error:', paymentError)
            // Non-fatal — booking still converted
        }

        // Set unit to OCCUPIED
        const { error: unitUpdateError } = await supabase
            .from('units')
            .update({ status: 'OCCUPIED' })
            .eq('id', booking.unit_id)

        if (unitUpdateError) {
            console.error('Unit status update error:', unitUpdateError)
        }

        // Update guest Aadhar URLs if provided
        if (guests && Array.isArray(guests)) {
            for (const g of guests) {
                if (g.id && g.aadhar_url) {
                    const { error: guestUpdateError } = await supabase
                        .from('guests')
                        .update({ aadhar_url: g.aadhar_url })
                        .eq('id', g.id)

                    if (guestUpdateError) {
                        console.error(`Guest aadhar update error for ${g.id}:`, guestUpdateError)
                    }
                }
            }
        }

        return NextResponse.json({
            success: true,
            message: `Reservation converted — ${unit.unit_number} is now checked in`,
            booking: {
                id: booking.id,
                unit_number: unit.unit_number,
                guests: booking.guests,
                grandTotal: finalGrandTotal,
                advanceAmount,
                balanceDue,
                payment: {
                    cash: cashAmount,
                    digital: digitalAmount,
                    total: totalPaid,
                },
            },
        })
    } catch (err) {
        console.error('Convert error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
