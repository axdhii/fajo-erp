import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/messages — fetch messages for the logged-in staff member
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive staff record from authenticated user
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const withStaffId = searchParams.get('with')

        if (withStaffId) {
            // Fetch conversation with a specific person (both directions), ordered ASC, limit 100
            const { data, error } = await supabase
                .from('messages')
                .select('*, sender:sender_id(name, role), recipient:recipient_id(name, role)')
                .or(`and(sender_id.eq.${callerStaff.id},recipient_id.eq.${withStaffId}),and(sender_id.eq.${withStaffId},recipient_id.eq.${callerStaff.id})`)
                .eq('hotel_id', callerStaff.hotel_id)
                .order('created_at', { ascending: true })
                .limit(100)

            if (error) {
                console.error('Messages fetch error:', error)
                return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
            }

            // Mark unread messages FROM that person as read
            try {
                await supabase
                    .from('messages')
                    .update({ read: true })
                    .eq('sender_id', withStaffId)
                    .eq('recipient_id', callerStaff.id)
                    .eq('read', false)
            } catch { /* never block */ }

            return NextResponse.json({ data })
        }

        // No `with` param — return conversation list
        // Fetch all messages involving this staff, then build conversation summaries
        const { data: allMessages, error } = await supabase
            .from('messages')
            .select('id, sender_id, recipient_id, body, created_at, read, sender:sender_id(name, role), recipient:recipient_id(name, role)')
            .or(`sender_id.eq.${callerStaff.id},recipient_id.eq.${callerStaff.id}`)
            .eq('hotel_id', callerStaff.hotel_id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('Messages list fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
        }

        // Build conversation list: group by contact, pick last message and unread count
        const conversationMap = new Map<string, {
            contact_id: string
            contact_name: string
            contact_role: string
            last_message: string
            last_message_at: string
            unread_count: number
        }>()

        for (const msg of allMessages || []) {
            const isIncoming = msg.recipient_id === callerStaff.id
            const contactId = isIncoming ? msg.sender_id : msg.recipient_id
            const contactInfo = (isIncoming ? msg.sender : msg.recipient) as unknown as { name: string; role: string } | null

            if (!conversationMap.has(contactId)) {
                conversationMap.set(contactId, {
                    contact_id: contactId,
                    contact_name: contactInfo?.name || 'Unknown',
                    contact_role: contactInfo?.role || 'Unknown',
                    last_message: msg.body,
                    last_message_at: msg.created_at,
                    unread_count: 0,
                })
            }

            // Count unread only for incoming messages
            if (isIncoming && !msg.read) {
                const conv = conversationMap.get(contactId)!
                conv.unread_count += 1
            }
        }

        const conversations = Array.from(conversationMap.values())
            .sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime())

        return NextResponse.json({ data: conversations })
    } catch (err) {
        console.error('Messages GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/messages — send a message
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive sender from authenticated user's staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { recipient_id, body: messageBody } = body

        if (!recipient_id) {
            return NextResponse.json({ error: 'recipient_id is required' }, { status: 400 })
        }

        if (!messageBody || !messageBody.trim()) {
            return NextResponse.json({ error: 'message body cannot be empty' }, { status: 400 })
        }

        // Validate recipient exists
        const { data: recipient, error: recipientError } = await supabase
            .from('staff').select('id, name, role').eq('id', recipient_id).eq('hotel_id', callerStaff.hotel_id).single()
        if (recipientError || !recipient) {
            return NextResponse.json({ error: 'Recipient not found' }, { status: 404 })
        }

        const { data, error } = await supabase
            .from('messages')
            .insert({
                hotel_id: callerStaff.hotel_id,
                sender_id: callerStaff.id,
                recipient_id,
                body: messageBody.trim(),
                read: false,
            })
            .select('*, sender:sender_id(name, role), recipient:recipient_id(name, role)')
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

// PATCH /api/messages — mark messages as read
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive staff record
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { sender_id } = body

        if (!sender_id) {
            return NextResponse.json({ error: 'sender_id is required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('messages')
            .update({ read: true })
            .eq('recipient_id', callerStaff.id)
            .eq('sender_id', sender_id)
            .eq('read', false)

        if (error) {
            console.error('Messages mark-read error:', error)
            return NextResponse.json({ error: 'Failed to mark messages as read' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Messages PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
