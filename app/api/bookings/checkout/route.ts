import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'
import { requireAuth } from '@/lib/auth'

// POST /api/bookings/checkout — Simple checkout (payment already collected at check-in)
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()

        const { bookingId, amountCash = 0, amountDigital = 0, force = false } = body

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

        // Look up staff ID + role for checkout attribution and role gating
        const { data: staffProfile } = await supabase
            .from('staff')
            .select('id, role')
            .eq('user_id', auth.userId)
            .single()

        // Force checkout (skipping balance-due validation) is destructive — only Admin/Dev/ZonalOps
        const callerRole = staffProfile?.role
        if (force && !['Admin', 'Developer', 'ZonalOps'].includes(callerRole || '')) {
            return NextResponse.json(
                { error: 'Force checkout requires Admin, Developer, or ZonalOps role' },
                { status: 403 }
            )
        }

        // Handle group dorm checkout — process all beds in the group
        if (booking.group_id) {
            const { data: groupBookings } = await supabase
                .from('bookings')
                .select('id, unit_id')
                .eq('group_id', booking.group_id)
                .eq('status', 'CHECKED_IN')
                .neq('id', bookingId)  // exclude the primary booking (handled below)

            if (groupBookings && groupBookings.length > 0) {
                // Update all sibling bookings to CHECKED_OUT
                // Keep original check_out (the paid-for checkout time)
                // Append actual departure time to notes
                const siblingIds = groupBookings.map(b => b.id)
                const siblingUnitIds = groupBookings.map(b => b.unit_id)
                const actualDeparture = getDevNow().toISOString()

                // Fetch sibling notes so we can append departure time
                const { data: siblingDetails } = await supabase
                    .from('bookings')
                    .select('id, notes')
                    .in('id', siblingIds)

                for (const sib of (siblingDetails || [])) {
                    await supabase
                        .from('bookings')
                        .update({
                            status: 'CHECKED_OUT',
                            checked_out_by: staffProfile?.id || null,
                            checked_out_at: actualDeparture,
                            notes: (sib.notes ? sib.notes + ' | ' : '') + `[Checked out: ${actualDeparture}]`,
                        })
                        .eq('id', sib.id)
                }

                // Set all sibling units to DIRTY
                await supabase
                    .from('units')
                    .update({ status: 'DIRTY' })
                    .in('id', siblingUnitIds)
            }
        }

        // Handle both Array and Object returns from Supabase — sum ALL payment records (Rule #2, #3)
        const paymentsArr = Array.isArray(booking.payments) ? booking.payments : booking.payments ? [booking.payments] : []
        const grandTotal = Number(booking.grand_total)
        const advanceAmount = Number(booking.advance_amount) || 0
        const totalPaid = paymentsArr.reduce((sum: number, p: { total_paid?: number }) => sum + Number(p.total_paid || 0), 0)
        const existingCash = paymentsArr.reduce((sum: number, p: { amount_cash?: number }) => sum + Number(p.amount_cash || 0), 0)
        const existingDigital = paymentsArr.reduce((sum: number, p: { amount_digital?: number }) => sum + Number(p.amount_digital || 0), 0)
        const balanceDue = Math.max(0, grandTotal - advanceAmount - totalPaid)
        // Find the most recent payment record for updates
        const latestPayment = paymentsArr.length > 0 ? paymentsArr.reduce((latest: { id: string; created_at?: string }, p: { id: string; created_at?: string }) => {
            if (!latest.created_at) return p
            if (!p.created_at) return latest
            return new Date(p.created_at) > new Date(latest.created_at) ? p : latest
        }, paymentsArr[0]) : null

        const incomingCash = Number(amountCash)
        const incomingDigital = Number(amountDigital)
        const incomingTotal = incomingCash + incomingDigital

        // Validate payment if balance is due (skip when admin force-checkout)
        if (!force && balanceDue > 0) {
            if (Math.abs(incomingTotal - balanceDue) >= 1) {
                return NextResponse.json(
                    { error: `Payment of ₹${incomingTotal} does not match balance of ₹${balanceDue}` },
                    { status: 400 }
                )
            }
        }

        // Update payment record if payment was collected.
        // Critical: bump `created_at` to now() so shift-report revenue attribution
        // credits the CHECKOUT staff (not the original check-in staff) for money
        // collected during checkout. Without this, a night-shift CRE's checkout
        // collections get folded under the day-shift CRE's timestamp.
        const now = getDevNow().toISOString()
        if (incomingTotal > 0 && latestPayment) {
            const { error: payErr } = await supabase
                .from('payments')
                .update({
                    amount_cash: Number(latestPayment.amount_cash) + incomingCash,
                    amount_digital: Number(latestPayment.amount_digital) + incomingDigital,
                    total_paid: Number(latestPayment.total_paid) + incomingTotal,
                    created_at: now,
                })
                .eq('id', latestPayment.id)
            if (payErr) {
                console.error('Checkout payment update error:', payErr)
                return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
            }
        } else if (incomingTotal > 0 && !latestPayment) {
            const { error: payErr } = await supabase
                .from('payments')
                .upsert({
                    booking_id: bookingId,
                    amount_cash: incomingCash,
                    amount_digital: incomingDigital,
                    total_paid: incomingTotal,
                }, { onConflict: 'booking_id' })
            if (payErr) {
                console.error('Checkout payment insert error:', payErr)
                return NextResponse.json({ error: 'Failed to record payment' }, { status: 500 })
            }
        }

        // Update booking to CHECKED_OUT atomically — prevents TOCTOU race where
        // two concurrent checkout requests both transition the booking and
        // overwrite each other's notes / checked_out_by.
        const checkoutTime = now
        const { data: updated, error: bookingUpdateError } = await supabase
            .from('bookings')
            .update({
                status: 'CHECKED_OUT',
                notes: (booking.notes ? booking.notes + ' | ' : '') + `[Checked out: ${checkoutTime}]`,
                checked_out_by: staffProfile?.id || null,
                checked_out_at: checkoutTime,
            })
            .eq('id', bookingId)
            .eq('status', 'CHECKED_IN')
            .select('id')

        if (bookingUpdateError) {
            console.error('Booking update error:', bookingUpdateError)
            return NextResponse.json(
                { error: 'Failed to update booking status' },
                { status: 500 }
            )
        }
        if (!updated || updated.length === 0) {
            return NextResponse.json(
                { error: 'Booking is no longer CHECKED_IN — another session may have checked it out' },
                { status: 409 }
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
