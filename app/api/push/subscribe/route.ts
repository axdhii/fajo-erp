import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// POST /api/push/subscribe — save push subscription for current user
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 403 })

        const body = await request.json()
        const { subscription } = body

        if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
            return NextResponse.json({ error: 'Invalid push subscription' }, { status: 400 })
        }

        const { error } = await supabase
            .from('push_subscriptions')
            .upsert({
                staff_id: callerStaff.id,
                hotel_id: callerStaff.hotel_id,
                endpoint: subscription.endpoint,
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth,
            }, { onConflict: 'staff_id,endpoint' })

        if (error) {
            console.error('Push subscription error:', error)
            return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Push subscribe error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/push/subscribe — remove push subscription
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id').eq('user_id', auth.userId).single()
        if (!callerStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 403 })

        const { searchParams } = new URL(request.url)
        const endpoint = searchParams.get('endpoint')

        if (endpoint) {
            await supabase.from('push_subscriptions').delete().eq('staff_id', callerStaff.id).eq('endpoint', endpoint)
        } else {
            await supabase.from('push_subscriptions').delete().eq('staff_id', callerStaff.id)
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Push unsubscribe error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
