import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { requireHotelScope } from '@/lib/hotel-scope'

// GET /api/booking-extras — list extras for a booking or hotel
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const bookingId = searchParams.get('booking_id')
        const hotelId = searchParams.get('hotel_id')

        if (!bookingId && !hotelId) {
            return NextResponse.json({ error: 'booking_id or hotel_id is required' }, { status: 400 })
        }

        let query = supabase
            .from('booking_extras')
            .select('*, staff:added_by(name)')
            .order('created_at', { ascending: false })
            .limit(100)

        if (bookingId) {
            query = query.eq('booking_id', bookingId)
        } else if (hotelId) {
            // Verify caller is allowed to see this hotel's extras
            const scope = await requireHotelScope(supabase, auth.userId, hotelId)
            if (!scope.ok) return scope.response
            query = query.eq('hotel_id', scope.hotelId)
            const from = searchParams.get('from')
            const to = searchParams.get('to')
            if (from) query = query.gte('created_at', from)
            if (to) query = query.lt('created_at', to)
        }

        const { data, error } = await query

        if (error) {
            console.error('Booking extras fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch extras' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Booking extras GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/booking-extras — add an extra to a booking
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 403 })

        const body = await request.json()
        const { booking_id, description, amount, payment_method } = body

        if (!description || !String(description).trim()) {
            return NextResponse.json({ error: 'Description is required' }, { status: 400 })
        }
        const numAmount = Number(amount)
        if (!numAmount || numAmount <= 0) {
            return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
        }
        if (!payment_method || !['CASH', 'DIGITAL'].includes(payment_method)) {
            return NextResponse.json({ error: 'Payment method must be CASH or DIGITAL' }, { status: 400 })
        }

        // Verify booking exists and is CHECKED_IN (if booking_id provided)
        if (booking_id) {
            const { data: booking } = await supabase
                .from('bookings')
                .select('id, status')
                .eq('id', booking_id)
                .single()
            if (!booking) {
                return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
            }
            if (booking.status !== 'CHECKED_IN') {
                return NextResponse.json({ error: 'Booking is not currently checked in' }, { status: 400 })
            }
        }

        const { data, error } = await supabase
            .from('booking_extras')
            .insert({
                booking_id: booking_id || null,
                hotel_id: callerStaff.hotel_id,
                description: String(description).trim(),
                amount: numAmount,
                payment_method,
                added_by: callerStaff.id,
            })
            .select('*, staff:added_by(name)')
            .single()

        if (error) {
            console.error('Booking extra insert error:', error)
            return NextResponse.json({ error: 'Failed to add extra' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Booking extras POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
