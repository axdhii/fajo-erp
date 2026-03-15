import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDevNow } from '@/lib/dev-time'
import { requireAuth } from '@/lib/auth'

// POST /api/dev/seed — Create dummy test data
export async function POST() {
    if (process.env.NODE_ENV !== 'development') {
        return NextResponse.json({ error: 'Dev-only endpoint' }, { status: 403 })
    }

    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()
        const now = getDevNow()

        // Get all available units
        const { data: units, error: unitsError } = await supabase
            .from('units')
            .select('*')
            .eq('status', 'AVAILABLE')
            .order('unit_number', { ascending: true })

        if (unitsError || !units || units.length === 0) {
            return NextResponse.json(
                { error: 'No available units found. Wipe test data first.' },
                { status: 400 }
            )
        }

        const rooms = units.filter(u => u.type === 'ROOM')
        const dorms = units.filter(u => u.type === 'DORM')

        const results: string[] = []

        // === Scenario 1: 2 rooms occupied (checked in today) ===
        for (let i = 0; i < Math.min(2, rooms.length); i++) {
            const room = rooms[i]
            const checkIn = new Date(now)
            const checkOut = new Date(now.getTime() + 24 * 60 * 60 * 1000) // +24h
            const basePrice = Number(room.base_price)

            const { data: booking } = await supabase
                .from('bookings')
                .insert({
                    unit_id: room.id,
                    check_in: checkIn.toISOString(),
                    check_out: checkOut.toISOString(),
                    guest_count: 2,
                    base_amount: basePrice,
                    surcharge: 0,
                    grand_total: basePrice,
                    status: 'CHECKED_IN',
                })
                .select()
                .single()

            if (booking) {
                await supabase.from('guests').insert([
                    { booking_id: booking.id, name: `Test Guest ${i + 1}A`, phone: `98765${String(i).padStart(5, '0')}` },
                    { booking_id: booking.id, name: `Test Guest ${i + 1}B`, phone: `98764${String(i).padStart(5, '0')}` },
                ])
                await supabase.from('payments').insert({
                    booking_id: booking.id,
                    amount_cash: basePrice,
                    amount_digital: 0,
                    total_paid: basePrice,
                })
                await supabase.from('units').update({ status: 'OCCUPIED' }).eq('id', room.id)
                results.push(`✅ ${room.unit_number}: Occupied (2 guests, ₹${basePrice})`)
            }
        }

        // === Scenario 2: 1 room dirty ===
        if (rooms.length > 2) {
            await supabase.from('units').update({ status: 'DIRTY' }).eq('id', rooms[2].id)
            results.push(`🟡 ${rooms[2].unit_number}: Set to DIRTY`)
        }

        // === Scenario 3: 1 room in maintenance ===
        if (rooms.length > 3) {
            await supabase.from('units').update({ status: 'MAINTENANCE', maintenance_reason: 'AC repair' }).eq('id', rooms[3].id)
            results.push(`🟣 ${rooms[3].unit_number}: Set to MAINTENANCE (AC repair)`)
        }

        // === Scenario 4: 3 dorm beds occupied ===
        for (let i = 0; i < Math.min(3, dorms.length); i++) {
            const bed = dorms[i]
            const checkIn = new Date(now)
            const checkOut = new Date(now)
            checkOut.setDate(checkOut.getDate() + 1)
            checkOut.setHours(10, 0, 0, 0)
            const basePrice = Number(bed.base_price)

            const { data: booking } = await supabase
                .from('bookings')
                .insert({
                    unit_id: bed.id,
                    check_in: checkIn.toISOString(),
                    check_out: checkOut.toISOString(),
                    guest_count: 1,
                    base_amount: basePrice,
                    surcharge: 0,
                    grand_total: basePrice,
                    status: 'CHECKED_IN',
                })
                .select()
                .single()

            if (booking) {
                await supabase.from('guests').insert({
                    booking_id: booking.id,
                    name: `Dorm Guest ${i + 1}`,
                    phone: `99887${String(i).padStart(5, '0')}`,
                })
                await supabase.from('payments').insert({
                    booking_id: booking.id,
                    amount_cash: basePrice,
                    amount_digital: 0,
                    total_paid: basePrice,
                })
                await supabase.from('units').update({ status: 'OCCUPIED' }).eq('id', bed.id)
                results.push(`✅ ${bed.unit_number}: Occupied (Dorm, ₹${basePrice})`)
            }
        }

        // === Scenario 5: 1 reservation for tomorrow ===
        if (rooms.length > 4) {
            const room = rooms[4]
            const tomorrow = new Date(now)
            tomorrow.setDate(tomorrow.getDate() + 1)
            tomorrow.setHours(14, 0, 0, 0)
            const checkOut = new Date(tomorrow.getTime() + 24 * 60 * 60 * 1000)
            const basePrice = Number(room.base_price)

            const { data: booking } = await supabase
                .from('bookings')
                .insert({
                    unit_id: room.id,
                    check_in: tomorrow.toISOString(),
                    check_out: checkOut.toISOString(),
                    guest_count: 1,
                    base_amount: basePrice,
                    surcharge: 0,
                    grand_total: basePrice,
                    status: 'CONFIRMED',
                    advance_amount: 500,
                    advance_type: 'CASH',
                    expected_arrival: 'Around 3 PM',
                })
                .select()
                .single()

            if (booking) {
                await supabase.from('guests').insert({
                    booking_id: booking.id,
                    name: 'Pre-Booked Guest',
                    phone: '9111122233',
                })
                results.push(`📅 ${room.unit_number}: Reserved for tomorrow (₹${basePrice}, ₹500 advance)`)
            }
        }

        return NextResponse.json({
            success: true,
            message: `Seeded ${results.length} test scenarios`,
            scenarios: results,
        })
    } catch (err) {
        console.error('Seed error:', err)
        return NextResponse.json({ error: 'Failed to seed test data' }, { status: 500 })
    }
}
