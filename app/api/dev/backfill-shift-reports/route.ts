import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { generateShiftReport } from '@/lib/shift-report'

// POST /api/dev/backfill-shift-reports — Developer-only one-shot backfill
// Finds all CLOCKED_OUT attendance rows for FrontDesk/HR without a matching
// shift_reports row and generates the report via the canonical helper.
export async function POST() {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        const { data: caller } = await supabase
            .from('staff').select('role').eq('user_id', auth.userId).single()
        if (!caller || caller.role !== 'Developer') {
            return NextResponse.json({ error: 'Forbidden — Developer role required' }, { status: 403 })
        }

        // Fetch CLOCKED_OUT attendance with staff role FrontDesk/HR, left-joined
        // with shift_reports to find ones missing a report.
        const { data: attendanceRows, error: attErr } = await supabase
            .from('attendance')
            .select('id, staff_id, hotel_id, clock_in, clock_out, staff!attendance_staff_id_fkey(role, name)')
            .eq('status', 'CLOCKED_OUT')
            .not('clock_out', 'is', null)
            .not('clock_in', 'is', null)

        if (attErr) {
            return NextResponse.json({ error: 'Failed to query attendance', debug: attErr }, { status: 500 })
        }

        const { data: existingReports } = await supabase
            .from('shift_reports').select('attendance_id')
        const existingIds = new Set((existingReports || []).map(r => r.attendance_id))

        type AttRow = {
            id: string; staff_id: string; hotel_id: string
            clock_in: string; clock_out: string
            staff: { role: string; name: string } | { role: string; name: string }[] | null
        }

        const candidates = ((attendanceRows || []) as AttRow[]).filter(a => {
            if (existingIds.has(a.id)) return false
            const role = Array.isArray(a.staff) ? a.staff[0]?.role : a.staff?.role
            return role === 'FrontDesk' || role === 'HR'
        })

        const results: Array<{ attendance_id: string; name: string; status: 'ok' | 'error'; message?: string }> = []

        for (const a of candidates) {
            const name = (Array.isArray(a.staff) ? a.staff[0]?.name : a.staff?.name) || 'unknown'
            try {
                const result = await generateShiftReport(
                    supabase, a.staff_id, a.hotel_id, a.clock_in, a.clock_out, a.id,
                )
                if (result.error) {
                    const e = result.error as { code?: string; message?: string; details?: string }
                    results.push({ attendance_id: a.id, name, status: 'error', message: `${e.code || ''} ${e.message || ''} ${e.details || ''}`.trim() })
                } else {
                    results.push({ attendance_id: a.id, name, status: 'ok' })
                }
            } catch (err) {
                const e = err as { message?: string }
                results.push({ attendance_id: a.id, name, status: 'error', message: e.message || 'unknown error' })
            }
        }

        const backfilled = results.filter(r => r.status === 'ok').length
        const errors = results.filter(r => r.status === 'error')
        return NextResponse.json({ backfilled, totalCandidates: candidates.length, errors, results })
    } catch (err) {
        console.error('Backfill shift reports error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
