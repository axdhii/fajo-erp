'use client'

import { useState, useMemo } from 'react'
import { UnitGrid } from '@/components/units/UnitGrid'
import { useUnitStore } from '@/lib/store/unit-store'
import { useCurrentTime, getCheckoutAlert } from '@/lib/hooks/use-current-time'
import type { UnitType, UnitStatus } from '@/lib/types'
import {
    BedDouble,
    BedSingle,
    LayoutGrid,
    CheckCircle2,
    Users,
    AlertTriangle,
    Loader2,
    Wrench,
    Clock,
    Bell,
} from 'lucide-react'

interface FrontDeskClientProps {
    hotelId: string
}

type TypeFilter = UnitType | 'ALL'
type StatusFilter = UnitStatus | 'ALL'

export function FrontDeskClient({ hotelId }: FrontDeskClientProps) {
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
    const { units } = useUnitStore()
    const now = useCurrentTime(15000) // Poll every 15 seconds for time-sensitive alerts

    // Stats
    const stats = useMemo(() => {
        const filtered = typeFilter === 'ALL' ? units : units.filter(u => u.type === typeFilter)
        return {
            total: filtered.length,
            available: filtered.filter((u) => u.status === 'AVAILABLE').length,
            occupied: filtered.filter((u) => u.status === 'OCCUPIED').length,
            dirty: filtered.filter((u) => u.status === 'DIRTY').length,
            inProgress: filtered.filter((u) => u.status === 'IN_PROGRESS').length,
            maintenance: filtered.filter((u) => u.status === 'MAINTENANCE').length,
        }
    }, [units, typeFilter])

    // Checkout alerts for occupied units
    const checkoutAlerts = useMemo(() => {
        const occupied = units.filter(u => u.status === 'OCCUPIED' && u.active_booking?.check_out)
        return occupied
            .map(u => {
                const alert = getCheckoutAlert(u.active_booking!.check_out!, now)
                return {
                    unit: u,
                    alert,
                    guestName: u.active_booking?.guests?.[0]?.name || 'Unknown',
                }
            })
            .filter(a => a.alert.level !== 'none')
            .sort((a, b) => a.alert.minutesRemaining - b.alert.minutesRemaining)
    }, [units, now])

    const criticalCount = checkoutAlerts.filter(a => a.alert.level === 'critical').length
    const warningCount = checkoutAlerts.filter(a => a.alert.level === 'warning').length

    const typeFilters: { key: TypeFilter; label: string; icon: React.ReactNode }[] = [
        { key: 'ALL', label: 'All Units', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
        { key: 'ROOM', label: 'Rooms', icon: <BedDouble className="h-3.5 w-3.5" /> },
        { key: 'DORM', label: 'Dorms', icon: <BedSingle className="h-3.5 w-3.5" /> },
    ]

    const statusFilters: { key: StatusFilter; label: string; count: number; icon: React.ReactNode; color: string }[] = [
        { key: 'ALL', label: 'All', count: stats.total, icon: <LayoutGrid className="h-3 w-3" />, color: 'text-slate-600 bg-slate-100' },
        { key: 'AVAILABLE', label: 'Available', count: stats.available, icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-emerald-700 bg-emerald-50' },
        { key: 'OCCUPIED', label: 'Occupied', count: stats.occupied, icon: <Users className="h-3 w-3" />, color: 'text-red-700 bg-red-50' },
        { key: 'DIRTY', label: 'Dirty', count: stats.dirty, icon: <AlertTriangle className="h-3 w-3" />, color: 'text-amber-700 bg-amber-50' },
        { key: 'IN_PROGRESS', label: 'Cleaning', count: stats.inProgress, icon: <Loader2 className="h-3 w-3" />, color: 'text-sky-700 bg-sky-50' },
        { key: 'MAINTENANCE', label: 'Maintenance', count: stats.maintenance, icon: <Wrench className="h-3 w-3" />, color: 'text-purple-700 bg-purple-50' },
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Checkout Alert Banner */}
            {checkoutAlerts.length > 0 && (
                <div className={`rounded-2xl border px-5 py-4 ${criticalCount > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                    }`}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${criticalCount > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                            }`}>
                            <Bell className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className={`text-sm font-bold ${criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                                Checkout Alerts
                                {criticalCount > 0 && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-200 text-red-700 text-[10px] font-bold uppercase">
                                        {criticalCount} overdue
                                    </span>
                                )}
                                {warningCount > 0 && (
                                    <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold uppercase">
                                        {warningCount} soon
                                    </span>
                                )}
                            </h3>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        {checkoutAlerts.map((item) => (
                            <div
                                key={item.unit.id}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${item.alert.level === 'critical'
                                    ? 'bg-red-100/80 text-red-700'
                                    : item.alert.level === 'warning'
                                        ? 'bg-amber-100/80 text-amber-700'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    {item.alert.level === 'critical' && (
                                        <span className="relative flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                        </span>
                                    )}
                                    <span className="font-bold">{item.unit.unit_number}</span>
                                    <span className="text-[10px] opacity-70">
                                        {item.guestName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span className="font-bold">{item.alert.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Front Desk
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Manage check-ins, check-outs, and room statuses in
                        real-time.
                    </p>
                </div>

                {/* Type Filter Tabs */}
                <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
                    {typeFilters.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setTypeFilter(f.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${typeFilter === f.key
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                        >
                            {f.icon}
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {statusFilters.map((sf) => (
                    <button
                        key={sf.key}
                        onClick={() => setStatusFilter(sf.key)}
                        className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-left transition-all border ${statusFilter === sf.key
                            ? 'border-slate-300 shadow-sm ring-1 ring-slate-200 bg-white'
                            : 'border-transparent bg-white/50 hover:bg-white hover:border-slate-200'
                            }`}
                    >
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${sf.color}`}
                        >
                            {sf.icon}
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900 leading-none">
                                {sf.count}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">
                                {sf.label}
                            </p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Unit Grid */}
            <UnitGrid
                hotelId={hotelId}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                now={now}
            />
        </div>
    )
}
