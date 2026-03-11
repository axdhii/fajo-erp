import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'

// POST /api/bookings/checkout — Simple checkout (payment already collected at check-in)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { bookingId, amountCash = 0, amountDigital = 0 } = body

        if (!bookingId) {
            return NextResponse.json(
                { error: 'bookingId is required' },
                { status: 400 }
            )
        }

        // Fetch the booking and its payment record
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('*, unit:units(*), payments(*)')
            .eq('id', bookingId)
            .single()

        if (bookingError || !booking) {
            return NextResponse.json(
                { error: 'Booking not found' },
                { status: 404 }
            )
        }

        if (booking.status !== 'CHECKED_IN') {
            return NextResponse.json(
                { error: `Booking is not checked in (current: ${booking.status})` },
                { status: 409 }
            )
        }

        // Handle both Array and Object returns from Supabase
        const paymentRecord = Array.isArray(booking.payments) ? booking.payments[0] : booking.payments
        const grandTotal = Number(booking.grand_total)
        const totalPaid = paymentRecord ? Number(paymentRecord.total_paid) : 0
        const balanceDue = Math.max(0, grandTotal - totalPaid)

        const incomingCash = Number(amountCash)
        const incomingDigital = Number(amountDigital)
        const incomingTotal = incomingCash + incomingDigital

        // Validate payment if balance is due
        if (balanceDue > 0) {
            if (Math.abs(incomingTotal - balanceDue) > 0.01) {
                return NextResponse.json(
                    { error: `Payment of ₹${incomingTotal} does not match balance of ₹${balanceDue}` },
                    { status: 400 }
                )
            }
        }

        // Update payment record if payment was collected
        if (incomingTotal > 0 && paymentRecord) {
            await supabase
                .from('payments')
                .update({
                    amount_cash: Number(paymentRecord.amount_cash) + incomingCash,
                    amount_digital: Number(paymentRecord.amount_digital) + incomingDigital,
                    total_paid: Number(paymentRecord.total_paid) + incomingTotal
                })
                .eq('id', paymentRecord.id)
        }

        const newNotes = booking.notes

        // Update booking to CHECKED_OUT
        const { error: bookingUpdateError } = await supabase
            .from('bookings')
            .update({
                status: 'CHECKED_OUT',
                check_out: getDevNow().toISOString(),
                notes: newNotes,
            })
            .eq('id', bookingId)

        if (bookingUpdateError) {
            console.error('Booking update error:', bookingUpdateError)
            return NextResponse.json(
                { error: 'Failed to update booking status' },
                { status: 500 }
            )
        }

        // Update unit status to DIRTY
        const { error: unitUpdateError } = await supabase
            .from('units')
            .update({ status: 'DIRTY' })
            .eq('id', booking.unit_id)

        if (unitUpdateError) {
            console.error('Unit status update error:', unitUpdateError)
        }

        return NextResponse.json({
            success: true,
            message: `Checked out from unit. Room marked as DIRTY.`,
        })
    } catch (err) {
        console.error('Checkout error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
