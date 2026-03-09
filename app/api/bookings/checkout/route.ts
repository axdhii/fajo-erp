import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'

// POST /api/bookings/checkout — Simple checkout (payment already collected at check-in)
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { bookingId } = body

        if (!bookingId) {
            return NextResponse.json(
                { error: 'bookingId is required' },
                { status: 400 }
            )
        }

        // Fetch the booking
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .select('*, unit:units(*)')
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

        // Update booking to CHECKED_OUT
        const { error: bookingUpdateError } = await supabase
            .from('bookings')
            .update({
                status: 'CHECKED_OUT',
                check_out: getDevNow().toISOString(),
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
