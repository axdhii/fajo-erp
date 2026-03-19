// ============================================================
// Fajo ERP — API Route Authentication Helper
// ============================================================

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

interface AuthResult {
    authenticated: true
    userId: string
}

interface AuthError {
    authenticated: false
    response: NextResponse
}

/**
 * Verify that the request is from an authenticated user.
 * Use at the top of every API route handler.
 *
 * Uses getUser() first (server-validated), then falls back to
 * getSession() (JWT-only) to handle cases where the middleware
 * refreshed the token but the Route Handler's cookies() reads
 * stale cookies.
 *
 * Usage:
 *   const auth = await requireAuth()
 *   if (!auth.authenticated) return auth.response
 */
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
