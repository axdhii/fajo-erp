import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// GET /api/cron/attendance-safety
// Called by Vercel Cron at shift boundaries (7:15 AM and 7:15 PM IST).
// Closes all CLOCKED_IN attendance records for the shift that just ended.
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
        const now = getDevNow()

        // Determine which shift just ended based on IST hour
        const istHour = parseInt(
            now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false })
        )

        // DAY shift ends at 7 PM (19:00), NIGHT shift ends at 7 AM (07:00)
        // This cron runs at 7:15 PM and 7:15 AM IST
        const endingShift = (istHour >= 19 || istHour < 7) ? 'DAY' : 'NIGHT'

        // Find all CLOCKED_IN records for the ending shift
        const { data: openRecords, error } = await supabase
            .from('attendance')
            .select('id')
            .eq('status', 'CLOCKED_IN')
            .eq('shift', endingShift)

        if (error || !openRecords || openRecords.length === 0) {
            return NextResponse.json({ message: 'No open records to close', closed: 0 })
        }

        // Close them all
        const ids = openRecords.map(r => r.id)
        const { error: updateError } = await supabase
            .from('attendance')
            .update({
                clock_out: now.toISOString(),
                status: 'CLOCKED_OUT',
            })
            .in('id', ids)

        if (updateError) {
            console.error('Attendance safety cron update error:', updateError)
            return NextResponse.json({ error: 'Failed to close records' }, { status: 500 })
        }

        return NextResponse.json({
            message: `Closed ${ids.length} attendance records for ${endingShift} shift`,
            closed: ids.length,
        })
    } catch (err) {
        console.error('Attendance safety cron error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
