import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { calculateBookingPrice } from '@/lib/pricing'
import { checkConflict, calculateCheckOut } from '@/lib/conflict'
import { getDevNow } from '@/lib/dev-time'
import { requireAuth } from '@/lib/auth'
import { distributePayment } from '@/lib/distribute-payment'
import type { BulkCheckInGuest } from '@/lib/types'

// ─────────────────────────────────────────────────────────────
// In-memory idempotency cache. Lives for the lifetime of the
// serverless function instance. This is intentionally light —
// it stops the same submission from creating two groups within
// a few seconds (double-tap, retry on a flaky connection) and
// then expires harmlessly. A spinning submit button still
// catches the rest. Documented here so the constraint is
// visible to anyone tightening this later.
// ─────────────────────────────────────────────────────────────
const IDEMPOTENCY_TTL_MS = 60_000
const recentRequests: Map<string, { at: number; status: 'pending' | 'done' }> = new Map()

function rememberRequest(id: string) {
    // Sweep old entries.
    const now = Date.now()
    for (const [key, value] of recentRequests) {
        if (now - value.at > IDEMPOTENCY_TTL_MS) recentRequests.delete(key)
    }
    recentRequests.set(id, { at: now, status: 'pending' })
}

function isDuplicate(id: string): boolean {
    const entry = recentRequests.get(id)
    if (!entry) return false
    if (Date.now() - entry.at > IDEMPOTENCY_TTL_MS) {
        recentRequests.delete(id)
        return false
    }
    return true
}

// POST /api/bookings/bulk — Bulk dorm check-in for Kaloor walk-in groups.
//
// 1. Validate caller + payload + hotel/unit invariants.
// 2. Run per-bed conflict check in parallel — ALL must pass.
// 3. Compute per-bed pricing via the shared lib/pricing helper.
// 4. Compute proportional payment split via lib/distribute-payment.
// 5. Hand the assembled JSONB payload to fn_bulk_dorm_checkin() so
//    inserts + status flip happen inside one Postgres transaction.
//    If the Postgres function raises (e.g. concurrent CHECKED_IN
//    from another CRE), Postgres rolls everything back atomically.
export async function POST(request: NextRequest) {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const body = await request.json()

        const {
            hotelId,
            unitIds,
            guests,
            numberOfDays,
            checkOutOverride,
            amountCash,
            amountDigital,
            payLater,
            clientRequestId,
        } = body as {
            hotelId?: string
            unitIds?: string[]
            guests?: BulkCheckInGuest[]
            numberOfDays?: number
            checkOutOverride?: string | null
            amountCash?: number
            amountDigital?: number
            payLater?: boolean
            clientRequestId?: string
        }

        // ── Validate payload shape ───────────────────────────────
        if (!hotelId || typeof hotelId !== 'string') {
            return NextResponse.json({ error: 'hotelId is required' }, { status: 400 })
        }
        if (!Array.isArray(unitIds) || unitIds.length < 2) {
            return NextResponse.json({ error: 'Select at least 2 beds for bulk check-in' }, { status: 400 })
        }
        if (unitIds.length > 36) {
            return NextResponse.json({ error: 'Cannot bulk check in more than 36 beds at once' }, { status: 400 })
        }
        if (!Array.isArray(guests) || guests.length !== unitIds.length) {
            return NextResponse.json({ error: 'guests.length must equal unitIds.length' }, { status: 400 })
        }
        const days = Math.max(1, Math.min(30, Math.floor(Number(numberOfDays) || 1)))
        const cashAmount = Number(amountCash) || 0
        const digitalAmount = Number(amountDigital) || 0
        if (cashAmount < 0 || digitalAmount < 0) {
            return NextResponse.json({ error: 'Payment amounts cannot be negative' }, { status: 400 })
        }

        // Optional idempotency guard — short-circuits accidental retries
        // (double-tap submit, browser-level retry) without needing a DB table.
        if (clientRequestId && typeof clientRequestId === 'string') {
            if (isDuplicate(clientRequestId)) {
                return NextResponse.json(
                    { error: 'Duplicate request detected — this group is already being processed.' },
                    { status: 409 },
                )
            }
            rememberRequest(clientRequestId)
        }

        // unitIds must match guest unitIds 1:1
        const guestUnitIdSet = new Set(guests.map(g => g.unitId))
        if (guestUnitIdSet.size !== guests.length) {
            return NextResponse.json({ error: 'Duplicate unitId in guests array' }, { status: 400 })
        }
        for (const id of unitIds) {
            if (!guestUnitIdSet.has(id)) {
                return NextResponse.json({ error: 'Every selected bed must have a matching guest' }, { status: 400 })
            }
        }

        // Every guest must have name + 10-digit phone + (aadhar OR bypass)
        for (const g of guests) {
            if (!g.name?.trim()) {
                return NextResponse.json({ error: `Guest at ${g.unitId} is missing a name` }, { status: 400 })
            }
            const phoneDigits = (g.phone || '').replace(/\D/g, '')
            if (phoneDigits.length !== 10) {
                return NextResponse.json({ error: `Guest ${g.name}'s phone must be exactly 10 digits` }, { status: 400 })
            }
            const hasAadhar = g.aadhar?.stitchedUrl && g.aadhar.stitchedUrl.length > 0
            const hasBypass = g.bypass?.reason && g.bypass.reason.trim().length >= 3
            if (!hasAadhar && !hasBypass) {
                return NextResponse.json(
                    { error: `Guest ${g.name} needs either an Aadhar photo OR a bypass reason (min 3 chars)` },
                    { status: 400 },
                )
            }
        }

        // ── Validate hotel is Kaloor ─────────────────────────────
        const { data: hotel, error: hotelError } = await supabase
            .from('hotels')
            .select('id, name')
            .eq('id', hotelId)
            .single()

        if (hotelError || !hotel) {
            return NextResponse.json({ error: 'Hotel not found' }, { status: 404 })
        }
        if (hotel.name !== 'FAJO Rooms Kaloor') {
            return NextResponse.json(
                { error: 'Bulk dorm check-in is only available at FAJO Rooms Kaloor.' },
                { status: 400 },
            )
        }

        // ── Validate units (all DORM, all at hotelId, all AVAILABLE) ─
        const { data: units, error: unitsError } = await supabase
            .from('units')
            .select('id, unit_number, type, status, base_price, hotel_id, max_guests')
            .in('id', unitIds)

        if (unitsError) {
            return NextResponse.json({ error: 'Failed to fetch units' }, { status: 500 })
        }
        if (!units || units.length !== unitIds.length) {
            return NextResponse.json({ error: 'One or more selected beds were not found' }, { status: 404 })
        }
        const nonDorm = units.find(u => u.type !== 'DORM' || u.hotel_id !== hotelId)
        if (nonDorm) {
            return NextResponse.json(
                { error: `Unit ${nonDorm.unit_number} is not a Kaloor dorm bed` },
                { status: 400 },
            )
        }
        const unavailable = units.filter(u => u.status !== 'AVAILABLE')
        if (unavailable.length > 0) {
            return NextResponse.json(
                {
                    error: `Some beds are no longer available: ${unavailable.map(u => `${u.unit_number} (${u.status})`).join(', ')}`,
                    conflicts: unavailable.map(u => ({ unit_number: u.unit_number, status: u.status })),
                },
                { status: 409 },
            )
        }

        // ── Calculate check-in / check-out using the same IST math as single check-in ──
        const checkInDate = getDevNow()
        let checkOutDate: Date
        if (checkOutOverride) {
            const overrideDate = new Date(checkOutOverride)
            if (!isNaN(overrideDate.getTime()) && overrideDate > checkInDate) {
                checkOutDate = overrideDate
            } else {
                checkOutDate = calculateCheckOut('DORM', checkInDate, days)
            }
        } else {
            checkOutDate = calculateCheckOut('DORM', checkInDate, days)
        }

        // ── Per-bed conflict check (parallel). ALL must pass before any write. ──
        const conflictResults = await Promise.all(
            units.map(u => checkConflict({ unitId: u.id, checkIn: checkInDate, checkOut: checkOutDate })),
        )
        const conflictingUnits: { unit_number: string }[] = []
        units.forEach((u, idx) => {
            if (conflictResults[idx].hasConflict) {
                conflictingUnits.push({ unit_number: u.unit_number })
            }
        })
        if (conflictingUnits.length > 0) {
            return NextResponse.json(
                {
                    error: `Booking conflict for: ${conflictingUnits.map(c => c.unit_number).join(', ')}`,
                    conflicts: conflictingUnits,
                },
                { status: 409 },
            )
        }

        // ── Compute per-bed pricing via the shared lib/pricing helper ──
        // Dorms have no surcharge (1 bed = 1 guest), so grand_total = base_price * days.
        const unitsById = new Map(units.map(u => [u.id, u]))
        const bedPricing = unitIds.map(unitId => {
            const unit = unitsById.get(unitId)!
            const perDayBase = Number(unit.base_price)
            const totalBase = perDayBase * days
            const pricing = calculateBookingPrice('DORM', totalBase, 1, unit.max_guests || 1)
            return {
                unitId,
                unitNumber: unit.unit_number,
                grandTotal: pricing.grandTotal,
            }
        })

        const grandTotal = bedPricing.reduce((s, b) => s + b.grandTotal, 0)

        // ── Validate payment total matches (or payLater = both zero) ──
        const totalPaid = cashAmount + digitalAmount
        if (payLater) {
            if (cashAmount !== 0 || digitalAmount !== 0) {
                return NextResponse.json(
                    { error: 'Pay Later requires cash and digital to both be 0' },
                    { status: 400 },
                )
            }
        } else if (Math.abs(totalPaid - grandTotal) > 0.01) {
            return NextResponse.json(
                { error: `Payment ₹${totalPaid} does not match grand total ₹${grandTotal}` },
                { status: 400 },
            )
        }

        // ── Look up staff for created_by and audit-trail bypass notes ──
        const { data: staffProfile } = await supabase
            .from('staff')
            .select('id, name')
            .eq('user_id', auth.userId)
            .single()

        const staffName = staffProfile?.name || 'CRE'
        const staffId = staffProfile?.id || null
        const auditTs = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })

        // ── Compute proportional payment split (last bed absorbs remainder) ──
        const splits = distributePayment(
            bedPricing.map(b => ({ bookingId: b.unitId, grandTotal: b.grandTotal })),
            cashAmount,
            digitalAmount,
        )
        const splitByUnit = new Map(splits.map(s => [s.bookingId, s]))

        // ── Build the JSONB payload for the Postgres function ──
        const guestsByUnit = new Map(guests.map(g => [g.unitId, g]))
        const bedsPayload = bedPricing.map(b => {
            const g = guestsByUnit.get(b.unitId)!
            const split = splitByUnit.get(b.unitId)!
            const phoneDigits = g.phone.replace(/\D/g, '')

            // Audit trail: if bypass, append note in the same format as
            // [OVERRIDE by ...] elsewhere in the codebase. No silent bypass.
            let notes: string | null = null
            if (g.bypass?.reason) {
                notes = `[BYPASS by ${staffName} at ${auditTs}]: ${g.bypass.reason.trim()}`
            }

            return {
                unit_id: b.unitId,
                grand_total: b.grandTotal,
                guest_name: g.name.trim(),
                guest_phone: phoneDigits,
                aadhar_number: g.aadhar?.aadharNumber || null,
                aadhar_url_front: g.aadhar?.stitchedUrl || null,
                aadhar_url_back: g.aadhar?.stitchedUrl || null,
                amount_cash: split.amountCash,
                amount_digital: split.amountDigital,
                total_paid: split.totalPaid,
                notes,
            }
        })

        const rpcPayload = {
            hotel_id: hotelId,
            staff_id: staffId,
            check_in: checkInDate.toISOString(),
            check_out: checkOutDate.toISOString(),
            pay_later: !!payLater,
            beds: bedsPayload,
        }

        // ── Atomic call ──────────────────────────────────────────
        const { data: rpcData, error: rpcError } = await supabase
            .rpc('fn_bulk_dorm_checkin', { payload: rpcPayload })

        if (rpcError) {
            console.error('fn_bulk_dorm_checkin error:', rpcError)
            const code = (rpcError as { code?: string }).code
            const msg = rpcError.message || ''

            // 23505 = unique_violation on idx_one_checkin_per_unit — another
            // CRE just won the race for one of these beds. Return 409 with a
            // clear actionable message.
            if (code === '23505') {
                return NextResponse.json(
                    { error: 'One of the selected beds was just checked in by another CRE. Please refresh and re-select.' },
                    { status: 409 },
                )
            }
            // Custom messages emitted by the function (unit_unavailable, etc.)
            if (msg.startsWith('unit_unavailable:')) {
                const parts = msg.split(':')
                return NextResponse.json(
                    { error: `Bed ${parts[1]} is no longer available (${parts[2] || 'OCCUPIED'}). Please refresh.` },
                    { status: 409 },
                )
            }
            if (msg.startsWith('unit_not_dorm:') || msg.startsWith('unit_wrong_hotel:') || msg.startsWith('unit_not_found:')) {
                return NextResponse.json(
                    { error: `Invalid unit: ${msg}` },
                    { status: 400 },
                )
            }
            return NextResponse.json(
                { error: `Bulk check-in failed: ${msg || 'database error'}` },
                { status: 500 },
            )
        }

        const result = rpcData as {
            success: boolean
            group_id: string
            booking_ids: string[]
            total_paid: number
        }

        return NextResponse.json({
            success: true,
            groupId: result.group_id,
            bookingIds: result.booking_ids,
            totalPaid: result.total_paid,
            grandTotal,
            checkIn: checkInDate.toISOString(),
            checkOut: checkOutDate.toISOString(),
        })
    } catch (err) {
        console.error('Bulk check-in error:', err)
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 },
        )
    }
}
