import { NextResponse } from 'next/server'
import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Resolve the target hotel_id for a GET route. Returns the requested hotel_id
 * when provided; falls back to the caller's own hotel_id otherwise.
 *
 * NOTE: This intentionally does NOT enforce per-hotel access control. Prior
 * tightening (non-admins restricted to their own hotel) was reverted at user
 * request. Any authenticated staff can query any hotel's data, same as before.
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

    const hotelId = requestedHotelId || staff.hotel_id
    return { ok: true, hotelId, callerStaffId: staff.id, callerHotelId: staff.hotel_id, callerRole: staff.role }
}
