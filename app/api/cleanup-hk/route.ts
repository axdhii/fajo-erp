import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

// POST /api/cleanup-hk — Remove hk2-hk5 accounts, keep only hk1
export async function POST(request: NextRequest) {
    try {
        const supabase = await createClient()

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Delete staff records for hk2-hk5
        const emailsToDelete = ['hk2@fajo.com', 'hk3@fajo.com', 'hk4@fajo.com', 'hk5@fajo.com']

        // Get user_ids from staff table via a workaround - 
        // we can't query auth.users from client, but we can delete staff records
        // The auth users will just be orphaned (harmless)
        const { data: staffToDelete, error: fetchError } = await supabase
            .from('staff')
            .select('id, user_id, role')
            .eq('role', 'Housekeeping')

        if (fetchError) {
            return NextResponse.json({ error: fetchError.message }, { status: 500 })
        }

        // Keep only the first housekeeping account, delete the rest
        const hkStaff = staffToDelete || []
        if (hkStaff.length <= 1) {
            return NextResponse.json({
                message: 'Only 1 housekeeping account exists, nothing to delete',
                count: hkStaff.length
            })
        }

        // Keep the first, delete the rest
        const keepId = hkStaff[0].id
        const deleteIds = hkStaff.slice(1).map(s => s.id)

        const { error: deleteError } = await supabase
            .from('staff')
            .delete()
            .in('id', deleteIds)

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
            message: `Deleted ${deleteIds.length} extra housekeeping accounts. 1 remains.`,
            kept: hkStaff[0],
            deleted: deleteIds.length,
        })
    } catch (err) {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
