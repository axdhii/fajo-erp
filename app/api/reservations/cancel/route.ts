import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// PATCH /api/reservations — Cancel or update a reservation
export async function PATCH(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { bookingId, action, updates } = body

        if (!bookingId) {
            return NextResponse.json(
                { error: 'bookingId is required' },
                { status: 400 }
            )
        }

        // Fetch the booking
        const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select('*, unit:units(unit_number)')
            .eq('id', bookingId)
            .single()

        if (fetchError || !booking) {
            return NextResponse.json(
                { error: 'Booking not found' },
                { status: 404 }
            )
        }

        // === CANCEL ACTION ===
        if (action === 'cancel') {
            if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
                return NextResponse.json(
                    { error: `Cannot cancel a booking with status: ${booking.status}. Only PENDING or CONFIRMED bookings can be cancelled.` },
                    { status: 409 }
                )
            }

            const { error: updateError } = await supabase
                .from('bookings')
                .update({ status: 'CANCELLED' })
                .eq('id', bookingId)

            if (updateError) {
                console.error('Cancel error:', updateError)
                return NextResponse.json(
                    { error: 'Failed to cancel reservation' },
                    { status: 500 }
                )
            }

            return NextResponse.json({
                success: true,
                message: `Reservation for ${(booking.unit as any)?.unit_number || 'unit'} has been cancelled`,
            })
        }

        // === EDIT ACTION ===
        if (action === 'edit') {
            if (!['PENDING', 'CONFIRMED'].includes(booking.status)) {
                return NextResponse.json(
                    { error: `Cannot edit a booking with status: ${booking.status}. Only PENDING or CONFIRMED bookings can be edited.` },
                    { status: 409 }
                )
            }

            if (!updates || typeof updates !== 'object') {
                return NextResponse.json(
                    { error: 'updates object is required for edit action' },
                    { status: 400 }
                )
            }

            // Only allow specific fields to be updated
            const allowedFields = [
                'check_in',
                'check_out',
                'guest_count',
                'grand_total',
                'advance_amount',
                'advance_type',
                'expected_arrival',
                'notes',
            ]

            const sanitizedUpdates: Record<string, any> = {}
            for (const key of allowedFields) {
                if (updates[key] !== undefined) {
                    sanitizedUpdates[key] = updates[key]
                }
            }

            if (Object.keys(sanitizedUpdates).length === 0) {
                return NextResponse.json(
                    { error: 'No valid fields to update' },
                    { status: 400 }
                )
            }

            const { error: updateError } = await supabase
                .from('bookings')
                .update(sanitizedUpdates)
                .eq('id', bookingId)

            if (updateError) {
                console.error('Edit error:', updateError)
                return NextResponse.json(
                    { error: 'Failed to update reservation' },
                    { status: 500 }
                )
            }

            // If guests are being updated, handle that separately
            if (updates.guests && Array.isArray(updates.guests)) {
                // Delete existing guests and re-insert
                await supabase.from('guests').delete().eq('booking_id', bookingId)

                const guestRecords = updates.guests.map((g: any) => ({
                    booking_id: bookingId,
                    name: g.name,
                    phone: g.phone,
                    aadhar_number: g.aadhar_number || null,
                    aadhar_url: g.aadhar_url || null,
                }))

                const { error: guestsError } = await supabase
                    .from('guests')
                    .insert(guestRecords)

                if (guestsError) {
                    console.error('Guest update error:', guestsError)
                    // Non-fatal
                }
            }

            return NextResponse.json({
                success: true,
                message: `Reservation updated successfully`,
            })
        }

        return NextResponse.json(
            { error: 'Invalid action. Use "cancel" or "edit".' },
            { status: 400 }
        )
    } catch (err) {
        console.error('Reservation PATCH error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
