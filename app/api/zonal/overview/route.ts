import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { getDevNow } from '@/lib/dev-time'
import { getCurrentShiftWindow } from '@/lib/shift-window'

// GET /api/zonal/overview — consolidated multi-hotel overview for Zonal Manager
export async function GET() {
    try {
        const auth = await requireAuth()
        if (!auth.authenticated) return auth.response

        const supabase = await createClient()

        // Role authorization: Admin, Developer, ZonalOps, ZonalHK
        const { data: callerProfile } = await supabase
            .from('staff').select('role').eq('user_id', auth.userId).single()
        if (!callerProfile || !['Admin', 'Developer', 'ZonalOps', 'ZonalHK'].includes(callerProfile.role)) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        }

        // IST date calculations
        const now = getDevNow()
        const todayIST = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const todayMidnightIST = `${todayIST}T00:00:00+05:30`
        // Current 12-hour shift window — used for revenue KPIs so night-shift staff
        // don't see their totals reset at midnight.
        const shift = getCurrentShiftWindow(now)
        const sevenDaysAgoDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const sevenDaysAgoIST = sevenDaysAgoDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

        // 1. Fetch all hotels
        const { data: hotels, error: hotelsErr } = await supabase
            .from('hotels')
            .select('id, name, city, status')
            .order('name')

        if (hotelsErr || !hotels) {
            console.error('Zonal hotels fetch error:', hotelsErr)
            return NextResponse.json({ error: 'Failed to fetch hotels' }, { status: 500 })
        }

        // 2. Pre-fetch all units grouped by hotel (single query for all hotels)
        const { data: allUnits } = await supabase
            .from('units')
            .select('id, hotel_id, unit_number, type, status')

        const unitsByHotel = new Map<string, typeof allUnits>()
        const unitIdsByHotel = new Map<string, string[]>()
        const unitNumberLookup = new Map<string, string>()

        for (const unit of allUnits || []) {
            // Group by hotel
            if (!unitsByHotel.has(unit.hotel_id)) unitsByHotel.set(unit.hotel_id, [])
            unitsByHotel.get(unit.hotel_id)!.push(unit)

            // Unit IDs by hotel
            if (!unitIdsByHotel.has(unit.hotel_id)) unitIdsByHotel.set(unit.hotel_id, [])
            unitIdsByHotel.get(unit.hotel_id)!.push(unit.id)

            // Unit number lookup
            unitNumberLookup.set(unit.id, unit.unit_number)
        }

        // 3. For each hotel, fetch remaining stats in parallel
        const hotelOverviews = await Promise.all(
            hotels.map(async (hotel) => {
                const hotelId = hotel.id
                const units = unitsByHotel.get(hotelId) || []
                const unitIds = unitIdsByHotel.get(hotelId) || []

                // If hotel has no units, skip expensive queries
                if (unitIds.length === 0) {
                    const [attendanceResult, totalStaffResult, incidentsResult] = await Promise.all([
                        supabase.from('attendance').select('id').eq('hotel_id', hotelId)
                            .eq('status', 'CLOCKED_IN').gte('clock_in', todayMidnightIST),
                        supabase.from('staff').select('id').eq('hotel_id', hotelId).neq('role', 'Admin'),
                        supabase.from('staff_incidents').select('id').eq('hotel_id', hotelId)
                            .gte('incident_date', sevenDaysAgoIST),
                    ])

                    return {
                        hotelId: hotel.id, hotelName: hotel.name, city: hotel.city,
                        status: hotel.status || 'ACTIVE',
                        totalRooms: 0, totalDorms: 0,
                        occupiedRooms: 0, occupiedDorms: 0,
                        availableRooms: 0, availableDorms: 0,
                        dirtyUnits: 0, maintenanceUnits: 0,
                        todayRevenue: 0, cashRevenue: 0, digitalRevenue: 0,
                        staffOnDuty: attendanceResult.data?.length || 0,
                        totalStaff: totalStaffResult.data?.length || 0,
                        recentIncidents: incidentsResult.data?.length || 0,
                        overdueCheckouts: [],
                    }
                }

                // Run all queries for this hotel in parallel
                const [
                    todayBookingsResult,
                    attendanceResult,
                    totalStaffResult,
                    incidentsResult,
                    overdueResult,
                ] = await Promise.all([
                    // Today's bookings (CHECKED_IN or CHECKED_OUT with check_in >= today IST midnight)
                    supabase
                        .from('bookings')
                        .select('id, grand_total, unit_id')
                        .in('status', ['CHECKED_IN', 'CHECKED_OUT'])
                        .gte('check_in', todayMidnightIST)
                        .in('unit_id', unitIds),

                    // Staff on duty: currently clocked in
                    supabase
                        .from('attendance')
                        .select('id')
                        .eq('hotel_id', hotelId)
                        .eq('status', 'CLOCKED_IN')
                        .gte('clock_in', todayMidnightIST),

                    // Total staff (excluding Admin)
                    supabase
                        .from('staff')
                        .select('id')
                        .eq('hotel_id', hotelId)
                        .neq('role', 'Admin'),

                    // Recent incidents in last 7 days
                    supabase
                        .from('staff_incidents')
                        .select('id')
                        .eq('hotel_id', hotelId)
                        .gte('incident_date', sevenDaysAgoIST),

                    // Overdue checkouts: CHECKED_IN bookings where check_out < now
                    supabase
                        .from('bookings')
                        .select('id, check_out, unit_id, guests(name)')
                        .eq('status', 'CHECKED_IN')
                        .not('check_out', 'is', null)
                        .lt('check_out', now.toISOString())
                        .in('unit_id', unitIds),
                ])

                const todayBookings = todayBookingsResult.data || []
                const overdueBookings = overdueResult.data || []

                // Count units by type and status
                const totalRooms = units.filter(u => u.type === 'ROOM').length
                const totalDorms = units.filter(u => u.type === 'DORM').length
                const occupiedRooms = units.filter(u => u.type === 'ROOM' && u.status === 'OCCUPIED').length
                const occupiedDorms = units.filter(u => u.type === 'DORM' && u.status === 'OCCUPIED').length
                const availableRooms = units.filter(u => u.type === 'ROOM' && u.status === 'AVAILABLE').length
                const availableDorms = units.filter(u => u.type === 'DORM' && u.status === 'AVAILABLE').length
                const dirtyUnits = units.filter(u => u.status === 'DIRTY').length
                const maintenanceUnits = units.filter(u => u.status === 'MAINTENANCE').length

                // Current shift revenue from payments (collected during DAY 7am-7pm or NIGHT 7pm-7am IST).
                // Uses payment.created_at so the total reflects collections during the active shift,
                // independent of when the booking was made.
                let cashRevenue = 0
                let digitalRevenue = 0
                if (unitIds.length > 0) {
                    const { data: payments } = await supabase
                        .from('payments')
                        .select('amount_cash, amount_digital, booking:bookings!inner(unit_id)')
                        .gte('created_at', shift.start)
                        .lte('created_at', shift.end)
                        .in('booking.unit_id', unitIds)
                    if (payments) {
                        cashRevenue = payments.reduce((sum, p) => sum + Number(p.amount_cash || 0), 0)
                        digitalRevenue = payments.reduce((sum, p) => sum + Number(p.amount_digital || 0), 0)
                    }
                }
                const todayRevenue = cashRevenue + digitalRevenue

                // Count IN_PROGRESS units as part of dirty (being cleaned)
                const inProgressUnits = units.filter(u => u.status === 'IN_PROGRESS').length

                // Build overdue checkout details
                const overdueCheckouts = overdueBookings.map(b => {
                    const checkOutTime = new Date(b.check_out!).getTime()
                    const minutesOverdue = Math.floor((now.getTime() - checkOutTime) / 60000)
                    const guests = b.guests as { name: string }[] | undefined
                    const guestName = guests?.[0]?.name || 'Unknown'

                    return {
                        unitNumber: unitNumberLookup.get(b.unit_id) || 'Unknown',
                        guestName,
                        minutesOverdue,
                    }
                })

                return {
                    hotelId: hotel.id,
                    hotelName: hotel.name,
                    city: hotel.city,
                    status: hotel.status || 'ACTIVE',
                    totalRooms,
                    totalDorms,
                    occupiedRooms,
                    occupiedDorms,
                    availableRooms,
                    availableDorms,
                    dirtyUnits: dirtyUnits + inProgressUnits,
                    maintenanceUnits,
                    todayRevenue,
                    cashRevenue,
                    digitalRevenue,
                    staffOnDuty: attendanceResult.data?.length || 0,
                    totalStaff: totalStaffResult.data?.length || 0,
                    recentIncidents: incidentsResult.data?.length || 0,
                    overdueCheckouts,
                }
            })
        )

        return NextResponse.json({ data: hotelOverviews })
    } catch (err) {
        console.error('Zonal overview GET error:', err)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
