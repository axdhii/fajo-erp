import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'

// POST /api/overrides/force-status
// Override #1: Force any unit to any status (except OCCUPIED — use check-in for that)
// Override #3: Force Release — set an OCCUPIED unit to DIRTY without a booking
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { unitId, newStatus, reason } = body

        if (!unitId || !newStatus) {
            return NextResponse.json(
                { error: 'unitId and newStatus are required' },
                { status: 400 }
            )
        }

        const validStatuses = ['AVAILABLE', 'DIRTY', 'IN_PROGRESS', 'MAINTENANCE']
        if (!validStatuses.includes(newStatus)) {
            return NextResponse.json(
                { error: `Invalid status. Allowed: ${validStatuses.join(', ')}. Use check-in flow for OCCUPIED.` },
                { status: 400 }
            )
        }

        // Fetch current unit
        const { data: unit, error: fetchError } = await supabase
            .from('units')
            .select('*')
            .eq('id', unitId)
            .single()

        if (fetchError || !unit) {
            return NextResponse.json(
                { error: 'Unit not found' },
                { status: 404 }
            )
        }

        const previousStatus = unit.status

        // If unit was OCCUPIED and we're force-releasing it, also close any active bookings
        if (previousStatus === 'OCCUPIED') {
            const { data: activeBookings } = await supabase
                .from('bookings')
                .select('id')
                .eq('unit_id', unitId)
                .eq('status', 'CHECKED_IN')

            if (activeBookings && activeBookings.length > 0) {
                const now = getDevNow()
                await supabase
                    .from('bookings')
                    .update({
                        status: 'CHECKED_OUT',
                        check_out: now.toISOString(),
                        notes: `[FORCE RELEASED] ${reason || 'Emergency override by CRE'}`,
                    })
                    .in('id', activeBookings.map(b => b.id))
            }
        }

        // Update unit status
        const updateData: Record<string, any> = { status: newStatus }
        if (newStatus === 'MAINTENANCE') {
            updateData.maintenance_reason = reason || 'Emergency override'
        } else if (previousStatus === 'MAINTENANCE') {
            updateData.maintenance_reason = null
        }

        const { error: updateError } = await supabase
            .from('units')
            .update(updateData)
            .eq('id', unitId)

        if (updateError) {
            console.error('Force status error:', updateError)
            return NextResponse.json(
                { error: 'Failed to update unit status' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: `Unit ${unit.unit_number}: ${previousStatus} → ${newStatus}`,
            previousStatus,
            newStatus,
            reason: reason || null,
        })
    } catch (err) {
        console.error('Force status error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
