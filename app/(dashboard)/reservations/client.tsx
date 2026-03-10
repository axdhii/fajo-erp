'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { Booking, Unit } from '@/lib/types'
import { useCurrentTime } from '@/lib/hooks/use-current-time'
import { useUnitStore, type UnitWithBooking } from '@/lib/store/unit-store'
import { ReservationSheet } from '@/components/reservations/ReservationSheet'
import { ReservationDetail } from '@/components/reservations/ReservationDetail'
import { Button } from '@/components/ui/button'
import {
    CalendarDays,
    ChevronLeft,
    ChevronRight,
    Plus,
    BedDouble,
    Users,
    Clock,
    CalendarCheck,
    CalendarPlus,
    User,
    Sparkles,
    AlertTriangle,
    Loader2,
    Wrench,
} from 'lucide-react'

interface ReservationsClientProps {
    hotelId: string
}

function formatDate(d: Date): string {
    return d.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
    })
}

function toDateString(d: Date): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

// isToday is now a component-level function that takes devNow
function isTodayCheck(d: Date, devNow: Date): boolean {
    return toDateString(d) === toDateString(devNow)
}

// Live unit status styles (for today view) — BOLD, saturated colors that stand out
const UNIT_STATUS_STYLES: Record<string, { bg: string; border: string; accent: string; badge: string; badgeText: string; textColor: string; icon: any }> = {
    OCCUPIED: {
        bg: 'bg-red-50',
        border: 'border-red-200',
        accent: 'border-l-red-500',
        badge: 'bg-red-500',
        badgeText: 'Occupied',
        textColor: 'text-red-700',
        icon: User,
    },
    DIRTY: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        accent: 'border-l-orange-500',
        badge: 'bg-orange-500',
        badgeText: 'Dirty',
        textColor: 'text-orange-700',
        icon: AlertTriangle,
    },
    IN_PROGRESS: {
        bg: 'bg-cyan-50',
        border: 'border-cyan-200',
        accent: 'border-l-cyan-500',
        badge: 'bg-cyan-500',
        badgeText: 'Cleaning',
        textColor: 'text-cyan-700',
        icon: Loader2,
    },
    MAINTENANCE: {
        bg: 'bg-violet-50',
        border: 'border-violet-200',
        accent: 'border-l-violet-500',
        badge: 'bg-violet-500',
        badgeText: 'Maintenance',
        textColor: 'text-violet-700',
        icon: Wrench,
    },
}

// Reservation booking status styles — vivid, unmistakable
const BOOKING_STATUS_STYLES: Record<string, { bg: string; border: string; accent: string; badge: string; badgeText: string; textColor: string }> = {
    CONFIRMED: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        accent: 'border-l-blue-500',
        badge: 'bg-blue-500',
        badgeText: 'Reserved',
        textColor: 'text-blue-700',
    },
    CHECKED_IN: {
        bg: 'bg-emerald-50',
        border: 'border-emerald-200',
        accent: 'border-l-emerald-500',
        badge: 'bg-emerald-600',
        badgeText: 'Checked In',
        textColor: 'text-emerald-700',
    },
    PENDING: {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        accent: 'border-l-amber-500',
        badge: 'bg-amber-500',
        badgeText: 'Pending',
        textColor: 'text-amber-700',
    },
}

export function ReservationsClient({ hotelId }: ReservationsClientProps) {
    const { units, fetchUnitsWithBookings } = useUnitStore()
    const devNow = useCurrentTime()
    const [bookings, setBookings] = useState<Booking[]>([])
    const [selectedDate, setSelectedDate] = useState(() => {
        const d = new Date(devNow)
        d.setHours(0, 0, 0, 0)
        return d
    })
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
    const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null)
    const [reservationSheetOpen, setReservationSheetOpen] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const [isLoading, setIsLoading] = useState(false)
    const activeFetch = useRef<AbortController | null>(null)

    // Always sync selectedDate to devNow whenever the DATE changes
    // This ensures: opening page → today, changing dev time → new today
    const devTodayStr = toDateString(devNow)
    useEffect(() => {
        setSelectedDate((prev) => {
            const currentStr = toDateString(prev)
            if (currentStr !== devTodayStr && currentStr === toDateString(new Date())) {
                const d = new Date(devNow)
                d.setHours(0, 0, 0, 0)
                return d
            }
            return prev
        })
    }, [devTodayStr, devNow])

    const todayView = isTodayCheck(selectedDate, devNow)

    const rooms = useMemo(
        () => units.filter((u) => u.type === 'ROOM'),
        [units]
    )

    // Fetch reservations for the selected date
    const fetchBookings = useCallback(async () => {
        if (activeFetch.current) {
            activeFetch.current.abort()
        }
        activeFetch.current = new AbortController()
        const { signal } = activeFetch.current

        setIsLoading(true)
        try {
            const from = new Date(selectedDate)
            from.setHours(0, 0, 0, 0)
            const to = new Date(selectedDate)
            to.setHours(23, 59, 59, 999)

            const res = await fetch(
                `/api/reservations?hotelId=${hotelId}&from=${from.toISOString()}&to=${to.toISOString()}`,
                { signal }
            )
            const data = await res.json()
            if (data.bookings) setBookings(data.bookings)
        } catch (err: any) {
            if (err.name === 'AbortError') return
            console.error('Failed to fetch bookings:', err)
        } finally {
            setIsLoading(false)
        }
    }, [hotelId, selectedDate])

    useEffect(() => {
        fetchUnitsWithBookings(hotelId)
    }, [hotelId, fetchUnitsWithBookings])

    useEffect(() => {
        fetchBookings()
    }, [fetchBookings])

    // Map: unitId → reservation booking for this day
    // If there are multiple bookings for a single unit today (e.g. one checking out, one checking in)
    // we must prioritize showing the CHECKED_IN one until it actually checks out.
    const bookingsByUnit = useMemo(() => {
        const map: Record<string, Booking> = {}
        for (const b of bookings) {
            const existing = map[b.unit_id]
            if (!existing) {
                map[b.unit_id] = b
            } else {
                // Prioritize CHECKED_IN over other statuses
                if (b.status === 'CHECKED_IN') {
                    map[b.unit_id] = b
                } else if (existing.status !== 'CHECKED_IN' && b.status === 'CONFIRMED') {
                    // CONFIRMED takes precedence over PENDING
                    map[b.unit_id] = b
                }
            }
        }
        return map
    }, [bookings])

    const navigateDay = (delta: number) => {
        setSelectedDate((prev) => {
            const d = new Date(prev)
            d.setDate(d.getDate() + delta)
            return d
        })
    }

    const goToToday = () => {
        const d = new Date(devNow)
        d.setHours(0, 0, 0, 0)
        setSelectedDate(d)
    }

    const handleCardClick = (room: UnitWithBooking) => {
        const booking = bookingsByUnit[room.id]
        if (booking) {
            setSelectedBooking(booking)
            setDetailOpen(true)
        } else if (room.status === 'AVAILABLE') {
            setSelectedUnit(room)
            setReservationSheetOpen(true)
        }
        // For OCCUPIED/DIRTY/CLEANING/MAINTENANCE rooms with no reservation, do nothing
    }

    const handleSuccess = () => {
        setReservationSheetOpen(false)
        setDetailOpen(false)
        setSelectedBooking(null)
        setSelectedUnit(null)
        fetchBookings()
        fetchUnitsWithBookings(hotelId)
    }

    // Determine what to show on each card
    function getCardState(room: UnitWithBooking) {
        const reservation = bookingsByUnit[room.id]

        // Is there a live issue we need to warn about?
        // (e.g. room has a reservation but is currently DIRTY or MAINTENANCE)
        const isLiveIssue = todayView && room.status !== 'AVAILABLE' && room.status !== 'OCCUPIED'

        // 1. Has a reservation for this date (PRIORITY OVER LIVE STATUS)
        if (reservation) {
            const bookingStyle = BOOKING_STATUS_STYLES[reservation.status] || BOOKING_STATUS_STYLES.CONFIRMED
            const liveIssueText = isLiveIssue ? UNIT_STATUS_STYLES[room.status]?.badgeText : null
            return {
                type: 'reservation' as const,
                bg: bookingStyle.bg,
                border: bookingStyle.border,
                accent: bookingStyle.accent,
                badge: bookingStyle.badge,
                badgeText: bookingStyle.badgeText,
                textColor: bookingStyle.textColor,
                guestName: (reservation as any)?.guests?.[0]?.name || 'Guest',
                reservation,
                liveIssueText, // Pass the warning down to the render
            }
        }

        // 2. Today view: show LIVE status if unit is not available (AND NO reservation exists)
        if (todayView && room.status !== 'AVAILABLE') {
            const unitStyle = UNIT_STATUS_STYLES[room.status]
            return {
                type: 'live-status' as const,
                bg: unitStyle?.bg || 'bg-slate-50',
                border: unitStyle?.border || 'border-slate-200',
                accent: unitStyle?.accent || 'border-l-slate-400',
                badge: unitStyle?.badge || 'bg-slate-500',
                badgeText: unitStyle?.badgeText || room.status,
                textColor: unitStyle?.textColor || 'text-slate-600',
                guestName: room.active_booking?.guests?.[0]?.name || null,
                reservation: null,
                liveIssueText: null,
            }
        }

        // Available — clean, neutral white (baseline state)
        return {
            type: 'available' as const,
            bg: 'bg-white',
            border: 'border-slate-200 border-dashed',
            accent: 'border-l-transparent',
            badge: '',
            badgeText: '',
            textColor: 'text-slate-400',
            guestName: null,
            reservation: null,
        }
    }

    // Stats
    const totalRooms = rooms.length
    const busyCount = rooms.filter((r) => {
        const state = getCardState(r)
        return state.type !== 'available'
    }).length
    const availableCount = totalRooms - busyCount

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                        Reservations
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">
                        Pre-bookings and calendar management
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={() => {
                        setSelectedUnit(null)
                        setReservationSheetOpen(true)
                    }}
                    className="h-9 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/15 rounded-xl"
                >
                    <Plus className="h-4 w-4" />
                    New Reservation
                </Button>
            </div>

            {/* Date Navigator */}
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm">
                <button
                    onClick={() => navigateDay(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                    <ChevronLeft className="h-4 w-4 text-slate-600" />
                </button>
                <button
                    onClick={goToToday}
                    className={`flex items-center gap-1.5 h-9 px-4 rounded-xl text-xs font-semibold transition-colors ${isTodayCheck(selectedDate, devNow)
                        ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                >
                    <CalendarDays className="h-3.5 w-3.5" />
                    Today
                </button>
                <button
                    onClick={() => navigateDay(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors"
                >
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                </button>
                <div className="ml-2">
                    <p className="text-sm font-bold text-slate-800">
                        {formatDate(selectedDate)}
                    </p>
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold mt-0.5">
                        {todayView ? "Today's Status + Bookings" : 'Bookings for this date'}
                    </p>
                </div>
                <input
                    type="date"
                    value={toDateString(selectedDate)}
                    onChange={(e) => {
                        const d = new Date(e.target.value + 'T00:00:00')
                        if (!isNaN(d.getTime())) setSelectedDate(d)
                    }}
                    className="ml-auto h-9 rounded-xl border border-slate-200 px-3 text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
            </div>

            {/* Stats */}
            <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
                    <CalendarCheck className="h-4 w-4 text-blue-500" />
                    <div>
                        <p className="text-lg font-bold text-blue-700 leading-none">
                            {busyCount}
                        </p>
                        <p className="text-[9px] font-semibold text-blue-500 uppercase tracking-widest mt-0.5">
                            {todayView ? 'Busy' : 'Reserved'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                    <CalendarPlus className="h-4 w-4 text-emerald-500" />
                    <div>
                        <p className="text-lg font-bold text-emerald-700 leading-none">
                            {availableCount}
                        </p>
                        <p className="text-[9px] font-semibold text-emerald-500 uppercase tracking-widest mt-0.5">
                            Available
                        </p>
                    </div>
                </div>
            </div>

            {/* Room Cards Grid */}
            {isLoading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {rooms.map((room) => {
                        const state = getCardState(room)
                        const isClickable = state.type === 'available' || state.type === 'reservation'

                        return (
                            <button
                                key={room.id}
                                onClick={() => handleCardClick(room)}
                                disabled={!isClickable && state.type === 'live-status' && !state.reservation}
                                className={`group relative rounded-2xl border-l-4 border p-4 text-left transition-all ${isClickable
                                    ? 'hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.98] cursor-pointer'
                                    : state.reservation
                                        ? 'hover:shadow-lg hover:-translate-y-0.5 cursor-pointer'
                                        : 'opacity-80 cursor-default'
                                    } ${state.bg} ${state.border} ${state.accent}`}
                            >
                                {/* Room Number + Badge */}
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <BedDouble className={`h-4 w-4 ${state.type === 'available' ? 'text-slate-300' : state.textColor}`} />
                                        <span className="text-xl font-bold text-slate-800">
                                            {room.unit_number}
                                        </span>
                                    </div>
                                    {state.badgeText ? (
                                        <span
                                            className={`text-[9px] font-bold uppercase tracking-wider text-white px-2.5 py-1 rounded-full ${state.badge}`}
                                        >
                                            {state.badgeText}
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[9px] font-semibold uppercase tracking-wider text-emerald-500">
                                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                                            Open
                                        </span>
                                    )}
                                </div>

                                {state.type === 'live-status' ? (
                                    <div className="space-y-1.5">
                                        {state.guestName && (
                                            <div className={`flex items-center gap-1.5 text-xs ${state.textColor}`}>
                                                <Users className="h-3 w-3" />
                                                <span className="font-semibold truncate">
                                                    {state.guestName}
                                                </span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                                                Room
                                            </span>
                                            <span className="text-xs font-bold text-slate-500">
                                                ₹{Number(room.base_price).toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                    </div>
                                ) : state.type === 'reservation' ? (
                                    <div className="space-y-1.5">
                                        <div className={`flex items-center gap-1.5 text-xs ${state.textColor}`}>
                                            <Users className="h-3 w-3" />
                                            <span className="font-semibold truncate">
                                                {state.guestName}
                                            </span>
                                        </div>

                                        {/* Show warning if room is reserved but DIRTY/MAINTENANCE */}
                                        {state.liveIssueText && (
                                            <div className="flex items-center justify-between w-full mt-1 px-2 py-1 bg-amber-100/80 rounded border border-amber-200/50">
                                                <div className="flex items-center gap-1 text-[10px] font-bold text-amber-700">
                                                    <AlertTriangle className="h-3 w-3" />
                                                    <span>Action Needed: {state.liveIssueText}</span>
                                                </div>
                                            </div>
                                        )}

                                        {state.reservation?.expected_arrival && !state.liveIssueText && (
                                            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
                                                <Clock className="h-3 w-3" />
                                                <span>{state.reservation.expected_arrival}</span>
                                            </div>
                                        )}
                                        <div className="flex items-center justify-between pt-1.5 border-t border-slate-200/60">
                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                                                Room
                                            </span>
                                            <span className={`text-xs font-bold ${state.textColor}`}>
                                                ₹{Number(state.reservation!.grand_total).toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <p className="text-xs text-slate-400">
                                            No bookings
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-300">
                                                Room
                                            </span>
                                            <span className="text-xs font-bold text-slate-400">
                                                ₹{Number(room.base_price).toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                        <p className="text-[10px] text-blue-500 font-semibold group-hover:text-blue-600 transition-colors">
                                            + Click to reserve
                                        </p>
                                    </div>
                                )}
                            </button>
                        )
                    })}

                    {rooms.length === 0 && (
                        <div className="col-span-full flex h-48 items-center justify-center text-slate-400 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                            <p className="text-sm font-medium">
                                No rooms found
                            </p>
                        </div>
                    )}
                </div>
            )}

            {/* Sheets */}
            <ReservationSheet
                hotelId={hotelId}
                unit={selectedUnit as any}
                defaultCheckIn={selectedDate}
                open={reservationSheetOpen}
                onOpenChange={setReservationSheetOpen}
                onSuccess={handleSuccess}
            />

            <ReservationDetail
                booking={selectedBooking}
                open={detailOpen}
                onOpenChange={setDetailOpen}
                onSuccess={handleSuccess}
            />
        </div>
    )
}
