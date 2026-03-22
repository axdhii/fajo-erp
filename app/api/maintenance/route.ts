import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// GET /api/maintenance — list maintenance tickets
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
            .from('maintenance_tickets')
            .select('*, unit:units(unit_number), staff:reported_by(name)')
            .eq('hotel_id', hotelId)

        const status = searchParams.get('status')
        if (status) {
            const statuses = status.split(',')
            query = query.in('status', statuses)
        }

        // Order by priority (URGENT first) then created_at desc
        // Use a custom order: URGENT=1, HIGH=2, MEDIUM=3, LOW=4
        const { data, error } = await query.order('created_at', { ascending: false })

        if (error) {
            console.error('Maintenance fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch maintenance tickets' }, { status: 500 })
        }

        // Sort by priority in application layer since Supabase doesn't support custom enum ordering
        const priorityOrder: Record<string, number> = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }
        const sorted = (data || []).sort((a: { priority: string; created_at: string }, b: { priority: string; created_at: string }) => {
            const pa = priorityOrder[a.priority] ?? 5
            const pb = priorityOrder[b.priority] ?? 5
            if (pa !== pb) return pa - pb
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })

        return NextResponse.json({ data: sorted })
    } catch (err) {
        console.error('Maintenance GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/maintenance — create maintenance ticket
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { unit_id, hotel_id, description, priority, reported_by } = body

        if (!hotel_id || !description || !priority) {
            return NextResponse.json({ error: 'hotel_id, description, and priority are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('maintenance_tickets')
            .insert({
                unit_id: unit_id || null,
                hotel_id,
                description,
                priority,
                reported_by: reported_by || null,
                status: 'OPEN',
            })
            .select('*, unit:units(unit_number), staff:reported_by(name)')
            .single()

        if (error) {
            console.error('Maintenance insert error:', error)
            return NextResponse.json({ error: 'Failed to create maintenance ticket' }, { status: 500 })
        }

        // Notify ZonalHK
        try { await supabase.from('notifications').insert({ hotel_id, recipient_role: 'ZonalHK', type: 'NEW_MAINTENANCE', title: 'New Maintenance Ticket', message: `${data.unit?.unit_number ? data.unit.unit_number + ' — ' : ''}${description}`, link: '/zonal-hk', source_table: 'maintenance_tickets', source_id: data.id }) } catch { /* never block */ }
        // If URGENT, also notify ZonalManager
        if (priority === 'URGENT') { try { await supabase.from('notifications').insert({ hotel_id, recipient_role: 'ZonalManager', type: 'URGENT_MAINTENANCE', title: 'URGENT Maintenance', message: `${data.unit?.unit_number ? data.unit.unit_number + ' — ' : ''}${description}`, link: '/zonal', source_table: 'maintenance_tickets', source_id: data.id }) } catch { /* never block */ } }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Maintenance POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/maintenance — update maintenance ticket
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive resolved_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { ticket_id, status, resolution_notes } = body

        if (!ticket_id) {
            return NextResponse.json({ error: 'ticket_id is required' }, { status: 400 })
        }

        // Fetch current ticket to guard against invalid transitions
        const { data: currentTicket, error: ticketFetchError } = await supabase
            .from('maintenance_tickets')
            .select('id, status')
            .eq('id', ticket_id)
            .single()

        if (ticketFetchError || !currentTicket) {
            return NextResponse.json({ error: 'Maintenance ticket not found' }, { status: 404 })
        }

        const updates: Record<string, unknown> = {}

        if (status) {
            const validStatuses = ['OPEN', 'IN_PROGRESS', 'RESOLVED']
            if (!validStatuses.includes(status)) {
                return NextResponse.json({ error: `Invalid status. Allowed: ${validStatuses.join(', ')}` }, { status: 400 })
            }
            if (status === 'RESOLVED' && currentTicket.status === 'RESOLVED') {
                return NextResponse.json({ error: 'Ticket is already resolved' }, { status: 409 })
            }
            updates.status = status
            if (status === 'RESOLVED') {
                updates.resolved_at = getDevNow().toISOString()
                updates.resolved_by = callerStaff.id
            }
        }

        if (resolution_notes !== undefined) {
            updates.resolution_notes = resolution_notes
        }

        if (Object.keys(updates).length === 0) {
            return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('maintenance_tickets')
            .update(updates)
            .eq('id', ticket_id)
            .select('*, unit:units(unit_number), staff:reported_by(name)')
            .single()

        if (error) {
            console.error('Maintenance update error:', error)
            return NextResponse.json({ error: 'Failed to update maintenance ticket' }, { status: 500 })
        }

        // When a ticket is resolved and has a unit, auto-set unit to AVAILABLE
        // if no other open tickets remain for that unit
        if (status === 'RESOLVED' && data.unit_id) {
            const { count } = await supabase
                .from('maintenance_tickets')
                .select('id', { count: 'exact', head: true })
                .eq('unit_id', data.unit_id)
                .in('status', ['OPEN', 'IN_PROGRESS'])

            if (count === 0) {
                await supabase
                    .from('units')
                    .update({ status: 'AVAILABLE', maintenance_reason: null })
                    .eq('id', data.unit_id)
                    .eq('status', 'MAINTENANCE')
            }
        }

        // Notify FrontDesk when resolved
        if (status === 'RESOLVED') {
            const unitNum = data.unit?.unit_number || 'Unit'
            try { await supabase.from('notifications').insert({ hotel_id: data.hotel_id, recipient_role: 'FrontDesk', type: 'MAINTENANCE_RESOLVED', title: 'Maintenance Resolved', message: `${unitNum} — back to available (resolved by ${callerStaff.name || 'staff'})`, link: '/front-desk', source_table: 'maintenance_tickets', source_id: data.id }) } catch { /* never block */ }
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Maintenance PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
