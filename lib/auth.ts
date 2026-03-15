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
 * Usage:
 *   const auth = await requireAuth()
 *   if (!auth.authenticated) return auth.response
 */
export async function requireAuth(): Promise<AuthResult | AuthError> {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()

    if (error || !user) {
        return {
            authenticated: false,
            response: NextResponse.json(
                { error: 'Unauthorized — please log in' },
                { status: 401 }
            ),
        }
    }

    return { authenticated: true, userId: user.id }
}
