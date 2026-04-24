import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireCronOrAdmin } from '@/lib/cron-auth'
import { getDevNow } from '@/lib/dev-time'
import { generateShiftReport } from '@/lib/shift-report'

// GET /api/cron/attendance-safety
// Called by Vercel Cron at shift boundaries (7:15 AM and 7:15 PM IST).
// Closes all CLOCKED_IN attendance records for the shift that just ended.
// Also generates shift reports for FrontDesk/HR roles so their activity is captured.
// In production, requires CRON_SECRET header. In dev, requires auth.
export async function GET(request: NextRequest) {
    try {
        const gate = await requireCronOrAdmin(request)
        if (!gate.ok) return gate.response

        const supabase = await createClient()
        const now = getDevNow()
        const nowIso = now.toISOString()

        // Determine IST hour using reliable Date arithmetic (avoid locale-dependent parsing)
        const istDate = new Date(now.getTime() + 330 * 60 * 1000)
        const istHour = istDate.getUTCHours()

        // DAY shift ends at 7 PM (19:00), NIGHT shift ends at 7 AM (07:00)
        // This cron runs at 7:15 PM and 7:15 AM IST
        const endingShift = (istHour >= 19 || istHour < 7) ? 'DAY' : 'NIGHT'

        // Find all CLOCKED_IN records for the ending shift — include staff context for reports
        const { data: openRecords, error } = await supabase
            .from('attendance')
            .select('id, staff_id, hotel_id, clock_in, staff:staff_id(role)')
            .eq('status', 'CLOCKED_IN')
            .eq('shift', endingShift)

        if (error || !openRecords || openRecords.length === 0) {
            return NextResponse.json({ message: 'No open records to close', closed: 0, reports: 0 })
        }

        // Close them all atomically (only rows still CLOCKED_IN will be updated)
        const ids = openRecords.map(r => r.id)
        const { error: updateError } = await supabase
            .from('attendance')
            .update({
                clock_out: nowIso,
                status: 'CLOCKED_OUT',
            })
            .in('id', ids)
            .eq('status', 'CLOCKED_IN')

        if (updateError) {
            console.error('Attendance safety cron update error:', updateError)
            return NextResponse.json({ error: 'Failed to close records' }, { status: 500 })
        }

        // Generate shift reports for property-level roles (FrontDesk, HR)
        // Non-blocking: log errors but don't fail the cron
        let reportsGenerated = 0
        type OpenRecord = { id: string; staff_id: string; hotel_id: string; clock_in: string; staff: { role: string } | { role: string }[] | null }
        for (const record of openRecords as OpenRecord[]) {
            // Supabase may return staff as object or array depending on join cardinality
            const staffRole = Array.isArray(record.staff) ? record.staff[0]?.role : record.staff?.role
            if (staffRole && ['FrontDesk', 'HR'].includes(staffRole)) {
                try {
                    const result = await generateShiftReport(
                        supabase,
                        record.staff_id,
                        record.hotel_id,
                        record.clock_in,
                        nowIso,
                        record.id,
                    )
                    if (result.error) {
                        console.error(`Shift report failed for attendance ${record.id}:`, result.error)
                    } else {
                        reportsGenerated++
                    }
                } catch (reportErr) {
                    console.error(`Shift report exception for attendance ${record.id}:`, reportErr)
                }
            }
        }

        return NextResponse.json({
            message: `Closed ${ids.length} attendance records for ${endingShift} shift`,
            closed: ids.length,
            reports: reportsGenerated,
        })
    } catch (err) {
        console.error('Attendance safety cron error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
