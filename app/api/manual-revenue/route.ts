import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { requireHotelScope } from '@/lib/hotel-scope'

const VALID_KINDS = ['CHECKIN', 'CHECKOUT', 'FRESHUP', 'EXTRAS', 'OTHER'] as const
type Kind = typeof VALID_KINDS[number]

// GET /api/manual-revenue — list entries for a hotel + date range
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)

        const scope = await requireHotelScope(supabase, auth.userId, searchParams.get('hotel_id'))
        if (!scope.ok) return scope.response

        let query = supabase
            .from('manual_revenue_entries')
            .select('*, staff:entered_by(name)')
            .eq('hotel_id', scope.hotelId)
            .order('transaction_at', { ascending: false })

        const from = searchParams.get('from')
        const to = searchParams.get('to')
        if (from) query = query.gte('transaction_at', from)
        if (to) query = query.lte('transaction_at', to)

        const limit = Number(searchParams.get('limit') || '50')
        if (Number.isFinite(limit) && limit > 0) query = query.limit(Math.min(limit, 500))

        const { data, error } = await query
        if (error) {
            console.error('Manual revenue fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch manual revenue entries' }, { status: 500 })
        }
        return NextResponse.json({ data })
    } catch (err) {
        console.error('Manual revenue GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/manual-revenue — record a manual revenue entry (Admin/Developer only)
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 })
        }
        if (!['Admin', 'Developer'].includes(callerStaff.role)) {
            return NextResponse.json({ error: 'Manual revenue entry requires Admin or Developer role' }, { status: 403 })
        }

        const body = await request.json()
        const {
            hotel_id,
            amount_cash,
            amount_digital,
            transaction_kind,
            description,
            transaction_at,
        } = body

        const targetHotelId = (typeof hotel_id === 'string' && hotel_id) ? hotel_id : callerStaff.hotel_id

        // Verify the hotel exists (FK would catch it, but cleaner error)
        const { data: hotel } = await supabase.from('hotels').select('id').eq('id', targetHotelId).single()
        if (!hotel) return NextResponse.json({ error: 'Hotel not found' }, { status: 404 })

        const cashNum = Number(amount_cash) || 0
        const digitalNum = Number(amount_digital) || 0
        if (cashNum < 0 || digitalNum < 0) {
            return NextResponse.json({ error: 'Amounts cannot be negative' }, { status: 400 })
        }
        if (cashNum + digitalNum <= 0) {
            return NextResponse.json({ error: 'Total amount must be greater than 0' }, { status: 400 })
        }

        if (!VALID_KINDS.includes(transaction_kind as Kind)) {
            return NextResponse.json({ error: `transaction_kind must be one of ${VALID_KINDS.join(', ')}` }, { status: 400 })
        }

        if (!transaction_at || typeof transaction_at !== 'string') {
            return NextResponse.json({ error: 'transaction_at is required (ISO timestamp)' }, { status: 400 })
        }
        const txnDate = new Date(transaction_at)
        if (Number.isNaN(txnDate.getTime())) {
            return NextResponse.json({ error: 'transaction_at must be a valid ISO timestamp' }, { status: 400 })
        }
        // Prevent absurd backdates / future-dates
        const oneYearAgo = new Date(Date.now() - 365 * 86400000)
        const oneDayAhead = new Date(Date.now() + 86400000)
        if (txnDate < oneYearAgo || txnDate > oneDayAhead) {
            return NextResponse.json({ error: 'transaction_at must be within the last year and not more than 1 day in the future' }, { status: 400 })
        }

        const desc = typeof description === 'string' ? description.trim() : null
        if (desc && desc.length > 500) {
            return NextResponse.json({ error: 'description cannot exceed 500 characters' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('manual_revenue_entries')
            .insert({
                hotel_id: targetHotelId,
                amount_cash: cashNum,
                amount_digital: digitalNum,
                transaction_kind,
                description: desc || null,
                transaction_at: txnDate.toISOString(),
                entered_by: callerStaff.id,
            })
            .select('*, staff:entered_by(name)')
            .single()

        if (error) {
            const e = error as { code?: string; message?: string; details?: string; hint?: string }
            // Log full error server-side; surface a friendly message to the client.
            // Special-case the "table not found" error so admins know to apply the
            // migration rather than seeing a cryptic Postgres relation error.
            console.error('Manual revenue insert error:', {
                code: e.code, message: e.message, details: e.details, hint: e.hint,
            })
            if (e.code === '42P01') {
                return NextResponse.json({
                    error: 'Manual revenue table not yet created. Ask developer to apply db/manual_revenue_entries.sql migration.',
                }, { status: 500 })
            }
            return NextResponse.json({ error: 'Failed to record manual revenue entry' }, { status: 500 })
        }

        return NextResponse.json({ data, success: true })
    } catch (err) {
        console.error('Manual revenue POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
