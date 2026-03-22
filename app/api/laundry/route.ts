import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// GET /api/laundry — list laundry orders
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
            .from('laundry_orders')
            .select('*, staff:created_by(name)')
            .eq('hotel_id', hotelId)

        const status = searchParams.get('status')
        if (status) {
            const statuses = status.split(',')
            query = query.in('status', statuses)
        }

        const { data, error } = await query.order('created_at', { ascending: false })

        if (error) {
            console.error('Laundry fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch laundry orders' }, { status: 500 })
        }

        return NextResponse.json({ data: data || [] })
    } catch (err) {
        console.error('Laundry GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/laundry — create laundry order
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive created_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { hotel_id, items_description, item_count, notes } = body

        if (!hotel_id || !items_description) {
            return NextResponse.json({ error: 'hotel_id and items_description are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('laundry_orders')
            .insert({
                hotel_id,
                items_description,
                item_count: item_count || null,
                notes: notes || null,
                status: 'OUT',
                sent_at: getDevNow().toISOString(),
                created_by: callerStaff.id,
            })
            .select('*, staff:created_by(name)')
            .single()

        if (error) {
            console.error('Laundry insert error:', error)
            return NextResponse.json({ error: 'Failed to create laundry order' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Laundry POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/laundry — update laundry order
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive actor from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { order_id, status, amount } = body

        if (!order_id) {
            return NextResponse.json({ error: 'order_id is required' }, { status: 400 })
        }

        // Fetch current order to guard against invalid transitions
        const { data: currentOrder, error: fetchError } = await supabase
            .from('laundry_orders')
            .select('id, status')
            .eq('id', order_id)
            .single()

        if (fetchError || !currentOrder) {
            return NextResponse.json({ error: 'Laundry order not found' }, { status: 404 })
        }

        const updates: Record<string, unknown> = {}

        if (status) {
            const validStatuses = ['OUT', 'RETURNED', 'PAID']
            if (!validStatuses.includes(status)) {
                return NextResponse.json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` }, { status: 400 })
            }

            // Guard: can't mark RETURNED if already RETURNED or PAID
            if (status === 'RETURNED') {
                if (currentOrder.status === 'RETURNED') {
                    return NextResponse.json({ error: 'Order is already marked as returned' }, { status: 409 })
                }
                if (currentOrder.status === 'PAID') {
                    return NextResponse.json({ error: 'Order is already paid — cannot revert to returned' }, { status: 409 })
                }
                updates.status = 'RETURNED'
                updates.returned_at = getDevNow().toISOString()
            }

            // Guard: can't mark PAID if not RETURNED
            if (status === 'PAID') {
                if (currentOrder.status !== 'RETURNED') {
                    return NextResponse.json({ error: 'Order must be in RETURNED status before marking as PAID' }, { status: 409 })
                }
                if (amount === undefined || amount === null || Number(amount) <= 0) {
                    return NextResponse.json({ error: 'A positive amount is required to mark as PAID' }, { status: 400 })
                }
                updates.status = 'PAID'
                updates.amount = Number(amount)
            }
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('laundry_orders')
            .update(updates)
            .eq('id', order_id)
            .select('*, staff:created_by(name)')
            .single()

        if (error) {
            console.error('Laundry update error:', error)
            return NextResponse.json({ error: 'Failed to update laundry order' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Laundry PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
