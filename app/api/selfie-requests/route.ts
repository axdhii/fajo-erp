import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/selfie-requests — list selfie requests for a hotel
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive caller staff
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')

        if (!hotelId) {
            return NextResponse.json({ error: 'hotel_id is required' }, { status: 400 })
        }

        let query = supabase
            .from('selfie_requests')
            .select('*, requester:requested_by(name, role), target:target_staff_id(name, role)')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })

        // Non-Admin/Developer roles can only see their own requests
        if (!['Admin', 'Developer'].includes(callerStaff.role)) {
            query = query.eq('target_staff_id', callerStaff.id)
        }

        const status = searchParams.get('status')
        if (status) query = query.eq('status', status)

        const targetStaffId = searchParams.get('target_staff_id')
        if (targetStaffId) query = query.eq('target_staff_id', targetStaffId)

        query = query.limit(50)

        const { data, error } = await query

        if (error) {
            console.error('Selfie requests fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch selfie requests' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Selfie requests GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/selfie-requests — admin creates a selfie request
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive caller staff
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        // Only Admin or Developer can request selfies
        if (!['Admin', 'Developer'].includes(callerStaff.role)) {
            return NextResponse.json({ error: 'Forbidden — Admin role required' }, { status: 403 })
        }

        const body = await request.json()
        const { target_staff_id, reason } = body

        if (!target_staff_id) {
            return NextResponse.json({ error: 'target_staff_id is required' }, { status: 400 })
        }

        // Check no existing PENDING request for this target (prevent spam)
        const { data: existing } = await supabase
            .from('selfie_requests')
            .select('id')
            .eq('target_staff_id', target_staff_id)
            .eq('status', 'PENDING')
            .limit(1)

        if (existing && existing.length > 0) {
            return NextResponse.json({ error: 'A pending selfie request already exists for this staff member' }, { status: 409 })
        }

        const { data, error } = await supabase
            .from('selfie_requests')
            .insert({
                hotel_id: callerStaff.hotel_id,
                requested_by: callerStaff.id,
                target_staff_id,
                reason: reason || null,
                status: 'PENDING',
            })
            .select('*, requester:requested_by(name, role), target:target_staff_id(name, role)')
            .single()

        if (error) {
            console.error('Selfie request insert error:', error)
            return NextResponse.json({ error: 'Failed to create selfie request' }, { status: 500 })
        }

        // Notify target staff — recipient_role is NOT NULL so we must provide it
        try {
            // Look up target staff's role
            const { data: targetStaff } = await supabase
                .from('staff').select('role').eq('id', target_staff_id).single()
            await supabase.from('notifications').insert({
                hotel_id: callerStaff.hotel_id,
                recipient_role: targetStaff?.role || 'FrontDesk',
                recipient_staff_id: target_staff_id,
                type: 'SELFIE_REQUEST',
                title: 'Selfie Requested',
                message: reason || 'Admin has requested a selfie from you',
                source_table: 'selfie_requests',
                source_id: data.id,
            })
        } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Selfie requests POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/selfie-requests — staff submits selfie
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive caller staff
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { id, photo_url } = body

        if (!id || !photo_url) {
            return NextResponse.json({ error: 'id and photo_url are required' }, { status: 400 })
        }

        // Fetch current request to validate ownership and status
        const { data: current, error: fetchError } = await supabase
            .from('selfie_requests')
            .select('id, status, target_staff_id, requested_by')
            .eq('id', id)
            .single()

        if (fetchError || !current) {
            return NextResponse.json({ error: 'Selfie request not found' }, { status: 404 })
        }

        if (current.target_staff_id !== callerStaff.id) {
            return NextResponse.json({ error: 'Forbidden — this request is not assigned to you' }, { status: 403 })
        }

        if (current.status !== 'PENDING') {
            return NextResponse.json({ error: 'This request is no longer pending' }, { status: 409 })
        }

        const { data, error } = await supabase
            .from('selfie_requests')
            .update({
                status: 'COMPLETED',
                photo_url,
                completed_at: new Date().toISOString(),
            })
            .eq('id', id)
            .select('*, requester:requested_by(name, role), target:target_staff_id(name, role)')
            .single()

        if (error) {
            console.error('Selfie request update error:', error)
            return NextResponse.json({ error: 'Failed to update selfie request' }, { status: 500 })
        }

        // Notify the admin who requested it
        try {
            await supabase.from('notifications').insert({
                hotel_id: callerStaff.hotel_id,
                recipient_role: 'Admin',
                recipient_staff_id: current.requested_by,
                type: 'SELFIE_COMPLETED',
                title: 'Selfie Submitted',
                message: `${callerStaff.name || 'Staff'} has submitted their selfie`,
                source_table: 'selfie_requests',
                source_id: data.id,
            })
        } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Selfie requests PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
