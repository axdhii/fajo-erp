import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { getDevNow } from '@/lib/dev-time'

// POST /api/overrides/emergency-vacate
// Override #6: Emergency Vacate — force checkout an OCCUPIED unit + set to MAINTENANCE
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()
        const body = await request.json()

        const { unitId, reason } = body

        if (!unitId) {
            return NextResponse.json(
                { error: 'unitId is required' },
                { status: 400 }
            )
        }

        // Fetch unit
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

        if (unit.status !== 'OCCUPIED') {
            return NextResponse.json(
                { error: `Unit ${unit.unit_number} is not occupied (current: ${unit.status})` },
                { status: 409 }
            )
        }

        const now = getDevNow()
        const vacateReason = reason || 'Emergency vacate by CRE'

        // Close all active bookings on this unit
        const { data: activeBookings } = await supabase
            .from('bookings')
            .select('id')
            .eq('unit_id', unitId)
            .eq('status', 'CHECKED_IN')

        if (activeBookings && activeBookings.length > 0) {
            await supabase
                .from('bookings')
                .update({
                    status: 'CHECKED_OUT',
                    check_out: now.toISOString(),
                    notes: `[EMERGENCY VACATE] ${vacateReason}`,
                })
                .in('id', activeBookings.map(b => b.id))
        }

        // Set unit to MAINTENANCE
        const { error: updateError } = await supabase
            .from('units')
            .update({
                status: 'MAINTENANCE',
                maintenance_reason: vacateReason,
            })
            .eq('id', unitId)

        if (updateError) {
            console.error('Emergency vacate error:', updateError)
            return NextResponse.json(
                { error: 'Failed to vacate unit' },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            message: `${unit.unit_number} emergency vacated — now under MAINTENANCE`,
            bookingsClosed: activeBookings?.length || 0,
            reason: vacateReason,
        })
    } catch (err) {
        console.error('Emergency vacate error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        )
    }
}
