import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import type { UnitStatus } from '@/lib/types'

// PATCH /api/housekeeping — Update unit cleaning status
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()

        const { unitId, newStatus } = body as { unitId: string; newStatus: UnitStatus }

        if (!unitId || !newStatus) {
            return NextResponse.json(
                { error: 'unitId and newStatus are required' },
                { status: 400 }
            )
        }

        // Validate allowed transitions (DIRTY→AVAILABLE is "Quick Clean" override)
        const allowedTransitions: Record<string, string[]> = {
            'DIRTY': ['IN_PROGRESS', 'AVAILABLE'],
            'IN_PROGRESS': ['AVAILABLE'],
        }

        // Fetch current unit status
        const { data: unit, error: fetchError } = await supabase
            .from('units')
            .select('status, unit_number')
            .eq('id', unitId)
            .single()

        if (fetchError || !unit) {
            return NextResponse.json(
                { error: 'Unit not found' },
                { status: 404 }
            )
        }

        const allowed = allowedTransitions[unit.status]
        if (!allowed || !allowed.includes(newStatus)) {
            return NextResponse.json(
                { error: `Cannot transition from ${unit.status} to ${newStatus}` },
                { status: 400 }
            )
        }

        // Atomic transition — prevents two HK staff from both transitioning
        // DIRTY → IN_PROGRESS simultaneously.
        const { data: rows, error: updateError } = await supabase
            .from('units')
            .update({ status: newStatus })
            .eq('id', unitId)
            .eq('status', unit.status)
            .select('id')

        if (updateError) {
            console.error('Housekeeping update error:', updateError)
            return NextResponse.json(
                { error: 'Failed to update status' },
                { status: 500 }
            )
        }
        if (!rows || rows.length === 0) {
            return NextResponse.json(
                { error: 'Unit status changed — another housekeeping staff may have transitioned it' },
                { status: 409 }
            )
        }

        return NextResponse.json({
            success: true,
            unitNumber: unit.unit_number,
            previousStatus: unit.status,
            newStatus,
        })
    } catch (err) {
        console.error('Housekeeping error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
