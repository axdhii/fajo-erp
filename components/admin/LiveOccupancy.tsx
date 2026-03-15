'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useCurrentTime, getCheckoutAlert } from '@/lib/hooks/use-current-time'
import type { UnitType, UnitStatus, Booking, Payment } from '@/lib/types'
import type { AdminTabProps } from '@/app/(dashboard)/admin/client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import {
    BedDouble,
    BedSingle,
    LayoutGrid,
    AlertTriangle,
    Loader2,
    Wrench,
    Sparkles,
    User,
    Clock,
    Phone,
    IndianRupee,
    FileText,
    LogOut,
    Timer,
    ShieldAlert,
    X,
} from 'lucide-react'

// ============================================================
// Types
// ============================================================

interface OccupancyUnit {
    id: string
    hotel_id: string
    unit_number: string
    type: UnitType
    status: UnitStatus
    base_price: number
    maintenance_reason: string | null
}

type OccupancyBooking = Omit<Booking, 'guests' | 'payments'> & {
    guests?: { name: string; phone: string }[]
    payments?: Payment[]
}

interface UnitWithBooking extends OccupancyUnit {
    active_booking: OccupancyBooking | null
    hotelName?: string
}

type TypeFilter = UnitType | 'ALL'
type StatusFilter = UnitStatus | 'ALL'

// ============================================================
// Status config — mirrors UnitCard.tsx accent colors
// ============================================================

const statusConfig: Record<
    UnitStatus,
    { bg: string; text: string; border: string; label: string; icon: React.ReactNode }
> = {
    AVAILABLE: {
        bg: 'bg-emerald-500/8',
        text: 'text-emerald-600',
        border: 'border-emerald-500/20',
        label: 'Available',
        icon: <Sparkles className="h-3 w-3" />,
    },
    OCCUPIED: {
        bg: 'bg-red-500/8',
        text: 'text-red-600',
        border: 'border-red-500/20',
        label: 'Occupied',
        icon: <User className="h-3 w-3" />,
    },
    DIRTY: {
        bg: 'bg-amber-500/8',
        text: 'text-amber-600',
        border: 'border-amber-500/20',
        label: 'Dirty',
        icon: <AlertTriangle className="h-3 w-3" />,
    },
    IN_PROGRESS: {
        bg: 'bg-sky-500/8',
        text: 'text-sky-600',
        border: 'border-sky-500/20',
        label: 'Cleaning',
        icon: <Loader2 className="h-3 w-3 animate-spin" />,
    },
    MAINTENANCE: {
        bg: 'bg-purple-500/8',
        text: 'text-purple-600',
        border: 'border-purple-500/20',
        label: 'Maintenance',
        icon: <Wrench className="h-3 w-3" />,
    },
}

// ============================================================
// Natural sort — 101 < 108 < A1 < A2 < A10
// ============================================================

function naturalSort(a: string, b: string): number {
    const extract = (s: string) => {
        const match = s.match(/^([A-Za-z]*)(\d+)$/)
        return match ? { prefix: match[1], num: parseInt(match[2]) } : { prefix: s, num: 0 }
    }
    const pa = extract(a)
    const pb = extract(b)
    if (pa.prefix !== pb.prefix) return pa.prefix.localeCompare(pb.prefix)
    return pa.num - pb.num
}

// ============================================================
// Component
// ============================================================

export function LiveOccupancy({ hotelId, hotels }: AdminTabProps) {
    const [units, setUnits] = useState<UnitWithBooking[]>([])
    const [loading, setLoading] = useState(true)
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
    const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null)
    const [actionLoading, setActionLoading] = useState<string | null>(null)

    // Extend-stay inline form state
    const [extendUnitId, setExtendUnitId] = useState<string | null>(null)
    const [extendType, setExtendType] = useState<'HOURS' | 'DAYS'>('HOURS')
    const [extendAmount, setExtendAmount] = useState('3')
    const [extendFee, setExtendFee] = useState('0')
    const [extendPaymentType, setExtendPaymentType] = useState<'CASH' | 'DIGITAL'>('CASH')

    const now = useCurrentTime(15000)
    const hotelMap = useMemo(() => new Map(hotels.map(h => [h.id, h.name])), [hotels])

    // --------------------------------------------------------
    // Data fetching — two-query pattern (units + active bookings)
    // --------------------------------------------------------

    const fetchData = useCallback(async () => {
        try {
            // 1. Fetch units
            let unitQuery = supabase
                .from('units')
                .select('*')
                .order('unit_number', { ascending: true })

            if (hotelId) {
                unitQuery = unitQuery.eq('hotel_id', hotelId)
            }

            const { data: unitsData, error: unitsError } = await unitQuery

            if (unitsError) {
                console.error('Failed to fetch units:', unitsError)
                return
            }

            const allUnits = (unitsData || []) as OccupancyUnit[]
            const unitIds = allUnits.map(u => u.id)

            // 2. Fetch active bookings with guests + payments
            const bookingsByUnit: Record<string, OccupancyBooking> = {}

            if (unitIds.length > 0) {
                const { data: bookingsData } = await supabase
                    .from('bookings')
                    .select('*, guests(name, phone), payments(amount_cash, amount_digital, total_paid)')
                    .eq('status', 'CHECKED_IN')
                    .in('unit_id', unitIds)

                if (bookingsData) {
                    for (const b of bookingsData) {
                        bookingsByUnit[b.unit_id] = b as OccupancyBooking
                    }
                }
            }

            // 3. Merge units + bookings
            const merged: UnitWithBooking[] = allUnits.map(unit => ({
                ...unit,
                active_booking: bookingsByUnit[unit.id] || null,
                hotelName: hotelMap.get(unit.hotel_id) || 'Unknown',
            }))

            merged.sort((a, b) => naturalSort(a.unit_number, b.unit_number))
            setUnits(merged)
        } finally {
            setLoading(false)
        }
    }, [hotelId, hotelMap])

    useEffect(() => {
        setLoading(true)
        fetchData()
    }, [fetchData])

    // --------------------------------------------------------
    // Realtime subscription on units table
    // --------------------------------------------------------

    useEffect(() => {
        const channelName = hotelId
            ? `admin_occupancy_${hotelId.slice(0, 8)}`
            : 'admin_occupancy_all'

        const pgConfig: {
            event: '*' | 'INSERT' | 'UPDATE' | 'DELETE'
            schema: string
            table: string
            filter?: string
        } = {
            event: '*',
            schema: 'public',
            table: 'units',
        }

        if (hotelId) {
            pgConfig.filter = `hotel_id=eq.${hotelId}`
        }

        const channel = supabase
            .channel(channelName)
            .on('postgres_changes', pgConfig, () => {
                fetchData()
            })
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [hotelId, fetchData])

    // --------------------------------------------------------
    // Computed stats
    // --------------------------------------------------------

    const stats = useMemo(() => {
        const rooms = units.filter(u => u.type === 'ROOM')
        const dorms = units.filter(u => u.type === 'DORM')
        const occupiedRooms = rooms.filter(u => u.status === 'OCCUPIED').length
        const occupiedDorms = dorms.filter(u => u.status === 'OCCUPIED').length
        const totalOccupied = occupiedRooms + occupiedDorms
        const total = units.length
        const occupancyPct = total > 0 ? Math.round((totalOccupied / total) * 100) : 0

        return {
            rooms: rooms.length,
            dorms: dorms.length,
            occupiedRooms,
            occupiedDorms,
            total,
            totalOccupied,
            occupancyPct,
            available: units.filter(u => u.status === 'AVAILABLE').length,
            dirty: units.filter(u => u.status === 'DIRTY').length,
            inProgress: units.filter(u => u.status === 'IN_PROGRESS').length,
            maintenance: units.filter(u => u.status === 'MAINTENANCE').length,
        }
    }, [units])

    // --------------------------------------------------------
    // Filtered + grouped units
    // --------------------------------------------------------

    const filteredUnits = useMemo(() => {
        return units.filter(u => {
            if (typeFilter !== 'ALL' && u.type !== typeFilter) return false
            if (statusFilter !== 'ALL' && u.status !== statusFilter) return false
            return true
        })
    }, [units, typeFilter, statusFilter])

    // Group by hotel when viewing all hotels (hotelId === null)
    const groupedUnits = useMemo(() => {
        if (hotelId) return null
        const groups = new Map<string, { name: string; units: UnitWithBooking[] }>()
        for (const unit of filteredUnits) {
            const name = unit.hotelName || 'Unknown'
            let group = groups.get(unit.hotel_id)
            if (!group) {
                group = { name, units: [] }
                groups.set(unit.hotel_id, group)
            }
            group.units.push(unit)
        }
        return groups
    }, [filteredUnits, hotelId])

    // --------------------------------------------------------
    // Admin actions (API calls for writes)
    // --------------------------------------------------------

    const handleForceCheckout = async (unit: UnitWithBooking) => {
        if (!unit.active_booking) return
        const confirmed = window.confirm(
            `Force checkout unit ${unit.unit_number}? This will close the booking and mark the unit as DIRTY.`
        )
        if (!confirmed) return

        setActionLoading(unit.id)
        try {
            const res = await fetch('/api/bookings/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId: unit.active_booking.id }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`${unit.unit_number} checked out`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Force checkout failed')
        } finally {
            setActionLoading(null)
        }
    }

    const handleEmergencyVacate = async (unit: UnitWithBooking) => {
        const reason = window.prompt(
            `Emergency vacate ${unit.unit_number}.\nThis will force-checkout and set unit to MAINTENANCE.\n\nEnter reason:`
        )
        if (reason === null) return // cancelled

        setActionLoading(unit.id)
        try {
            const res = await fetch('/api/overrides/emergency-vacate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId: unit.id, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`${unit.unit_number} emergency vacated`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Emergency vacate failed')
        } finally {
            setActionLoading(null)
        }
    }

    const handleExtendStay = async (unit: UnitWithBooking) => {
        if (!unit.active_booking) return
        setActionLoading(unit.id)
        try {
            const res = await fetch('/api/bookings/extend', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: unit.active_booking.id,
                    extendType,
                    amount: Number(extendAmount),
                    fee: Number(extendFee),
                    paymentType: Number(extendFee) > 0 ? extendPaymentType : null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`${unit.unit_number} stay extended`)
            setExtendUnitId(null)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Extend failed')
        } finally {
            setActionLoading(null)
        }
    }

    // --------------------------------------------------------
    // Display helpers
    // --------------------------------------------------------

    const formatTime = (iso: string | null): string => {
        if (!iso) return '\u2014'
        return new Date(iso).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const getTimeRemaining = (checkOut: string | null): { label: string; overdue: boolean } => {
        if (!checkOut) return { label: 'No checkout set', overdue: false }
        const alert = getCheckoutAlert(checkOut, now)
        if (alert.level === 'critical') return { label: alert.label, overdue: true }
        if (alert.level !== 'none') return { label: alert.label, overdue: false }
        // More than 6 hours away — compute manually
        const diffMs = new Date(checkOut).getTime() - now.getTime()
        const hours = Math.floor(diffMs / (3600 * 1000))
        const mins = Math.round((diffMs % (3600 * 1000)) / (60 * 1000))
        return { label: `${hours}h ${mins}m remaining`, overdue: false }
    }

    // --------------------------------------------------------
    // Filter button configs
    // --------------------------------------------------------

    const typeFilters: { key: TypeFilter; label: string; icon: React.ReactNode }[] = [
        { key: 'ALL', label: 'All', icon: <LayoutGrid className="h-3 w-3" /> },
        { key: 'ROOM', label: 'Rooms', icon: <BedDouble className="h-3 w-3" /> },
        { key: 'DORM', label: 'Dorms', icon: <BedSingle className="h-3 w-3" /> },
    ]

    const statusFilters: { key: StatusFilter; label: string; count: number; color: string }[] = [
        { key: 'ALL', label: 'All', count: stats.total, color: 'text-slate-600 bg-slate-100' },
        { key: 'OCCUPIED', label: 'Occupied', count: stats.totalOccupied, color: 'text-red-700 bg-red-50' },
        { key: 'AVAILABLE', label: 'Available', count: stats.available, color: 'text-emerald-700 bg-emerald-50' },
        { key: 'DIRTY', label: 'Dirty', count: stats.dirty, color: 'text-amber-700 bg-amber-50' },
        { key: 'IN_PROGRESS', label: 'Cleaning', count: stats.inProgress, color: 'text-sky-700 bg-sky-50' },
        { key: 'MAINTENANCE', label: 'Maintenance', count: stats.maintenance, color: 'text-purple-700 bg-purple-50' },
    ]

    // --------------------------------------------------------
    // Render: compact unit card
    // --------------------------------------------------------

    const renderUnitCard = (unit: UnitWithBooking) => {
        const config = statusConfig[unit.status]
        const isExpanded = expandedUnitId === unit.id
        const isOccupied = unit.status === 'OCCUPIED'
        const booking = unit.active_booking
        const guestName = booking?.guests?.[0]?.name
        const guestPhone = booking?.guests?.[0]?.phone

        // Checkout alert
        const checkoutAlert =
            isOccupied && booking?.check_out
                ? getCheckoutAlert(booking.check_out, now)
                : null
        const isOverdue = checkoutAlert?.level === 'critical'

        // Payment
        const paymentRecord = booking?.payments
            ? (Array.isArray(booking.payments) ? booking.payments[0] : booking.payments)
            : null
        const totalPaid = paymentRecord ? Number(paymentRecord.total_paid) : 0
        const grandTotal = booking ? Number(booking.grand_total) : 0
        const balance = grandTotal - totalPaid

        return (
            <div key={unit.id} className="flex flex-col">
                {/* Card button */}
                <button
                    onClick={() => setExpandedUnitId(isExpanded ? null : unit.id)}
                    className={`
                        relative rounded-xl border p-3 text-left transition-all cursor-pointer
                        hover:shadow-md hover:scale-[1.01]
                        ${config.bg} ${config.border}
                        ${isExpanded ? 'ring-2 ring-slate-300 shadow-md' : ''}
                        ${isOverdue ? 'border-red-500/40 bg-red-500/10' : ''}
                    `}
                >
                    {/* Overdue pulsing red dot */}
                    {isOverdue && (
                        <div className="absolute -top-1 -right-1 h-3 w-3">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                        </div>
                    )}

                    {/* Unit number + status badge */}
                    <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                            {unit.type === 'DORM'
                                ? <BedSingle className="h-3.5 w-3.5 text-slate-400" />
                                : <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                            }
                            <span className="font-bold text-sm text-slate-900">{unit.unit_number}</span>
                        </div>
                        <Badge
                            variant="outline"
                            className={`flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0 ${config.text} border-current/20`}
                        >
                            {config.icon}
                            {config.label}
                        </Badge>
                    </div>

                    {/* Occupied unit details */}
                    {isOccupied && guestName && (
                        <div className="mt-1.5 space-y-0.5">
                            <p className="text-[11px] font-semibold text-slate-700 truncate">{guestName}</p>
                            {guestPhone && (
                                <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                    <Phone className="h-2.5 w-2.5" />
                                    {guestPhone}
                                </p>
                            )}
                            <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                <Clock className="h-2.5 w-2.5" />
                                In: {formatTime(booking?.check_in || null)}
                            </p>
                            {booking?.check_out && (
                                <p className={`text-[10px] font-bold flex items-center gap-1 ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                                    <Timer className="h-2.5 w-2.5" />
                                    {isOverdue ? checkoutAlert?.label : getTimeRemaining(booking.check_out).label}
                                </p>
                            )}
                            {/* Payment status line */}
                            <p className={`text-[10px] flex items-center gap-1 ${balance > 0 ? 'text-amber-600 font-bold' : 'text-emerald-600'}`}>
                                <IndianRupee className="h-2.5 w-2.5" />
                                {balance > 0
                                    ? `\u20B9${totalPaid.toLocaleString('en-IN')} / \u20B9${grandTotal.toLocaleString('en-IN')}`
                                    : `\u20B9${grandTotal.toLocaleString('en-IN')} paid`
                                }
                            </p>
                        </div>
                    )}

                    {/* Non-occupied sublabel */}
                    {!isOccupied && (
                        <p className="text-[10px] text-slate-400 mt-1">
                            {unit.status === 'MAINTENANCE' && unit.maintenance_reason
                                ? unit.maintenance_reason
                                : unit.type === 'DORM' ? 'Dorm Bed' : 'Private Room'
                            }
                        </p>
                    )}
                </button>

                {/* Expanded detail panel — only for occupied units */}
                {isExpanded && isOccupied && booking && (
                    <div className="mt-1 rounded-xl border border-slate-200 bg-white p-4 space-y-3 shadow-sm animate-in slide-in-from-top-2 duration-200">
                        {/* Guest list */}
                        <div>
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                Guests ({booking.guests?.length || 0})
                            </h4>
                            <div className="space-y-1">
                                {(booking.guests || []).map((g, i) => (
                                    <div key={i} className="flex items-center gap-2 text-xs">
                                        <User className="h-3 w-3 text-slate-400" />
                                        <span className="font-medium text-slate-800">{g.name}</span>
                                        <span className="text-slate-400">{g.phone}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Payment breakdown */}
                        <div>
                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                                Payment
                            </h4>
                            <div className="grid grid-cols-2 gap-1 text-xs">
                                <span className="text-slate-500">Cash:</span>
                                <span className="font-medium text-slate-800">
                                    {'\u20B9'}{(paymentRecord ? Number(paymentRecord.amount_cash) : 0).toLocaleString('en-IN')}
                                </span>
                                <span className="text-slate-500">Digital:</span>
                                <span className="font-medium text-slate-800">
                                    {'\u20B9'}{(paymentRecord ? Number(paymentRecord.amount_digital) : 0).toLocaleString('en-IN')}
                                </span>
                                <span className="text-slate-500">Total Paid:</span>
                                <span className="font-semibold text-emerald-700">
                                    {'\u20B9'}{totalPaid.toLocaleString('en-IN')}
                                </span>
                                <span className="text-slate-500">Grand Total:</span>
                                <span className="font-semibold text-slate-800">
                                    {'\u20B9'}{grandTotal.toLocaleString('en-IN')}
                                </span>
                                {balance > 0 && (
                                    <>
                                        <span className="text-amber-600 font-semibold">Balance:</span>
                                        <span className="font-bold text-amber-600">
                                            {'\u20B9'}{balance.toLocaleString('en-IN')}
                                        </span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Booking meta */}
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                            <p>Booking ID: <span className="font-mono text-slate-600">{booking.id.slice(0, 8)}</span></p>
                            {booking.notes && (
                                <p>Notes: <span className="text-slate-600">{booking.notes}</span></p>
                            )}
                        </div>

                        {/* Inline Extend Stay form */}
                        {extendUnitId === unit.id && (
                            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                    <h5 className="text-[11px] font-bold text-blue-800 uppercase tracking-wider">
                                        Extend Stay
                                    </h5>
                                    <button
                                        onClick={() => setExtendUnitId(null)}
                                        className="text-blue-400 hover:text-blue-600"
                                    >
                                        <X className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-0.5">Type</label>
                                        <select
                                            value={extendType}
                                            onChange={(e) => setExtendType(e.target.value as 'HOURS' | 'DAYS')}
                                            className="w-full h-7 text-xs rounded-md border border-slate-200 px-2 bg-white"
                                        >
                                            <option value="HOURS">Hours</option>
                                            <option value="DAYS">Days</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-0.5">Amount</label>
                                        <Input
                                            type="number"
                                            value={extendAmount}
                                            onChange={(e) => setExtendAmount(e.target.value)}
                                            className="h-7 text-xs"
                                            min="1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-0.5">
                                            Fee ({'\u20B9'})
                                        </label>
                                        <Input
                                            type="number"
                                            value={extendFee}
                                            onChange={(e) => setExtendFee(e.target.value)}
                                            className="h-7 text-xs"
                                            min="0"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-slate-500 block mb-0.5">Payment</label>
                                        <select
                                            value={extendPaymentType}
                                            onChange={(e) => setExtendPaymentType(e.target.value as 'CASH' | 'DIGITAL')}
                                            className="w-full h-7 text-xs rounded-md border border-slate-200 px-2 bg-white"
                                        >
                                            <option value="CASH">Cash</option>
                                            <option value="DIGITAL">Digital</option>
                                        </select>
                                    </div>
                                </div>
                                <Button
                                    size="sm"
                                    className="w-full h-7 text-xs bg-blue-600 hover:bg-blue-700"
                                    disabled={actionLoading === unit.id || !extendAmount || Number(extendAmount) <= 0}
                                    onClick={() => handleExtendStay(unit)}
                                >
                                    {actionLoading === unit.id
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : 'Confirm Extend'
                                    }
                                </Button>
                            </div>
                        )}

                        {/* Action buttons row */}
                        <div className="flex flex-wrap gap-1.5 pt-1">
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] text-red-600 border-red-200 hover:bg-red-50"
                                disabled={actionLoading === unit.id}
                                onClick={() => handleForceCheckout(unit)}
                            >
                                <LogOut className="h-3 w-3 mr-1" />
                                Force Checkout
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] text-blue-600 border-blue-200 hover:bg-blue-50"
                                disabled={actionLoading === unit.id}
                                onClick={() => {
                                    setExtendUnitId(extendUnitId === unit.id ? null : unit.id)
                                    setExtendAmount('3')
                                    setExtendFee('0')
                                    setExtendType('HOURS')
                                }}
                            >
                                <Timer className="h-3 w-3 mr-1" />
                                Extend
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-7 text-[11px] text-purple-600 border-purple-200 hover:bg-purple-50"
                                disabled={actionLoading === unit.id}
                                onClick={() => handleEmergencyVacate(unit)}
                            >
                                <ShieldAlert className="h-3 w-3 mr-1" />
                                Emergency Vacate
                            </Button>
                            <a
                                href={`/invoice/${booking.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-[11px] text-slate-600 border-slate-200 hover:bg-slate-50"
                                >
                                    <FileText className="h-3 w-3 mr-1" />
                                    Invoice
                                </Button>
                            </a>
                        </div>
                    </div>
                )}
            </div>
        )
    }

    // --------------------------------------------------------
    // Render: unit grid wrapper
    // --------------------------------------------------------

    const renderUnitGrid = (unitsToRender: UnitWithBooking[]) => (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {unitsToRender.map(renderUnitCard)}
        </div>
    )

    // --------------------------------------------------------
    // Main render
    // --------------------------------------------------------

    if (loading) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                <span className="ml-2 text-sm text-slate-400">Loading occupancy data...</span>
            </div>
        )
    }

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {/* Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Occupancy</p>
                    <p className="text-2xl font-bold text-slate-900">{stats.occupancyPct}%</p>
                    <p className="text-[11px] text-slate-500">{stats.totalOccupied} / {stats.total} units</p>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Rooms</p>
                    <p className="text-2xl font-bold text-red-600">{stats.occupiedRooms}</p>
                    <p className="text-[11px] text-slate-500">of {stats.rooms} occupied</p>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Dorms</p>
                    <p className="text-2xl font-bold text-red-600">{stats.occupiedDorms}</p>
                    <p className="text-[11px] text-slate-500">of {stats.dorms} occupied</p>
                </div>
                <div className="rounded-xl bg-white border border-slate-200 px-4 py-3">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Needs Attention</p>
                    <p className="text-2xl font-bold text-amber-600">{stats.dirty + stats.maintenance}</p>
                    <p className="text-[11px] text-slate-500">{stats.dirty} dirty, {stats.maintenance} maint.</p>
                </div>
            </div>

            {/* Filter Toggles */}
            <div className="flex flex-col sm:flex-row gap-3">
                {/* Type filter */}
                <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
                    {typeFilters.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setTypeFilter(f.key)}
                            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer transition-all ${
                                typeFilter === f.key
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                            }`}
                        >
                            {f.icon}
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Status filter */}
                <div className="flex flex-wrap bg-white rounded-xl p-1 border border-slate-200 shadow-sm gap-0.5">
                    {statusFilters.map((sf) => (
                        <button
                            key={sf.key}
                            onClick={() => setStatusFilter(sf.key)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg cursor-pointer transition-all ${
                                statusFilter === sf.key
                                    ? 'bg-slate-900 text-white shadow-sm'
                                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                            }`}
                        >
                            <span className={`text-[10px] font-bold px-1.5 py-0 rounded-full ${sf.color}`}>
                                {sf.count}
                            </span>
                            {sf.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Unit Grid */}
            {filteredUnits.length === 0 ? (
                <div className="text-center py-16">
                    <LayoutGrid className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-400">No units match current filters.</p>
                </div>
            ) : groupedUnits ? (
                // Multi-hotel grouped view
                <div className="space-y-6">
                    {Array.from(groupedUnits.entries()).map(([hId, group]) => (
                        <div key={hId}>
                            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                                {group.name}
                                <span className="text-xs font-normal text-slate-400">
                                    ({group.units.filter(u => u.status === 'OCCUPIED').length}/{group.units.length} occupied)
                                </span>
                            </h3>
                            {renderUnitGrid(group.units)}
                        </div>
                    ))}
                </div>
            ) : (
                // Single hotel flat view
                renderUnitGrid(filteredUnits)
            )}
        </div>
    )
}
