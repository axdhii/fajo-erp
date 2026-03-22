import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// GET /api/restock — list restock requests
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
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })

        const status = searchParams.get('status')
        if (status) query = query.eq('status', status)

        const { data, error } = await query

        if (error) {
            console.error('Restock fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch restock requests' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Restock GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/restock — create restock request
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { unit_id, hotel_id, items, requested_by } = body

        if (!hotel_id || !items) {
            return NextResponse.json({ error: 'hotel_id and items are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('restock_requests')
            .insert({
                unit_id: unit_id || null,
                hotel_id,
                items,
                requested_by: requested_by || null,
                status: 'PENDING',
            })
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .single()

        if (error) {
            console.error('Restock insert error:', error)
            return NextResponse.json({ error: 'Failed to create restock request' }, { status: 500 })
        }

        // Notify ZonalOps
        try { await supabase.from('notifications').insert({ hotel_id, recipient_role: 'ZonalOps', type: 'NEW_RESTOCK', title: 'New Restock Request', message: items, link: '/zonal-ops', source_table: 'restock_requests', source_id: data.id }) } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Restock POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/restock — mark restock request as done
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive completed_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { request_id } = body

        if (!request_id) {
            return NextResponse.json({ error: 'request_id is required' }, { status: 400 })
        }

        // Fetch current request to guard against re-completion
        const { data: currentRequest, error: requestFetchError } = await supabase
            .from('restock_requests')
            .select('id, status')
            .eq('id', request_id)
            .single()

        if (requestFetchError || !currentRequest) {
            return NextResponse.json({ error: 'Restock request not found' }, { status: 404 })
        }

        if (currentRequest.status === 'DONE') {
            return NextResponse.json({ error: 'Restock request is already completed' }, { status: 409 })
        }

        const { data, error } = await supabase
            .from('restock_requests')
            .update({
                status: 'DONE',
                completed_at: getDevNow().toISOString(),
                completed_by: callerStaff.id,
            })
            .eq('id', request_id)
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .single()

        if (error) {
            console.error('Restock update error:', error)
            return NextResponse.json({ error: 'Failed to update restock request' }, { status: 500 })
        }

        // Notify the CRE who requested
        if (data.requested_by) {
            try { await supabase.from('notifications').insert({ hotel_id: data.hotel_id, recipient_role: 'FrontDesk', recipient_staff_id: data.requested_by, type: 'RESTOCK_DONE', title: 'Restock Completed', message: `${data.items} — restocked by ${callerStaff.name || 'staff'}`, link: '/front-desk', source_table: 'restock_requests', source_id: data.id }) } catch { /* never block */ }
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Restock PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
