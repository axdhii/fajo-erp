// ============================================================
// Fajo ERP — Conflict Detection Engine
// Checks for overlapping bookings on a given unit
// Formula: Conflict if (Requested_Start < Existing_End) AND (Requested_End > Existing_Start)
// ============================================================

import { createClient } from '@/lib/supabase/server'

export interface ConflictCheckParams {
    unitId: string
    checkIn: Date
    checkOut: Date
    excludeBookingId?: string // Exclude self when editing
}

export interface ConflictResult {
    hasConflict: boolean
    conflictingBookings: {
        id: string
        check_in: string
        check_out: string
        status: string
        guest_name: string | null
    }[]
}

/**
 * Check for booking conflicts on a specific unit for a given date range.
 * Only checks against bookings with active statuses (PENDING, CONFIRMED, CHECKED_IN).
 */
export async function checkConflict(
    params: ConflictCheckParams
): Promise<ConflictResult> {
    const supabase = await createClient()
    const { unitId, checkIn, checkOut, excludeBookingId } = params

    // Query: (Requested_Start < Existing_End) AND (Requested_End > Existing_Start)
    // Only check against "live" statuses
    console.log(`[Conflict Check] unit=${unitId} requested: ${checkIn.toISOString()} → ${checkOut.toISOString()}`)
    let query = supabase
        .from('bookings')
        .select('id, check_in, check_out, status, guests(name)')
        .eq('unit_id', unitId)
        .in('status', ['PENDING', 'CONFIRMED', 'CHECKED_IN'])
        .lt('check_in', checkOut.toISOString()) // Existing start < Requested end
        .gt('check_out', checkIn.toISOString()) // Existing end > Requested start

    if (excludeBookingId) {
        query = query.neq('id', excludeBookingId)
    }

    const { data: conflicts, error } = await query

    if (error) {
        console.error('Conflict check error:', error)
        // Fail-safe: assume conflict exists to prevent double-bookings
        return {
            hasConflict: true,
            conflictingBookings: [{
                id: 'error',
                check_in: '',
                check_out: '',
                status: 'ERROR',
                guest_name: 'Database error — please try again',
            }],
        }
    }

    const hasConflict = (conflicts?.length ?? 0) > 0
    if (hasConflict) {
        console.log(`[Conflict Check] CONFLICT FOUND! ${conflicts!.length} overlapping booking(s):`)
        for (const c of conflicts!) {
            console.log(`  - Booking ${(c as any).id}: ${(c as any).check_in} → ${(c as any).check_out} (${(c as any).status})`)
        }
    } else {
        console.log(`[Conflict Check] No conflicts found ✓`)
    }

    return {
        hasConflict,
        conflictingBookings: (conflicts ?? []).map((c: any) => ({
            id: c.id,
            check_in: c.check_in,
            check_out: c.check_out,
            status: c.status,
            guest_name: c.guests?.[0]?.name ?? null,
        })),
    }
}

/**
 * Calculate expected check-out time based on unit type and check-in time.
 * - Rooms: check_in + 24 hours
 * - Dorms: next day 10:00 AM IST
 */
export function calculateCheckOut(
    unitType: 'ROOM' | 'DORM',
    checkIn: Date
): Date {
    if (unitType === 'ROOM') {
        // Room: check-in < 12 PM = today 11 AM. check-in >= 12 PM = tomorrow 11 AM
        const checkOut = new Date(checkIn)
        if (checkIn.getHours() < 12) {
            checkOut.setHours(11, 0, 0, 0)
        } else {
            checkOut.setDate(checkOut.getDate() + 1)
            checkOut.setHours(11, 0, 0, 0)
        }
        return checkOut
    }

    // Dorm: next day 10:00 AM IST
    // Note: setHours uses local machine time; server runs in IST
    const checkOut = new Date(checkIn)
    checkOut.setDate(checkOut.getDate() + 1)
    checkOut.setHours(10, 0, 0, 0) // 10:00 AM local (IST)
    return checkOut
}
