'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    CalendarDays,
    Clock,
    Users,
    CheckCircle2,
    Ban,
    ChevronDown,
    ChevronUp,
    Phone,
    CreditCard,
    FileText,
} from 'lucide-react'
import type { Booking, Guest } from '@/lib/types'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

// Extended booking type with cross-hotel joins
interface BookingWithHotel extends Booking {
    hotel_name?: string
    unit_number?: string
    unit_type?: string
    unit_hotel_id?: string
}

function toDateString(d: Date): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

function todayIST(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

export function ReservationsOverview({ hotelId, hotels, staffId }: AdminTabProps) {
    const [bookings, setBookings] = useState<BookingWithHotel[]>([])
    const [loading, setLoading] = useState(false)
    const [cancelling, setCancelling] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)

    // Date range: default today to 7 days out
    const [fromDate, setFromDate] = useState(() => todayIST())
    const [toDate, setToDate] = useState(() => {
        const d = new Date()
        d.setDate(d.getDate() + 7)
        return toDateString(d)
    })

    const today = todayIST()

    // Fetch bookings
    const fetchBookings = useCallback(async () => {
        setLoading(true)
        try {
            const query = supabase
                .from('bookings')
                .select('*, guests(name, phone, aadhar_number, aadhar_url_front, aadhar_url_back), unit:units(unit_number, type, hotel_id, hotel:hotels(name))')
                .in('status', ['PENDING', 'CONFIRMED'])
                .gte('check_in', fromDate + 'T00:00:00+05:30')
                .lte('check_in', toDate + 'T23:59:59.999+05:30')
                .order('check_in', { ascending: true })

            const { data } = await query

            if (data) {
                // Transform to flat structure with hotel name
                const transformed: BookingWithHotel[] = (data as Array<Record<string, unknown>>).map((b) => {
                    const unit = b.unit as Record<string, unknown> | null
                    const unitHotel = unit?.hotel as { name: string } | null
                    const unitHotelId = (unit?.hotel_id as string) ?? ''

                    return {
                        ...b,
                        hotel_name: unitHotel?.name ?? 'Unknown',
                        unit_number: (unit?.unit_number as string) ?? '',
                        unit_type: (unit?.type as string) ?? '',
                        unit_hotel_id: unitHotelId,
                        guests: b.guests as Guest[] | undefined,
                    } as BookingWithHotel
                })

                // Apply hotel filter client-side through the unit join
                const filtered = hotelId
                    ? transformed.filter(b => b.unit_hotel_id === hotelId)
                    : transformed

                setBookings(filtered)
            }
        } catch (err) {
            console.error('Failed to fetch reservations:', err)
        } finally {
            setLoading(false)
        }
    }, [hotelId, fromDate, toDate])

    useEffect(() => {
        fetchBookings()
    }, [fetchBookings])

    // Realtime: bookings
    useEffect(() => {
        const channel = supabase
            .channel(`admin_bookings_${hotelId ?? 'all'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'bookings',
            }, () => {
                fetchBookings()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [hotelId, fetchBookings])

    // Cancel reservation
    const handleCancel = async (bookingId: string) => {
        setCancelling(bookingId)
        try {
            const res = await fetch('/api/reservations/cancel', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookingId, action: 'cancel' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(json.message || 'Reservation cancelled')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to cancel reservation')
        } finally {
            setCancelling(null)
        }
    }

    // Computed counts
    const pendingCount = bookings.filter(b => b.status === 'PENDING').length
    const confirmedCount = bookings.filter(b => b.status === 'CONFIRMED').length
    const todayArrivalCount = bookings.filter(b => {
        const checkInDate = b.check_in ? b.check_in.substring(0, 10) : ''
        return checkInDate === today
    }).length

    // Group IDs that appear more than once
    const groupIds = new Set<string>()
    const seenGroups = new Map<string, number>()
    for (const b of bookings) {
        if (b.group_id) {
            seenGroups.set(b.group_id, (seenGroups.get(b.group_id) ?? 0) + 1)
        }
    }
    for (const [gid, count] of seenGroups) {
        if (count > 1) groupIds.add(gid)
    }

    const isTodayArrival = (checkIn: string): boolean => {
        return checkIn.substring(0, 10) === today
    }

    return (
        <div className="space-y-5">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-amber-100 bg-white">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending</p>
                                <p className="text-3xl font-bold text-amber-600 mt-1">{pendingCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
                                <Clock className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-blue-100 bg-white">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Confirmed</p>
                                <p className="text-3xl font-bold text-blue-600 mt-1">{confirmedCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-blue-50 flex items-center justify-center">
                                <CheckCircle2 className="h-6 w-6 text-blue-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-emerald-100 bg-white">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{"Today's Arrivals"}</p>
                                <p className="text-3xl font-bold text-emerald-600 mt-1">{todayArrivalCount}</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-emerald-50 flex items-center justify-center">
                                <CalendarDays className="h-6 w-6 text-emerald-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Date Range Filter */}
            <div className="flex items-center gap-3 bg-white border border-slate-200 rounded-xl px-4 py-3 shadow-sm flex-wrap">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <label className="text-xs font-semibold text-slate-500">From</label>
                <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <label className="text-xs font-semibold text-slate-500">To</label>
                <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    className="h-8 rounded-lg border border-slate-200 px-3 text-xs text-slate-600 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
                <span className="text-xs text-slate-400 ml-auto">{bookings.length} reservations</span>
            </div>

            {/* Reservations List */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
                </div>
            ) : bookings.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <CalendarDays className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">No reservations found for the selected date range.</p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {bookings.map(b => {
                        const todayArr = isTodayArrival(b.check_in)
                        const isExpanded = expandedId === b.id
                        const isGroupBooking = b.group_id && groupIds.has(b.group_id)
                        const guestName = b.guests?.[0]?.name ?? 'Guest'
                        const guestPhone = b.guests?.[0]?.phone ?? ''

                        return (
                            <div
                                key={b.id}
                                className={`rounded-xl border overflow-hidden transition-all ${
                                    todayArr
                                        ? 'bg-amber-50/60 border-amber-200'
                                        : 'bg-white border-slate-200'
                                }`}
                            >
                                {/* Main row */}
                                <div className="px-4 py-3">
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 flex-1 min-w-0 flex-wrap">
                                            {/* Hotel */}
                                            {!hotelId && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 flex-shrink-0">
                                                    {b.hotel_name}
                                                </span>
                                            )}
                                            {/* Unit */}
                                            <span className="text-sm font-bold text-slate-800 flex-shrink-0">
                                                {b.unit_number || 'N/A'}
                                            </span>
                                            {/* Group badge */}
                                            {isGroupBooking && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 flex-shrink-0">
                                                    Group
                                                </span>
                                            )}
                                            {/* Today badge */}
                                            {todayArr && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800 flex-shrink-0">
                                                    Today
                                                </span>
                                            )}
                                            {/* Guest info */}
                                            <span className="text-sm text-slate-700 truncate">
                                                <Users className="h-3 w-3 inline mr-1" />
                                                {guestName}
                                            </span>
                                            {guestPhone && (
                                                <span className="text-xs text-slate-400 flex-shrink-0">
                                                    <Phone className="h-3 w-3 inline mr-0.5" />
                                                    {guestPhone}
                                                </span>
                                            )}
                                        </div>

                                        <div className="flex items-center gap-2 flex-shrink-0">
                                            {/* Dates */}
                                            <div className="text-right hidden sm:block">
                                                <p className="text-xs text-slate-500">
                                                    {new Date(b.check_in).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })}
                                                    {b.check_out && (
                                                        <span> - {new Date(b.check_out).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short' })}</span>
                                                    )}
                                                </p>
                                            </div>
                                            {/* Advance */}
                                            {Number(b.advance_amount) > 0 && (
                                                <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                                    {'\u20B9'}{Number(b.advance_amount).toLocaleString('en-IN')}
                                                </span>
                                            )}
                                            {/* Status badge */}
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                b.status === 'CONFIRMED'
                                                    ? 'bg-blue-100 text-blue-700'
                                                    : 'bg-amber-100 text-amber-700'
                                            }`}>
                                                {b.status}
                                            </span>
                                            {/* Expand */}
                                            <button
                                                onClick={() => setExpandedId(isExpanded ? null : b.id)}
                                                className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-slate-100 transition-colors"
                                            >
                                                {isExpanded
                                                    ? <ChevronUp className="h-4 w-4 text-slate-400" />
                                                    : <ChevronDown className="h-4 w-4 text-slate-400" />
                                                }
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Expanded details */}
                                {isExpanded && (
                                    <div className="px-4 pb-4 pt-1 border-t border-slate-100 space-y-3">
                                        {/* Booking details */}
                                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                                            <div>
                                                <p className="text-xs text-slate-400">Check-in</p>
                                                <p className="font-semibold text-slate-700">
                                                    {new Date(b.check_in).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400">Check-out</p>
                                                <p className="font-semibold text-slate-700">
                                                    {b.check_out
                                                        ? new Date(b.check_out).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
                                                        : '--'}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400">Grand Total</p>
                                                <p className="font-bold text-slate-900">
                                                    {'\u20B9'}{Number(b.grand_total).toLocaleString('en-IN')}
                                                </p>
                                            </div>
                                            <div>
                                                <p className="text-xs text-slate-400">Advance</p>
                                                <p className="font-semibold text-emerald-700">
                                                    {'\u20B9'}{Number(b.advance_amount).toLocaleString('en-IN')}
                                                    {b.advance_type && (
                                                        <span className="text-[10px] text-slate-400 ml-1">({b.advance_type})</span>
                                                    )}
                                                </p>
                                            </div>
                                        </div>

                                        {b.expected_arrival && (
                                            <div className="flex items-center gap-1.5 text-xs text-slate-500">
                                                <Clock className="h-3 w-3" />
                                                Expected arrival: <strong>{b.expected_arrival}</strong>
                                            </div>
                                        )}

                                        {b.notes && (
                                            <div className="flex items-start gap-1.5 text-xs text-slate-500">
                                                <FileText className="h-3 w-3 mt-0.5" />
                                                <span>{b.notes}</span>
                                            </div>
                                        )}

                                        {/* Guest list */}
                                        {(b.guests?.length ?? 0) > 0 && (
                                            <div className="space-y-1.5">
                                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Guests ({b.guests!.length})</p>
                                                {b.guests!.map((g, idx) => (
                                                    <div key={idx} className="flex items-center gap-3 bg-slate-50 rounded-lg px-3 py-2 text-sm">
                                                        <Users className="h-3.5 w-3.5 text-slate-400" />
                                                        <span className="font-semibold text-slate-700">{g.name}</span>
                                                        {g.phone && (
                                                            <span className="text-xs text-slate-400">
                                                                <Phone className="h-3 w-3 inline mr-0.5" />{g.phone}
                                                            </span>
                                                        )}
                                                        {g.aadhar_number ? (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                                                <CreditCard className="h-3 w-3 inline mr-0.5" />Aadhar
                                                            </span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                                                                No Aadhar
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        )}

                                        {/* Cancel action */}
                                        <div className="flex justify-end pt-2">
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => handleCancel(b.id)}
                                                disabled={cancelling === b.id}
                                                className="h-8 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                            >
                                                <Ban className="h-3 w-3 mr-1" />
                                                {cancelling === b.id ? 'Cancelling...' : 'Cancel Reservation'}
                                            </Button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}
