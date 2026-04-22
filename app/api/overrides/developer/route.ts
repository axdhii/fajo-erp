import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// Supported tables that can be overridden by Developer
const ALLOWED_TABLES = [
    'bookings', 'payments', 'guests', 'attendance', 'freshup', 'booking_extras',
    'staff', 'payroll', 'staff_incidents', 'property_expenses',
] as const
type AllowedTable = typeof ALLOWED_TABLES[number]

// PATCH /api/overrides/developer — Developer-only override for any supported table
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Only Developer can use this endpoint
        const { data: callerStaff } = await supabase
            .from('staff').select('id, role, name').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff not found' }, { status: 403 })
        }
        if (callerStaff.role !== 'Developer') {
            return NextResponse.json({ error: 'Forbidden — Developer role required' }, { status: 403 })
        }

        const body = await request.json()
        const { table, id, updates, reason } = body as {
            table: string
            id: string
            updates: Record<string, unknown>
            reason?: string
        }

        if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
            return NextResponse.json({ error: `Invalid table. Allowed: ${ALLOWED_TABLES.join(', ')}` }, { status: 400 })
        }
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }
        if (!updates || typeof updates !== 'object') {
            return NextResponse.json({ error: 'updates object is required' }, { status: 400 })
        }

        // Build audit trail and attach to notes field if the table has a notes column
        const timestamp = new Date().toISOString()
        const auditLine = `[OVERRIDE by ${callerStaff.name || 'Developer'} at ${timestamp}]${reason ? `: ${reason}` : ''}`

        const finalUpdates: Record<string, unknown> = { ...updates }

        // Append audit note to bookings and attendance (they have notes/description fields)
        if (table === 'bookings') {
            // Fetch current notes; append audit trail without losing existing content
            const { data: current } = await supabase.from('bookings').select('notes').eq('id', id).single()
            const existingNotes = current?.notes || ''
            // If caller explicitly set new notes, use those as base; otherwise keep existing
            const baseNotes = typeof updates.notes === 'string' ? updates.notes : existingNotes
            finalUpdates.notes = baseNotes ? `${baseNotes}\n${auditLine}` : auditLine
        }

        const { data, error } = await supabase
            .from(table)
            .update(finalUpdates)
            .eq('id', id)
            .select('*')
            .single()

        if (error) {
            console.error(`Override ${table} error:`, error)
            return NextResponse.json({ error: error.message || 'Failed to update record' }, { status: 500 })
        }

        return NextResponse.json({ data, audit: auditLine })
    } catch (err) {
        console.error('Override PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/overrides/developer — Developer-only delete
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('role').eq('user_id', auth.userId).single()
        if (!callerStaff || callerStaff.role !== 'Developer') {
            return NextResponse.json({ error: 'Forbidden — Developer role required' }, { status: 403 })
        }

        const { searchParams } = new URL(request.url)
        const table = searchParams.get('table')
        const id = searchParams.get('id')

        if (!table || !ALLOWED_TABLES.includes(table as AllowedTable)) {
            return NextResponse.json({ error: 'Invalid table' }, { status: 400 })
        }
        if (!id) {
            return NextResponse.json({ error: 'id is required' }, { status: 400 })
        }

        const { error } = await supabase.from(table).delete().eq('id', id)

        if (error) {
            console.error(`Override delete ${table} error:`, error)
            return NextResponse.json({ error: error.message || 'Failed to delete record' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (err) {
        console.error('Override DELETE error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
