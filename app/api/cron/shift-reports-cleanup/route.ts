import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/cron/shift-reports-cleanup
// Called by Vercel Cron once a day.
// Deletes shift_reports rows older than 7 days.
//
// Retention policy: shift reports are only useful to Admin/owners for recent
// staff accountability. Keeping them unbounded bloats the table without
// business value. Older data is still available in the underlying tables
// (attendance, bookings, payments), just not in pre-aggregated form.
//
// In production, requires CRON_SECRET header. In dev, requires auth.
export async function GET(request: NextRequest) {
    try {
        // Allow Vercel Cron via secret header, otherwise require auth
        const cronSecret = process.env.CRON_SECRET
        const authHeader = request.headers.get('authorization')
        if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
            // Authorized via cron secret — proceed
        } else {
            const auth = await requireAuth()
            if (!auth.authenticated) return auth.response
        }

        const supabase = await createClient()

        // Calculate 7 days ago
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

        // Delete and return the count so ops can see the effect
        const { data, error } = await supabase
            .from('shift_reports')
            .delete()
            .lt('created_at', sevenDaysAgo.toISOString())
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
            message: `Cleaned up ${deletedCount} shift report${deletedCount === 1 ? '' : 's'} older than 7 days`,
        })
    } catch (err) {
        console.error('Shift reports cleanup cron error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
