import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDevNow, isDevTimeActive } from '@/lib/dev-time'

// GET /api/dev/health — System health overview
export async function GET() {
    const auth = await requireAuth()
    if (!auth.authenticated) return auth.response

    const supabase = await createClient()
    const now = getDevNow()

    // Run all queries in parallel for speed
    const [
        hotelsRes,
        unitsRes,
        bookingsActiveRes,
        bookingsTodayRes,
        guestsRes,
        paymentsRes,
        staffRes,
        attendanceRes,
        reservationsRes,
        issuesOpenRes,
        maintenanceOpenRes,
        expensesPendingRes,
        notificationsRes,
        laundryOutRes,
    ] = await Promise.all([
        // Hotels
        supabase.from('hotels').select('id, name, city, status'),
        // Units
        supabase.from('units').select('id, type, status, hotel_id'),
        // Active bookings (checked in)
        supabase.from('bookings').select('id, unit_id, status, check_in, grand_total').eq('status', 'CHECKED_IN'),
        // Bookings created today
        supabase.from('bookings').select('id, status, created_at').gte('created_at', new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()),
        // Total guests
        supabase.from('guests').select('id', { count: 'exact', head: true }),
        // Payments aggregate
        supabase.from('payments').select('id, amount_cash, amount_digital, total_paid'),
        // Staff
        supabase.from('staff').select('id, role, hotel_id, name'),
        // Currently clocked in
        supabase.from('attendance').select('id, staff_id, shift, status').eq('status', 'CLOCKED_IN'),
        // Pending reservations
        supabase.from('bookings').select('id, status').in('status', ['PENDING', 'CONFIRMED']),
        // Open customer issues
        supabase.from('customer_issues').select('id, status').in('status', ['OPEN', 'IN_PROGRESS']),
        // Open maintenance tickets
        supabase.from('maintenance_tickets').select('id, status').in('status', ['OPEN', 'IN_PROGRESS']),
        // Pending expenses
        supabase.from('property_expenses').select('id, status').eq('status', 'PENDING'),
        // Unread notifications (last 24h)
        supabase.from('notifications').select('id, read').eq('read', false),
        // Laundry out
        supabase.from('laundry_orders').select('id, status').eq('status', 'OUT'),
    ])

    // Unit breakdown
    const units = unitsRes.data || []
    const unitsByStatus: Record<string, number> = {}
    const unitsByType: Record<string, number> = {}
    for (const u of units) {
        unitsByStatus[u.status] = (unitsByStatus[u.status] || 0) + 1
        unitsByType[u.type] = (unitsByType[u.type] || 0) + 1
    }

    // Staff by role
    const staff = staffRes.data || []
    const staffByRole: Record<string, number> = {}
    for (const s of staff) {
        staffByRole[s.role] = (staffByRole[s.role] || 0) + 1
    }

    // Payment totals
    const payments = paymentsRes.data || []
    let totalCash = 0, totalDigital = 0, totalRevenue = 0
    for (const p of payments) {
        totalCash += p.amount_cash || 0
        totalDigital += p.amount_digital || 0
        totalRevenue += p.total_paid || 0
    }

    // Hotels data
    const hotels = hotelsRes.data || []
    const hotelMap = Object.fromEntries(hotels.map(h => [h.id, h]))

    // Per-hotel unit counts
    const unitsPerHotel: Record<string, { total: number; available: number; occupied: number; dirty: number; maintenance: number }> = {}
    for (const u of units) {
        if (!unitsPerHotel[u.hotel_id]) {
            unitsPerHotel[u.hotel_id] = { total: 0, available: 0, occupied: 0, dirty: 0, maintenance: 0 }
        }
        const h = unitsPerHotel[u.hotel_id]
        h.total++
        if (u.status === 'AVAILABLE') h.available++
        else if (u.status === 'OCCUPIED') h.occupied++
        else if (u.status === 'DIRTY') h.dirty++
        else if (u.status === 'MAINTENANCE') h.maintenance++
    }

    return NextResponse.json({
        timestamp: now.toISOString(),
        isSimulatedTime: isDevTimeActive(),

        // Hotels
        hotels: hotels.map(h => ({
            ...h,
            units: unitsPerHotel[h.id] || { total: 0, available: 0, occupied: 0, dirty: 0, maintenance: 0 },
        })),

        // Totals
        totals: {
            hotels: hotels.length,
            units: units.length,
            unitsByStatus,
            unitsByType,
            activeBookings: (bookingsActiveRes.data || []).length,
            bookingsToday: (bookingsTodayRes.data || []).length,
            totalGuests: guestsRes.count || 0,
            pendingReservations: (reservationsRes.data || []).length,
            staff: staff.length,
            staffByRole,
            clockedIn: (attendanceRes.data || []).length,
            openIssues: (issuesOpenRes.data || []).length,
            openMaintenance: (maintenanceOpenRes.data || []).length,
            pendingExpenses: (expensesPendingRes.data || []).length,
            unreadNotifications: (notificationsRes.data || []).length,
            laundryOut: (laundryOutRes.data || []).length,
        },

        // Revenue
        revenue: {
            totalCash,
            totalDigital,
            totalRevenue,
        },
    })
}
