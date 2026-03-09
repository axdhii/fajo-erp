import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'

// GET /api/cron/dorm-checkout
// Called by Vercel Cron or external scheduler at 10:00 AM IST daily.
// Transitions all OCCUPIED dorm beds whose checkout time has passed to DIRTY.
export async function GET() {
    try {
        const supabase = await createClient()
        const now = getDevNow()

        // Find all CHECKED_IN bookings on DORM units whose check_out has passed
        const { data: staleBookings, error: fetchError } = await supabase
            .from('bookings')
            .select('id, unit_id, units!inner(type, status)')
            .eq('status', 'CHECKED_IN')
            .eq('units.type', 'DORM')
            .eq('units.status', 'OCCUPIED')
            .lt('check_out', now.toISOString())

        if (fetchError) {
            console.error('Cron fetch error:', fetchError)
            return NextResponse.json(
                { error: 'Failed to fetch stale dorm bookings' },
                { status: 500 }
            )
        }

        if (!staleBookings || staleBookings.length === 0) {
            return NextResponse.json({
                success: true,
                message: 'No dorm beds to transition',
                count: 0,
            })
        }

        const bookingIds = staleBookings.map((b) => b.id)
        const unitIds = [...new Set(staleBookings.map((b) => b.unit_id))]

        // Mark bookings as checked out
        const { error: bookingUpdateError } = await supabase
            .from('bookings')
            .update({
                status: 'CHECKED_OUT',
                check_out: now.toISOString(),
            })
            .in('id', bookingIds)

        if (bookingUpdateError) {
            console.error('Cron booking update error:', bookingUpdateError)
        }

        // Mark units as DIRTY
        const { error: unitUpdateError } = await supabase
            .from('units')
            .update({ status: 'DIRTY' })
            .in('id', unitIds)

        if (unitUpdateError) {
            console.error('Cron unit update error:', unitUpdateError)
        }

        return NextResponse.json({
            success: true,
            message: `Transitioned ${unitIds.length} dorm bed(s) to DIRTY`,
            count: unitIds.length,
        })
    } catch (err) {
        console.error('Cron error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
