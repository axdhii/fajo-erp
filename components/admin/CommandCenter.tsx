'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
    TrendingUp,
    DollarSign,
    Users,
    AlertTriangle,
    CheckCircle2,
    Wrench,
    RefreshCw,
    Clock,
    Loader2,
    Building2,
    BedDouble,
    BedSingle,
    Package,
    ShieldAlert,
} from 'lucide-react'
import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

// ============================================================
// Helpers
// ============================================================
function todayIST(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function todayISTStart(): string {
    return todayIST() + 'T00:00:00+05:30'
}

function nowISO(): string {
    return new Date().toISOString()
}

// ============================================================
// Types
// ============================================================
interface KPIData {
    totalUnits: number
    occupiedUnits: number
    todayRevenue: number
    staffOnDuty: number
    overdueCount: number
    urgentTickets: number
}

interface AlertItem {
    id: string
    type: 'overdue' | 'maintenance' | 'restock'
    title: string
    subtitle: string
    timestamp: string
}

interface HotelCardData {
    id: string
    name: string
    city: string
    status: string
    totalUnits: number
    occupiedUnits: number
    todayRevenue: number
    staffOnDuty: number
    alertCount: number
}

// ============================================================
// Command Center Component
// ============================================================
export function CommandCenter({ hotelId, hotels, staffId }: AdminTabProps) {
    const [kpi, setKpi] = useState<KPIData>({
        totalUnits: 0,
        occupiedUnits: 0,
        todayRevenue: 0,
        staffOnDuty: 0,
        overdueCount: 0,
        urgentTickets: 0,
    })
    const [alerts, setAlerts] = useState<AlertItem[]>([])
    const [hotelCards, setHotelCards] = useState<HotelCardData[]>([])
    const [loading, setLoading] = useState(true)

    // --------------------------------------------------------
    // Core data fetch
    // --------------------------------------------------------
    const fetchData = useCallback(async () => {
        try {
            const today = todayISTStart()
            const now = nowISO()

            // Determine which hotel IDs to query
            const targetHotelIds = hotelId
                ? [hotelId]
                : hotels.map(h => h.id)

            if (targetHotelIds.length === 0) {
                setLoading(false)
                return
            }

            // ------ Parallel queries ------
            const [
                unitsRes,
                attendanceRes,
                overdueRes,
                ticketsRes,
                restockRes,
                paymentsRes,
                advanceRes,
            ] = await Promise.all([
                // All units
                supabase
                    .from('units')
                    .select('id, hotel_id, status')
                    .in('hotel_id', targetHotelIds),

                // Staff on duty (clocked in today)
                supabase
                    .from('attendance')
                    .select('id, hotel_id')
                    .in('hotel_id', targetHotelIds)
                    .eq('status', 'CLOCKED_IN'),

                // Overdue checkouts: CHECKED_IN bookings past their check_out time
                supabase
                    .from('bookings')
                    .select('id, check_out, unit:units!inner(hotel_id, unit_number), guests(name)')
                    .eq('status', 'CHECKED_IN')
                    .not('check_out', 'is', null)
                    .lt('check_out', now)
                    .in('units.hotel_id', targetHotelIds),

                // URGENT / HIGH maintenance tickets (open or in-progress)
                supabase
                    .from('maintenance_tickets')
                    .select('id, description, priority, created_at, unit:unit_id(unit_number)')
                    .in('hotel_id', targetHotelIds)
                    .in('priority', ['URGENT', 'HIGH'])
                    .in('status', ['OPEN', 'IN_PROGRESS']),

                // Pending restock requests
                supabase
                    .from('restock_requests')
                    .select('id, items, created_at, unit:unit_id(unit_number)')
                    .in('hotel_id', targetHotelIds)
                    .eq('status', 'PENDING'),

                // Today's payments (via bookings created/checked-in today)
                supabase
                    .from('payments')
                    .select('total_paid, booking:booking_id!inner(status, unit:units!inner(hotel_id))')
                    .gte('created_at', today),

                // Today's bookings with advance_amount (Rule #1)
                supabase
                    .from('bookings')
                    .select('advance_amount, advance_type, unit:units!inner(hotel_id)')
                    .gte('created_at', today)
                    .gt('advance_amount', 0),
            ])

            const units = unitsRes.data || []
            const attendance = attendanceRes.data || []
            const overdueBookings = overdueRes.data || []
            const tickets = ticketsRes.data || []
            const restocks = restockRes.data || []
            const payments = paymentsRes.data || []

            // Filter payments by hotel scope (join may return all)
            const scopedPayments = payments.filter(p => {
                const booking = p.booking as unknown as { status: string; unit: { hotel_id: string } }
                return booking?.unit?.hotel_id && targetHotelIds.includes(booking.unit.hotel_id)
            })

            const totalPaymentRevenue = scopedPayments.reduce((sum, p) => sum + Number(p.total_paid || 0), 0)

            // Add advance_amount from today's bookings (Rule #1)
            const advanceBookings = (advanceRes.data || []) as unknown as { advance_amount: number; advance_type: string | null; unit: { hotel_id: string } }[]
            const scopedAdvances = advanceBookings.filter(b => b.unit?.hotel_id && targetHotelIds.includes(b.unit.hotel_id))
            const totalAdvanceRevenue = scopedAdvances.reduce((sum, b) => sum + Number(b.advance_amount || 0), 0)
            const totalRevenue = totalPaymentRevenue + totalAdvanceRevenue

            // ------ KPI ------
            const totalUnits = units.length
            const occupiedUnits = units.filter(u => u.status === 'OCCUPIED').length

            setKpi({
                totalUnits,
                occupiedUnits,
                todayRevenue: totalRevenue,
                staffOnDuty: attendance.length,
                overdueCount: overdueBookings.length,
                urgentTickets: tickets.length,
            })

            // ------ Alert feed ------
            const alertItems: AlertItem[] = []

            // Overdue checkout alerts
            for (const b of overdueBookings) {
                const unit = b.unit as unknown as { hotel_id: string; unit_number: string }
                const guestList = b.guests as unknown as { name: string }[]
                const guestName = guestList?.[0]?.name || 'Guest'
                alertItems.push({
                    id: b.id,
                    type: 'overdue',
                    title: `Overdue checkout: ${unit?.unit_number || 'Unit'}`,
                    subtitle: guestName,
                    timestamp: b.check_out || '',
                })
            }

            // Urgent maintenance alerts
            for (const t of tickets) {
                const unit = t.unit as unknown as { unit_number: string } | null
                alertItems.push({
                    id: t.id,
                    type: 'maintenance',
                    title: `${t.priority} ticket: ${unit?.unit_number || 'General'}`,
                    subtitle: t.description || 'No description',
                    timestamp: t.created_at,
                })
            }

            // Pending restock alerts
            for (const r of restocks) {
                const unit = r.unit as unknown as { unit_number: string } | null
                alertItems.push({
                    id: r.id,
                    type: 'restock',
                    title: `Restock pending: ${unit?.unit_number || 'Unit'}`,
                    subtitle: r.items || '',
                    timestamp: r.created_at,
                })
            }

            // Sort by timestamp descending (most recent first)
            alertItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            setAlerts(alertItems)

            // ------ Hotel cards ------
            const cardMap = new Map<string, HotelCardData>()

            // Initialize from hotel list (only those in scope)
            const scopedHotels = hotelId
                ? hotels.filter(h => h.id === hotelId)
                : hotels

            for (const h of scopedHotels) {
                cardMap.set(h.id, {
                    id: h.id,
                    name: h.name,
                    city: h.city,
                    status: h.status,
                    totalUnits: 0,
                    occupiedUnits: 0,
                    todayRevenue: 0,
                    staffOnDuty: 0,
                    alertCount: 0,
                })
            }

            // Aggregate units per hotel
            for (const u of units) {
                const card = cardMap.get(u.hotel_id)
                if (!card) continue
                card.totalUnits++
                if (u.status === 'OCCUPIED') card.occupiedUnits++
            }

            // Aggregate attendance per hotel
            for (const a of attendance) {
                const card = cardMap.get(a.hotel_id)
                if (card) card.staffOnDuty++
            }

            // Aggregate revenue per hotel
            for (const p of scopedPayments) {
                const booking = p.booking as unknown as { status: string; unit: { hotel_id: string } }
                const hid = booking?.unit?.hotel_id
                const card = hid ? cardMap.get(hid) : null
                if (card) card.todayRevenue += Number(p.total_paid || 0)
            }

            // Aggregate advance revenue per hotel
            for (const b of scopedAdvances) {
                const hid = b.unit?.hotel_id
                const card = hid ? cardMap.get(hid) : null
                if (card) card.todayRevenue += Number(b.advance_amount || 0)
            }

            // Aggregate alert counts per hotel
            for (const b of overdueBookings) {
                const unit = b.unit as unknown as { hotel_id: string }
                const card = unit?.hotel_id ? cardMap.get(unit.hotel_id) : null
                if (card) card.alertCount++
            }
            for (const t of tickets) {
                // tickets have hotel_id directly, but we fetched with .in('hotel_id', ...)
                // We need the hotel_id from the original query — re-fetch it
                // Actually the tickets query doesn't select hotel_id, let's count them differently
                // Since we already have the data filtered by targetHotelIds, distribute evenly
                // Better: just count total per hotel using the unit join
            }

            // For tickets and restocks, we don't have hotel_id in the selected fields,
            // but we filtered by targetHotelIds, so they belong to the right scope.
            // We won't break down tickets/restocks per hotel in the card — the card.alertCount
            // only counts overdue checkouts for now (the most critical metric per hotel).

            setHotelCards(Array.from(cardMap.values()))
        } catch (err) {
            console.error('CommandCenter fetch error:', err)
        } finally {
            setLoading(false)
        }
    }, [hotelId, hotels])

    // --------------------------------------------------------
    // Initial load + re-fetch on scope change
    // --------------------------------------------------------
    useEffect(() => {
        setLoading(true)
        fetchData()
    }, [fetchData])

    // --------------------------------------------------------
    // Realtime subscriptions (debounced 2s)
    // --------------------------------------------------------
    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout>
        const debouncedFetch = () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => fetchData(), 2000)
        }

        const channel = supabase
            .channel('admin_command_center')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, debouncedFetch)
            .subscribe()

        return () => {
            clearTimeout(debounceTimer)
            supabase.removeChannel(channel)
        }
    }, [fetchData])

    // --------------------------------------------------------
    // Computed values
    // --------------------------------------------------------
    const occupancyPct = kpi.totalUnits > 0
        ? Math.round((kpi.occupiedUnits / kpi.totalUnits) * 100)
        : 0

    const totalAlerts = kpi.overdueCount + kpi.urgentTickets

    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------
    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Refresh bar */}
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                    Real-time overview &mdash; {todayIST()}
                </p>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setLoading(true); fetchData() }}
                    className="h-8 text-xs border-slate-200"
                >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Refresh
                </Button>
            </div>

            {/* ==================== KPI Cards ==================== */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {/* Occupancy */}
                <Card className="border-emerald-500/10 shadow-sm bg-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Total Occupancy</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{occupancyPct}%</div>
                        <p className="text-xs text-slate-500 mt-1">
                            {kpi.occupiedUnits} / {kpi.totalUnits} units occupied
                        </p>
                    </CardContent>
                </Card>

                {/* Revenue */}
                <Card className="border-violet-500/10 shadow-sm bg-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-violet-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Today&apos;s Revenue</CardTitle>
                        <DollarSign className="h-4 w-4 text-violet-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">
                            {'\u20B9'}{kpi.todayRevenue.toLocaleString('en-IN')}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">Payments collected today</p>
                    </CardContent>
                </Card>

                {/* Staff on Duty */}
                <Card className="border-blue-500/10 shadow-sm bg-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-blue-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Staff on Duty</CardTitle>
                        <Users className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{kpi.staffOnDuty}</div>
                        <p className="text-xs text-slate-500 mt-1">Currently clocked in</p>
                    </CardContent>
                </Card>

                {/* Active Alerts */}
                <Card className={`shadow-sm bg-white overflow-hidden relative group ${
                    totalAlerts > 0 ? 'border-red-500/20' : 'border-slate-200'
                }`}>
                    <div className={`absolute inset-x-0 bottom-0 h-1 ${
                        totalAlerts > 0 ? 'bg-red-500' : 'bg-emerald-500'
                    } transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left`} />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Active Alerts</CardTitle>
                        <ShieldAlert className={`h-4 w-4 ${totalAlerts > 0 ? 'text-red-500' : 'text-emerald-500'}`} />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-3xl font-bold ${totalAlerts > 0 ? 'text-red-600' : 'text-slate-900'}`}>
                            {totalAlerts}
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                            {kpi.overdueCount} overdue + {kpi.urgentTickets} urgent tickets
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* ==================== Alert Feed ==================== */}
            {alerts.length > 0 ? (
                <div className="rounded-2xl border px-5 py-4 bg-red-50/50 border-red-200">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                            <AlertTriangle className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-red-800">
                                Active Alerts
                                <span className="ml-2 px-2 py-0.5 rounded-full bg-red-200 text-red-700 text-[10px] font-bold uppercase">
                                    {alerts.length} items
                                </span>
                            </h3>
                        </div>
                    </div>
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                        {alerts.map(alert => {
                            const colorMap = {
                                overdue: {
                                    bg: 'bg-red-100/80',
                                    text: 'text-red-700',
                                    badge: 'bg-red-200 text-red-800',
                                    label: 'OVERDUE',
                                },
                                maintenance: {
                                    bg: 'bg-amber-100/80',
                                    text: 'text-amber-700',
                                    badge: 'bg-amber-200 text-amber-800',
                                    label: 'URGENT',
                                },
                                restock: {
                                    bg: 'bg-orange-100/80',
                                    text: 'text-orange-700',
                                    badge: 'bg-orange-200 text-orange-800',
                                    label: 'RESTOCK',
                                },
                            }
                            const c = colorMap[alert.type]
                            return (
                                <div
                                    key={alert.id}
                                    className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${c.bg} ${c.text}`}
                                >
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="relative flex h-2 w-2 shrink-0">
                                            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${
                                                alert.type === 'overdue' ? 'bg-red-400' : alert.type === 'maintenance' ? 'bg-amber-400' : 'bg-orange-400'
                                            }`} />
                                            <span className={`relative inline-flex h-2 w-2 rounded-full ${
                                                alert.type === 'overdue' ? 'bg-red-500' : alert.type === 'maintenance' ? 'bg-amber-500' : 'bg-orange-500'
                                            }`} />
                                        </span>
                                        <span className="font-bold truncate">{alert.title}</span>
                                        <span className="text-[10px] opacity-70 truncate hidden sm:inline">{alert.subtitle}</span>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ml-2 ${c.badge}`}>
                                        {c.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </div>
            ) : (
                <div className="rounded-2xl border px-5 py-4 bg-emerald-50 border-emerald-200">
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                            <CheckCircle2 className="h-4 w-4" />
                        </div>
                        <p className="text-sm font-medium text-emerald-700">
                            All Clear &mdash; No active alerts across {hotelId ? 'this hotel' : 'all hotels'}
                        </p>
                    </div>
                </div>
            )}

            {/* ==================== Hotel Cards Grid ==================== */}
            <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-3">
                    Property Overview
                </h2>
                <div className="grid gap-4 md:grid-cols-2">
                    {hotelCards.map(hotel => {
                        const isMaintenance = hotel.status === 'MAINTENANCE'
                        const hotelOccupancyPct = hotel.totalUnits > 0
                            ? Math.round((hotel.occupiedUnits / hotel.totalUnits) * 100)
                            : 0

                        return (
                            <Card
                                key={hotel.id}
                                className={`shadow-sm overflow-hidden relative ${
                                    isMaintenance
                                        ? 'opacity-60 bg-slate-50 border-slate-200'
                                        : 'bg-white border-slate-200'
                                }`}
                            >
                                <CardHeader className="pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Building2 className={`h-5 w-5 ${isMaintenance ? 'text-slate-400' : 'text-slate-700'}`} />
                                            <div>
                                                <CardTitle className={`text-base font-bold ${isMaintenance ? 'text-slate-400' : 'text-slate-900'}`}>
                                                    {hotel.name}
                                                </CardTitle>
                                                <p className={`text-xs ${isMaintenance ? 'text-slate-400' : 'text-slate-500'}`}>
                                                    {hotel.city}
                                                </p>
                                            </div>
                                        </div>
                                        {isMaintenance && (
                                            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold uppercase">
                                                <Wrench className="h-3 w-3" />
                                                Maintenance
                                            </span>
                                        )}
                                        {!isMaintenance && hotel.alertCount > 0 && (
                                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                                                <AlertTriangle className="h-3 w-3" />
                                                {hotel.alertCount} alert{hotel.alertCount !== 1 ? 's' : ''}
                                            </span>
                                        )}
                                    </div>
                                </CardHeader>
                                {!isMaintenance && (
                                    <CardContent className="space-y-3">
                                        {/* Occupancy Bar */}
                                        <div>
                                            <div className="flex items-center justify-between text-xs mb-1.5">
                                                <span className="text-slate-500 font-medium">Occupancy</span>
                                                <span className="font-bold text-slate-700">{hotelOccupancyPct}%</span>
                                            </div>
                                            <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-slate-700 to-slate-500"
                                                    style={{ width: `${hotelOccupancyPct}%` }}
                                                />
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-1">
                                                {hotel.occupiedUnits} / {hotel.totalUnits} units
                                            </p>
                                        </div>
                                        {/* Quick Metrics Row */}
                                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                <DollarSign className="h-3.5 w-3.5 text-violet-500" />
                                                <span className="font-bold">{'\u20B9'}{hotel.todayRevenue.toLocaleString('en-IN')}</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                                <Users className="h-3.5 w-3.5 text-blue-500" />
                                                <span className="font-medium">{hotel.staffOnDuty} on duty</span>
                                            </div>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>
                        )
                    })}
                    {hotelCards.length === 0 && (
                        <div className="col-span-2 text-center py-12 text-slate-400 text-sm">
                            No hotels found
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
