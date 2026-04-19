import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

const VALID_CATEGORIES = ['OBSERVATION', 'DAMAGE', 'SAFETY', 'MAINTENANCE', 'GUEST_COMPLAINT', 'OTHER'] as const

// GET /api/property-reports — list property reports for a hotel
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
            .from('property_reports')
            .select('*, reporter:reported_by(name, role), reviewer:reviewed_by(name)')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })

        const status = searchParams.get('status')
        if (status) query = query.eq('status', status)

        const type = searchParams.get('type')
        if (type) query = query.eq('type', type)

        const from = searchParams.get('from')
        if (from) query = query.gte('created_at', from)

        const to = searchParams.get('to')
        if (to) query = query.lte('created_at', to)

        const limit = searchParams.get('limit')
        query = query.limit(limit ? Number(limit) : 50)

        const { data, error } = await query

        if (error) {
            console.error('Property reports fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch property reports' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Property reports GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/property-reports — create a property report
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive reported_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { type, category, description, photo_url } = body

        if (!description || !description.trim()) {
            return NextResponse.json({ error: 'description is required' }, { status: 400 })
        }

        if (!type || !['REPORT', 'ISSUE'].includes(type)) {
            return NextResponse.json({ error: 'type must be REPORT or ISSUE' }, { status: 400 })
        }

        if (!category || !VALID_CATEGORIES.includes(category)) {
            return NextResponse.json({ error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('property_reports')
            .insert({
                hotel_id: callerStaff.hotel_id,
                type,
                category,
                description: description.trim(),
                photo_url: photo_url || null,
                reported_by: callerStaff.id,
                status: 'OPEN',
            })
            .select('*, reporter:reported_by(name, role), reviewer:reviewed_by(name)')
            .single()

        if (error) {
            console.error('Property report insert error:', error)
            return NextResponse.json({ error: 'Failed to create property report' }, { status: 500 })
        }

        // Notify ZonalOps
        try {
            await supabase.from('notifications').insert({
                hotel_id: callerStaff.hotel_id,
                recipient_role: 'ZonalOps',
                type: type === 'ISSUE' ? 'NEW_OPERATIONAL_ISSUE' : 'NEW_PROPERTY_REPORT',
                title: type === 'ISSUE' ? 'New Issue Reported' : 'New Property Report',
                message: description.trim().substring(0, 100),
                source_table: 'property_reports',
                source_id: data.id,
            })
        } catch { /* never block */ }
        // Notify ZonalHK
        try {
            await supabase.from('notifications').insert({
                hotel_id: callerStaff.hotel_id,
                recipient_role: 'ZonalHK',
                type: type === 'ISSUE' ? 'NEW_OPERATIONAL_ISSUE' : 'NEW_PROPERTY_REPORT',
                title: type === 'ISSUE' ? 'New Issue Reported' : 'New Property Report',
                message: description.trim().substring(0, 100),
                source_table: 'property_reports',
                source_id: data.id,
            })
        } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Property reports POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/property-reports — admin acknowledges or resolves a report
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive reviewed_by from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        // Only Admin or Developer can review reports
        if (!['Admin', 'Developer'].includes(callerStaff.role)) {
            return NextResponse.json({ error: 'Forbidden — insufficient role' }, { status: 403 })
        }

        const body = await request.json()
        const { id, action, review_notes } = body

        if (!id || !action) {
            return NextResponse.json({ error: 'id and action are required' }, { status: 400 })
        }

        if (!['ACKNOWLEDGED', 'RESOLVED'].includes(action)) {
            return NextResponse.json({ error: 'action must be ACKNOWLEDGED or RESOLVED' }, { status: 400 })
        }

        // Fetch current report to guard transitions and get reporter
        const { data: current, error: fetchError } = await supabase
            .from('property_reports')
            .select('id, status, reported_by')
            .eq('id', id)
            .single()

        if (fetchError || !current) {
            return NextResponse.json({ error: 'Property report not found' }, { status: 404 })
        }

        if (current.status === 'RESOLVED') {
            return NextResponse.json({ error: 'Report is already resolved' }, { status: 409 })
        }

        const updatePayload: Record<string, unknown> = {
            status: action,
            reviewed_by: callerStaff.id,
        }

        if (review_notes) {
            updatePayload.review_notes = review_notes
        }

        if (action === 'RESOLVED') {
            updatePayload.resolved_at = getDevNow().toISOString()
        }

        const { data, error } = await supabase
            .from('property_reports')
            .update(updatePayload)
            .eq('id', id)
            .select('*, reporter:reported_by(name, role), reviewer:reviewed_by(name)')
            .single()

        if (error) {
            console.error('Property report update error:', error)
            return NextResponse.json({ error: 'Failed to update property report' }, { status: 500 })
        }

        // Notify the reporter
        try {
            const reporterRole = data.reporter?.role || 'FrontDesk'
            await supabase.from('notifications').insert({
                hotel_id: data.hotel_id,
                recipient_role: reporterRole,
                recipient_staff_id: current.reported_by,
                type: 'REPORT_REVIEWED',
                title: 'Report ' + action,
                message: review_notes || 'Your report has been ' + action.toLowerCase(),
                source_table: 'property_reports',
                source_id: data.id,
            })
        } catch { /* never block */ }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Property reports PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
