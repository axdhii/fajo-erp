'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DevTabProps } from '@/app/(dashboard)/developer/client'
import {
    Activity,
    Building2,
    BedDouble,
    Users,
    DollarSign,
    AlertTriangle,
    CheckCircle2,
    Clock,
    RefreshCw,
    Loader2,
    Wrench,
    Bell,
    ShoppingCart,
    Shirt,
} from 'lucide-react'
import { Button } from '@/components/ui/button'

// ============================================================
// Types
// ============================================================
interface HotelHealth {
    id: string
    name: string
    city: string
    status: string
    units: {
        total: number
        available: number
        occupied: number
        dirty: number
        maintenance: number
    }
}

interface HealthData {
    timestamp: string
    isSimulatedTime: boolean
    hotels: HotelHealth[]
    totals: {
        hotels: number
        units: number
        unitsByStatus: Record<string, number>
        unitsByType: Record<string, number>
        activeBookings: number
        bookingsToday: number
        totalGuests: number
        pendingReservations: number
        staff: number
        staffByRole: Record<string, number>
        clockedIn: number
        openIssues: number
        openMaintenance: number
        pendingExpenses: number
        unreadNotifications: number
        laundryOut: number
    }
    revenue: {
        totalCash: number
        totalDigital: number
        totalRevenue: number
    }
}

// ============================================================
// Helpers
// ============================================================

function StatCard({ label, value, icon, color = 'slate', sub }: {
    label: string
    value: number | string
    icon: React.ReactNode
    color?: 'slate' | 'emerald' | 'amber' | 'red' | 'blue' | 'violet'
    sub?: string
}) {
    const bg: Record<string, string> = {
        slate: 'bg-slate-100 text-slate-600',
        emerald: 'bg-emerald-100 text-emerald-600',
        amber: 'bg-amber-100 text-amber-600',
        red: 'bg-red-100 text-red-600',
        blue: 'bg-blue-100 text-blue-600',
        violet: 'bg-violet-100 text-violet-600',
    }

    return (
        <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start gap-3 shadow-sm">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${bg[color]}`}>
                {icon}
            </div>
            <div className="min-w-0">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">{label}</p>
                <p className="text-xl font-bold text-slate-900 mt-0.5">{value}</p>
                {sub && <p className="text-xs text-slate-400 mt-0.5">{sub}</p>}
            </div>
        </div>
    )
}

function StatusDot({ status }: { status: string }) {
    const colors: Record<string, string> = {
        ACTIVE: 'bg-emerald-400',
        INACTIVE: 'bg-slate-300',
        MAINTENANCE: 'bg-amber-400',
    }
    return (
        <span className={`inline-block h-2 w-2 rounded-full ${colors[status.toUpperCase()] || 'bg-slate-300'}`} />
    )
}

function formatINR(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

// ============================================================
// Component
// ============================================================

export function SystemHealth({ hotelId, hotels: _hotels, staffId }: DevTabProps) {
    const [data, setData] = useState<HealthData | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const fetchHealth = useCallback(async () => {
        setLoading(true)
        setError(null)
        try {
            const res = await fetch('/api/dev/health')
            if (!res.ok) throw new Error(`HTTP ${res.status}`)
            const json = await res.json()
            setData(json)
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Failed to load')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchHealth()
    }, [fetchHealth])

    // Listen for dev-data-changed events from DevToolbar
    useEffect(() => {
        const handler = () => fetchHealth()
        window.addEventListener('dev-data-changed', handler)
        return () => window.removeEventListener('dev-data-changed', handler)
    }, [fetchHealth])

    if (loading && !data) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
        )
    }

    if (error && !data) {
        return (
            <div className="text-center py-24">
                <AlertTriangle className="h-8 w-8 mx-auto mb-3 text-amber-400" />
                <p className="text-sm text-slate-600 mb-4">{error}</p>
                <Button variant="outline" onClick={fetchHealth}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Retry
                </Button>
            </div>
        )
    }

    if (!data) return null

    const t = data.totals

    // Filter hotels if hotelId selected
    const filteredHotels = hotelId
        ? data.hotels.filter(h => h.id === hotelId)
        : data.hotels

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header row */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {data.isSimulatedTime && (
                        <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700 text-xs font-bold">
                            SIMULATED TIME
                        </span>
                    )}
                    <span className="text-xs text-slate-400">
                        Last fetched: {new Date(data.timestamp).toLocaleTimeString('en-IN')}
                    </span>
                </div>
                <Button variant="outline" size="sm" onClick={fetchHealth} disabled={loading}>
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* ── KPI Grid ────────────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <StatCard
                    label="Hotels"
                    value={t.hotels}
                    icon={<Building2 className="h-5 w-5" />}
                    color="emerald"
                />
                <StatCard
                    label="Total Units"
                    value={t.units}
                    icon={<BedDouble className="h-5 w-5" />}
                    color="blue"
                    sub={`${t.unitsByType['ROOM'] || 0} rooms, ${t.unitsByType['DORM'] || 0} dorms`}
                />
                <StatCard
                    label="Active Bookings"
                    value={t.activeBookings}
                    icon={<CheckCircle2 className="h-5 w-5" />}
                    color="emerald"
                    sub={`${t.bookingsToday} today`}
                />
                <StatCard
                    label="Pending Reservations"
                    value={t.pendingReservations}
                    icon={<Clock className="h-5 w-5" />}
                    color="amber"
                />
                <StatCard
                    label="Total Guests"
                    value={t.totalGuests}
                    icon={<Users className="h-5 w-5" />}
                    color="violet"
                />
                <StatCard
                    label="Staff"
                    value={t.staff}
                    icon={<Users className="h-5 w-5" />}
                    color="blue"
                    sub={`${t.clockedIn} clocked in`}
                />
                <StatCard
                    label="Open Issues"
                    value={t.openIssues}
                    icon={<AlertTriangle className="h-5 w-5" />}
                    color={t.openIssues > 0 ? 'red' : 'emerald'}
                />
                <StatCard
                    label="Open Maintenance"
                    value={t.openMaintenance}
                    icon={<Wrench className="h-5 w-5" />}
                    color={t.openMaintenance > 0 ? 'amber' : 'emerald'}
                />
                <StatCard
                    label="Pending Expenses"
                    value={t.pendingExpenses}
                    icon={<ShoppingCart className="h-5 w-5" />}
                    color={t.pendingExpenses > 0 ? 'amber' : 'slate'}
                />
                <StatCard
                    label="Unread Alerts"
                    value={t.unreadNotifications}
                    icon={<Bell className="h-5 w-5" />}
                    color={t.unreadNotifications > 0 ? 'red' : 'slate'}
                />
                <StatCard
                    label="Laundry Out"
                    value={t.laundryOut}
                    icon={<Shirt className="h-5 w-5" />}
                    color={t.laundryOut > 0 ? 'blue' : 'slate'}
                />
                <StatCard
                    label="Total Revenue"
                    value={formatINR(data.revenue.totalRevenue)}
                    icon={<DollarSign className="h-5 w-5" />}
                    color="emerald"
                    sub={`Cash ${formatINR(data.revenue.totalCash)} | Digital ${formatINR(data.revenue.totalDigital)}`}
                />
            </div>

            {/* ── Unit Status Breakdown ──────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                    Unit Status Breakdown
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {(['AVAILABLE', 'OCCUPIED', 'DIRTY', 'IN_PROGRESS', 'MAINTENANCE'] as const).map(status => {
                        const count = t.unitsByStatus[status] || 0
                        const colors: Record<string, string> = {
                            AVAILABLE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                            OCCUPIED: 'bg-blue-50 text-blue-700 border-blue-200',
                            DIRTY: 'bg-amber-50 text-amber-700 border-amber-200',
                            IN_PROGRESS: 'bg-violet-50 text-violet-700 border-violet-200',
                            MAINTENANCE: 'bg-red-50 text-red-700 border-red-200',
                        }
                        return (
                            <div key={status} className={`rounded-lg border px-3 py-2.5 text-center ${colors[status]}`}>
                                <p className="text-2xl font-bold">{count}</p>
                                <p className="text-xs font-medium mt-0.5">{status.replace('_', ' ')}</p>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* ── Staff Roles ────────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                    Staff by Role
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {Object.entries(t.staffByRole).sort((a, b) => b[1] - a[1]).map(([role, count]) => (
                        <div key={role} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                            <span className="text-sm font-medium text-slate-600">{role}</span>
                            <span className="text-sm font-bold text-slate-900">{count}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── Per-Hotel Status ────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm">
                <h3 className="text-sm font-bold text-slate-700 mb-3 uppercase tracking-wide">
                    Hotels
                </h3>
                <div className="space-y-3">
                    {filteredHotels.map(hotel => {
                        const u = hotel.units
                        const occupancy = u.total > 0
                            ? Math.round((u.occupied / u.total) * 100)
                            : 0
                        return (
                            <div
                                key={hotel.id}
                                className="rounded-xl border border-slate-200 p-4"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <StatusDot status={hotel.status} />
                                        <span className="font-semibold text-slate-900">{hotel.name}</span>
                                        <span className="text-xs text-slate-400">{hotel.city}</span>
                                    </div>
                                    <span className="text-xs font-medium text-slate-500">
                                        {occupancy}% occupancy
                                    </span>
                                </div>

                                {/* Occupancy bar */}
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mb-3">
                                    <div
                                        className="h-full rounded-full bg-emerald-500 transition-all"
                                        style={{ width: `${occupancy}%` }}
                                    />
                                </div>

                                <div className="grid grid-cols-5 gap-2 text-center text-xs">
                                    <div>
                                        <p className="font-bold text-slate-900">{u.total}</p>
                                        <p className="text-slate-400">Total</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-emerald-600">{u.available}</p>
                                        <p className="text-slate-400">Free</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-blue-600">{u.occupied}</p>
                                        <p className="text-slate-400">Occupied</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-amber-600">{u.dirty}</p>
                                        <p className="text-slate-400">Dirty</p>
                                    </div>
                                    <div>
                                        <p className="font-bold text-red-600">{u.maintenance}</p>
                                        <p className="text-slate-400">Maint.</p>
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    )
}
