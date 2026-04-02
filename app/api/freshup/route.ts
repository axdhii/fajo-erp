import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/freshup — list freshup records by hotel_id + optional date range
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
            .from('freshup')
            .select('*, staff:created_by(name)')
            .eq('hotel_id', hotelId)
            .order('created_at', { ascending: false })

        const from = searchParams.get('from')
        const to = searchParams.get('to')
        if (from) query = query.gte('created_at', from)
        if (to) query = query.lt('created_at', to)

        const limit = searchParams.get('limit')
        if (limit) query = query.limit(Number(limit))

        const { data, error } = await query

        if (error) {
            console.error('Freshup fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch freshup records' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Freshup GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/freshup — create a freshup record
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()

        const { guest_name, guest_phone, guest_count, payment_method, aadhar_url } = body

        if (!guest_name || !guest_phone) {
            return NextResponse.json({ error: 'Guest name and phone are required' }, { status: 400 })
        }

        const phoneDigits = String(guest_phone).replace(/\D/g, '')
        if (phoneDigits.length !== 10) {
            return NextResponse.json({ error: 'Phone number must be exactly 10 digits' }, { status: 400 })
        }

        const count = Math.max(1, Math.floor(Number(guest_count) || 1))
        const amount = count * 100 // ₹100 per guest

        if (!payment_method || !['CASH', 'DIGITAL'].includes(payment_method)) {
            return NextResponse.json({ error: 'Payment method must be CASH or DIGITAL' }, { status: 400 })
        }

        // Look up staff profile for attribution
        const { data: staffProfile } = await supabase
            .from('staff')
            .select('id, hotel_id')
            .eq('user_id', auth.userId)
            .single()

        if (!staffProfile) {
            return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 })
        }

        const { data, error } = await supabase
            .from('freshup')
            .insert({
                hotel_id: staffProfile.hotel_id,
                guest_name: guest_name.trim(),
                guest_phone: phoneDigits,
                guest_count: count,
                amount,
                payment_method,
                aadhar_url: aadhar_url || null,
                created_by: staffProfile.id,
            })
            .select()
            .single()

        if (error) {
            console.error('Freshup insert error:', error)
            return NextResponse.json({ error: 'Failed to create freshup record' }, { status: 500 })
        }

        return NextResponse.json({ data, success: true })
    } catch (err) {
        console.error('Freshup POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
