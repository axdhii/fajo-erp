import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { calculateBookingPrice } from '@/lib/pricing'
import { checkConflict } from '@/lib/conflict'
import type { UnitType } from '@/lib/types'

interface GuestInput {
    name: string
    phone: string
    aadhar_number?: string | null
    aadhar_url_front?: string | null
    aadhar_url_back?: string | null
}

// POST /api/admin/retroactive-booking
// Admin/Developer-only endpoint for entering paper-register check-ins after the
// fact. Unlike /api/bookings POST (which uses getDevNow() for check_in), this
// route accepts explicit check_in_at / check_out_at / payment_at timestamps so
// the booking + payment land in the correct date bucket for revenue reporting.
//
// If the booking's check_out_at is in the past, status = CHECKED_OUT and the
// unit goes back to AVAILABLE/DIRTY. Otherwise CHECKED_IN.
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        const { data: callerStaff } = await supabase
            .from('staff').select('id, name, role').eq('user_id', auth.userId).single()
        if (!callerStaff) {
            return NextResponse.json({ error: 'Staff profile not found' }, { status: 403 })
        }
        if (!['Admin', 'Developer'].includes(callerStaff.role)) {
            return NextResponse.json({ error: 'Retroactive booking requires Admin or Developer role' }, { status: 403 })
        }

        const body = await request.json()
        const {
            unitId,
            check_in_at,
            check_out_at,
            payment_at,
            guests,
            cashAmount = 0,
            digitalAmount = 0,
            grandTotalOverride,
        } = body as {
            unitId?: string
            check_in_at?: string
            check_out_at?: string
            payment_at?: string
            guests?: GuestInput[]
            cashAmount?: number
            digitalAmount?: number
            grandTotalOverride?: number | null
        }

        // ── Required fields ──────────────────────────────────────────
        if (!unitId) return NextResponse.json({ error: 'unitId is required' }, { status: 400 })
        if (!check_in_at) return NextResponse.json({ error: 'check_in_at is required' }, { status: 400 })
        if (!check_out_at) return NextResponse.json({ error: 'check_out_at is required' }, { status: 400 })
        if (!Array.isArray(guests) || guests.length === 0) {
            return NextResponse.json({ error: 'At least one guest is required' }, { status: 400 })
        }

        const checkInDate = new Date(check_in_at)
        const checkOutDate = new Date(check_out_at)
        if (Number.isNaN(checkInDate.getTime()) || Number.isNaN(checkOutDate.getTime())) {
            return NextResponse.json({ error: 'Invalid check_in_at or check_out_at timestamp' }, { status: 400 })
        }
        if (checkOutDate <= checkInDate) {
            return NextResponse.json({ error: 'check_out_at must be after check_in_at' }, { status: 400 })
        }

        const paymentDate = payment_at ? new Date(payment_at) : checkInDate
        if (Number.isNaN(paymentDate.getTime())) {
            return NextResponse.json({ error: 'Invalid payment_at timestamp' }, { status: 400 })
        }

        // Sanity-bound timestamps (no >1 year backdate, no >1 day future)
        const oneYearAgo = new Date(Date.now() - 365 * 86400000)
        const oneDayAhead = new Date(Date.now() + 86400000)
        if (checkInDate < oneYearAgo || checkOutDate > oneDayAhead) {
            return NextResponse.json({ error: 'Booking timestamps must be within 1 year past and not more than 1 day in future' }, { status: 400 })
        }

        // Validate each guest has name + 10-digit phone
        for (const g of guests) {
            if (!g.name || !g.phone) {
                return NextResponse.json({ error: 'Each guest must have a name and phone' }, { status: 400 })
            }
            if (g.phone.replace(/\D/g, '').length !== 10) {
                return NextResponse.json({ error: `${g.name}'s phone must be exactly 10 digits` }, { status: 400 })
            }
        }

        // Fetch the unit
        const { data: unit, error: unitError } = await supabase
            .from('units')
            .select('*')
            .eq('id', unitId)
            .single()
        if (unitError || !unit) {
            return NextResponse.json({ error: 'Unit not found' }, { status: 404 })
        }

        const unitMaxGuests = unit.max_guests || 3
        const days = Math.max(1, Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / 86400000))

        // Conflict check — even retroactively, two bookings can't occupy the same
        // unit in overlapping windows. If admin's paper register conflicts with
        // an existing system booking, return 409 so they can resolve manually.
        const conflict = await checkConflict({
            unitId,
            checkIn: checkInDate,
            checkOut: checkOutDate,
        })
        if (conflict.hasConflict) {
            return NextResponse.json(
                {
                    error: `Conflicts with ${conflict.conflictingBookings.length} existing booking(s) for ${unit.unit_number}. Resolve those before retroactive entry.`,
                    conflicts: conflict.conflictingBookings,
                },
                { status: 409 }
            )
        }
        const perDayBase = Number(unit.base_price)
        const totalBase = perDayBase * days
        const pricing = calculateBookingPrice(unit.type as UnitType, totalBase, guests.length, unitMaxGuests)
        const finalGrandTotal = grandTotalOverride != null ? Number(grandTotalOverride) : pricing.grandTotal

        const totalPaid = Number(cashAmount) + Number(digitalAmount)
        if (Math.abs(totalPaid - finalGrandTotal) > 0.01) {
            return NextResponse.json({ error: `Payment ₹${totalPaid} does not match grand total ₹${finalGrandTotal}` }, { status: 400 })
        }

        // Status = CHECKED_OUT if check_out is already in the past, else CHECKED_IN
        const now = new Date()
        const status = checkOutDate <= now ? 'CHECKED_OUT' : 'CHECKED_IN'

        const auditNote = `[RETROACTIVE — entered by ${callerStaff.name || 'Admin'} at ${now.toISOString()}]`

        // ── Create booking ───────────────────────────────────────────
        const { data: booking, error: bookingError } = await supabase
            .from('bookings')
            .insert({
                unit_id: unitId,
                check_in: checkInDate.toISOString(),
                check_out: checkOutDate.toISOString(),
                guest_count: guests.length,
                base_amount: pricing.baseAmount,
                surcharge: pricing.surcharge,
                grand_total: finalGrandTotal,
                notes: auditNote,
                status,
                checked_out_by: status === 'CHECKED_OUT' ? callerStaff.id : null,
                checked_out_at: status === 'CHECKED_OUT' ? checkOutDate.toISOString() : null,
                created_by: callerStaff.id,
            })
            .select()
            .single()

        if (bookingError) {
            console.error('Retroactive booking insert error:', bookingError)
            if (bookingError.code === '23505') {
                return NextResponse.json({ error: 'A booking already exists for this unit in the given window. Resolve before retroactive entry.' }, { status: 409 })
            }
            return NextResponse.json({ error: 'Failed to create retroactive booking' }, { status: 500 })
        }

        // ── Insert guests ────────────────────────────────────────────
        const guestRecords = guests.map((g) => ({
            booking_id: booking.id,
            name: g.name,
            phone: g.phone.replace(/\D/g, ''),
            aadhar_number: g.aadhar_number || null,
            aadhar_url_front: g.aadhar_url_front || null,
            aadhar_url_back: g.aadhar_url_back || null,
        }))
        const { error: guestsError } = await supabase.from('guests').insert(guestRecords)
        if (guestsError) {
            console.error('Retroactive guests insert error:', guestsError)
            await supabase.from('bookings').delete().eq('id', booking.id)
            return NextResponse.json({ error: 'Failed to save guest details. Booking rolled back.' }, { status: 500 })
        }

        // ── Insert payment with backdated created_at ─────────────────
        // Use upsert in case the unique constraint on payments.booking_id triggers.
        const { error: paymentError } = await supabase
            .from('payments')
            .upsert({
                booking_id: booking.id,
                amount_cash: Number(cashAmount),
                amount_digital: Number(digitalAmount),
                total_paid: totalPaid,
                created_at: paymentDate.toISOString(),
            }, { onConflict: 'booking_id' })

        if (paymentError) {
            console.error('Retroactive payment insert error:', paymentError)
            await supabase.from('guests').delete().eq('booking_id', booking.id)
            await supabase.from('bookings').delete().eq('id', booking.id)
            return NextResponse.json({ error: 'Failed to record payment. Booking rolled back.' }, { status: 500 })
        }

        // ── Unit status ──────────────────────────────────────────────
        // If still active, mark OCCUPIED. If retroactively closed, leave the unit
        // alone — DIRTY/AVAILABLE depends on whether housekeeping happened, and
        // we shouldn't assume.
        if (status === 'CHECKED_IN') {
            await supabase.from('units').update({ status: 'OCCUPIED' }).eq('id', unitId)
        }

        return NextResponse.json({
            success: true,
            booking: {
                ...booking,
                pricing: {
                    baseAmount: pricing.baseAmount,
                    surcharge: pricing.surcharge,
                    grandTotal: finalGrandTotal,
                    days,
                },
            },
        })
    } catch (err) {
        console.error('Retroactive booking error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
