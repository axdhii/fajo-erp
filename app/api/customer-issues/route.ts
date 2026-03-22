import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/customer-issues — list customer issues for a hotel
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')

        if (!hotelId) {
            return NextResponse.json({ error: 'hotel_id is required' }, { status: 400 })
        }

        let query = supabase
            .from('customer_issues')
            .select('*, unit:units(unit_number), reporter:reported_by(name), resolver:resolved_by(name)')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })

        const status = searchParams.get('status')
        if (status) query = query.eq('status', status)

        const limit = searchParams.get('limit')
        if (limit) query = query.limit(Number(limit))

        const { data, error } = await query

        if (error) {
            console.error('Customer issues fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch customer issues' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Customer issues GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/customer-issues — report a new customer issue
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive reported_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { description, guest_name, guest_phone, unit_id } = body

        if (!description) {
            return NextResponse.json({ error: 'description is required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('customer_issues')
            .insert({
                hotel_id: callerStaff.hotel_id,
                description,
                guest_name: guest_name || null,
                guest_phone: guest_phone || null,
                unit_id: unit_id || null,
                reported_by: callerStaff.id,
                status: 'OPEN',
            })
            .select('*, unit:units(unit_number), reporter:reported_by(name), resolver:resolved_by(name)')
            .single()

        if (error) {
            console.error('Customer issue insert error:', error)
            return NextResponse.json({ error: 'Failed to report customer issue' }, { status: 500 })
        }

        // Notify ZonalOps
        try { await supabase.from('notifications').insert({ hotel_id: callerStaff.hotel_id, recipient_role: 'ZonalOps', type: 'NEW_ISSUE', title: 'New Customer Issue', message: description, link: '/zonal-ops', source_table: 'customer_issues', source_id: data.id }) } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Customer issues POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/customer-issues — update issue status (start / resolve)
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive resolved_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, role').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { issue_id, status, resolution_notes } = body

        if (!issue_id || !status) {
            return NextResponse.json({ error: 'issue_id and status are required' }, { status: 400 })
        }

        if (!['IN_PROGRESS', 'RESOLVED'].includes(status)) {
            return NextResponse.json({ error: 'status must be IN_PROGRESS or RESOLVED' }, { status: 400 })
        }

        // Guard against invalid transitions
        const { data: current, error: fetchError } = await supabase
            .from('customer_issues')
            .select('id, status')
            .eq('id', issue_id)
            .single()

        if (fetchError || !current) {
            return NextResponse.json({ error: 'Customer issue not found' }, { status: 404 })
        }

        if (current.status === 'RESOLVED') {
            return NextResponse.json({ error: 'Issue is already resolved' }, { status: 409 })
        }

        const updatePayload: Record<string, unknown> = { status }

        if (status === 'RESOLVED') {
            updatePayload.resolved_by = callerStaff.id
            updatePayload.resolved_at = new Date().toISOString()
            if (resolution_notes) {
                updatePayload.resolution_notes = resolution_notes
            }
        }

        const { data, error } = await supabase
            .from('customer_issues')
            .update(updatePayload)
            .eq('id', issue_id)
            .select('*, unit:units(unit_number), reporter:reported_by(name), resolver:resolved_by(name)')
            .single()

        if (error) {
            console.error('Customer issue update error:', error)
            return NextResponse.json({ error: 'Failed to update customer issue' }, { status: 500 })
        }

        // Notify the CRE who reported (on resolve)
        if (status === 'RESOLVED' && data.reported_by) {
            try { await supabase.from('notifications').insert({ hotel_id: data.hotel_id, recipient_role: 'FrontDesk', recipient_staff_id: data.reported_by, type: 'ISSUE_RESOLVED', title: 'Customer Issue Resolved', message: `${data.description} — resolved`, link: '/front-desk', source_table: 'customer_issues', source_id: data.id }) } catch { /* never block */ }
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Customer issues PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
