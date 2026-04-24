import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/messages — fetch group chat messages + unread count
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 403 })

        // Fetch latest 100 group messages (recipient_id IS NULL)
        const { data, error } = await supabase
            .from('messages')
            .select('*, sender:sender_id(name, role)')
            .eq('hotel_id', callerStaff.hotel_id)
            .is('recipient_id', null)
            .order('created_at', { ascending: true })
            .limit(100)

        if (error) {
            console.error('Messages fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
        }

        // Get caller's last_read_at from chat_read_status
        const { data: readStatus } = await supabase
            .from('chat_read_status')
            .select('last_read_at')
            .eq('staff_id', callerStaff.id)
            .maybeSingle()

        // Count unread: messages after last_read_at from other senders
        let unread_count = 0
        if (readStatus?.last_read_at) {
            const lastRead = new Date(readStatus.last_read_at)
            unread_count = (data || []).filter(
                m => new Date(m.created_at) > lastRead && m.sender_id !== callerStaff.id
            ).length
        } else {
            // Never opened chat — all messages from others are unread
            unread_count = (data || []).filter(m => m.sender_id !== callerStaff.id).length
        }

        return NextResponse.json({ data: data || [], unread_count })
    } catch (err) {
        console.error('Messages GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/messages — send a group message
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 403 })

        const body = await request.json()
        const messageBody = (body.body || '').trim()

        if (!messageBody) {
            return NextResponse.json({ error: 'Message body cannot be empty' }, { status: 400 })
        }
        if (messageBody.length > 5000) {
            return NextResponse.json({ error: 'Message body cannot exceed 5000 characters' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('messages')
            .insert({
                hotel_id: callerStaff.hotel_id,
                sender_id: callerStaff.id,
                recipient_id: null,
                body: messageBody,
                read: false,
            })
            .select('*, sender:sender_id(name, role)')
            .single()

        if (error) {
            console.error('Message insert error:', error)
            return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Messages POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/messages — mark chat as read (upsert last_read_at)
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response
        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 403 })

        const { error } = await supabase
            .from('chat_read_status')
            .upsert({
                staff_id: callerStaff.id,
                hotel_id: callerStaff.hotel_id,
                last_read_at: new Date().toISOString(),
            }, { onConflict: 'staff_id' })

        if (error) {
            console.error('Chat read status error:', error)
            return NextResponse.json({ error: 'Failed to update read status' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Messages PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
