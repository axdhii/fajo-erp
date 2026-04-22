import { SupabaseClient } from '@supabase/supabase-js'

export async function generateShiftReport(
    supabase: SupabaseClient,
    staffId: string,
    hotelId: string,
    clockIn: string,
    clockOut: string,
    attendanceId: string
) {
    // 1. Check-ins (bookings created by this staff, status CHECKED_IN or CHECKED_OUT)
    const { data: checkIns } = await supabase
        .from('bookings')
        .select('id, unit_id, grand_total, advance_amount, advance_type, guests(name), unit:units(unit_number)')
        .eq('created_by', staffId)
        .gte('created_at', clockIn)
        .lte('created_at', clockOut)
        .in('status', ['CHECKED_IN', 'CHECKED_OUT'])

    // 2. Check-outs (bookings checked out by this staff)
    const { data: checkOuts } = await supabase
        .from('bookings')
        .select('id, unit_id, guests(name), unit:units(unit_number)')
        .eq('checked_out_by', staffId)
        .gte('updated_at', clockIn)
        .lte('updated_at', clockOut)

    // 3. Reservations created
    const { data: reservations } = await supabase
        .from('bookings')
        .select('id, unit_id, check_in, guests(name), unit:units(unit_number)')
        .eq('created_by', staffId)
        .gte('created_at', clockIn)
        .lte('created_at', clockOut)
        .in('status', ['PENDING', 'CONFIRMED'])

    // 4. Restock requests
    const { data: restocks } = await supabase
        .from('restock_requests')
        .select('id, items')
        .eq('requested_by', staffId)
        .gte('created_at', clockIn)
        .lte('created_at', clockOut)

    // 5. Customer issues
    const { data: issues } = await supabase
        .from('customer_issues')
        .select('id, description, guest_name')
        .eq('reported_by', staffId)
        .gte('created_at', clockIn)
        .lte('created_at', clockOut)

    // 6. Expense requests
    const { data: expenses } = await supabase
        .from('property_expenses')
        .select('id, description, amount')
        .eq('requested_by', staffId)
        .gte('created_at', clockIn)
        .lte('created_at', clockOut)

    // 7. Revenue -- payments for bookings created OR checked out by this staff
    const allBookingIds = [
        ...(checkIns || []).map(b => b.id),
        ...(checkOuts || []).map(b => b.id),
    ]
    const uniqueBookingIds = [...new Set(allBookingIds)]

    let revenueCash = 0, revenueDigital = 0
    if (uniqueBookingIds.length > 0) {
        const { data: payments } = await supabase
            .from('payments')
            .select('amount_cash, amount_digital')
            .in('booking_id', uniqueBookingIds)
        if (payments) {
            revenueCash = payments.reduce((s, p) => s + Number(p.amount_cash || 0), 0)
            revenueDigital = payments.reduce((s, p) => s + Number(p.amount_digital || 0), 0)
        }
    }

    // Include advance_amount from check-ins (collected at reservation/check-in time)
    let advanceCash = 0, advanceDigital = 0
    for (const b of (checkIns || [])) {
        const advance = Number((b as Record<string, unknown>).advance_amount || 0)
        if (advance > 0) {
            const advType = String((b as Record<string, unknown>).advance_type || '').toUpperCase()
            if (advType === 'DIGITAL' || advType === 'UPI' || advType === 'GPAY') {
                advanceDigital += advance
                revenueDigital += advance
            } else {
                advanceCash += advance
                revenueCash += advance
            }
        }
    }

    // Include booking extras added by this staff during the shift
    const { data: extras } = await supabase
        .from('booking_extras')
        .select('amount, payment_method')
        .eq('added_by', staffId)
        .gte('created_at', clockIn)
        .lt('created_at', clockOut)

    let extrasCash = 0, extrasDigital = 0, extrasCount = 0, freshupCash = 0, freshupDigital = 0, freshupCount = 0
    if (extras) {
        extrasCount = extras.length
        for (const e of extras) {
            const amt = Number(e.amount || 0)
            if (e.payment_method === 'DIGITAL') {
                extrasDigital += amt
                revenueDigital += amt
            } else {
                extrasCash += amt
                revenueCash += amt
            }
        }
    }

    // Include freshup records created by this staff during the shift
    const { data: freshups } = await supabase
        .from('freshup')
        .select('amount, payment_method')
        .eq('created_by', staffId)
        .gte('created_at', clockIn)
        .lt('created_at', clockOut)

    if (freshups) {
        freshupCount = freshups.length
        for (const f of freshups) {
            const amt = Number(f.amount || 0)
            if (f.payment_method === 'DIGITAL') {
                freshupDigital += amt
                revenueDigital += amt
            } else {
                freshupCash += amt
                revenueCash += amt
            }
        }
    }

    // 8. Build report
    const report = {
        staff_id: staffId,
        hotel_id: hotelId,
        attendance_id: attendanceId,
        shift_start: clockIn,
        shift_end: clockOut,
        total_check_ins: (checkIns || []).length,
        total_check_outs: (checkOuts || []).length,
        total_reservations_created: (reservations || []).length,
        total_guests_handled: (checkIns || []).reduce((s, b) => s + ((b.guests as any[])?.length || 0), 0),
        check_in_units: (checkIns || []).map(b => ({
            unit_number: (b.unit as any)?.unit_number,
            booking_id: b.id,
            guest_names: ((b.guests as any[]) || []).map(g => g.name).join(', '),
        })),
        check_out_units: (checkOuts || []).map(b => ({
            unit_number: (b.unit as any)?.unit_number,
            booking_id: b.id,
            guest_names: ((b.guests as any[]) || []).map(g => g.name).join(', '),
        })),
        reservations_list: (reservations || []).map(b => ({
            unit_number: (b.unit as any)?.unit_number,
            booking_id: b.id,
            guest_names: ((b.guests as any[]) || []).map(g => g.name).join(', '),
            check_in: b.check_in,
        })),
        restock_requests_count: (restocks || []).length,
        customer_issues_count: (issues || []).length,
        expense_requests_count: (expenses || []).length,
        advance_cash: advanceCash,
        advance_digital: advanceDigital,
        advance_total: advanceCash + advanceDigital,
        extras_count: extrasCount,
        extras_revenue_cash: extrasCash,
        extras_revenue_digital: extrasDigital,
        freshup_count: freshupCount,
        freshup_revenue_cash: freshupCash,
        freshup_revenue_digital: freshupDigital,
        revenue_cash: revenueCash,
        revenue_digital: revenueDigital,
        revenue_total: revenueCash + revenueDigital,
    }

    // 9. Insert — if a report already exists for this attendance, fetch and return it (idempotent)
    const { data, error } = await supabase
        .from('shift_reports')
        .insert(report)
        .select()
        .single()

    // Postgres unique violation code 23505 — another concurrent call already created this report
    if (error && (error as { code?: string }).code === '23505') {
        const { data: existing } = await supabase
            .from('shift_reports')
            .select()
            .eq('attendance_id', attendanceId)
            .single()
        return { data: existing, error: null }
    }

    return { data, error }
}
