'use client'

import { useEffect, useMemo, useState, useCallback, useRef } from 'react'
import type { Booking } from '@/lib/types'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import { useUnitStore } from '@/lib/store/unit-store'
import { useCurrentTime } from '@/lib/hooks/use-current-time'
import { ReservationSheet } from './ReservationSheet'
import { ReservationDetail } from './ReservationDetail'
import { ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TimelineProps {
    hotelId: string
}

function formatLocalYYYYMMDD(d: Date): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

const STATUS_COLORS: Record<string, { bg: string; border: string; text: string }> = {
    CONFIRMED: {
        bg: 'bg-blue-500',
        border: 'border-blue-600',
        text: 'text-white',
    },
    CHECKED_IN: {
        bg: 'bg-emerald-500',
        border: 'border-emerald-600',
        text: 'text-white',
    },
    PENDING: {
        bg: 'bg-amber-400',
        border: 'border-amber-500 border-dashed',
        text: 'text-amber-900',
    },
}

const HOURS_IN_DAY = 24
const DAYS_TO_SHOW = 7
const CELL_WIDTH = 48 // px per hour
const ROW_HEIGHT = 56 // px per room row

function formatHour(h: number): string {
    if (h === 0) return '12 AM'
    if (h === 12) return '12 PM'
    return h < 12 ? `${h} AM` : `${h - 12} PM`
}

function dayLabel(date: Date): string {
    return date.toLocaleDateString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
    })
}

export function Timeline({ hotelId }: TimelineProps) {
    const { units, fetchUnits } = useUnitStore()
    const devNow = useCurrentTime()
    const [bookings, setBookings] = useState<Booking[]>([])
    const [startDate, setStartDate] = useState(() => {
        const d = new Date(devNow)
        d.setHours(0, 0, 0, 0)
        return d
    })
    const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null)
    const [selectedUnit, setSelectedUnit] = useState<UnitWithBooking | null>(null)
    const [selectedSlotTime, setSelectedSlotTime] = useState<Date | null>(null)
    const [reservationSheetOpen, setReservationSheetOpen] = useState(false)
    const [detailOpen, setDetailOpen] = useState(false)
    const [, setIsLoading] = useState(false)
    const activeFetch = useRef<AbortController | null>(null)

    const endDate = useMemo(() => {
        const d = new Date(startDate)
        d.setDate(d.getDate() + DAYS_TO_SHOW)
        return d
    }, [startDate])

    // Only show rooms in timeline (not dorm beds)
    const rooms = useMemo(
        () => units.filter((u) => u.type === 'ROOM'),
        [units]
    )

    const fetchBookings = useCallback(async () => {
        if (activeFetch.current) {
            activeFetch.current.abort()
        }
        activeFetch.current = new AbortController()
        const { signal } = activeFetch.current

        setIsLoading(true)
        try {
            const res = await fetch(
                `/api/reservations?hotelId=${hotelId}&from=${startDate.toISOString()}&to=${endDate.toISOString()}`,
                { signal }
            )
            const data = await res.json()
            if (data.bookings) setBookings(data.bookings)
        } catch (err: unknown) {
            if (err instanceof Error && err.name === 'AbortError') return
            console.error('Failed to fetch bookings:', err)
        } finally {
            setIsLoading(false)
        }
    }, [hotelId, startDate, endDate])

    // Sync startDate to devNow if it is strictly tracking the current day
    const devTodayStr = formatLocalYYYYMMDD(devNow)
    useEffect(() => {
        setStartDate((prev) => {
            const currentStr = formatLocalYYYYMMDD(prev)
            if (currentStr !== devTodayStr && currentStr === formatLocalYYYYMMDD(new Date())) {
                const d = new Date(devNow)
                d.setHours(0, 0, 0, 0)
                return d
            }
            return prev
        })
    }, [devTodayStr, devNow])

    useEffect(() => {
        fetchUnits(hotelId)
        fetchBookings()
    }, [hotelId, fetchUnits, fetchBookings])

    const navigateDays = (delta: number) => {
        setStartDate((prev) => {
            const d = new Date(prev)
            d.setDate(d.getDate() + delta)
            return d
        })
    }

    const goToToday = () => {
        const d = new Date(devNow)
        d.setHours(0, 0, 0, 0)
        setStartDate(d)
    }

    // Calculate position/width of a booking bar on the timeline
    const getBookingStyle = (booking: Booking) => {
        const bookingStart = new Date(booking.check_in)
        const bookingEnd = booking.check_out
            ? new Date(booking.check_out)
            : new Date(bookingStart.getTime() + 24 * 60 * 60 * 1000)

        const timelineStart = startDate.getTime()
        const timelineEnd = endDate.getTime()

        // Clamp to visible range
        const visibleStart = Math.max(bookingStart.getTime(), timelineStart)
        const visibleEnd = Math.min(bookingEnd.getTime(), timelineEnd)

        if (visibleStart >= visibleEnd) return null

        const totalHours = DAYS_TO_SHOW * HOURS_IN_DAY
        const startHourOffset =
            (visibleStart - timelineStart) / (1000 * 60 * 60)
        const durationHours =
            (visibleEnd - visibleStart) / (1000 * 60 * 60)

        const left = (startHourOffset / totalHours) * 100
        const width = (durationHours / totalHours) * 100

        return { left: `${left}%`, width: `${width}%` }
    }

    const handleSlotClick = (unit: UnitWithBooking, dayOffset: number, hour: number) => {
        const clickTime = new Date(startDate)
        clickTime.setDate(clickTime.getDate() + dayOffset)
        clickTime.setHours(hour, 0, 0, 0)
        setSelectedUnit(unit)
        setSelectedSlotTime(clickTime)
        setReservationSheetOpen(true)
    }

    const handleBookingClick = (booking: Booking) => {
        setSelectedBooking(booking)
        setDetailOpen(true)
    }

    const handleSuccess = () => {
        setReservationSheetOpen(false)
        setDetailOpen(false)
        setSelectedBooking(null)
        setSelectedUnit(null)
        setSelectedSlotTime(null)
        fetchBookings()
    }

    // Build day headers
    const days = useMemo(() => {
        const result = []
        for (let i = 0; i < DAYS_TO_SHOW; i++) {
            const d = new Date(startDate)
            d.setDate(d.getDate() + i)
            result.push(d)
        }
        return result
    }, [startDate])

    const totalWidth = DAYS_TO_SHOW * HOURS_IN_DAY * CELL_WIDTH

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateDays(-7)}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={goToToday}
                        className="h-8 gap-1.5 text-xs"
                    >
                        <CalendarDays className="h-3.5 w-3.5" />
                        Today
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigateDays(7)}
                        className="h-8 w-8 p-0"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="ml-2 text-sm font-medium text-slate-600">
                        {dayLabel(startDate)} — {dayLabel(days[days.length - 1])}
                    </span>
                </div>

                <Button
                    size="sm"
                    onClick={() => {
                        setSelectedUnit(null)
                        setSelectedSlotTime(null)
                        setReservationSheetOpen(true)
                    }}
                    className="h-8 gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                >
                    <Plus className="h-3.5 w-3.5" />
                    New Reservation
                </Button>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-6 rounded bg-blue-500" />
                    Confirmed
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-6 rounded bg-emerald-500" />
                    Checked In
                </span>
                <span className="flex items-center gap-1.5">
                    <span className="h-3 w-6 rounded border-2 border-dashed border-amber-400 bg-amber-100" />
                    Pending
                </span>
            </div>

            {/* Timeline Grid */}
            <div className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm">
                <div className="overflow-x-auto">
                    <div className="min-w-fit">
                        {/* Day headers */}
                        <div className="flex border-b border-slate-200 bg-slate-50/50">
                            <div className="w-24 min-w-24 border-r border-slate-200 bg-white sticky left-0 z-20" />
                            {days.map((day, di) => (
                                <div
                                    key={di}
                                    className="border-r border-slate-200 last:border-r-0 text-center"
                                    style={{
                                        width: HOURS_IN_DAY * CELL_WIDTH,
                                        minWidth: HOURS_IN_DAY * CELL_WIDTH,
                                    }}
                                >
                                    <div className={`py-2 text-xs font-semibold border-b border-slate-100 ${day.toDateString() === devNow.toDateString()
                                        ? 'text-blue-600 bg-blue-50/50'
                                        : 'text-slate-700'
                                        }`}>
                                        {dayLabel(day)}
                                    </div>
                                    {/* Hour markers */}
                                    <div className="flex">
                                        {Array.from({ length: HOURS_IN_DAY }, (_, h) => (
                                            <div
                                                key={h}
                                                className={`border-r border-slate-100 last:border-r-0 text-center text-[9px] text-slate-400 py-0.5 ${h % 6 === 0 ? 'font-medium' : ''
                                                    }`}
                                                style={{ width: CELL_WIDTH, minWidth: CELL_WIDTH }}
                                            >
                                                {h % 6 === 0 ? formatHour(h) : ''}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Room rows */}
                        {rooms.map((room) => {
                            const roomBookings = bookings.filter(
                                (b) => b.unit_id === room.id
                            )

                            return (
                                <div
                                    key={room.id}
                                    className="flex border-b border-slate-100 last:border-b-0 group hover:bg-slate-50/50"
                                    style={{ height: ROW_HEIGHT }}
                                >
                                    {/* Room label */}
                                    <div className="w-24 min-w-24 border-r border-slate-200 flex items-center justify-center bg-white sticky left-0 z-20">
                                        <span className="text-sm font-bold text-slate-800">
                                            {room.unit_number}
                                        </span>
                                    </div>

                                    {/* Timeline area */}
                                    <div
                                        className="relative flex-1"
                                        style={{ width: totalWidth, minWidth: totalWidth }}
                                    >
                                        {/* Hour grid lines */}
                                        {days.map((_, di) =>
                                            Array.from({ length: HOURS_IN_DAY }, (_, h) => (
                                                <div
                                                    key={`${di}-${h}`}
                                                    className="absolute top-0 bottom-0 border-r border-slate-100/50 cursor-pointer hover:bg-blue-50/30 transition-colors"
                                                    style={{
                                                        left:
                                                            (di * HOURS_IN_DAY + h) *
                                                            CELL_WIDTH,
                                                        width: CELL_WIDTH,
                                                    }}
                                                    onClick={() =>
                                                        handleSlotClick(room, di, h)
                                                    }
                                                />
                                            ))
                                        )}

                                        {/* Booking bars */}
                                        {roomBookings.map((booking) => {
                                            const style = getBookingStyle(booking)
                                            if (!style) return null

                                            const statusColors =
                                                STATUS_COLORS[booking.status] ||
                                                STATUS_COLORS.CONFIRMED

                                            const guestName =
                                                (booking as Booking & { guests?: { name: string }[] }).guests?.[0]
                                                    ?.name || 'Guest'

                                            return (
                                                <div
                                                    key={booking.id}
                                                    className={`absolute top-2 bottom-2 rounded-md ${statusColors.bg} ${statusColors.border} border ${statusColors.text} flex items-center px-2 cursor-pointer hover:brightness-110 transition-all shadow-sm overflow-hidden z-10`}
                                                    style={{
                                                        left: style.left,
                                                        width: style.width,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        handleBookingClick(
                                                            booking
                                                        )
                                                    }}
                                                    title={`${guestName} · ${booking.status}`}
                                                >
                                                    <span className="text-[11px] font-semibold truncate">
                                                        {guestName}
                                                    </span>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>
                            )
                        })}

                        {rooms.length === 0 && (
                            <div className="flex items-center justify-center py-12 text-sm text-slate-400">
                                No rooms found
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Sheets */}
            <ReservationSheet
                unit={selectedUnit}
                defaultCheckIn={selectedSlotTime}
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
