import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'

// GET /api/payroll
export async function GET(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const hotelId = searchParams.get('hotel_id')
        const month = searchParams.get('month') // YYYY-MM-01

        let query = supabase
            .from('payroll')
            .select('*, staff(id, name, role, phone)')
            .order('created_at', { ascending: false })

        if (hotelId) query = query.eq('hotel_id', hotelId)
        if (month) {
            // Accept both YYYY-MM and YYYY-MM-01 formats
            const monthValue = month.length === 7 ? `${month}-01` : month
            query = query.eq('month', monthValue)
        }

        const { data, error } = await query

        if (error) {
            console.error('Payroll fetch error:', error)
            return NextResponse.json({ error: 'Failed to fetch payroll' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Payroll GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// POST /api/payroll — generate payroll for a month
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { hotel_id, month } = body // month: "YYYY-MM"

        if (!hotel_id || !month) {
            return NextResponse.json({ error: 'hotel_id and month are required' }, { status: 400 })
        }

        const monthStart = `${month}-01`
        const [yearStr, monthStr] = month.split('-')
        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate()
        const monthEnd = `${month}-${String(daysInMonth).padStart(2, '0')}`

        // Get all staff for this hotel
        const { data: staffList, error: staffErr } = await supabase
            .from('staff')
            .select('id, name, role, base_salary')
            .eq('hotel_id', hotel_id)
            .neq('role', 'Admin')

        if (staffErr || !staffList) {
            return NextResponse.json({ error: 'Failed to fetch staff' }, { status: 500 })
        }

        const results = []

        for (const s of staffList) {
            // Check if payroll already exists
            const { data: existing } = await supabase
                .from('payroll')
                .select('id')
                .eq('staff_id', s.id)
                .eq('month', monthStart)
                .maybeSingle()

            if (existing) continue // Skip already generated

            // Count attendance days — use next-day boundary (Rule #21)
            const nextMonthStart = `${new Date(parseInt(yearStr), parseInt(monthStr), 1).toISOString().split('T')[0]}T00:00:00+05:30`
            const { data: attendanceData } = await supabase
                .from('attendance')
                .select('id, clock_in')
                .eq('staff_id', s.id)
                .gte('clock_in', `${monthStart}T00:00:00+05:30`)
                .lt('clock_in', nextMonthStart)

            const uniqueDays = new Set(
                (attendanceData || []).map(a =>
                    new Date(a.clock_in).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
                )
            )
            const daysPresent = uniqueDays.size
            const daysAbsent = Math.max(0, daysInMonth - daysPresent)

            // Sum penalties
            const { data: incidents } = await supabase
                .from('staff_incidents')
                .select('penalty_amount')
                .eq('staff_id', s.id)
                .gte('incident_date', monthStart)
                .lte('incident_date', monthEnd)

            const totalPenalties = (incidents || []).reduce((sum, i) => sum + Number(i.penalty_amount), 0)

            const baseSalary = Number(s.base_salary) || 0
            // Per-day rate × days present - penalties
            const perDay = daysInMonth > 0 ? baseSalary / daysInMonth : 0
            const earnedSalary = perDay * daysPresent
            const netSalary = Math.max(0, earnedSalary - totalPenalties)

            const { data: payroll, error: insertErr } = await supabase
                .from('payroll')
                .insert({
                    staff_id: s.id,
                    hotel_id,
                    month: monthStart,
                    base_salary: baseSalary,
                    total_penalties: totalPenalties,
                    total_days_present: daysPresent,
                    total_days_absent: daysAbsent,
                    net_salary: Math.round(netSalary * 100) / 100,
                    status: 'DRAFT',
                })
                .select('*, staff(id, name, role)')
                .single()

            if (insertErr) {
                console.error(`Payroll insert error for ${s.name}:`, insertErr)
                continue
            }

            results.push(payroll)
        }

        return NextResponse.json({ data: results, generated: results.length })
    } catch (err) {
        console.error('Payroll POST error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// PATCH /api/payroll — finalize or mark paid
export async function PATCH(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { payroll_id, action } = body // action: "finalize" | "pay"

        if (!payroll_id || !action) {
            return NextResponse.json({ error: 'payroll_id and action are required' }, { status: 400 })
        }

        if (action === 'edit') {
            // Edit DRAFT payroll — override calculated values
            const { data: current, error: fetchErr } = await supabase
                .from('payroll')
                .select('*')
                .eq('id', payroll_id)
                .single()

            if (fetchErr || !current) {
                return NextResponse.json({ error: 'Payroll not found' }, { status: 404 })
            }

            if (current.status !== 'DRAFT') {
                return NextResponse.json(
                    { error: 'Only DRAFT payroll can be edited. Finalized and paid records are locked.' },
                    { status: 409 }
                )
            }

            const editUpdates: Record<string, unknown> = {}

            if (body.total_days_present !== undefined)
                editUpdates.total_days_present = Number(body.total_days_present)
            if (body.total_days_absent !== undefined)
                editUpdates.total_days_absent = Number(body.total_days_absent)
            if (body.total_penalties !== undefined)
                editUpdates.total_penalties = Math.round(Number(body.total_penalties) * 100) / 100
            if (body.net_salary !== undefined)
                editUpdates.net_salary = Math.round(Number(body.net_salary) * 100) / 100
            if (body.notes !== undefined)
                editUpdates.notes = body.notes || null

            if (Object.keys(editUpdates).length === 0) {
                return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
            }

            const { data, error } = await supabase
                .from('payroll')
                .update(editUpdates)
                .eq('id', payroll_id)
                .select('*, staff(id, name, role)')
                .single()

            if (error) {
                console.error('Payroll edit error:', error)
                return NextResponse.json({ error: 'Failed to update payroll' }, { status: 500 })
            }

            return NextResponse.json({ data })
        }

        // Fetch current payroll to validate status transition
        const { data: current, error: fetchErr } = await supabase
            .from('payroll')
            .select('*')
            .eq('id', payroll_id)
            .single()

        if (fetchErr || !current) {
            return NextResponse.json({ error: 'Payroll not found' }, { status: 404 })
        }

        const updates: Record<string, unknown> = {}

        if (action === 'finalize') {
            if (current.status !== 'DRAFT') {
                return NextResponse.json(
                    { error: 'Only DRAFT payroll can be finalized.' },
                    { status: 409 }
                )
            }
            updates.status = 'FINALIZED'
        } else if (action === 'pay') {
            if (current.status !== 'FINALIZED') {
                return NextResponse.json(
                    { error: 'Only FINALIZED payroll can be marked as paid.' },
                    { status: 409 }
                )
            }
            updates.status = 'PAID'
            updates.paid_at = getDevNow().toISOString()
        } else {
            return NextResponse.json({ error: 'Invalid action. Use "finalize", "pay", or "edit"' }, { status: 400 })
        }

        const { data, error } = await supabase
            .from('payroll')
            .update(updates)
            .eq('id', payroll_id)
            .select('*, staff(id, name, role)')
            .single()

        if (error) {
            console.error('Payroll update error:', error)
            return NextResponse.json({ error: 'Failed to update payroll' }, { status: 500 })
        }

        return NextResponse.json({ data })
    } catch (err) {
        console.error('Payroll PATCH error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

// DELETE /api/payroll — delete all DRAFT payroll for a hotel+month (for regeneration)
export async function DELETE(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()
        const { hotel_id, month } = body // month: "YYYY-MM"

        if (!hotel_id || !month) {
            return NextResponse.json({ error: 'hotel_id and month are required' }, { status: 400 })
        }

        const monthStart = `${month}-01`

        const { data, error } = await supabase
            .from('payroll')
            .delete()
            .eq('hotel_id', hotel_id)
            .eq('month', monthStart)
            .eq('status', 'DRAFT')
            .select('id')

        if (error) {
            console.error('Payroll delete error:', error)
            return NextResponse.json({ error: 'Failed to delete draft payroll' }, { status: 500 })
        }

        return NextResponse.json({ deleted: data?.length || 0 })
    } catch (err) {
        console.error('Payroll DELETE error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
