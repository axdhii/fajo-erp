import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/staff — list staff
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')

        let query = supabase
            .from('staff')
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .order('name', { ascending: true })

        if (hotelId) query = query.eq('hotel_id', hotelId)

        const excludeRole = searchParams.get('exclude_role')
        if (excludeRole) query = query.neq('role', excludeRole)

        const clockable = searchParams.get('clockable')
        if (clockable === 'true') query = query.is('user_id', null)

        const { data, error } = await query

        if (error) {
            console.error('Staff fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Staff GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/staff — update staff name/phone/salary (Admin/HR/Developer only)
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('role').eq('user_id', auth.userId).single()
        if (!callerStaff || !['Admin', 'Developer', 'HR'].includes(callerStaff.role)) {
            return NextResponse.json({ error: 'Staff edits require Admin, Developer, or HR role' }, { status: 403 })
        }

        const body = await request.json()
        const { staff_id, name, phone, base_salary } = body

        if (!staff_id) {
            return NextResponse.json({ error: 'staff_id is required' }, { status: 400 })
        }

        const updates: Record<string, unknown> = {}
        if (name !== undefined) updates.name = name
        if (phone !== undefined) updates.phone = phone
        if (base_salary !== undefined) {
            const sal = Number(base_salary)
            if (Number.isNaN(sal) || sal < 0) {
                return NextResponse.json({ error: 'base_salary must be a non-negative number' }, { status: 400 })
            }
            updates.base_salary = sal
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('staff')
            .update(updates)
            .eq('id', staff_id)
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .single()

        if (error) {
            console.error('Staff update error:', error)
            return NextResponse.json({ error: 'Failed to update staff' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Staff PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
