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

        // Alias: DB column is `phone` but consumers expect `guest_phone`. Expose both.
        let query = supabase
            .from('freshup')
            .select('*, guest_phone:phone, staff:created_by(name)')
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

        const {
            hotel_id: bodyHotelId,
            guest_name, guest_phone, guest_count, payment_method,
            aadhar_url, aadhar_url_front, aadhar_url_back, ac_type,
            guest_name_2, guest_phone_2, aadhar_url_front_2, aadhar_url_back_2,
        } = body

        if (!guest_name || !guest_phone) {
            return NextResponse.json({ error: 'Guest name and phone are required' }, { status: 400 })
        }

        const phoneDigits = String(guest_phone).replace(/\D/g, '')
        if (phoneDigits.length !== 10) {
            return NextResponse.json({ error: 'Phone number must be exactly 10 digits' }, { status: 400 })
        }

        const count = Math.max(1, Math.floor(Number(guest_count) || 1))
        if (count > 20) {
            return NextResponse.json({ error: 'guest_count cannot exceed 20' }, { status: 400 })
        }

        if (!payment_method || !['CASH', 'DIGITAL'].includes(payment_method)) {
            return NextResponse.json({ error: 'Payment method must be CASH or DIGITAL' }, { status: 400 })
        }

        // Look up staff profile for attribution + role gating
        const { data: staffProfile } = await supabase
            .from('staff')
            .select('id, hotel_id, role')
            .eq('user_id', auth.userId)
            .single()

        if (!staffProfile) {
            return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 })
        }

        // Resolve target hotel id — Admin/Developer may record freshup for any hotel
        // via the global hotel switcher (client sends `hotel_id`); other roles are
        // pinned to their assigned hotel. This prevents a cross-hotel mode/price
        // mismatch where the UI shows Aluva pricing but the server derives config
        // from the staff's home hotel (e.g. Kaloor).
        const isAdminOrDev = staffProfile.role === 'Admin' || staffProfile.role === 'Developer'
        const targetHotelId = (isAdminOrDev && typeof bodyHotelId === 'string' && bodyHotelId)
            ? bodyHotelId
            : staffProfile.hotel_id

        // Fetch hotel freshup config for per-hotel pricing
        const { data: hotel } = await supabase
            .from('hotels')
            .select('freshup_mode, freshup_person_price, freshup_ac_price, freshup_nonac_price, freshup_max_guests')
            .eq('id', targetHotelId)
            .single()

        if (!hotel) {
            return NextResponse.json({ error: 'Hotel not found' }, { status: 404 })
        }

        const freshupMode = hotel.freshup_mode || 'PERSON'

        let amount: number
        if (freshupMode === 'ROOM') {
            // ac_type is required and must be valid in ROOM mode
            if (!ac_type || !['AC', 'NON_AC'].includes(ac_type)) {
                return NextResponse.json({ error: 'ac_type must be AC or NON_AC for room freshup' }, { status: 400 })
            }
            // Room-based: price depends on AC type
            amount = ac_type === 'AC'
                ? Number(hotel.freshup_ac_price || 799)
                : Number(hotel.freshup_nonac_price || 699)
            // Enforce max guests
            const maxGuests = hotel.freshup_max_guests || 2
            if (count > maxGuests) {
                return NextResponse.json({ error: `Maximum ${maxGuests} guests allowed for room freshup` }, { status: 400 })
            }
            // Require Guest 2 details when count >= 2
            if (count >= 2 && !guest_name_2?.trim()) {
                return NextResponse.json({ error: 'Guest 2 name is required for 2-guest room freshup' }, { status: 400 })
            }
            // Reject Guest 2 fields when count === 1 — UI shouldn't send them
            // but a stale form or direct API call could smuggle them in
            if (count === 1 && (guest_name_2 || guest_phone_2 || aadhar_url_front_2 || aadhar_url_back_2)) {
                return NextResponse.json({ error: 'Guest 2 fields are not valid for a 1-guest room freshup' }, { status: 400 })
            }
        } else {
            // Person-based: price per guest
            amount = count * Number(hotel.freshup_person_price || 100)
        }

        // Guest 2 is only valid for ROOM mode. Reject in PERSON mode.
        if (freshupMode === 'PERSON' && (guest_name_2 || guest_phone_2 || aadhar_url_front_2 || aadhar_url_back_2)) {
            return NextResponse.json({ error: 'Guest 2 fields are not valid for person-mode freshup' }, { status: 400 })
        }

        // ac_type is only valid in ROOM mode. Reject in PERSON mode to prevent
        // schema-CHECK violations and accidental ROOM pricing on PERSON hotels.
        if (freshupMode === 'PERSON' && ac_type) {
            return NextResponse.json({ error: 'ac_type is not valid for person-mode freshup' }, { status: 400 })
        }

        // Validate guest 2 if provided (ROOM mode with 2 guests)
        let phone2Digits: string | null = null
        if (guest_name_2 || guest_phone_2) {
            if (!guest_name_2?.trim()) {
                return NextResponse.json({ error: 'Guest 2 name is required' }, { status: 400 })
            }
            phone2Digits = String(guest_phone_2 || '').replace(/\D/g, '')
            if (phone2Digits.length !== 10) {
                return NextResponse.json({ error: 'Guest 2 phone must be exactly 10 digits' }, { status: 400 })
            }
        }

        const { data, error } = await supabase
            .from('freshup')
            .insert({
                hotel_id: targetHotelId,
                guest_name: guest_name.trim(),
                // DB column is `phone`, not `guest_phone` — inserting into the wrong
                // name silently fails with 42703 and leaves the table empty.
                phone: phoneDigits,
                guest_count: count,
                amount,
                payment_method,
                aadhar_url: aadhar_url || null,
                aadhar_url_front: aadhar_url_front || null,
                aadhar_url_back: aadhar_url_back || null,
                ac_type: freshupMode === 'ROOM' ? (ac_type || null) : null,
                guest_name_2: guest_name_2?.trim() || null,
                guest_phone_2: phone2Digits,
                aadhar_url_front_2: aadhar_url_front_2 || null,
                aadhar_url_back_2: aadhar_url_back_2 || null,
                created_by: staffProfile.id,
            })
            .select()
            .single()

        if (error) {
            console.error('Freshup insert error:', {
                code: (error as { code?: string }).code,
                message: error.message,
                details: (error as { details?: string }).details,
                hint: (error as { hint?: string }).hint,
                hotel_id: targetHotelId,
            })
            return NextResponse.json({ error: error.message || 'Failed to create freshup record' }, { status: 500 })
        }

        return NextResponse.json({ data, success: true })
    } catch (err) {
        console.error('Freshup POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
