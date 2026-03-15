import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/reservations/group?groupId=X
// Fetches all bookings in a dorm group
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const groupId = searchParams.get('groupId')

        if (!groupId) {
            return NextResponse.json(
                { error: 'groupId is required' },
                { status: 400 }
            )
        }

        const { data: bookings, error } = await supabase
            .from('bookings')
            .select('*, guests(id, name, phone, aadhar_number, aadhar_url), unit:units(unit_number, type, base_price)')
            .eq('group_id', groupId)
            .order('created_at', { ascending: true })

        if (error) {
            console.error('Group fetch error:', error)
            return NextResponse.json(
                { error: 'Failed to fetch group bookings' },
                { status: 500 }
            )
        }

        return NextResponse.json({ bookings: bookings || [] })
    } catch (err) {
        console.error('Group GET error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
