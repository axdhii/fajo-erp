import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { generateShiftReport } from '@/lib/shift-report'
import { getDevNow } from '@/lib/dev-time'

// PATCH /api/attendance/clock-out — clock out
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { attendance_id, staff_id } = body

        let existing;

        if (attendance_id) {
            // Find by attendance_id (existing behavior)
            const { data } = await supabase
                .from('attendance')
                .select('*')
                .eq('id', attendance_id)
                .eq('status', 'CLOCKED_IN')
                .single()
            existing = data
        } else if (staff_id) {
            // Find active CLOCKED_IN record by staff_id
            const { data } = await supabase
                .from('attendance')
                .select('*')
                .eq('staff_id', staff_id)
                .eq('status', 'CLOCKED_IN')
                .maybeSingle()
            existing = data
        }

        if (!existing) {
            // No active clock-in found — return 200 with message instead of 404
            return NextResponse.json({ message: 'No active clock-in found', skipped: true })
        }

        // Atomic update: only change if still CLOCKED_IN (prevents race condition on double-click)
        const { data, error } = await supabase
            .from('attendance')
            .update({
                clock_out: getDevNow().toISOString(),
                status: 'CLOCKED_OUT',
            })
            .eq('id', existing.id)
            .eq('status', 'CLOCKED_IN')
            .select('*, staff!attendance_staff_id_fkey(id, name, role)')

        if (error) {
            console.error('Clock out error:', error)
            return NextResponse.json({ error: 'Failed to clock out' }, { status: 500 })
        }

        // If no row was updated, another concurrent call already clocked out — skip report generation
        if (!data || data.length === 0) {
            return NextResponse.json({ message: 'Already clocked out', skipped: true })
        }

        // Generate shift report for property-level roles
        const { data: staffProfile } = await supabase
            .from('staff').select('role, hotel_id').eq('id', existing.staff_id).single()

        const updatedRecord = data[0]
        if (staffProfile && ['FrontDesk', 'HR'].includes(staffProfile.role)) {
            try {
                const result = await generateShiftReport(
                    supabase, existing.staff_id, existing.hotel_id,
                    existing.clock_in, getDevNow().toISOString(), existing.id
                )
                if (result.error) {
                    const e = result.error as { code?: string; message?: string; details?: string; hint?: string }
                    console.error('Shift report insert error:', {
                        code: e.code, message: e.message, details: e.details, hint: e.hint,
                        attendance_id: existing.id, staff_id: existing.staff_id, hotel_id: existing.hotel_id,
                    })
                    return NextResponse.json({ data: updatedRecord, shiftReport: null, reportError: 'Shift report could not be saved', debug: { code: e.code, message: e.message } })
                }
                return NextResponse.json({ data: updatedRecord, shiftReport: result.data })
            } catch (err) {
                const e = err as { code?: string; message?: string; details?: string; hint?: string; stack?: string }
                console.error('Shift report generation failed:', {
                    code: e.code, message: e.message, details: e.details, hint: e.hint, stack: e.stack,
                    attendance_id: existing.id, staff_id: existing.staff_id, hotel_id: existing.hotel_id,
                })
                return NextResponse.json({ data: updatedRecord, shiftReport: null, reportError: 'Shift report generation failed', debug: { message: e.message } })
            }
        }

        return NextResponse.json({ data: updatedRecord })
    } catch (err) {
        console.error('Clock out error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
