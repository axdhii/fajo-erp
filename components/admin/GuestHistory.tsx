'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Search,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    ChevronUp,
    Loader2,
    User,
    Phone,
    BedDouble,
    BedSingle,
    FileText,
    ImageIcon,
    Copy,
    CreditCard,
    Banknote,
    ArrowRightLeft,
    X,
    StickyNote,
    Moon,
} from 'lucide-react'
import { toast } from 'sonner'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

// ============================================================
// Types
// ============================================================

interface BookingRow {
    id: string
    check_in: string
    check_out: string | null
    grand_total: number
    status: string
    advance_amount: number | null
    advance_type: string | null
    group_id: string | null
    notes: string | null
    unit: { unit_number: string; type: string; hotel_id: string }
    guests: {
        id: string
        name: string
        phone: string
        aadhar_number: string | null
        aadhar_url_front: string | null
        aadhar_url_back: string | null
    }[]
    payments: {
        amount_cash: number
        amount_digital: number
        total_paid: number
    }[]
}

const PAGE_SIZE = 50

const STATUS_OPTIONS = ['ALL', 'CHECKED_IN', 'CHECKED_OUT', 'CONFIRMED', 'CANCELLED', 'PENDING'] as const

// ============================================================
// Helpers
// ============================================================

function statusBadgeClass(status: string): string {
    switch (status) {
        case 'CHECKED_IN':  return 'bg-emerald-100 text-emerald-700 border-emerald-200'
        case 'CHECKED_OUT': return 'bg-slate-100 text-slate-600 border-slate-200'
        case 'CONFIRMED':   return 'bg-blue-100 text-blue-700 border-blue-200'
        case 'CANCELLED':   return 'bg-red-100 text-red-700 border-red-200'
        case 'PENDING':     return 'bg-amber-100 text-amber-700 border-amber-200'
        default:            return 'bg-slate-100 text-slate-500 border-slate-200'
    }
}

function paymentStatusBadgeClass(s: string): string {
    switch (s) {
        case 'Paid':    return 'bg-emerald-100 text-emerald-700 border-emerald-200'
        case 'Partial': return 'bg-amber-100 text-amber-700 border-amber-200'
        case 'Unpaid':  return 'bg-red-100 text-red-700 border-red-200'
        default:        return 'bg-slate-100 text-slate-500 border-slate-200'
    }
}

function formatDateIST(iso: string | null): string {
    if (!iso) return '\u2014'
    return new Date(iso).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

function formatDateTimeIST(iso: string | null): string {
    if (!iso) return '\u2014'
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function derivePaymentMethod(b: BookingRow): string {
    const p = b.payments?.[0]
    if (!p || p.total_paid === 0) return 'Unpaid'
    if (p.amount_cash > 0 && p.amount_digital > 0) return 'Split'
    if (p.amount_digital > 0) return 'Digital'
    return 'Cash'
}

function derivePaymentStatus(b: BookingRow): string {
    const p = b.payments?.[0]
    if (!p || p.total_paid === 0) return 'Unpaid'
    if (p.total_paid >= Number(b.grand_total)) return 'Paid'
    return 'Partial'
}

function deriveNights(b: BookingRow): string | number {
    if (!b.check_out) return 'Active'
    return Math.max(1, Math.ceil(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
    ))
}

function deriveAadharStatus(b: BookingRow): 'Available' | 'Archived' | 'None' {
    const hasAadhar = b.guests.some(
        g => g.aadhar_url_front && !g.aadhar_url_front.startsWith('ARCHIVED:')
    )
    if (hasAadhar) return 'Available'
    const archivedAadhar = b.guests.some(
        g => g.aadhar_url_front?.startsWith('ARCHIVED:')
    )
    if (archivedAadhar) return 'Archived'
    return 'None'
}

function PaymentMethodIcon({ method }: { method: string }) {
    switch (method) {
        case 'Cash':    return <Banknote className="h-3 w-3" />
        case 'Digital': return <CreditCard className="h-3 w-3" />
        case 'Split':   return <ArrowRightLeft className="h-3 w-3" />
        default:        return null
    }
}

// ============================================================
// Component
// ============================================================

export function GuestHistory({ hotelId, hotels }: AdminTabProps) {
    const [bookings, setBookings] = useState<BookingRow[]>([])
    const [totalCount, setTotalCount] = useState(0)
    const [page, setPage] = useState(0)
    const [loading, setLoading] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedSearch, setDebouncedSearch] = useState('')
    const [dateFrom, setDateFrom] = useState('')
    const [dateTo, setDateTo] = useState('')
    const [statusFilter, setStatusFilter] = useState('ALL')
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const [signedUrls, setSignedUrls] = useState<Record<string, string>>({})
    const [enlargedPhoto, setEnlargedPhoto] = useState<{ front: string | null; back: string | null } | null>(null)

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // --------------------------------------------------------
    // Signed URL helper (1hr cache in state)
    // --------------------------------------------------------
    const getSignedUrl = useCallback(async (path: string): Promise<string | null> => {
        if (!path || path.startsWith('LOCAL:') || path.startsWith('ARCHIVED:')) return null
        if (signedUrls[path]) return signedUrls[path]

        const { data } = await supabase.storage
            .from('aadhars')
            .createSignedUrl(path, 3600)

        if (data?.signedUrl) {
            setSignedUrls(prev => ({ ...prev, [path]: data.signedUrl }))
            return data.signedUrl
        }
        return null
    }, [signedUrls])

    // Generate a 24hr signed URL for copy-to-clipboard
    const generate24hUrl = useCallback(async (path: string): Promise<string | null> => {
        if (!path || path.startsWith('LOCAL:') || path.startsWith('ARCHIVED:')) return null
        const { data } = await supabase.storage
            .from('aadhars')
            .createSignedUrl(path, 86400)
        return data?.signedUrl || null
    }, [])

    // --------------------------------------------------------
    // Debounce search
    // --------------------------------------------------------
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

    // --------------------------------------------------------
    // Fetch bookings
    // --------------------------------------------------------
    const fetchBookings = useCallback(async () => {
        setLoading(true)
        try {
            // Step 1: If search query exists, find matching booking IDs via guests + units
            let matchedBookingIds: string[] | null = null

            if (debouncedSearch.trim()) {
                const term = debouncedSearch.trim()
                const s = `%${term}%`

                // Search guests by name or phone
                const { data: guestMatches } = await supabase
                    .from('guests')
                    .select('booking_id')
                    .or(`name.ilike.${s},phone.ilike.${s}`)

                const guestBookingIds = (guestMatches || []).map(g => g.booking_id)

                // Search units by unit_number
                const { data: unitMatches } = await supabase
                    .from('units')
                    .select('id')
                    .ilike('unit_number', s)

                let unitBookingIds: string[] = []
                if (unitMatches && unitMatches.length > 0) {
                    const unitIds = unitMatches.map(u => u.id)
                    const { data: unitBookings } = await supabase
                        .from('bookings')
                        .select('id')
                        .in('unit_id', unitIds)
                    unitBookingIds = (unitBookings || []).map(b => b.id)
                }

                matchedBookingIds = [...new Set([...guestBookingIds, ...unitBookingIds])]

                if (matchedBookingIds.length === 0) {
                    setBookings([])
                    setTotalCount(0)
                    setLoading(false)
                    return
                }
            }

            // Step 2: Main bookings query
            let query = supabase
                .from('bookings')
                .select(`
                    id, unit_id, check_in, check_out, guest_count, base_amount, surcharge,
                    grand_total, status, notes, advance_amount, advance_type, group_id, created_at,
                    unit:units!inner(id, unit_number, type, hotel_id),
                    guests(id, name, phone, aadhar_number, aadhar_url_front, aadhar_url_back),
                    payments(id, amount_cash, amount_digital, total_paid)
                `, { count: 'exact' })
                .order('check_in', { ascending: false })

            // Filter: hotel
            if (hotelId) {
                query = query.eq('unit.hotel_id', hotelId)
            }

            // Filter: date range on check_in
            if (dateFrom) {
                query = query.gte('check_in', dateFrom + 'T00:00:00+05:30')
            }
            if (dateTo) {
                query = query.lte('check_in', dateTo + 'T23:59:59+05:30')
            }

            // Filter: status
            if (statusFilter !== 'ALL') {
                query = query.eq('status', statusFilter)
            }

            // Filter: search results
            if (matchedBookingIds) {
                query = query.in('id', matchedBookingIds)
            }

            // Pagination
            query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

            const { data, count, error } = await query

            if (error) {
                console.error('Bookings fetch error:', error)
                setBookings([])
                setTotalCount(0)
                return
            }

            setBookings((data || []) as unknown as BookingRow[])
            setTotalCount(count || 0)
        } finally {
            setLoading(false)
        }
    }, [debouncedSearch, hotelId, page, dateFrom, dateTo, statusFilter])

    useEffect(() => {
        fetchBookings()
    }, [fetchBookings])

    // --------------------------------------------------------
    // Expand handler — pre-load signed URLs for all guests
    // --------------------------------------------------------
    const handleExpand = useCallback(async (booking: BookingRow) => {
        const nextId = expandedId === booking.id ? null : booking.id
        setExpandedId(nextId)

        if (nextId) {
            for (const guest of booking.guests) {
                if (guest.aadhar_url_front && !guest.aadhar_url_front.startsWith('LOCAL:') && !guest.aadhar_url_front.startsWith('ARCHIVED:')) {
                    getSignedUrl(guest.aadhar_url_front)
                }
                if (guest.aadhar_url_back && !guest.aadhar_url_back.startsWith('LOCAL:') && !guest.aadhar_url_back.startsWith('ARCHIVED:')) {
                    getSignedUrl(guest.aadhar_url_back)
                }
            }
        }
    }, [expandedId, getSignedUrl])

    // --------------------------------------------------------
    // Copy 24hr link handler
    // --------------------------------------------------------
    const handleCopyLink = useCallback(async (path: string) => {
        const url = await generate24hUrl(path)
        if (url) {
            await navigator.clipboard.writeText(url)
            toast.success('Link copied \u2014 valid for 24 hours')
        } else {
            toast.error('Could not generate link')
        }
    }, [generate24hUrl])

    // --------------------------------------------------------
    // Pagination derived
    // --------------------------------------------------------
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    const showingFrom = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
    const showingTo = Math.min((page + 1) * PAGE_SIZE, totalCount)

    // --------------------------------------------------------
    // Render
    // --------------------------------------------------------
    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {/* ==================== Filter Bar ==================== */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, phone, or unit#..."
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
                <Select
                    value={statusFilter}
                    onValueChange={(v) => { setStatusFilter(v); setPage(0) }}
                >
                    <SelectTrigger className="w-44 bg-white text-xs">
                        <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                        {STATUS_OPTIONS.map(s => (
                            <SelectItem key={s} value={s} className="text-xs">
                                {s === 'ALL' ? 'All Statuses' : s.replace('_', ' ')}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            {/* ==================== Results ==================== */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    <span className="ml-2 text-sm text-slate-400">Loading bookings...</span>
                </div>
            ) : bookings.length === 0 ? (
                <div className="text-center py-20">
                    <User className="h-10 w-10 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm text-slate-400">
                        {debouncedSearch ? 'No bookings match your search.' : 'No booking records found.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-2">
                    {bookings.map((b) => {
                        const isExpanded = expandedId === b.id
                        const payment = b.payments?.[0]
                        const paymentMethod = derivePaymentMethod(b)
                        const paymentStatus = derivePaymentStatus(b)
                        const nights = deriveNights(b)
                        const aadharStatus = deriveAadharStatus(b)
                        const guestNames = b.guests.map(g => g.name).join(', ') || '\u2014'
                        const guestPhones = [...new Set(b.guests.map(g => g.phone).filter(Boolean))].join(', ') || '\u2014'
                        const unitType = b.unit?.type || 'ROOM'

                        return (
                            <div
                                key={b.id}
                                className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all"
                            >
                                {/* ========== Collapsed Row ========== */}
                                <button
                                    onClick={() => handleExpand(b)}
                                    className="w-full px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors text-left"
                                >
                                    {/* Line 1: Unit icon + unit_number + type badge + check-in date */}
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {unitType === 'DORM'
                                            ? <BedSingle className="h-4 w-4 text-violet-500" />
                                            : <BedDouble className="h-4 w-4 text-emerald-500" />
                                        }
                                        <span className="font-bold text-sm text-slate-900">
                                            {b.unit?.unit_number || '\u2014'}
                                        </span>
                                        <Badge
                                            variant="outline"
                                            className={`text-[9px] font-bold px-1.5 py-0 ${
                                                unitType === 'DORM'
                                                    ? 'bg-violet-50 text-violet-600 border-violet-200'
                                                    : 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                            }`}
                                        >
                                            {unitType}
                                        </Badge>
                                        <span className="text-[11px] text-slate-400 ml-auto">
                                            {formatDateIST(b.check_in)}
                                        </span>
                                    </div>

                                    {/* Line 2: Guest names + phones */}
                                    <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-600">
                                        <span className="flex items-center gap-1 truncate">
                                            <User className="h-3 w-3 text-slate-400 shrink-0" />
                                            {guestNames}
                                        </span>
                                        <span className="flex items-center gap-1 text-slate-400 shrink-0">
                                            <Phone className="h-3 w-3" />
                                            {guestPhones}
                                        </span>
                                    </div>

                                    {/* Line 3: Check-in -> Check-out + nights */}
                                    <div className="flex items-center gap-2 mt-1 text-[11px] text-slate-500">
                                        <span>
                                            {formatDateTimeIST(b.check_in)}
                                            {' \u2192 '}
                                            {b.check_out ? formatDateTimeIST(b.check_out) : 'Active'}
                                        </span>
                                        <span className="flex items-center gap-0.5 text-slate-400">
                                            <Moon className="h-3 w-3" />
                                            {typeof nights === 'number' ? `${nights}N` : nights}
                                        </span>
                                    </div>

                                    {/* Line 4: Amount + badges + aadhar dot + chevron */}
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span className="font-semibold text-xs text-slate-800">
                                            {'\u20B9'}{Number(b.grand_total).toLocaleString('en-IN')}
                                        </span>

                                        {paymentMethod !== 'Unpaid' && (
                                            <Badge
                                                variant="outline"
                                                className="text-[9px] font-bold px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200 flex items-center gap-0.5"
                                            >
                                                <PaymentMethodIcon method={paymentMethod} />
                                                {paymentMethod}
                                            </Badge>
                                        )}

                                        <Badge
                                            variant="outline"
                                            className={`text-[9px] font-bold px-1.5 py-0 ${paymentStatusBadgeClass(paymentStatus)}`}
                                        >
                                            {paymentStatus}
                                        </Badge>

                                        <Badge
                                            variant="outline"
                                            className={`text-[9px] font-bold px-1.5 py-0 ${statusBadgeClass(b.status)}`}
                                        >
                                            {b.status.replace('_', ' ')}
                                        </Badge>

                                        {aadharStatus === 'Available' && (
                                            <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" title="Aadhar available" />
                                        )}
                                        {aadharStatus === 'Archived' && (
                                            <span className="inline-block h-2 w-2 rounded-full bg-amber-400" title="Aadhar archived" />
                                        )}

                                        <span className="ml-auto">
                                            {isExpanded
                                                ? <ChevronUp className="h-4 w-4 text-slate-400" />
                                                : <ChevronDown className="h-4 w-4 text-slate-400" />
                                            }
                                        </span>
                                    </div>
                                </button>

                                {/* ========== Expanded Details ========== */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-4">
                                        {/* --- Guest Cards --- */}
                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                Guests ({b.guests.length})
                                            </h4>
                                            {b.guests.length === 0 ? (
                                                <p className="text-xs text-slate-400">No guest records.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {b.guests.map((guest) => {
                                                        const frontPath = guest.aadhar_url_front
                                                        const backPath = guest.aadhar_url_back
                                                        const frontAvailable = !!(frontPath && !frontPath.startsWith('LOCAL:') && !frontPath.startsWith('ARCHIVED:'))
                                                        const backAvailable = !!(backPath && !backPath.startsWith('LOCAL:') && !backPath.startsWith('ARCHIVED:'))
                                                        const frontArchived = !!frontPath?.startsWith('ARCHIVED:')
                                                        const backArchived = !!backPath?.startsWith('ARCHIVED:')
                                                        const allArchived = (frontArchived || !frontPath) && (backArchived || !backPath) && (frontArchived || backArchived)

                                                        return (
                                                            <div
                                                                key={guest.id}
                                                                className="bg-white rounded-lg border border-slate-100 px-3 py-2.5"
                                                            >
                                                                <div className="flex items-start justify-between gap-3 flex-wrap">
                                                                    {/* Guest info */}
                                                                    <div className="min-w-0">
                                                                        <p className="text-sm font-semibold text-slate-800">{guest.name}</p>
                                                                        <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                                            <Phone className="h-3 w-3" />
                                                                            {guest.phone || '\u2014'}
                                                                        </p>
                                                                        {guest.aadhar_number && (
                                                                            <p className="text-[11px] text-slate-400 mt-0.5">
                                                                                Aadhar: ****{guest.aadhar_number.replace(/\D/g, '').slice(-4)}
                                                                            </p>
                                                                        )}
                                                                    </div>

                                                                    {/* Aadhar photo buttons */}
                                                                    <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                                                                        {/* Front */}
                                                                        {frontAvailable ? (
                                                                            <div className="flex items-center gap-0.5">
                                                                                <button
                                                                                    onClick={async (e) => {
                                                                                        e.stopPropagation()
                                                                                        const fUrl = await getSignedUrl(frontPath!)
                                                                                        const bUrl = backAvailable ? await getSignedUrl(backPath!) : null
                                                                                        if (fUrl) setEnlargedPhoto({ front: fUrl, back: bUrl })
                                                                                    }}
                                                                                    className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                                                                                    title="View Aadhar front"
                                                                                >
                                                                                    {signedUrls[frontPath!] ? (
                                                                                        <img
                                                                                            src={signedUrls[frontPath!]}
                                                                                            alt="Front"
                                                                                            className="w-5 h-4 object-cover rounded"
                                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                                                                        />
                                                                                    ) : (
                                                                                        <ImageIcon className="h-3 w-3" />
                                                                                    )}
                                                                                    Front
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleCopyLink(frontPath!) }}
                                                                                    className="text-[10px] text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                                                                                    title="Copy 24hr link (front)"
                                                                                >
                                                                                    <Copy className="h-3 w-3" />
                                                                                </button>
                                                                            </div>
                                                                        ) : frontArchived ? (
                                                                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Front: Archived</span>
                                                                        ) : (
                                                                            <span className="text-[10px] text-slate-400">Front: Not captured</span>
                                                                        )}

                                                                        {/* Back */}
                                                                        {backAvailable ? (
                                                                            <div className="flex items-center gap-0.5">
                                                                                <button
                                                                                    onClick={async (e) => {
                                                                                        e.stopPropagation()
                                                                                        const bUrl = await getSignedUrl(backPath!)
                                                                                        const fUrl = frontAvailable ? await getSignedUrl(frontPath!) : null
                                                                                        if (bUrl) setEnlargedPhoto({ front: fUrl, back: bUrl })
                                                                                    }}
                                                                                    className="flex items-center gap-1 text-[10px] text-violet-600 hover:text-violet-800 bg-violet-50 hover:bg-violet-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                                                                                    title="View Aadhar back"
                                                                                >
                                                                                    {signedUrls[backPath!] ? (
                                                                                        <img
                                                                                            src={signedUrls[backPath!]}
                                                                                            alt="Back"
                                                                                            className="w-5 h-4 object-cover rounded"
                                                                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                                                                                        />
                                                                                    ) : (
                                                                                        <ImageIcon className="h-3 w-3" />
                                                                                    )}
                                                                                    Back
                                                                                </button>
                                                                                <button
                                                                                    onClick={(e) => { e.stopPropagation(); handleCopyLink(backPath!) }}
                                                                                    className="text-[10px] text-slate-400 hover:text-slate-600 p-1 rounded cursor-pointer"
                                                                                    title="Copy 24hr link (back)"
                                                                                >
                                                                                    <Copy className="h-3 w-3" />
                                                                                </button>
                                                                            </div>
                                                                        ) : backArchived ? (
                                                                            <span className="text-[10px] text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Back: Archived</span>
                                                                        ) : (
                                                                            <span className="text-[10px] text-slate-400">Back: Not captured</span>
                                                                        )}

                                                                        {allArchived && (
                                                                            <Badge variant="outline" className="text-[9px] bg-amber-50 text-amber-600 border-amber-200 px-1.5 py-0">
                                                                                Archived
                                                                            </Badge>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            )}
                                        </div>

                                        {/* --- Payment Breakdown --- */}
                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                Payment Breakdown
                                            </h4>
                                            <div className="bg-white rounded-lg border border-slate-100 px-3 py-2.5">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                    <div>
                                                        <span className="text-slate-400">Cash</span>
                                                        <p className="font-semibold text-slate-800">
                                                            {'\u20B9'}{(payment?.amount_cash ?? 0).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Digital</span>
                                                        <p className="font-semibold text-slate-800">
                                                            {'\u20B9'}{(payment?.amount_digital ?? 0).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Total Paid</span>
                                                        <p className="font-semibold text-emerald-700">
                                                            {'\u20B9'}{(payment?.total_paid ?? 0).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Advance</span>
                                                        <p className="font-semibold text-slate-800">
                                                            {b.advance_amount
                                                                ? `\u20B9${Number(b.advance_amount).toLocaleString('en-IN')} (${b.advance_type || '\u2014'})`
                                                                : '\u2014'
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="mt-2 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                                                    <span className="text-slate-400">Grand Total</span>
                                                    <span className="font-bold text-slate-900">
                                                        {'\u20B9'}{Number(b.grand_total).toLocaleString('en-IN')}
                                                    </span>
                                                </div>
                                            </div>
                                        </div>

                                        {/* --- Notes --- */}
                                        {b.notes && (
                                            <div>
                                                <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                                                    Notes
                                                </h4>
                                                <div className="flex items-start gap-2 bg-white rounded-lg border border-slate-100 px-3 py-2 text-xs text-slate-600">
                                                    <StickyNote className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                                                    {b.notes}
                                                </div>
                                            </div>
                                        )}

                                        {/* --- Invoice Link + Group Badge --- */}
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={`/invoice/${b.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                <FileText className="h-3.5 w-3.5" />
                                                View Invoice
                                            </a>
                                            {b.group_id && (
                                                <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-violet-50 text-violet-600 border-violet-200">
                                                    Group Booking
                                                </Badge>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* ==================== Pagination ==================== */}
            {totalCount > 0 && (
                <div className="flex items-center justify-between pt-2">
                    <p className="text-xs text-slate-400">
                        Showing {showingFrom}{'\u2013'}{showingTo} of {totalCount}
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

            {/* ==================== Enlarged Aadhar Photo Modal ==================== */}
            {enlargedPhoto && (
                <div
                    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                    onClick={() => setEnlargedPhoto(null)}
                >
                    <div
                        className="bg-white rounded-2xl p-4 shadow-2xl max-w-4xl w-full"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <h3 className="text-sm font-semibold text-slate-800">Aadhar Card</h3>
                            <button
                                onClick={() => setEnlargedPhoto(null)}
                                className="text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {enlargedPhoto.front ? (
                                <div>
                                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Front</p>
                                    <img
                                        src={enlargedPhoto.front}
                                        alt="Aadhar Front"
                                        className="rounded-xl w-full object-contain max-h-[60vh]"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center bg-slate-50 rounded-xl min-h-[200px]">
                                    <p className="text-xs text-slate-400">Front not available</p>
                                </div>
                            )}
                            {enlargedPhoto.back ? (
                                <div>
                                    <p className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider mb-1">Back</p>
                                    <img
                                        src={enlargedPhoto.back}
                                        alt="Aadhar Back"
                                        className="rounded-xl w-full object-contain max-h-[60vh]"
                                    />
                                </div>
                            ) : (
                                <div className="flex items-center justify-center bg-slate-50 rounded-xl min-h-[200px]">
                                    <p className="text-xs text-slate-400">Back not available</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
