// ============================================================
// Fajo ERP — Authentication Helpers
// ============================================================

import { createClient } from '@/lib/supabase/server'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'

// ── Staff profile injected by middleware ────────────────────
export interface StaffContext {
    staffId: string
    hotelId: string
    role: string
}

/**
 * Read the staff context headers that the middleware injected.
 * Use in Server Components (pages) instead of re-querying the DB.
 * Returns null if any header is missing (should never happen for
 * protected routes because middleware redirects first).
 */
export async function getStaffFromHeaders(): Promise<StaffContext | null> {
    const h = await headers()
    const staffId = h.get('x-staff-id')
    const hotelId = h.get('x-staff-hotel-id')
    const role = h.get('x-staff-role')
    if (!staffId || !hotelId || !role) return null
    return { staffId, hotelId, role }
}

// ── Legacy helpers (still used by API routes & invoice page) ─

interface AuthResult {
    authenticated: true
    userId: string
}

interface AuthError {
    authenticated: false
    response: NextResponse
}

/**
 * Get the authenticated user for Server Components (pages).
 * Uses getUser() first, falls back to getSession() for cookie staleness.
 * Returns the user object or null.
 */
export async function getAuthUser() {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) return user
    const { data: { session } } = await supabase.auth.getSession()
    return session?.user || null
}

export async function requireAuth(): Promise<AuthResult | AuthError> {
    const supabase = await createClient()

    // Primary: validate with Supabase server
    const { data: { user } } = await supabase.auth.getUser()

    if (user) {
        return { authenticated: true, userId: user.id }
    }

    // Fallback: read the JWT from the session cookie directly.
    // This handles the edge case where the middleware refreshed
    // the session but the Route Handler received stale cookies.
    const { data: { session } } = await supabase.auth.getSession()

    if (session?.user) {
        return { authenticated: true, userId: session.user.id }
    }

    return {
        authenticated: false,
        response: NextResponse.json(
            { error: 'Unauthorized — please log in' },
            { status: 401 }
        ),
    }
}
