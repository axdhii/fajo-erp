import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronOrAdmin } from '@/lib/cron-auth'

// GET /api/cron/shift-reports-cleanup
// Called by Vercel Cron once a day.
// Deletes shift_reports rows older than 60 days.
//
// Retention policy: 60 days covers a full monthly payroll cycle + grace for
// disputes. The underlying tables (attendance, bookings, payments) retain the
// raw data; shift_reports is the denormalized per-staff revenue attribution
// that matters for payroll audits.
export async function GET(request: NextRequest) {
    try {
        const gate = await requireCronOrAdmin(request)
        if (!gate.ok) return gate.response

        const supabase = await createClient()

        const sixtyDaysAgo = new Date()
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

        // Delete and return the count so ops can see the effect
        const { data, error } = await supabase
            .from('shift_reports')
            .delete()
            .lt('created_at', sixtyDaysAgo.toISOString())
            .select('id')

        if (error) {
            console.error('Shift reports cleanup error:', error)
            return NextResponse.json(
                { error: 'Failed to clean up old shift reports' },
                { status: 500 }
            )
        }

        const deletedCount = data?.length ?? 0
        return NextResponse.json({
            success: true,
            deleted: deletedCount,
            message: `Cleaned up ${deletedCount} shift report${deletedCount === 1 ? '' : 's'} older than 60 days`,
        })
    } catch (err) {
        console.error('Shift reports cleanup cron error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
