import { createClient } from '@/lib/supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'

// Admin-only Supabase client for storage operations (needs service role for deletion)
function getAdminClient() {
    return createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
    )
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

        if (!profile || profile.role !== 'Admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        const { month } = await request.json() // e.g., "2026-03"

        if (!month || !/^\d{4}-\d{2}$/.test(month)) {
            return NextResponse.json({ error: 'Invalid month format (YYYY-MM)' }, { status: 400 })
        }

        const adminClient = getAdminClient()

        // List all files in the month folder
        const { data: files, error: listError } = await adminClient.storage
            .from('aadhar-photos')
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
            .from('aadhar-photos')
            .remove(filePaths)

        if (deleteError) {
            console.error('Aadhar archive delete error:', deleteError)
            return NextResponse.json({ error: 'Failed to delete files' }, { status: 500 })
        }

        // Update guest records: mark aadhar_url as ARCHIVED
        // Fetch all guests whose aadhar_url starts with this month prefix
        const { data: matchingGuests } = await supabase
            .from('guests')
            .select('id, aadhar_url')
            .like('aadhar_url', `${month}/%`)

        let guestsUpdated = 0
        if (matchingGuests && matchingGuests.length > 0) {
            for (const guest of matchingGuests) {
                const { error: updateError } = await supabase
                    .from('guests')
                    .update({ aadhar_url: `ARCHIVED: ${guest.aadhar_url}` })
                    .eq('id', guest.id)

                if (!updateError) guestsUpdated++
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
