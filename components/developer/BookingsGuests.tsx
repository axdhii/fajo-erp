'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
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
    Pencil,
    Save,
    Ban,
    Trash2,
    FileText,
    StickyNote,
    Moon,
    CreditCard,
    Banknote,
    ArrowRightLeft,
    IndianRupee,
    CalendarDays,
    Users,
} from 'lucide-react'
import { toast } from 'sonner'

import type { DevTabProps as AdminTabProps } from '@/app/(dashboard)/developer/client'

// ============================================================
// Types
// ============================================================

interface GuestRow {
    id: string
    booking_id: string
    name: string
    phone: string
    aadhar_number: string | null
    aadhar_url_front: string | null
    aadhar_url_back: string | null
}

interface PaymentRow {
    id: string
    amount_cash: number
    amount_digital: number
    total_paid: number
    created_at: string
}

interface BookingRow {
    id: string
    unit_id: string
    check_in: string
    check_out: string | null
    guest_count: number
    base_amount: number
    surcharge: number
    grand_total: number
    status: string
    notes: string | null
    advance_amount: number | null
    advance_type: string | null
    group_id: string | null
    created_at: string
    unit: { unit_number: string; type: string; hotel_id: string }
    guests: GuestRow[]
    payments: PaymentRow[] | PaymentRow | null
}

const PAGE_SIZE = 50
const STATUS_OPTIONS = ['ALL', 'CHECKED_IN', 'CHECKED_OUT', 'CONFIRMED', 'CANCELLED', 'PENDING'] as const
const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED'] as const

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

function normalizePayments(p: BookingRow['payments']): PaymentRow[] {
    if (!p) return []
    if (Array.isArray(p)) return p
    return [p]
}

function deriveNights(b: BookingRow): string | number {
    if (!b.check_out) return 'Active'
    return Math.max(1, Math.ceil(
        (new Date(b.check_out).getTime() - new Date(b.check_in).getTime()) / 86400000
    ))
}

function derivePaymentMethod(b: BookingRow): string {
    const payments = normalizePayments(b.payments)
    const totalCash = payments.reduce((sum, p) => sum + Number(p.amount_cash || 0), 0)
    const totalDigital = payments.reduce((sum, p) => sum + Number(p.amount_digital || 0), 0)
    if (totalCash === 0 && totalDigital === 0) return 'Unpaid'
    if (totalCash > 0 && totalDigital > 0) return 'Split'
    return totalDigital > 0 ? 'Digital' : 'Cash'
}

function derivePaymentStatus(b: BookingRow): string {
    const payments = normalizePayments(b.payments)
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.total_paid || 0), 0) + Number(b.advance_amount || 0)
    if (totalPaid === 0) return 'Unpaid'
    if (totalPaid >= Number(b.grand_total)) return 'Paid'
    return 'Partial'
}

function paymentStatusBadgeClass(s: string): string {
    switch (s) {
        case 'Paid':    return 'bg-emerald-100 text-emerald-700 border-emerald-200'
        case 'Partial': return 'bg-amber-100 text-amber-700 border-amber-200'
        case 'Unpaid':  return 'bg-red-100 text-red-700 border-red-200'
        default:        return 'bg-slate-100 text-slate-500 border-slate-200'
    }
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

export function BookingsGuests({ hotelId, hotels }: AdminTabProps) {
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

    // Editing state
    const [editingBookingId, setEditingBookingId] = useState<string | null>(null)
    const [editBookingStatus, setEditBookingStatus] = useState('')
    const [editBookingNotes, setEditBookingNotes] = useState('')
    const [editBookingGrandTotal, setEditBookingGrandTotal] = useState('')

    const [editingGuestId, setEditingGuestId] = useState<string | null>(null)
    const [editGuestName, setEditGuestName] = useState('')
    const [editGuestPhone, setEditGuestPhone] = useState('')
    const [editGuestAadhar, setEditGuestAadhar] = useState('')

    // Delete guest confirmation
    const [deleteGuestTarget, setDeleteGuestTarget] = useState<GuestRow | null>(null)

    const [saving, setSaving] = useState(false)

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // ---- Debounce search ----
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

    // ---- Fetch bookings ----
    const fetchBookings = useCallback(async () => {
        setLoading(true)
        try {
            // Step 1: If search query, find matching booking IDs via guests + units
            let matchedBookingIds: string[] | null = null

            if (debouncedSearch.trim()) {
                const term = debouncedSearch.trim()
                const s = `%${term}%`

                const { data: guestMatches } = await supabase
                    .from('guests')
                    .select('booking_id')
                    .or(`name.ilike.${s},phone.ilike.${s}`)

                const guestBookingIds = (guestMatches || []).map(g => g.booking_id)

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
                    unit:units!inner(unit_number, type, hotel_id),
                    guests(id, booking_id, name, phone, aadhar_number, aadhar_url_front, aadhar_url_back),
                    payments(id, amount_cash, amount_digital, total_paid, created_at)
                `, { count: 'exact' })
                .order('check_in', { ascending: false })

            if (hotelId) {
                query = query.eq('unit.hotel_id', hotelId)
            }
            if (dateFrom) {
                query = query.gte('check_in', dateFrom + 'T00:00:00+05:30')
            }
            if (dateTo) {
                query = query.lte('check_in', dateTo + 'T23:59:59+05:30')
            }
            if (statusFilter !== 'ALL') {
                query = query.eq('status', statusFilter)
            }
            if (matchedBookingIds) {
                query = query.in('id', matchedBookingIds)
            }

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

    // Realtime: refresh on booking/guest changes
    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout>
        const debouncedFetch = () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => fetchBookings(), 2000)
        }

        const channel = supabase
            .channel(`admin_bookings_guests_${hotelId ?? 'all'}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'guests' }, debouncedFetch)
            .subscribe()

        return () => {
            clearTimeout(debounceTimer)
            supabase.removeChannel(channel)
        }
    }, [hotelId, fetchBookings])

    // ---- Booking CRUD ----
    const startEditingBooking = (b: BookingRow) => {
        setEditingBookingId(b.id)
        setEditBookingStatus(b.status)
        setEditBookingNotes(b.notes || '')
        setEditBookingGrandTotal(String(b.grand_total))
    }

    const handleSaveBooking = async (b: BookingRow) => {
        setSaving(true)
        try {
            const updateData: Record<string, unknown> = {
                status: editBookingStatus,
                notes: editBookingNotes.trim() || null,
                grand_total: editBookingGrandTotal ? Number(editBookingGrandTotal) : b.grand_total,
            }

            const { error } = await supabase
                .from('bookings')
                .update(updateData)
                .eq('id', b.id)

            if (error) throw error
            toast.success('Booking updated')
            setEditingBookingId(null)
            fetchBookings()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update booking')
        } finally {
            setSaving(false)
        }
    }

    // ---- Guest CRUD ----
    const startEditingGuest = (g: GuestRow) => {
        setEditingGuestId(g.id)
        setEditGuestName(g.name)
        setEditGuestPhone(g.phone)
        setEditGuestAadhar(g.aadhar_number || '')
    }

    const handleSaveGuest = async (g: GuestRow) => {
        if (!editGuestName.trim()) {
            toast.error('Guest name is required')
            return
        }
        setSaving(true)
        try {
            const { error } = await supabase
                .from('guests')
                .update({
                    name: editGuestName.trim(),
                    phone: editGuestPhone.trim(),
                    aadhar_number: editGuestAadhar.trim() || null,
                })
                .eq('id', g.id)

            if (error) throw error
            toast.success('Guest updated')
            setEditingGuestId(null)
            fetchBookings()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update guest')
        } finally {
            setSaving(false)
        }
    }

    const handleDeleteGuest = async () => {
        if (!deleteGuestTarget) return
        setSaving(true)
        try {
            const { error } = await supabase
                .from('guests')
                .delete()
                .eq('id', deleteGuestTarget.id)

            if (error) throw error

            // Update guest_count on booking
            const booking = bookings.find(b => b.id === deleteGuestTarget.booking_id)
            if (booking) {
                const newCount = Math.max(0, (booking.guests?.length || 1) - 1)
                await supabase
                    .from('bookings')
                    .update({ guest_count: newCount })
                    .eq('id', booking.id)
            }

            toast.success(`Guest "${deleteGuestTarget.name}" removed`)
            setDeleteGuestTarget(null)
            fetchBookings()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete guest')
        } finally {
            setSaving(false)
        }
    }

    // ---- Helpers ----
    const getHotelName = (hotelIdVal: string) => hotels.find(h => h.id === hotelIdVal)?.name || 'Unknown'

    // ---- Pagination ----
    const totalPages = Math.ceil(totalCount / PAGE_SIZE)
    const showingFrom = totalCount === 0 ? 0 : page * PAGE_SIZE + 1
    const showingTo = Math.min((page + 1) * PAGE_SIZE, totalCount)

    return (
        <div className="space-y-5 animate-in fade-in duration-300">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <Users className="h-6 w-6 text-teal-600" />
                    Bookings & Guests
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                    View and edit all bookings and guest records
                </p>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                        placeholder="Search by name, phone, or unit#..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="pl-9 bg-white"
                    />
                </div>
                <div className="flex gap-2">
                    <Input
                        type="date"
                        value={dateFrom}
                        onChange={e => { setDateFrom(e.target.value); setPage(0) }}
                        className="w-36 bg-white text-xs"
                        title="From date"
                    />
                    <Input
                        type="date"
                        value={dateTo}
                        onChange={e => { setDateTo(e.target.value); setPage(0) }}
                        className="w-36 bg-white text-xs"
                        title="To date"
                    />
                </div>
                <Select
                    value={statusFilter}
                    onValueChange={v => { setStatusFilter(v); setPage(0) }}
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

            {/* Summary counters */}
            <div className="flex items-center gap-4 text-xs text-slate-500">
                <span>{totalCount} booking{totalCount !== 1 ? 's' : ''} found</span>
                {debouncedSearch && (
                    <button
                        onClick={() => { setSearchQuery(''); setDebouncedSearch('') }}
                        className="flex items-center gap-1 text-red-500 hover:text-red-700 cursor-pointer"
                    >
                        <Ban className="h-3 w-3" />
                        Clear search
                    </button>
                )}
            </div>

            {/* Results */}
            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                    <span className="ml-2 text-sm text-slate-400">Loading bookings...</span>
                </div>
            ) : bookings.length === 0 ? (
                <Card>
                    <CardContent className="py-12 text-center">
                        <CalendarDays className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm text-slate-400">
                            {debouncedSearch ? 'No bookings match your search.' : 'No booking records found.'}
                        </p>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {bookings.map(b => {
                        const isExpanded = expandedId === b.id
                        const isEditingBooking = editingBookingId === b.id
                        const allPayments = normalizePayments(b.payments)
                        const paymentMethod = derivePaymentMethod(b)
                        const paymentStatus = derivePaymentStatus(b)
                        const nights = deriveNights(b)
                        const guestNames = b.guests?.map(g => g.name).join(', ') || '\u2014'
                        const guestPhones = [...new Set(b.guests?.map(g => g.phone).filter(Boolean) || [])].join(', ') || '\u2014'
                        const unitType = b.unit?.type || 'ROOM'

                        return (
                            <div
                                key={b.id}
                                className="bg-white rounded-xl border border-slate-200 overflow-hidden transition-all"
                            >
                                {/* Collapsed Row */}
                                <button
                                    onClick={() => setExpandedId(isExpanded ? null : b.id)}
                                    className="w-full px-4 py-3 cursor-pointer hover:bg-slate-50/80 transition-colors text-left"
                                >
                                    {/* Line 1: Unit + hotel + date */}
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
                                            className={`text-[9px] font-bold px-1.5 py-0 ${unitType === 'DORM' ? 'bg-violet-50 text-violet-600 border-violet-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'}`}
                                        >
                                            {unitType}
                                        </Badge>
                                        {!hotelId && b.unit?.hotel_id && (
                                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-blue-50 text-blue-600 border-blue-200">
                                                {getHotelName(b.unit.hotel_id)}
                                            </Badge>
                                        )}
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

                                    {/* Line 3: Date range + nights */}
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

                                    {/* Line 4: Amount + badges */}
                                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                        <span className="font-semibold text-xs text-slate-800">
                                            {'\u20B9'}{Number(b.grand_total).toLocaleString('en-IN')}
                                        </span>
                                        {paymentMethod !== 'Unpaid' && (
                                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-slate-50 text-slate-600 border-slate-200 flex items-center gap-0.5">
                                                <PaymentMethodIcon method={paymentMethod} />
                                                {paymentMethod}
                                            </Badge>
                                        )}
                                        <Badge variant="outline" className={`text-[9px] font-bold px-1.5 py-0 ${paymentStatusBadgeClass(paymentStatus)}`}>
                                            {paymentStatus}
                                        </Badge>
                                        <Badge variant="outline" className={`text-[9px] font-bold px-1.5 py-0 ${statusBadgeClass(b.status)}`}>
                                            {b.status.replace('_', ' ')}
                                        </Badge>
                                        {b.group_id && (
                                            <Badge variant="outline" className="text-[9px] font-bold px-1.5 py-0 bg-violet-50 text-violet-600 border-violet-200">
                                                Group
                                            </Badge>
                                        )}
                                        <span className="ml-auto">
                                            {isExpanded
                                                ? <ChevronUp className="h-4 w-4 text-slate-400" />
                                                : <ChevronDown className="h-4 w-4 text-slate-400" />
                                            }
                                        </span>
                                    </div>
                                </button>

                                {/* Expanded Details */}
                                {isExpanded && (
                                    <div className="border-t border-slate-100 bg-slate-50/50 px-4 py-4 space-y-4">
                                        {/* Booking Edit Section */}
                                        <div className="flex items-center justify-between">
                                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                                                Booking Details
                                            </h4>
                                            {!isEditingBooking ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => startEditingBooking(b)}
                                                    className="h-7 text-xs"
                                                >
                                                    <Pencil className="h-3 w-3 mr-1" /> Edit Booking
                                                </Button>
                                            ) : (
                                                <div className="flex gap-1">
                                                    <Button size="sm" variant="ghost" onClick={() => setEditingBookingId(null)} className="h-7 text-xs">
                                                        <Ban className="h-3 w-3 mr-1" /> Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSaveBooking(b)}
                                                        disabled={saving}
                                                        className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                                                    >
                                                        <Save className="h-3 w-3 mr-1" /> Save
                                                    </Button>
                                                </div>
                                            )}
                                        </div>

                                        {isEditingBooking ? (
                                            /* Booking Edit Form */
                                            <div className="bg-white rounded-lg border border-slate-100 p-3 space-y-3">
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Status</Label>
                                                        <Select value={editBookingStatus} onValueChange={setEditBookingStatus}>
                                                            <SelectTrigger className="mt-1 h-8 text-sm bg-white">
                                                                <SelectValue />
                                                            </SelectTrigger>
                                                            <SelectContent>
                                                                {BOOKING_STATUSES.map(s => (
                                                                    <SelectItem key={s} value={s}>{s}</SelectItem>
                                                                ))}
                                                            </SelectContent>
                                                        </Select>
                                                    </div>
                                                    <div>
                                                        <Label className="text-xs text-slate-500">Grand Total</Label>
                                                        <Input
                                                            type="number"
                                                            value={editBookingGrandTotal}
                                                            onChange={e => setEditBookingGrandTotal(e.target.value)}
                                                            className="mt-1 h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div className="col-span-2 sm:col-span-1">
                                                        <Label className="text-xs text-slate-500">Notes</Label>
                                                        <Input
                                                            value={editBookingNotes}
                                                            onChange={e => setEditBookingNotes(e.target.value)}
                                                            placeholder="Booking notes"
                                                            className="mt-1 h-8 text-sm"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Booking View */
                                            <div className="bg-white rounded-lg border border-slate-100 px-3 py-2.5">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                    <div>
                                                        <span className="text-slate-400">Check-in</span>
                                                        <p className="font-semibold text-slate-700">{formatDateTimeIST(b.check_in)}</p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Check-out</span>
                                                        <p className="font-semibold text-slate-700">
                                                            {b.check_out ? formatDateTimeIST(b.check_out) : '\u2014'}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Grand Total</span>
                                                        <p className="font-bold text-slate-900">
                                                            {'\u20B9'}{Number(b.grand_total).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Advance</span>
                                                        <p className="font-semibold text-emerald-700">
                                                            {b.advance_amount
                                                                ? `\u20B9${Number(b.advance_amount).toLocaleString('en-IN')} (${b.advance_type || '\u2014'})`
                                                                : '\u2014'
                                                            }
                                                        </p>
                                                    </div>
                                                </div>
                                                {b.notes && (
                                                    <div className="mt-2 pt-2 border-t border-slate-100 flex items-start gap-2 text-xs text-slate-600">
                                                        <StickyNote className="h-3.5 w-3.5 text-slate-400 shrink-0 mt-0.5" />
                                                        {b.notes}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Payment Breakdown */}
                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                Payment Breakdown
                                            </h4>
                                            <div className="bg-white rounded-lg border border-slate-100 px-3 py-2.5">
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                                                    <div>
                                                        <span className="text-slate-400">Cash</span>
                                                        <p className="font-semibold text-slate-800">
                                                            {'\u20B9'}{allPayments.reduce((sum, p) => sum + Number(p.amount_cash || 0), 0).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Digital</span>
                                                        <p className="font-semibold text-slate-800">
                                                            {'\u20B9'}{allPayments.reduce((sum, p) => sum + Number(p.amount_digital || 0), 0).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Total Paid</span>
                                                        <p className="font-semibold text-emerald-700">
                                                            {'\u20B9'}{allPayments.reduce((sum, p) => sum + Number(p.total_paid || 0), 0).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                    <div>
                                                        <span className="text-slate-400">Balance</span>
                                                        <p className="font-semibold text-red-600">
                                                            {'\u20B9'}{Math.max(0,
                                                                Number(b.grand_total) -
                                                                allPayments.reduce((sum, p) => sum + Number(p.total_paid || 0), 0) -
                                                                Number(b.advance_amount || 0)
                                                            ).toLocaleString('en-IN')}
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Guest Cards */}
                                        <div>
                                            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                                                Guests ({b.guests?.length || 0})
                                            </h4>
                                            {(!b.guests || b.guests.length === 0) ? (
                                                <p className="text-xs text-slate-400">No guest records.</p>
                                            ) : (
                                                <div className="space-y-2">
                                                    {b.guests.map(guest => {
                                                        const isEditingThisGuest = editingGuestId === guest.id
                                                        return (
                                                            <div
                                                                key={guest.id}
                                                                className="bg-white rounded-lg border border-slate-100 px-3 py-2.5"
                                                            >
                                                                {isEditingThisGuest ? (
                                                                    /* Guest Edit Mode */
                                                                    <div className="space-y-3">
                                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                                                            <div>
                                                                                <Label className="text-xs text-slate-500">Name *</Label>
                                                                                <Input
                                                                                    value={editGuestName}
                                                                                    onChange={e => setEditGuestName(e.target.value)}
                                                                                    placeholder="Guest name"
                                                                                    className="mt-1 h-8 text-sm"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <Label className="text-xs text-slate-500">Phone</Label>
                                                                                <Input
                                                                                    value={editGuestPhone}
                                                                                    onChange={e => setEditGuestPhone(e.target.value)}
                                                                                    placeholder="Phone number"
                                                                                    maxLength={10}
                                                                                    className="mt-1 h-8 text-sm"
                                                                                />
                                                                            </div>
                                                                            <div>
                                                                                <Label className="text-xs text-slate-500">Aadhar Number</Label>
                                                                                <Input
                                                                                    value={editGuestAadhar}
                                                                                    onChange={e => setEditGuestAadhar(e.target.value)}
                                                                                    placeholder="12-digit Aadhar"
                                                                                    maxLength={14}
                                                                                    className="mt-1 h-8 text-sm"
                                                                                />
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex justify-end gap-2">
                                                                            <Button size="sm" variant="ghost" onClick={() => setEditingGuestId(null)} className="h-7 text-xs">
                                                                                <Ban className="h-3 w-3 mr-1" /> Cancel
                                                                            </Button>
                                                                            <Button
                                                                                size="sm"
                                                                                onClick={() => handleSaveGuest(guest)}
                                                                                disabled={saving}
                                                                                className="h-7 text-xs bg-teal-600 hover:bg-teal-700"
                                                                            >
                                                                                <Save className="h-3 w-3 mr-1" /> Save
                                                                            </Button>
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    /* Guest View Mode */
                                                                    <div className="flex items-center justify-between gap-3 flex-wrap">
                                                                        <div className="min-w-0">
                                                                            <p className="text-sm font-semibold text-slate-800">{guest.name}</p>
                                                                            <div className="flex items-center gap-3 mt-0.5 text-[11px] text-slate-500">
                                                                                <span className="flex items-center gap-1">
                                                                                    <Phone className="h-3 w-3" />
                                                                                    {guest.phone || '\u2014'}
                                                                                </span>
                                                                                {guest.aadhar_number ? (
                                                                                    <span className="flex items-center gap-1 text-emerald-600">
                                                                                        <CreditCard className="h-3 w-3" />
                                                                                        ****{guest.aadhar_number.replace(/\D/g, '').slice(-4)}
                                                                                    </span>
                                                                                ) : (
                                                                                    <span className="text-red-400">No Aadhar</span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-1 shrink-0">
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => startEditingGuest(guest)}
                                                                                className="h-7 w-7 p-0 text-slate-500 hover:text-teal-600"
                                                                            >
                                                                                <Pencil className="h-3 w-3" />
                                                                            </Button>
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => setDeleteGuestTarget(guest)}
                                                                                className="h-7 w-7 p-0 text-slate-400 hover:text-red-600"
                                                                                disabled={b.guests.length <= 1}
                                                                                title={b.guests.length <= 1 ? 'Cannot delete last guest' : 'Delete guest'}
                                                                            >
                                                                                <Trash2 className="h-3 w-3" />
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

                                        {/* Invoice link + ID */}
                                        <div className="flex items-center gap-3 flex-wrap">
                                            <a
                                                href={`/invoice/${b.id}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                                            >
                                                <FileText className="h-3.5 w-3.5" />
                                                View Invoice
                                            </a>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                ID: {b.id.slice(0, 8)}...
                                            </span>
                                            {b.group_id && (
                                                <span className="text-[10px] text-violet-500 font-mono">
                                                    Group: {b.group_id.slice(0, 8)}...
                                                </span>
                                            )}
                                        </div>
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

            {/* Delete Guest Confirmation */}
            <Dialog open={!!deleteGuestTarget} onOpenChange={open => { if (!open) setDeleteGuestTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Guest</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to remove <strong>{deleteGuestTarget?.name}</strong> from this booking?
                            This will also remove their Aadhar records. This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteGuestTarget(null)} disabled={saving}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDeleteGuest} disabled={saving}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
