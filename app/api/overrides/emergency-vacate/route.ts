import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// POST /api/overrides/emergency-vacate
// Override #6: Emergency Vacate — force checkout an OCCUPIED unit + set to MAINTENANCE
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

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

        const vacateReason = reason || 'Emergency vacate by CRE'

        // Look up caller staff ID + name for audit trail
        const { data: callerStaff } = await supabase
            .from('staff').select('id, name').eq('user_id', auth.userId).single()

        // Close all active bookings on this unit with atomic status guard
        const { data: activeBookings } = await supabase
            .from('bookings')
            .select('id, notes')
            .eq('unit_id', unitId)
            .eq('status', 'CHECKED_IN')

        if (activeBookings && activeBookings.length > 0) {
            const now = new Date().toISOString()
            for (const b of activeBookings) {
                await supabase
                    .from('bookings')
                    .update({
                        status: 'CHECKED_OUT',
                        checked_out_by: callerStaff?.id || null,
                        checked_out_at: now,
                        notes: (b.notes ? b.notes + ' | ' : '') + `[EMERGENCY VACATE by ${callerStaff?.name || 'Staff'}] ${vacateReason}`,
                    })
                    .eq('id', b.id)
                    .eq('status', 'CHECKED_IN')
            }
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

        // Create a maintenance ticket for the emergency vacate
        const { data: ticket } = await supabase.from('maintenance_tickets').insert({
            unit_id: unitId,
            hotel_id: unit.hotel_id,
            description: `Emergency vacate: ${vacateReason}`,
            priority: 'HIGH',
            reported_by: callerStaff?.id || null,
            status: 'OPEN',
        }).select('id').single()

        // Notify ZonalHK about the emergency maintenance
        try { await supabase.from('notifications').insert({ hotel_id: unit.hotel_id, recipient_role: 'ZonalHK', type: 'URGENT_MAINTENANCE', title: 'Emergency Vacate — Maintenance Required', message: `${unit.unit_number} — ${vacateReason || 'Emergency vacate'}`, link: '/zonal-hk', source_table: 'maintenance_tickets', source_id: ticket?.id || null }) } catch { /* never block */ }

        // Audit trail
        try {
            await supabase.from('property_reports').insert({
                hotel_id: unit.hotel_id,
                reported_by: callerStaff?.id || null,
                type: 'REPORT',
                category: 'SAFETY',
                description: `[EMERGENCY-VACATE] ${unit.unit_number} | Reason: ${vacateReason} | Bookings closed: ${activeBookings?.length || 0}`,
                photo_url: null,
                status: 'RESOLVED',
                reviewed_by: callerStaff?.id || null,
                review_notes: 'Auto-audit from emergency-vacate override',
            })
        } catch { /* audit must not fail the override */ }

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
