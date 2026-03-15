import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDevNow } from '@/lib/dev-time'
import { requireAuth } from '@/lib/auth'

// POST /api/dev/auto-checkout — Trigger dorm auto-checkout using simulated time
export async function POST() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Dev-only endpoint' }, { status: 403 })
    }

    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const now = getDevNow()

        // Find all CHECKED_IN dorm bookings where checkout time has passed
        const { data: expiredBookings, error: fetchError } = await supabase
            .from('bookings')
            .select('id, unit_id, check_out, unit:units(unit_number, type)')
            .eq('status', 'CHECKED_IN')
            .lte('check_out', now.toISOString())

        if (fetchError) {
            console.error('Fetch expired bookings error:', fetchError)
            return NextResponse.json({ error: 'Failed to fetch bookings' }, { status: 500 })
        }

        // Filter to dorm bookings only
        const dormBookings = (expiredBookings || []).filter(
            (b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.type === 'DORM'
        )

        if (dormBookings.length === 0) {
            return NextResponse.json({
                success: true,
                message: `No dorm checkouts due (simulated time: ${now.toISOString()})`,
                checkedOut: 0,
            })
        }

        // Check out each expired dorm booking
        const results: string[] = []
        for (const booking of dormBookings) {
            const { error: updateError } = await supabase
                .from('bookings')
                .update({
                    status: 'CHECKED_OUT',
                    check_out: now.toISOString(),
                })
                .eq('id', booking.id)

            if (!updateError) {
                await supabase
                    .from('units')
                    .update({ status: 'DIRTY' })
                    .eq('id', booking.unit_id)

                const unitNum = (booking as Record<string, unknown>).unit ? ((booking as Record<string, unknown>).unit as Record<string, string>).unit_number : booking.unit_id
                results.push(`${unitNum}: CHECKED_OUT → DIRTY`)
            }
        }

        return NextResponse.json({
            success: true,
            message: `Auto-checkout completed for ${results.length} dorm beds`,
            simulatedTime: now.toISOString(),
            checkedOut: results.length,
            details: results,
        })
    } catch (err) {
        console.error('Auto-checkout error:', err)
        return NextResponse.json({ error: 'Failed to run auto-checkout' }, { status: 500 })
    }
}
