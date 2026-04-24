import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireAuth } from '@/lib/auth'
import { checkConflict } from '@/lib/conflict'

export async function PATCH(request: Request) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { bookingId, extendType, paymentType } = body
        let { amount, fee } = body

        if (!bookingId || !extendType || amount === undefined || fee === undefined) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            )
        }

        amount = Number(amount)
        fee = Number(fee)

        if (amount <= 0 || fee < 0) {
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

        // Use pseudo-IST to prevent Vercel UTC shifts during local hour math
        const istOffsetMs = 5.5 * 60 * 60 * 1000
        const pseudoIst = new Date(oldCheckOut.getTime() + istOffsetMs)

        if (extendType === 'HOURS') {
            pseudoIst.setUTCHours(pseudoIst.getUTCHours() + amount)
        } else if (extendType === 'DAYS') {
            pseudoIst.setUTCDate(pseudoIst.getUTCDate() + amount)
            // Don't reset time — preserve any previous hourly extensions
        } else {
            return NextResponse.json({ error: 'Invalid extend type' }, { status: 400 })
        }

        const newCheckOut = new Date(pseudoIst.getTime() - istOffsetMs)

        // 2. Conflict checking using canonical conflict engine
        const conflictResult = await checkConflict({
            unitId: booking.unit_id,
            checkIn: new Date(booking.check_in),
            checkOut: newCheckOut,
            excludeBookingId: booking.id,
        })

        if (conflictResult.hasConflict) {
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

        // 4. Update the payments record if there is a fee. On failure, ROLL BACK the
        // booking extension — otherwise the guest's stay is extended + grand_total
        // is increased but no payment is recorded, leading to revenue loss.
        if (fee > 0 && paymentType) {
            const { data: paymentRecords } = await supabase
                .from('payments')
                .select('*')
                .eq('booking_id', booking.id)
                .order('created_at', { ascending: false })

            const paymentRecord = paymentRecords?.[0] || null

            const updatePayload: Record<string, number | string> = {
                total_paid: Number(paymentRecord?.total_paid || 0) + fee,
                // Credit the extending staff's shift window via created_at bump
                created_at: new Date().toISOString(),
            }
            if (paymentType === 'CASH') {
                updatePayload.amount_cash = Number(paymentRecord?.amount_cash || 0) + fee
            } else if (paymentType === 'DIGITAL') {
                updatePayload.amount_digital = Number(paymentRecord?.amount_digital || 0) + fee
            }

            let payErr: unknown = null
            if (paymentRecord) {
                const { error } = await supabase.from('payments').update(updatePayload).eq('id', paymentRecord.id)
                payErr = error
            } else {
                const { error } = await supabase.from('payments').insert({
                    booking_id: booking.id,
                    amount_cash: paymentType === 'CASH' ? fee : 0,
                    amount_digital: paymentType === 'DIGITAL' ? fee : 0,
                    total_paid: fee,
                })
                payErr = error
            }

            if (payErr) {
                console.error('Extend payment update failed, rolling back booking:', payErr)
                await supabase
                    .from('bookings')
                    .update({
                        check_out: booking.check_out,
                        surcharge: booking.surcharge,
                        grand_total: booking.grand_total,
                        notes: booking.notes,
                    })
                    .eq('id', booking.id)
                return NextResponse.json(
                    { error: 'Failed to record extension fee — extension cancelled' },
                    { status: 500 }
                )
            }
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
