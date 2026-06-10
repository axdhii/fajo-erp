import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// Months of Aadhaar PII we must retain before a purge is permitted.
const RETENTION_MONTHS = 6

// Admin-only Supabase client for storage operations (needs service role for deletion)
function getAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL not configured')
    }
    return createSupabaseClient(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    })
}

/**
 * Retention guard: a `YYYY-MM` month folder is purgeable ONLY if the LAST day
 * of that month is strictly before `(now - RETENTION_MONTHS)`.
 *
 * Returns null if purgeable; otherwise a human-readable rejection reason.
 * Computes against `getDevNow()` so dev time-travel is honoured.
 *
 * Examples (now = 2026-06-10, retention = 6 months → cutoff = 2025-12-10):
 *   - "2026-06" (current): last day 2026-06-30 is NOT < cutoff → reject
 *   - "2025-12" (6 months ago): last day 2025-12-31 is NOT < 2025-12-10 → reject
 *   - "2025-11" (7 months ago): last day 2025-11-30 IS < 2025-12-10 → allow
 */
function retentionRejection(month: string): string | null {
    const m = /^(\d{4})-(\d{2})$/.exec(month)
    if (!m) return `Invalid month format "${month}" (expected YYYY-MM).`

    const year = Number(m[1])
    const monthNum = Number(m[2]) // 1-12
    if (monthNum < 1 || monthNum > 12) {
        return `Invalid month "${month}" — month must be 01-12.`
    }

    // Last instant of the target month, in UTC. `Date.UTC(year, monthNum, 1)` is
    // the first day of the NEXT month; subtract 1ms to land on this month's end.
    const lastInstantOfMonth = new Date(Date.UTC(year, monthNum, 1) - 1)

    // Cutoff = now minus RETENTION_MONTHS. Using UTC month math keeps it stable.
    const now = getDevNow()
    const cutoff = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth() - RETENTION_MONTHS,
        now.getUTCDate(),
        now.getUTCHours(),
        now.getUTCMinutes(),
        now.getUTCSeconds(),
    ))

    if (lastInstantOfMonth.getTime() < cutoff.getTime()) {
        return null // purgeable
    }
    return `Month ${month} is within the ${RETENTION_MONTHS}-month retention window and cannot be purged.`
}

// ============================================================
// POST /api/admin/aadhar-archive — Clear a month's Aadhar photos
// ============================================================

export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Verify Admin role
        const { data: profile } = await supabase
            .from('staff')
            .select('role')
            .eq('user_id', auth.userId)
            .single()

        if (!profile || !['Admin', 'Developer'].includes(profile.role)) {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const { month } = await request.json() // e.g., "2026-03"

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 })
        }

        // Authoritative retention guard: only months strictly older than the
        // 6-month retention window may be purged. This protects recent/returning
        // guest PII and is the real safeguard (the client disable is just UX).
        const rejection = retentionRejection(month)
        if (rejection) {
            return NextResponse.json({ error: rejection }, { status: 400 })
        }

        const adminClient = getAdminClient()

        // List all files in the month folder
        const { data: files, error: listError } = await adminClient.storage
            .from('aadhars')
            .list(month, { limit: 1000 })

        if (listError) {
            console.error('Aadhar archive list error:', listError)
            return NextResponse.json({ error: 'Failed to list files' }, { status: 500 })
        }

        // Filter out folder placeholders
        const realFiles = (files || []).filter(
            f => f.name && f.name !== '.emptyFolderPlaceholder'
        )

        if (realFiles.length === 0) {
            return NextResponse.json({ message: 'No files to clear', cleared: 0, guestsUpdated: 0 })
        }

        // Delete all files from storage
        const filePaths = realFiles.map(f => `${month}/${f.name}`)
        const { error: deleteError } = await adminClient.storage
            .from('aadhars')
            .remove(filePaths)

        if (deleteError) {
            console.error('Aadhar archive delete error:', deleteError)
            return NextResponse.json({ error: 'Failed to delete files' }, { status: 500 })
        }

        // Update guest records: mark aadhar_url_front and aadhar_url_back as ARCHIVED
        // Fetch all guests whose aadhar_url_front or aadhar_url_back starts with this month prefix
        const { data: matchingFront } = await supabase
            .from('guests')
            .select('id, aadhar_url_front')
            .like('aadhar_url_front', `${month}/%`)

        const { data: matchingBack } = await supabase
            .from('guests')
            .select('id, aadhar_url_back')
            .like('aadhar_url_back', `${month}/%`)

        let guestsUpdated = 0
        const processedIds = new Set<string>()

        if (matchingFront && matchingFront.length > 0) {
            for (const guest of matchingFront) {
                const { error: updateError } = await supabase
                    .from('guests')
                    .update({ aadhar_url_front: `ARCHIVED: ${guest.aadhar_url_front}` })
                    .eq('id', guest.id)

                if (!updateError) {
                    processedIds.add(guest.id)
                    guestsUpdated++
                }
            }
        }

        if (matchingBack && matchingBack.length > 0) {
            for (const guest of matchingBack) {
                const { error: updateError } = await supabase
                    .from('guests')
                    .update({ aadhar_url_back: `ARCHIVED: ${guest.aadhar_url_back}` })
                    .eq('id', guest.id)

                if (!updateError && !processedIds.has(guest.id)) {
                    guestsUpdated++
                }
            }
        }

        return NextResponse.json({
            message: `Cleared ${realFiles.length} photos for ${month}`,
            cleared: realFiles.length,
            guestsUpdated,
        })
    } catch (err) {
        console.error('Aadhar archive error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
