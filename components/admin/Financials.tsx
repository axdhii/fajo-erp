'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    DollarSign,
    TrendingUp,
    Banknote,
    Smartphone,
    Building2,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
    Calendar,
} from 'lucide-react'
import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

interface PaymentRow {
    id: string
    amount_cash: number
    amount_digital: number
    total_paid: number
    created_at: string
    booking: {
        unit_id: string
        guests: { name: string }[]
        unit: { unit_number: string; hotel_id: string }
    }
}

interface OutstandingRow {
    id: string
    grand_total: number
    advance_amount: number | null
    check_in: string
    status: string
    guests: { name: string }[]
    payments: { total_paid: number }[]
    unit: { unit_number: string; hotel_id: string }
}

interface HotelRevenue {
    hotelId: string
    hotelName: string
    cash: number
    digital: number
    total: number
}

function todayIST(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function monthStartIST(): string {
    const now = new Date()
    const parts = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).split('-')
    return `${parts[0]}-${parts[1]}-01`
}

function formatINR(amount: number): string {
    return '\u20B9' + Number(amount).toLocaleString('en-IN')
}

function formatDateIST(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
}

function formatDateShort(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
    })
}

export function Financials({ hotelId, hotels }: AdminTabProps) {
    const [loading, setLoading] = useState(false)

    // Date range filter
    const [dateFrom, setDateFrom] = useState(todayIST())
    const [dateTo, setDateTo] = useState(todayIST())

    // Revenue data
    const [todayRevenue, setTodayRevenue] = useState({ cash: 0, digital: 0, total: 0 })
    const [monthRevenue, setMonthRevenue] = useState({ cash: 0, digital: 0, total: 0 })
    const [rangeRevenue, setRangeRevenue] = useState({ cash: 0, digital: 0, total: 0 })
    const [hotelRevenues, setHotelRevenues] = useState<HotelRevenue[]>([])

    // Outstanding
    const [outstanding, setOutstanding] = useState<OutstandingRow[]>([])

    // Payments ledger
    const [payments, setPayments] = useState<PaymentRow[]>([])
    const [page, setPage] = useState(0)
    const [hasMore, setHasMore] = useState(false)
    const PAGE_SIZE = 50

    // ── Fetch revenue summaries ──
    const fetchRevenue = useCallback(async () => {
        setLoading(true)
        try {
            const today = todayIST()
            const monthStart = monthStartIST()

            // Today's revenue
            const { data: todayPayments } = await supabase
                .from('payments')
                .select('amount_cash, amount_digital, total_paid, booking:bookings(unit_id, unit:units(hotel_id))')
                .gte('created_at', today + 'T00:00:00+05:30')

            // Month revenue
            const { data: monthPayments } = await supabase
                .from('payments')
                .select('amount_cash, amount_digital, total_paid, booking:bookings(unit_id, unit:units(hotel_id))')
                .gte('created_at', monthStart + 'T00:00:00+05:30')

            // Range revenue (user-selected dates)
            const { data: rangePayments } = await supabase
                .from('payments')
                .select('amount_cash, amount_digital, total_paid, booking:bookings(unit_id, unit:units(hotel_id))')
                .gte('created_at', dateFrom + 'T00:00:00+05:30')
                .lte('created_at', dateTo + 'T23:59:59+05:30')

            // Filter by selected hotel if applicable
            type PaymentWithBooking = { amount_cash: number; amount_digital: number; total_paid: number; booking: { unit: { hotel_id: string } } }
            const filterByHotel = (rows: PaymentWithBooking[] | null) => {
                if (!rows) return []
                if (!hotelId) return rows
                return rows.filter(r => {
                    const booking = r.booking as { unit: { hotel_id: string } }
                    return booking?.unit?.hotel_id === hotelId
                })
            }

            const sumRevenue = (rows: PaymentWithBooking[] | null) => {
                const filtered = filterByHotel(rows)
                return filtered.reduce(
                    (acc, r) => ({
                        cash: acc.cash + Number(r.amount_cash),
                        digital: acc.digital + Number(r.amount_digital),
                        total: acc.total + Number(r.total_paid),
                    }),
                    { cash: 0, digital: 0, total: 0 }
                )
            }

            setTodayRevenue(sumRevenue(todayPayments as unknown as PaymentWithBooking[]))
            setMonthRevenue(sumRevenue(monthPayments as unknown as PaymentWithBooking[]))
            setRangeRevenue(sumRevenue(rangePayments as unknown as PaymentWithBooking[]))

            // Per-hotel revenue breakdown (from range dates)
            const perHotel: Record<string, HotelRevenue> = {}
            for (const h of hotels) {
                perHotel[h.id] = { hotelId: h.id, hotelName: h.name, cash: 0, digital: 0, total: 0 }
            }
            for (const r of (rangePayments || []) as unknown as PaymentWithBooking[]) {
                const hid = r.booking?.unit?.hotel_id
                if (hid && perHotel[hid]) {
                    perHotel[hid].cash += Number(r.amount_cash)
                    perHotel[hid].digital += Number(r.amount_digital)
                    perHotel[hid].total += Number(r.total_paid)
                }
            }
            setHotelRevenues(Object.values(perHotel))
        } catch (err) {
            console.error('Revenue fetch error:', err)
            toast.error('Failed to load revenue data')
        } finally {
            setLoading(false)
        }
    }, [hotelId, hotels, dateFrom, dateTo])

    // ── Fetch outstanding balances ──
    const fetchOutstanding = useCallback(async () => {
        const { data, error } = await supabase
            .from('bookings')
            .select('id, grand_total, advance_amount, check_in, status, guests(name), payments(total_paid), unit:units(unit_number, hotel_id)')
            .in('status', ['CHECKED_IN', 'CHECKED_OUT'])

        if (error) {
            console.error('Outstanding fetch error:', error)
            return
        }

        // Filter client-side: where advance + total_paid < grand_total, and by hotel
        const rows = (data || []).filter(b => {
            const paymentsArr = Array.isArray(b.payments) ? b.payments : b.payments ? [b.payments] : []
            const advance = Number(b.advance_amount || 0)
            const paid = advance + paymentsArr.reduce((sum: number, p: { total_paid: number }) => sum + Number(p.total_paid || 0), 0)
            return paid < Number(b.grand_total) && Number(b.grand_total) > 0
        }).filter(b => {
            if (!hotelId) return true
            const unit = b.unit as unknown as { hotel_id: string }
            return unit?.hotel_id === hotelId
        })

        setOutstanding(rows as unknown as OutstandingRow[])
    }, [hotelId])

    // ── Fetch payments ledger ──
    const fetchPayments = useCallback(async () => {
        const { data, error } = await supabase
            .from('payments')
            .select('*, booking:bookings(unit_id, guests(name), unit:units(unit_number, hotel_id))')
            .order('created_at', { ascending: false })
            .gte('created_at', dateFrom + 'T00:00:00+05:30')
            .lte('created_at', dateTo + 'T23:59:59+05:30')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

        if (error) {
            console.error('Payments fetch error:', error)
            return
        }

        let rows = (data || []) as unknown as PaymentRow[]
        // Filter by hotel if needed
        if (hotelId) {
            rows = rows.filter(r => r.booking?.unit?.hotel_id === hotelId)
        }

        setPayments(rows)
        // Use filtered count for hasMore when hotel filter is active
        setHasMore(hotelId ? rows.length > 0 && (data || []).length === PAGE_SIZE : (data || []).length === PAGE_SIZE)
    }, [hotelId, dateFrom, dateTo, page])

    // ── Effects ──
    useEffect(() => {
        fetchRevenue()
        fetchOutstanding()
    }, [fetchRevenue, fetchOutstanding])

    useEffect(() => {
        fetchPayments()
    }, [fetchPayments])

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <DollarSign className="h-6 w-6 text-emerald-600" />
                        Financials
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Revenue, payments, and outstanding balances{hotelId ? '' : ' across all hotels'}
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { fetchRevenue(); fetchOutstanding(); fetchPayments() }}
                    disabled={loading}
                    className="border-slate-200"
                >
                    <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Date Range Filter */}
            <Card className="border-slate-200">
                <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <Label className="text-sm text-slate-600">Date Range:</Label>
                        <Input
                            type="date"
                            value={dateFrom}
                            onChange={e => setDateFrom(e.target.value)}
                            className="w-40 h-8 text-sm"
                        />
                        <span className="text-slate-400 text-sm">to</span>
                        <Input
                            type="date"
                            value={dateTo}
                            onChange={e => setDateTo(e.target.value)}
                            className="w-40 h-8 text-sm"
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setDateFrom(todayIST()); setDateTo(todayIST()) }}
                            className="text-xs text-emerald-600 hover:text-emerald-700"
                        >
                            Today
                        </Button>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => { setDateFrom(monthStartIST()); setDateTo(todayIST()) }}
                            className="text-xs text-emerald-600 hover:text-emerald-700"
                        >
                            This Month
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* ── Section 1: Revenue Summary Cards ── */}
            <div className="grid gap-4 md:grid-cols-3">
                {/* Today */}
                <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50 to-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-emerald-700">Today&apos;s Revenue</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-emerald-800">{formatINR(todayRevenue.total)}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-emerald-600">
                            <span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash: {formatINR(todayRevenue.cash)}</span>
                            <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> Digital: {formatINR(todayRevenue.digital)}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* This Month */}
                <Card className="border-emerald-100 bg-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-400 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">This Month</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{formatINR(monthRevenue.total)}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash: {formatINR(monthRevenue.cash)}</span>
                            <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> Digital: {formatINR(monthRevenue.digital)}</span>
                        </div>
                    </CardContent>
                </Card>

                {/* Date Range */}
                <Card className="border-slate-200 bg-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-violet-400 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-600">
                            {dateFrom === dateTo ? formatDateShort(dateFrom + 'T00:00:00') : `${formatDateShort(dateFrom + 'T00:00:00')} - ${formatDateShort(dateTo + 'T00:00:00')}`}
                        </CardTitle>
                        <Calendar className="h-4 w-4 text-violet-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{formatINR(rangeRevenue.total)}</div>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                            <span className="flex items-center gap-1"><Banknote className="h-3 w-3" /> Cash: {formatINR(rangeRevenue.cash)}</span>
                            <span className="flex items-center gap-1"><Smartphone className="h-3 w-3" /> Digital: {formatINR(rangeRevenue.digital)}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* ── Section 2: Revenue by Hotel ── */}
            {!hotelId && hotelRevenues.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2">
                            <Building2 className="h-5 w-5 text-emerald-600" />
                            Revenue by Hotel
                            <span className="text-xs font-normal text-slate-400 ml-1">(selected date range)</span>
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                            {hotelRevenues.map(hr => (
                                <div
                                    key={hr.hotelId}
                                    className="rounded-xl border border-slate-200 p-4 bg-slate-50/50 hover:bg-emerald-50/30 transition-colors"
                                >
                                    <div className="font-semibold text-slate-800 text-sm">{hr.hotelName}</div>
                                    <div className="text-2xl font-bold text-emerald-700 mt-1">{formatINR(hr.total)}</div>
                                    <div className="flex items-center gap-3 mt-2 text-xs text-slate-500">
                                        <span>Cash: {formatINR(hr.cash)}</span>
                                        <span>Digital: {formatINR(hr.digital)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Single hotel breakdown when filtered */}
            {hotelId && hotelRevenues.length > 0 && (() => {
                const hr = hotelRevenues.find(h => h.hotelId === hotelId)
                if (!hr || hr.total === 0) return null
                return (
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="h-5 w-5 text-emerald-600" />
                                {hr.hotelName} Revenue
                                <span className="text-xs font-normal text-slate-400 ml-1">(selected date range)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-4 md:grid-cols-3">
                                <div className="text-center p-4 bg-emerald-50 rounded-xl">
                                    <div className="text-xs text-emerald-600 font-medium">Total</div>
                                    <div className="text-2xl font-bold text-emerald-800 mt-1">{formatINR(hr.total)}</div>
                                </div>
                                <div className="text-center p-4 bg-slate-50 rounded-xl">
                                    <div className="text-xs text-slate-500 font-medium flex items-center justify-center gap-1"><Banknote className="h-3 w-3" /> Cash</div>
                                    <div className="text-2xl font-bold text-slate-800 mt-1">{formatINR(hr.cash)}</div>
                                </div>
                                <div className="text-center p-4 bg-slate-50 rounded-xl">
                                    <div className="text-xs text-slate-500 font-medium flex items-center justify-center gap-1"><Smartphone className="h-3 w-3" /> Digital</div>
                                    <div className="text-2xl font-bold text-slate-800 mt-1">{formatINR(hr.digital)}</div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                )
            })()}

            {/* ── Section 3: Outstanding Balances ── */}
            {outstanding.length > 0 && (
                <Card className="border-red-200">
                    <CardHeader>
                        <CardTitle className="text-lg flex items-center gap-2 text-red-700">
                            <AlertCircle className="h-5 w-5 text-red-500" />
                            Outstanding Balances
                            <Badge variant="outline" className="ml-1 bg-red-50 text-red-700 border-red-200 text-xs">
                                {outstanding.length}
                            </Badge>
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-red-100 bg-red-50/50">
                                        <th className="text-left py-2 px-4 font-medium text-red-700">Unit</th>
                                        <th className="text-left py-2 px-4 font-medium text-red-700">Guest</th>
                                        <th className="text-right py-2 px-4 font-medium text-red-700">Total</th>
                                        <th className="text-right py-2 px-4 font-medium text-red-700">Paid</th>
                                        <th className="text-right py-2 px-4 font-medium text-red-700">Balance Due</th>
                                        <th className="text-left py-2 px-4 font-medium text-red-700">Check-in</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {outstanding.map(b => {
                                        const paymentsArr = Array.isArray(b.payments) ? b.payments : b.payments ? [b.payments] : []
                                        const advance = Number(b.advance_amount || 0)
                                        const paid = advance + paymentsArr.reduce((sum: number, p: { total_paid: number }) => sum + Number(p.total_paid || 0), 0)
                                        const due = Number(b.grand_total) - paid
                                        const unit = b.unit as unknown as { unit_number: string; hotel_id: string }
                                        return (
                                            <tr key={b.id} className="border-b border-red-50 hover:bg-red-50/30">
                                                <td className="py-2 px-4 font-mono text-slate-800">{unit?.unit_number}</td>
                                                <td className="py-2 px-4 text-slate-700">{b.guests?.[0]?.name || '-'}</td>
                                                <td className="py-2 px-4 text-right text-slate-700">{formatINR(Number(b.grand_total))}</td>
                                                <td className="py-2 px-4 text-right text-emerald-600">{formatINR(paid)}</td>
                                                <td className="py-2 px-4 text-right font-bold text-red-600">{formatINR(due)}</td>
                                                <td className="py-2 px-4 text-slate-500 text-xs">{formatDateShort(b.check_in)}</td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* ── Section 4: Recent Payments Ledger ── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                        <DollarSign className="h-5 w-5 text-emerald-600" />
                        Payments Ledger
                    </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                    {payments.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                            <DollarSign className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p>No payments found for the selected date range.</p>
                        </div>
                    ) : (
                        <>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="text-left py-2 px-4 font-medium text-slate-600">Date (IST)</th>
                                            <th className="text-left py-2 px-4 font-medium text-slate-600">Unit</th>
                                            <th className="text-left py-2 px-4 font-medium text-slate-600">Guest</th>
                                            <th className="text-right py-2 px-4 font-medium text-slate-600">Cash</th>
                                            <th className="text-right py-2 px-4 font-medium text-slate-600">Digital</th>
                                            <th className="text-right py-2 px-4 font-medium text-slate-600">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {payments.map(p => (
                                            <tr key={p.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                                <td className="py-2 px-4 text-slate-500 text-xs whitespace-nowrap">
                                                    {formatDateIST(p.created_at)}
                                                </td>
                                                <td className="py-2 px-4 font-mono text-slate-800">
                                                    {p.booking?.unit?.unit_number || '-'}
                                                </td>
                                                <td className="py-2 px-4 text-slate-700">
                                                    {p.booking?.guests?.[0]?.name || '-'}
                                                </td>
                                                <td className="py-2 px-4 text-right text-slate-600">
                                                    {Number(p.amount_cash) > 0 ? formatINR(Number(p.amount_cash)) : '-'}
                                                </td>
                                                <td className="py-2 px-4 text-right text-slate-600">
                                                    {Number(p.amount_digital) > 0 ? formatINR(Number(p.amount_digital)) : '-'}
                                                </td>
                                                <td className="py-2 px-4 text-right font-semibold text-emerald-700">
                                                    {formatINR(Number(p.total_paid))}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Pagination */}
                            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                                <span className="text-xs text-slate-500">
                                    Page {page + 1}{!hasMore && payments.length > 0 ? ' (last)' : ''}
                                </span>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => Math.max(0, p - 1))}
                                        disabled={page === 0}
                                        className="h-7"
                                    >
                                        <ChevronLeft className="h-3 w-3 mr-1" /> Prev
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setPage(p => p + 1)}
                                        disabled={!hasMore}
                                        className="h-7"
                                    >
                                        Next <ChevronRight className="h-3 w-3 ml-1" />
                                    </Button>
                                </div>
                            </div>
                        </>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
