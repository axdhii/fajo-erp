'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Loader2,
    User,
    Phone,
    Calendar,
    IndianRupee,
    BedDouble,
    BedSingle,
    Hash,
    FileText,
} from 'lucide-react'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

// ============================================================
// Types
// ============================================================

interface GuestBooking {
    id: string
    unit_id: string
    check_in: string
    check_out: string | null
    grand_total: number
    status: string
    unit: { unit_number: string; hotel_id: string; type: string } | null
}

interface GuestRow {
    id: string
    booking_id: string
    name: string
    phone: string
    aadhar_number: string | null
    created_at: string
    booking: GuestBooking | null
}

/** Aggregated guest view — one entry per unique phone number */
interface AggregatedGuest {
    name: string
    phone: string
    aadhar_number: string | null
    totalStays: number
    totalRevenue: number
    lastStayDate: string | null
    lastUnitNumber: string | null
    stays: {
        bookingId: string
        unitNumber: string
        unitType: string
        checkIn: string
        checkOut: string | null
        amount: number
        status: string
    }[]
}

const PAGE_SIZE = 50

// ============================================================
// Component
// ============================================================

export function GuestHistory({ hotelId, hotels }: AdminTabProps) {
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [guests, setGuests] = useState<AggregatedGuest[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [expandedGuest, setExpandedGuest] = useState<string | null>(null) // phone as key
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Hotel lookup for display
    const hotelMap = new Map(hotels.map(h => [h.id, h.name]))

    // Debounce search input
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(searchQuery)
            setPage(0)
        }, 500)
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current)
        }
    }, [searchQuery])

    // Fetch guests
    const fetchGuests = useCallback(async () => {
        setLoading(true)
        try {
            // Build the query
            let query = supabase
                .from('guests')
                .select(
                    '*, booking:bookings(id, unit_id, check_in, check_out, grand_total, status, unit:units(unit_number, hotel_id, type))',
                    { count: 'exact' }
                )
                .order('created_at', { ascending: false })

            // Search filter
            if (debouncedSearch.trim()) {
                const s = `%${debouncedSearch.trim()}%`
                query = query.or(`name.ilike.${s},phone.ilike.${s},aadhar_number.ilike.${s}`)
            }

            // Date range filter — filter by booking check_in via the guests' created_at as proxy
            if (dateFrom) {
                query = query.gte('created_at', dateFrom + 'T00:00:00+05:30')
            }
            if (dateTo) {
                query = query.lte('created_at', dateTo + 'T23:59:59+05:30')
            }

            // Pagination
            query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

            const { data, count, error } = await query

            if (error) {
                console.error('Guest fetch error:', error)
                setGuests([])
                setTotalCount(0)
                return
            }

            const rows = (data || []) as unknown as GuestRow[]
            setTotalCount(count || 0)

            // Filter by hotel if needed
            let filtered = rows
            if (hotelId) {
                filtered = rows.filter(g => {
                    const booking = g.booking as GuestBooking | null
                    const unit = booking?.unit as { unit_number: string; hotel_id: string; type: string } | null
                    return unit?.hotel_id === hotelId
                })
            }

            // Aggregate by phone number
            const phoneMap = new Map<string, AggregatedGuest>()

            for (const row of filtered) {
                const booking = row.booking as GuestBooking | null
                const unit = booking?.unit as { unit_number: string; hotel_id: string; type: string } | null
                const key = row.phone || row.id // fallback to id if no phone

                let agg = phoneMap.get(key)
                if (!agg) {
                    agg = {
                        name: row.name,
                        phone: row.phone,
                        aadhar_number: row.aadhar_number,
                        totalStays: 0,
                        totalRevenue: 0,
                        lastStayDate: null,
                        lastUnitNumber: null,
                        stays: [],
                    }
                    phoneMap.set(key, agg)
                }

                if (booking) {
                    agg.totalStays += 1
                    agg.totalRevenue += Number(booking.grand_total) || 0

                    const checkIn = booking.check_in
                    if (!agg.lastStayDate || checkIn > agg.lastStayDate) {
                        agg.lastStayDate = checkIn
                        agg.lastUnitNumber = unit?.unit_number || '—'
                    }

                    agg.stays.push({
                        bookingId: booking.id,
                        unitNumber: unit?.unit_number || '—',
                        unitType: unit?.type || 'ROOM',
                        checkIn: booking.check_in,
                        checkOut: booking.check_out,
                        amount: Number(booking.grand_total) || 0,
                        status: booking.status,
                    })
                }

                // Use most recent name/aadhar
                if (row.name) agg.name = row.name
                if (row.aadhar_number) agg.aadhar_number = row.aadhar_number
            }

            // Sort stays within each guest by check_in descending
            for (const agg of phoneMap.values()) {
                agg.stays.sort((a, b) => new Date(b.checkIn).getTime() - new Date(a.checkIn).getTime())
            }

            setGuests(Array.from(phoneMap.values()))
        } finally {
            setLoading(false)
        }
    }, [debouncedSearch, hotelId, page, dateFrom, dateTo])

    useEffect(() => {
        fetchGuests()
    }, [fetchGuests])

    // Helpers
    const maskAadhar = (aadhar: string | null): string => {
        if (!aadhar) return '—'
        const digits = aadhar.replace(/\D/g, '')
        if (digits.length < 4) return '****'
        return '**** **** ' + digits.slice(-4)
    }

    const formatDate = (iso: string | null): string => {
        if (!iso) return '—'
        return new Date(iso).toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        })
    }

    const formatDateTime = (iso: string | null): string => {
        if (!iso) return '—'
        return new Date(iso).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        })
    }

    const statusColor = (status: string): string => {
        switch (status) {
            case 'CHECKED_IN': return 'bg-red-100 text-red-700 border-red-200'
            case 'CHECKED_OUT': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
            case 'CANCELLED': return 'bg-slate-100 text-slate-500 border-slate-200'
            case 'CONFIRMED': return 'bg-blue-100 text-blue-700 border-blue-200'
            default: return 'bg-slate-100 text-slate-600 border-slate-200'
        }
    }

    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    const showingFrom = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
    const showingTo = Math.min((page + 1) * PAGE_SIZE, totalCount)

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {/* Search + Filters */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, phone, or Aadhar..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white"
                    />
                </div>
                <div className="flex gap-2">
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => { setDateFrom(e.target.value); setPage(0) }}
                        className="w-36 bg-white text-xs"
                        title="From date"
                    />
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => { setDateTo(e.target.value); setPage(0) }}
                        className="w-36 bg-white text-xs"
                        title="To date"
                    />
                </div>
            </div>

            {/* Results */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    <span className="ml-2 text-sm text-slate-400">Loading guests...</span>
                </div>
            ) : guests.length === 0 ? (
                <div className="text-center py-20">
                    <User className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-400">
                        {debouncedSearch ? 'No guests match your search.' : 'No guest records found.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {guests.map((guest) => {
                        const isExpanded = expandedGuest === guest.phone
                        return (
                            <div
                                key={guest.phone}
                                className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all"
                            >
                                {/* Guest Summary Row */}
                                <button
                                    onClick={() => setExpandedGuest(isExpanded ? null : guest.phone)}
                                    className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-4 min-w-0 flex-1">
                                        {/* Name + Phone + Aadhar */}
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-bold text-sm text-slate-900 truncate">
                                                    {guest.name}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                                    <Phone className="h-3 w-3" />
                                                    {guest.phone || '—'}
                                                </span>
                                                <span className="flex items-center gap-1 text-[11px] text-slate-400">
                                                    <Hash className="h-3 w-3" />
                                                    {maskAadhar(guest.aadhar_number)}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="h-3 w-3" />
                                                    {guest.totalStays} stay{guest.totalStays !== 1 ? 's' : ''}
                                                </span>
                                                <span className="flex items-center gap-1 font-semibold text-emerald-600">
                                                    <IndianRupee className="h-3 w-3" />
                                                    {guest.totalRevenue.toLocaleString('en-IN')}
                                                </span>
                                                {guest.lastStayDate && (
                                                    <span className="text-slate-400">
                                                        Last: {formatDate(guest.lastStayDate)} in {guest.lastUnitNumber}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {isExpanded
                                        ? <ChevronUp className="h-4 w-4 text-slate-400 shrink-0" />
                                        : <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                                    }
                                </button>

                                {/* Expanded Stay History */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-3">
                                        <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                            Stay History
                                        </h4>
                                        {guest.stays.length === 0 ? (
                                            <p className="text-xs text-slate-400 py-2">No booking records.</p>
                                        ) : (
                                            <div className="space-y-1.5">
                                                {guest.stays.map((stay) => (
                                                    <div
                                                        key={stay.bookingId}
                                                        className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-slate-100 text-xs"
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            {stay.unitType === 'DORM'
                                                                ? <BedSingle className="h-3.5 w-3.5 text-slate-400" />
                                                                : <BedDouble className="h-3.5 w-3.5 text-slate-400" />
                                                            }
                                                            <span className="font-bold text-slate-800">
                                                                {stay.unitNumber}
                                                            </span>
                                                            <span className="text-slate-400">
                                                                {formatDateTime(stay.checkIn)}
                                                                {' → '}
                                                                {stay.checkOut ? formatDateTime(stay.checkOut) : 'Active'}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-700">
                                                                ₹{stay.amount.toLocaleString('en-IN')}
                                                            </span>
                                                            <Badge
                                                                variant="outline"
                                                                className={`text-[9px] font-bold px-1.5 py-0 ${statusColor(stay.status)}`}
                                                            >
                                                                {stay.status.replace('_', ' ')}
                                                            </Badge>
                                                            <a
                                                                href={`/invoice/${stay.bookingId}`}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                onClick={(e) => e.stopPropagation()}
                                                                className="text-blue-500 hover:text-blue-700"
                                                                title="View Invoice"
                                                            >
                                                                <FileText className="h-3.5 w-3.5" />
                                                            </a>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Pagination */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-400">
                        Showing {showingFrom}–{showingTo} of {totalCount}
                    </p>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="h-8 text-xs"
                        >
                            <ChevronLeft className="h-3.5 w-3.5 mr-1" />
                            Previous
                        </Button>
                        <span className="text-xs text-slate-500 font-medium px-2">
                            {page + 1} / {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="h-8 text-xs"
                        >
                            Next
                            <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                    </div>
                </div>
            )}
        </div>
    )
}
