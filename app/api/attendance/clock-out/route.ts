import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// PATCH /api/attendance/clock-out — clock out
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { attendance_id } = body

        if (!attendance_id) {
            return NextResponse.json({ error: 'attendance_id is required' }, { status: 400 })
        }

        // Verify the record exists and is clocked in
        const { data: existing, error: fetchErr } = await supabase
            .from('attendance')
            .select('*')
            .eq('id', attendance_id)
            .eq('status', 'CLOCKED_IN')
            .single()

        if (fetchErr || !existing) {
            return NextResponse.json({ error: 'Attendance record not found or already clocked out' }, { status: 404 })
        }

        const { data, error } = await supabase
            .from('attendance')
            .update({
                clock_out: new Date().toISOString(),
                status: 'CLOCKED_OUT',
            })
            .eq('id', attendance_id)
            .select('*, staff!attendance_staff_id_fkey(id, name, role)')
            .single()

        if (error) {
            console.error('Clock out error:', error)
            return NextResponse.json({ error: 'Failed to clock out' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Clock out error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
