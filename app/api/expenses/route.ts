import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { requireHotelScope } from '@/lib/hotel-scope'
import { getDevNow } from '@/lib/dev-time'

// GET /api/expenses — list property expenses for a hotel
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const scope = await requireHotelScope(supabase, auth.userId, searchParams.get('hotel_id'))
        if (!scope.ok) return scope.response

        let query = supabase
            .from('property_expenses')
            .select('*, requester:requested_by(name), reviewer:reviewed_by(name)')
            .eq('hotel_id', scope.hotelId)
            .order('created_at', { ascending: false })

        const status = searchParams.get('status')
        if (status) query = query.eq('status', status)

        const limit = searchParams.get('limit')
        if (limit) query = query.limit(Number(limit))

        const { data, error } = await query

        if (error) {
            console.error('Expenses fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Expenses GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/expenses — create a property expense request
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive requested_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { description, amount, category } = body

        if (!description || !amount) {
            return NextResponse.json({ error: 'description and amount are required' }, { status: 400 })
        }

        if (Number(amount) <= 0) {
            return NextResponse.json({ error: 'amount must be positive' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('property_expenses')
            .insert({
                hotel_id: callerStaff.hotel_id,
                description,
                amount: Number(amount),
                category: category || null,
                requested_by: callerStaff.id,
                status: 'PENDING',
            })
            .select('*, requester:requested_by(name), reviewer:reviewed_by(name)')
            .single()

        if (error) {
            console.error('Expense insert error:', error)
            return NextResponse.json({ error: 'Failed to create expense request' }, { status: 500 })
        }

        // Notify ZonalOps
        try { await supabase.from('notifications').insert({ hotel_id: callerStaff.hotel_id, recipient_role: 'ZonalOps', type: 'NEW_EXPENSE', title: 'New Expense Request', message: `${description} — ₹${amount}`, link: '/zonal-ops', source_table: 'property_expenses', source_id: data.id }) } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Expenses POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/expenses — approve or reject an expense
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive reviewed_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        // Only ZonalOps and Admin can approve/reject
        if (!['Admin', 'Developer', 'ZonalOps'].includes(callerStaff.role)) {
            return NextResponse.json({ error: 'Forbidden — insufficient role' }, { status: 403 })
        }

        const body = await request.json()
        const { expense_id, action, rejection_reason } = body

        if (!expense_id || !action) {
            return NextResponse.json({ error: 'expense_id and action are required' }, { status: 400 })
        }

        if (!['APPROVED', 'REJECTED'].includes(action)) {
            return NextResponse.json({ error: 'action must be APPROVED or REJECTED' }, { status: 400 })
        }

        // Guard against double-review
        const { data: current, error: fetchError } = await supabase
            .from('property_expenses')
            .select('id, status')
            .eq('id', expense_id)
            .single()

        if (fetchError || !current) {
            return NextResponse.json({ error: 'Expense not found' }, { status: 404 })
        }

        if (current.status !== 'PENDING') {
            return NextResponse.json({ error: 'Expense has already been reviewed' }, { status: 409 })
        }

        const updatePayload: Record<string, unknown> = {
            status: action,
            reviewed_by: callerStaff.id,
            reviewed_at: getDevNow().toISOString(),
        }

        if (action === 'REJECTED' && rejection_reason) {
            updatePayload.rejection_reason = rejection_reason
        }

        const { data: rows, error } = await supabase
            .from('property_expenses')
            .update(updatePayload)
            .eq('id', expense_id)
            .eq('status', 'PENDING')
            .select('*, requester:requested_by(name), reviewer:reviewed_by(name)')

        if (error) {
            console.error('Expense review error:', error)
            return NextResponse.json({ error: 'Failed to review expense' }, { status: 500 })
        }
        if (!rows || rows.length === 0) {
            return NextResponse.json({ error: 'Expense was just reviewed by another admin — refresh' }, { status: 409 })
        }
        const data = rows[0]

        // Notify the submitter (use their actual role, not hardcoded FrontDesk)
        try {
            const { data: submitter } = await supabase.from('staff').select('role').eq('id', data.requested_by).single()
            const isApproved = action === 'APPROVED'
            const actorName = callerStaff.name || 'staff'
            await supabase.from('notifications').insert({
                hotel_id: data.hotel_id, recipient_role: submitter?.role || 'FrontDesk', recipient_staff_id: data.requested_by,
                type: isApproved ? 'EXPENSE_APPROVED' : 'EXPENSE_REJECTED',
                title: isApproved ? 'Expense Approved' : 'Expense Rejected',
                message: `${data.description} — ₹${data.amount} ${isApproved ? 'approved' : 'rejected'} by ${actorName}${!isApproved && rejection_reason ? ': ' + rejection_reason : ''}`,
                link: '/front-desk', source_table: 'property_expenses', source_id: data.id,
            })
        } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Expenses PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
