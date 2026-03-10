import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(request: Request) {
    try {
        const supabase = await createClient()
        const body = await request.json()
        let { bookingId, extendType, amount, fee } = body

        if (!bookingId || !extendType || amount === undefined || fee === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        amount = Number(amount)
        fee = Number(fee)

        if (amount <= 0 && fee < 0) {
            return NextResponse.json({ error: 'Invalid extension amount/fee' }, { status: 400 })
        }

        // 1. Fetch the booking & unit details
        const { data: booking, error: fetchError } = await supabase
            .from('bookings')
            .select('*, unit:units(id, type, unit_number)')
            .eq('id', bookingId)
            .single()

        if (fetchError || !booking) {
            return NextResponse.json(
                { error: 'Booking not found' },
                { status: 404 }
            )
        }

        if (booking.status !== 'CHECKED_IN') {
            return NextResponse.json(
                { error: 'Can only extend currently checked in bookings' },
                { status: 400 }
            )
        }

        const oldCheckOut = new Date(booking.check_out)
        const newCheckOut = new Date(booking.check_out)

        if (extendType === 'HOURS') {
            newCheckOut.setHours(newCheckOut.getHours() + amount)
        } else if (extendType === 'DAYS') {
            newCheckOut.setDate(newCheckOut.getDate() + amount)
            // If it's a room, it should stay at 11:00 AM. 
            // If dorm, 10:00 AM.
            // Since `oldCheckOut` was already calculated with correct hours initially,
            // adding days to it directly retains the 11/10 hours physically.
            // But let's be explicit just in case.
            if (booking.unit.type === 'DORM') {
                newCheckOut.setHours(10, 0, 0, 0)
            } else {
                newCheckOut.setHours(11, 0, 0, 0)
            }
        } else {
            return NextResponse.json({ error: 'Invalid extend type' }, { status: 400 })
        }

        // 2. Conflict checking
        const { data: conflicts, error: conflictError } = await supabase
            .from('bookings')
            .select('id, check_in, check_out, status')
            .eq('unit_id', booking.unit_id)
            .neq('id', booking.id)
            .in('status', ['PENDING', 'CONFIRMED'])
            .gte('check_out', new Date().toISOString()) // Look at active/future ones

        if (conflictError) {
            return NextResponse.json({ error: 'Failed to verify conflicts' }, { status: 500 })
        }

        // Check if our new check_out overlaps with any future booking's check_in
        const hasConflict = conflicts?.some(conflict => {
            const conflictIn = new Date(conflict.check_in)
            // If the incoming guest checks in BEFORE our new checkout time, it's a conflict
            return conflictIn < newCheckOut
        })

        if (hasConflict) {
            return NextResponse.json(
                { error: 'Cannot extend: conflicts with an upcoming reservation.' },
                { status: 409 }
            )
        }

        // 3. Update the booking
        const extensionNote = `\n[AUTO] Extended by ${amount} ${extendType.toLowerCase()} for ₹${fee.toLocaleString('en-IN')}`
        const newNotes = booking.notes ? booking.notes + extensionNote : extensionNote.trim()

        const { error: updateError } = await supabase
            .from('bookings')
            .update({
                check_out: newCheckOut.toISOString(),
                surcharge: Number(booking.surcharge) + fee,
                grand_total: Number(booking.grand_total) + fee,
                notes: newNotes
            })
            .eq('id', booking.id)

        if (updateError) {
            return NextResponse.json(
                { error: 'Failed to update booking' },
                { status: 500 }
            )
        }

        return NextResponse.json({ message: 'Stay extended successfully' })
    } catch (error) {
        console.error('Extend Stay Error:', error)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
