import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Enforce per-hotel data scope on list routes. Any authenticated staff can ask
 * for their own hotel's data; only Admin/Developer can ask for a different
 * hotel's data via the global hotel switcher.
 *
 * Returns { ok: true, hotelId } with the validated hotel_id to filter by, or
 * { ok: false, response } to short-circuit with a 403.
 *
 * Closes the silent data-leak gap where RLS is `USING (true)` and routes
 * previously accepted any hotel_id in the URL.
 */
export async function requireHotelScope(
    supabase: SupabaseClient,
    userId: string,
    requestedHotelId: string | null,
): Promise<{ ok: true; hotelId: string; callerStaffId: string; callerHotelId: string; callerRole: string } | { ok: false; response: NextResponse }> {
    const { data: staff } = await supabase
        .from('staff')
        .select('id, hotel_id, role')
        .eq('user_id', userId)
        .single()

    if (!staff) {
        return { ok: false, response: NextResponse.json({ error: 'Staff profile not found' }, { status: 403 }) }
    }

    const isAdminOrDev = staff.role === 'Admin' || staff.role === 'Developer'

    // No hotel asked for → default to caller's own hotel
    if (!requestedHotelId) {
        return { ok: true, hotelId: staff.hotel_id, callerStaffId: staff.id, callerHotelId: staff.hotel_id, callerRole: staff.role }
    }

    // Non-admins can only query their own hotel
    if (!isAdminOrDev && requestedHotelId !== staff.hotel_id) {
        return { ok: false, response: NextResponse.json({ error: 'Forbidden — you can only access your own hotel\'s data' }, { status: 403 }) }
    }

    return { ok: true, hotelId: requestedHotelId, callerStaffId: staff.id, callerHotelId: staff.hotel_id, callerRole: staff.role }
}
