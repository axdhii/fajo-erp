import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// GET /api/notes — fetch all notes for the logged-in staff
export async function GET() {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive staff record from authenticated user
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const { data, error } = await supabase
            .from('notes')
            .select('*')
            .eq('staff_id', callerStaff.id)
            .order('updated_at', { ascending: false })

        if (error) {
            console.error('Notes fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Notes GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/notes — create a new note
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive staff record from authenticated user
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { content } = body

        const { data, error } = await supabase
            .from('notes')
            .insert({
                staff_id: callerStaff.id,
                hotel_id: callerStaff.hotel_id,
                content: content || '',
            })
            .select('*')
            .single()

        if (error) {
            console.error('Note insert error:', error)
            return NextResponse.json({ error: 'Failed to create note' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Notes POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/notes — update a note
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive staff record from authenticated user
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const body = await request.json()
        const { id, content } = body

        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        if (content === undefined) {
            return NextResponse.json({ error: 'content is required' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('notes')
            .update({
                content,
                updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('staff_id', callerStaff.id)
            .select('*')
            .single()

        if (error) {
            if (error.code === 'PGRST116') {
                return NextResponse.json({ error: 'Note not found or access denied' }, { status: 404 })
            }
            console.error('Note update error:', error)
            return NextResponse.json({ error: 'Failed to update note' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Notes PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/notes — delete a note
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Derive staff record from authenticated user
        const { data: callerStaff } = await supabase
            .from('staff').select('id, hotel_id').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff record not found' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const noteId = searchParams.get('id')

        if (!noteId) {
            return NextResponse.json({ error: 'id query parameter is required' }, { status: 400 })
        }

        const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', noteId)
            .eq('staff_id', callerStaff.id)

        if (error) {
            console.error('Note delete error:', error)
            return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Notes DELETE error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
