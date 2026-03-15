import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// POST /api/migrate-dorms — Rename D01-D36 → A1-A36, set Lower/Upper pricing
export async function POST() {
    try {
        if (process.env.NODE_ENV === 'production') {
            return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
        }

        const supabase = await createClient()

        // Auth check
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Verify staff role is Admin
        const { data: staff } = await supabase
            .from('staff')
            .select('role')
            .eq('user_id', user.id)
            .single()

        if (!staff || staff.role !== 'Admin') {
            return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
        }

        // Fetch dorm beds
        const { data: dorms, error } = await supabase
            .from('units')
            .select('*')
            .eq('type', 'DORM')
            .order('unit_number', { ascending: true })

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        const results: string[] = []

        for (const bed of (dorms || [])) {
            // Extract number: D01→1, D10→10, A1→1
            const match = bed.unit_number.match(/[DA](\d+)/)
            if (!match) {
                results.push(`⚠️ Skipped ${bed.unit_number}`)
                continue
            }

            const num = parseInt(match[1])
            const newName = 'A' + num
            const newPrice = num <= 13 ? 400 : 450
            const bedType = num <= 13 ? 'Lower' : 'Upper'

            if (bed.unit_number === newName && Number(bed.base_price) === newPrice) {
                results.push(`✓ ${newName} already correct (${bedType}, ₹${newPrice})`)
                continue
            }

            const { error: updateError } = await supabase
                .from('units')
                .update({ unit_number: newName, base_price: newPrice })
                .eq('id', bed.id)

            if (updateError) {
                results.push(`❌ ${bed.unit_number}: ${updateError.message}`)
            } else {
                results.push(`✅ ${bed.unit_number} → ${newName} (${bedType}, ₹${newPrice})`)
            }
        }

        return NextResponse.json({
            success: true,
            total: dorms?.length || 0,
            results,
        })
    } catch {
        return NextResponse.json({ error: 'Internal error' }, { status: 500 })
    }
}
