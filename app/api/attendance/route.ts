import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

function determineShift(clockInDate: Date): 'DAY' | 'NIGHT' {
    // Convert to IST hours
    const istHours = new Date(clockInDate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getHours()
    // 7:00AM - 6:59PM → DAY, 7:00PM - 6:59AM → NIGHT
    return istHours >= 7 && istHours < 19 ? 'DAY' : 'NIGHT'
}

// GET /api/attendance — list attendance records
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')
        const date = searchParams.get('date') // YYYY-MM-DD
        const status = searchParams.get('status') // CLOCKED_IN or CLOCKED_OUT

        let query = supabase
            .from('attendance')
            .select('*, staff!attendance_staff_id_fkey(id, name, role, phone)')
            .order('clock_in', { ascending: false })

        if (hotelId) query = query.eq('hotel_id', hotelId)
        if (status) query = query.eq('status', status)
        if (date) {
            const nextDay = new Date(new Date(date + 'T00:00:00+05:30').getTime() + 86400000).toISOString()
            query = query.gte('clock_in', `${date}T00:00:00+05:30`).lt('clock_in', nextDay)
        }

        const { data, error } = await query

        if (error) {
            console.error('Attendance fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch attendance' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Attendance GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/attendance — clock in
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { staff_id, hotel_id, photo } = body

        if (!staff_id || !hotel_id) {
            return NextResponse.json({ error: 'staff_id and hotel_id are required' }, { status: 400 })
        }

        if (!photo) {
            return NextResponse.json({ error: 'Photo is required for clock-in' }, { status: 400 })
        }

        const now = new Date()
        const shift = determineShift(now)

        // Check if staff already has an active (not clocked out) attendance record
        // This handles the midnight edge case because it checks status, not date boundaries
        const { data: activeRecord } = await supabase
            .from('attendance')
            .select('id')
            .eq('staff_id', staff_id)
            .eq('status', 'CLOCKED_IN')
            .maybeSingle()

        if (activeRecord) {
            return NextResponse.json({ error: 'Staff is already clocked in. Clock out first.' }, { status: 409 })
        }

        // Check if already clocked in today for this shift
        const todayStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) // YYYY-MM-DD
        const { data: existing } = await supabase
            .from('attendance')
            .select('id')
            .eq('staff_id', staff_id)
            .eq('shift', shift)
            .gte('clock_in', `${todayStr}T00:00:00+05:30`)
            .lt('clock_in', new Date(new Date(todayStr + 'T00:00:00+05:30').getTime() + 86400000).toISOString())
            .maybeSingle()

        if (existing) {
            return NextResponse.json({ error: `Already clocked in for ${shift} shift today` }, { status: 409 })
        }

        const { data, error } = await supabase
            .from('attendance')
            .insert({
                staff_id,
                hotel_id,
                shift,
                clock_in: now.toISOString(),
                clock_in_photo: photo || null,
                status: 'CLOCKED_IN',
            })
            .select('*, staff!attendance_staff_id_fkey(id, name, role)')
            .single()

        if (error) {
            console.error('Clock in error:', error)
            return NextResponse.json({ error: 'Failed to clock in' }, { status: 500 })
        }

        return NextResponse.json({ data, shift })
    } catch (err) {
        console.error('Attendance POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/attendance — HR validates attendance (approve / mark late)
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { attendance_id, validation_status, validated_by } = body

        if (!attendance_id || !validation_status) {
            return NextResponse.json({ error: 'attendance_id and validation_status are required' }, { status: 400 })
        }

        if (!['APPROVED', 'LATE'].includes(validation_status)) {
            return NextResponse.json({ error: 'validation_status must be APPROVED or LATE' }, { status: 400 })
        }

        // Guard: reject if already validated (not PENDING_REVIEW)
        const { data: existing } = await supabase
            .from('attendance').select('validation_status').eq('id', attendance_id).single()
        if (!existing) {
            return NextResponse.json({ error: 'Record not found' }, { status: 404 })
        }
        if (existing.validation_status !== 'PENDING_REVIEW') {
            return NextResponse.json({ error: 'Already validated' }, { status: 409 })
        }

        const { data, error } = await supabase
            .from('attendance')
            .update({
                validation_status,
                validated_by: validated_by || null,
                validated_at: new Date().toISOString(),
            })
            .eq('id', attendance_id)
            .select('*, staff!attendance_staff_id_fkey(id, name, role, phone)')
            .single()

        if (error) {
            console.error('Attendance validation error:', error)
            return NextResponse.json({ error: 'Failed to validate attendance' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Attendance PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
