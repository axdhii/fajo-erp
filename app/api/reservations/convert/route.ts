import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'
import { requireAuth } from '@/lib/auth'

// POST /api/reservations/convert — Convert a CONFIRMED reservation to CHECKED_IN
// Supports group bookings: if the booking has a group_id, all bookings in the group are converted
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

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

        // Check if this is a group booking
        const isGroup = !!booking.group_id
        let allBookings: typeof booking[] = [booking]

        if (isGroup) {
            const { data: groupBookings, error: groupError } = await supabase
                .from('bookings')
                .select('*, guests(*), unit:units(*)')
                .eq('group_id', booking.group_id)
                .order('created_at', { ascending: true })

            if (groupError || !groupBookings) {
                return NextResponse.json(
                    { error: 'Failed to fetch group bookings' },
                    { status: 500 }
                )
            }

            allBookings = groupBookings

            // Verify all are CONFIRMED
            const nonConfirmed = allBookings.find((b: { status: string }) => b.status !== 'CONFIRMED')
            if (nonConfirmed) {
                const unitInfo = nonConfirmed.unit as Record<string, string> | null
                return NextResponse.json(
                    {
                        error: `All bookings in group must be CONFIRMED. Bed ${unitInfo?.unit_number || 'unknown'} is ${nonConfirmed.status}`,
                    },
                    { status: 409 }
                )
            }
        }

        // Verify all units are AVAILABLE
        for (const b of allBookings) {
            const unit = b.unit as Record<string, string>
            if (unit.status !== 'AVAILABLE') {
                return NextResponse.json(
                    {
                        error: `Unit ${unit.unit_number} is currently ${unit.status}. Cannot check in.`,
                    },
                    { status: 409 }
                )
            }
        }

        // Calculate combined totals
        const combinedGrandTotal = allBookings.reduce(
            (sum: number, b: { grand_total: number | string }) => sum + Number(b.grand_total),
            0
        )

        const finalGrandTotal =
            grandTotalOverride != null
                ? Number(grandTotalOverride)
                : combinedGrandTotal

        const combinedAdvance = allBookings.reduce(
            (sum: number, b: { advance_amount?: number | string }) => sum + (Number(b.advance_amount) || 0),
            0
        )

        const balanceDue = Math.max(0, finalGrandTotal - combinedAdvance)

        // Validate payment matches balance due
        const totalPaid = cashAmount + digitalAmount
        if (Math.abs(totalPaid - balanceDue) > 0.01) {
            return NextResponse.json(
                { error: `Payment ₹${totalPaid} does not match balance due ₹${balanceDue}` },
                { status: 400 }
            )
        }

        const now = getDevNow().toISOString()

        // Update all bookings: CONFIRMED → CHECKED_IN
        for (const b of allBookings) {
            const updateData: Record<string, string | number> = {
                status: 'CHECKED_IN',
                check_in: now,
            }

            // Only apply grand total override for single (non-group) bookings
            if (grandTotalOverride != null && !isGroup) {
                updateData.grand_total = finalGrandTotal
            }

            const { error: updateError } = await supabase
                .from('bookings')
                .update(updateData)
                .eq('id', b.id)

            if (updateError) {
                console.error('Convert booking error:', updateError)
                return NextResponse.json(
                    { error: 'Failed to convert reservation' },
                    { status: 500 }
                )
            }
        }

        // Insert payment records — distribute across all bookings proportionally
        if (isGroup && allBookings.length > 1) {
            for (const b of allBookings) {
                const proportion = finalGrandTotal > 0
                    ? Number(b.grand_total) / finalGrandTotal
                    : 1 / allBookings.length
                const bCash = Math.round(cashAmount * proportion * 100) / 100
                const bDigital = Math.round(digitalAmount * proportion * 100) / 100
                const bTotal = Math.round(totalPaid * proportion * 100) / 100

                const { error: paymentError } = await supabase
                    .from('payments')
                    .insert({
                        booking_id: b.id,
                        amount_cash: bCash,
                        amount_digital: bDigital,
                        total_paid: bTotal,
                    })

                if (paymentError) {
                    console.error(`Payment insert error for booking ${b.id}:`, paymentError)
                }
            }
        } else {
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
        }

        // Set all units to OCCUPIED
        const unitIds = allBookings.map((b: { unit_id: string }) => b.unit_id)
        const { error: unitUpdateError } = await supabase
            .from('units')
            .update({ status: 'OCCUPIED' })
            .in('id', unitIds)

        if (unitUpdateError) {
            console.error('Unit status update error:', unitUpdateError)
        }

        // Update guest Aadhar URLs if provided — process guests from ALL bookings in the group
        if (guests && Array.isArray(guests)) {
            // Collect all guest IDs across all bookings in the group
            const allGuestIds = new Set(
                allBookings.flatMap((b: { guests?: { id: string }[] }) =>
                    (b.guests || []).map((g: { id: string }) => g.id)
                )
            )

            for (const g of guests) {
                if (g.id && g.aadhar_url && allGuestIds.has(g.id)) {
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

        const primaryUnit = booking.unit as Record<string, string>

        return NextResponse.json({
            success: true,
            message: isGroup
                ? `${allBookings.length} dorm beds checked in successfully`
                : `Reservation converted — ${primaryUnit.unit_number} is now checked in`,
            booking: {
                id: booking.id,
                unit_number: primaryUnit.unit_number,
                guests: booking.guests,
                grandTotal: finalGrandTotal,
                advanceAmount: combinedAdvance,
                balanceDue,
                payment: {
                    cash: cashAmount,
                    digital: digitalAmount,
                    total: totalPaid,
                },
            },
            ...(isGroup && { groupSize: allBookings.length }),
        })
    } catch (err) {
        console.error('Convert error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
