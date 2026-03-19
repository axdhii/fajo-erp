import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/shift-reports?hotel_id=X&from=ISO&to=ISO&staff_id=Y
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')
        const from = searchParams.get('from')
        const to = searchParams.get('to')
        const staffId = searchParams.get('staff_id')

        if (!hotelId) {
            return NextResponse.json({ error: 'hotel_id is required' }, { status: 400 })
        }

        let query = supabase
            .from('shift_reports')
            .select('*, staff:staff_id(name, role)')
            .eq('hotel_id', hotelId)
            .order('shift_start', { ascending: false })

        if (from) query = query.gte('shift_start', from)
        if (to) query = query.lte('shift_start', to)
        if (staffId) query = query.eq('staff_id', staffId)

        const { data, error } = await query

        if (error) {
            console.error('Shift reports fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch shift reports' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Shift reports error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
