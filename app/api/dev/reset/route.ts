import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// POST /api/dev/reset — Wipe all test data and reset units
export async function POST() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Dev-only endpoint' }, { status: 403 })
    }

    try {
        const supabase = await createClient()

        // Delete in dependency order: payments → guests → bookings
        const { error: p } = await supabase
            .from('payments')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')

        const { error: g } = await supabase
            .from('guests')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')

        const { error: b } = await supabase
            .from('bookings')
            .delete()
            .neq('id', '00000000-0000-0000-0000-000000000000')

        // Reset all units to AVAILABLE
        const { error: resetError } = await supabase
            .from('units')
            .update({ status: 'AVAILABLE', maintenance_reason: null })
            .neq('id', '00000000-0000-0000-0000-000000000000')

        const errors = [p, g, b, resetError].filter(Boolean)
        if (errors.length > 0) {
            console.error('Reset errors:', errors)
        }

        return NextResponse.json({
            success: true,
            message: 'All test data wiped, rooms reset to AVAILABLE',
        })
    } catch (err) {
        console.error('Reset error:', err)
        return NextResponse.json({ error: 'Failed to reset' }, { status: 500 })
    }
}
