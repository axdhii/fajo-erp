import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// Admin-only Supabase client for auth operations
function getAdminClient() {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is not configured. ' +
            'Set it in .env.local (local dev) and in Vercel Environment Variables (production).'
        )
    }
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        serviceRoleKey,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
}

/** Verify the caller is an Admin. */
async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
    const { data: profile } = await supabase
        .from('staff')
        .select('id, role')
        .eq('user_id', userId)
        .single()

    if (!profile || profile.role !== 'Admin') {
        return { error: NextResponse.json({ error: 'Forbidden — Admin role required' }, { status: 403 }) }
    }
    return { profile }
}

// ============================================================
// POST /api/admin/bulk-password-reset
// Body: { hotel_id?: string, role?: string, password: string }
// Resets password for all matching staff who have auth accounts.
// ============================================================
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const adminCheck = await requireAdmin(supabase, auth.userId)
        if ('error' in adminCheck) return adminCheck.error

        const body = await request.json()
        const { hotel_id, role, password } = body

        // Validate password
        if (!password || typeof password !== 'string' || password.trim().length < 6) {
            return NextResponse.json(
                { error: 'Password must be at least 6 characters' },
                { status: 400 }
            )
        }

        const trimmedPassword = password.trim()

        // Build query to find matching staff with auth accounts
        let query = supabase
            .from('staff')
            .select('id, user_id, name, phone, role')
            .not('user_id', 'is', null)

        if (hotel_id) {
            query = query.eq('hotel_id', hotel_id)
        }
        if (role) {
            query = query.eq('role', role)
        }

        const { data: staffList, error: fetchError } = await query

        if (fetchError) {
            console.error('Bulk reset: staff fetch error:', fetchError)
            return NextResponse.json({ error: 'Failed to fetch staff list' }, { status: 500 })
        }

        if (!staffList || staffList.length === 0) {
            return NextResponse.json({
                updated: 0,
                failed: 0,
                errors: [],
                message: 'No matching staff members found',
            })
        }

        // Get admin client for auth operations
        let adminClient
        try {
            adminClient = getAdminClient()
        } catch (configErr) {
            console.error('Admin client config error:', configErr)
            const msg = configErr instanceof Error ? configErr.message : 'Service role key not configured'
            return NextResponse.json({ error: msg }, { status: 500 })
        }

        // Reset passwords one by one
        let updated = 0
        let failed = 0
        const errors: string[] = []

        for (const staff of staffList) {
            if (!staff.user_id) continue

            try {
                const { error: updateError } = await adminClient.auth.admin.updateUserById(
                    staff.user_id,
                    { password: trimmedPassword }
                )

                if (updateError) {
                    failed++
                    errors.push(`${staff.name || staff.phone || staff.id}: ${updateError.message}`)
                } else {
                    updated++
                }
            } catch (err: unknown) {
                failed++
                const msg = err instanceof Error ? err.message : 'Unknown error'
                errors.push(`${staff.name || staff.phone || staff.id}: ${msg}`)
            }
        }

        return NextResponse.json({
            updated,
            failed,
            errors,
            total: staffList.length,
            message: `Password reset complete: ${updated} updated, ${failed} failed`,
        })
    } catch (err) {
        console.error('Bulk password reset error:', err)
        const message = err instanceof Error ? err.message : 'Unknown error'
        return NextResponse.json({ error: `Bulk password reset failed: ${message}` }, { status: 500 })
    }
}
