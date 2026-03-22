import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// GET /api/staff-incidents
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')
        const staffId = searchParams.get('staff_id')
        const month = searchParams.get('month') // YYYY-MM

        let query = supabase
            .from('staff_incidents')
            .select('*, staff:staff_id(id, name, role)')
            .order('incident_date', { ascending: false })

        if (hotelId) query = query.eq('hotel_id', hotelId)
        if (staffId) query = query.eq('staff_id', staffId)
        if (month) {
            const start = `${month}-01`
            const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0)
            const end = `${month}-${String(endDate.getDate()).padStart(2, '0')}`
            query = query.gte('incident_date', start).lte('incident_date', end)
        }

        const { data, error } = await query

        if (error) {
            console.error('Incidents fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch incidents' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Incidents GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/staff-incidents
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { staff_id, hotel_id, category, description, penalty_amount, incident_date, recorded_by } = body

        if (!staff_id || !hotel_id || !category) {
            return NextResponse.json({ error: 'staff_id, hotel_id, and category are required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('staff_incidents')
            .insert({
                staff_id,
                hotel_id,
                category,
                description: description || null,
                penalty_amount: Math.max(0, Number(penalty_amount) || 0),
                incident_date: incident_date || getDevNow().toISOString().split('T')[0],
                recorded_by: recorded_by || null,
            })
            .select('*, staff:staff_id(id, name, role)')
            .single()

        if (error) {
            console.error('Incident insert error:', error)
            return NextResponse.json({ error: 'Failed to record incident' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Incidents POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
