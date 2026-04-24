import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

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
