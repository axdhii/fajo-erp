'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
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
    Download,
    Loader2,
} from 'lucide-react'
// html2canvas imported dynamically in handleDownloadReport
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

    // Date + time range filter
    const [dateFrom, setDateFrom] = useState(todayIST())
    const [dateTo, setDateTo] = useState(todayIST())
    const [timeFrom, setTimeFrom] = useState('00:00')
    const [timeTo, setTimeTo] = useState('23:59')

    // Report download
    const reportRef = useRef<HTMLDivElement>(null)
    const [generatingReport, setGeneratingReport] = useState(false)

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

    // ── Download Financial Report as PNG ──
    const handleDownloadReport = async () => {
        setGeneratingReport(true)
        try {
            const html2canvas = (await import('html2canvas')).default

            const fromIST = `${dateFrom || todayIST()}T${timeFrom}:00+05:30`
            const toIST = `${dateTo || todayIST()}T${timeTo}:59+05:30`

            const { data: bookings, error: queryError } = await supabase
                .from('bookings')
                .select('id, grand_total, status, unit:units!inner(type, hotel_id), payments(amount_cash, amount_digital, total_paid)')
                .in('status', ['CHECKED_IN', 'CHECKED_OUT'])
                .gte('check_in', fromIST)
                .lte('check_in', toIST)

            if (queryError) throw new Error(`Query failed: ${queryError.message}`)

            let filtered = bookings || []
            if (hotelId) {
                filtered = filtered.filter((b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.hotel_id === hotelId)
            }

            const rooms = filtered.filter((b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.type === 'ROOM')
            const dorms = filtered.filter((b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.type === 'DORM')

            const calcRev = (list: typeof filtered) => {
                let cash = 0, digital = 0
                for (const b of list) {
                    const raw = (b as Record<string, unknown>).payments
                    const payments = Array.isArray(raw) ? raw : raw ? [raw] : []
                    for (const p of payments) {
                        const pay = p as Record<string, unknown>
                        cash += Number(pay.amount_cash || 0)
                        digital += Number(pay.amount_digital || 0)
                    }
                }
                return { cash, digital }
            }

            const roomRev = calcRev(rooms)
            const dormRev = calcRev(dorms)
            const grandCash = roomRev.cash + dormRev.cash
            const grandDigital = roomRev.digital + dormRev.digital
            const grandTotal = grandCash + grandDigital
            const hotelName = hotelId ? hotels.find(h => h.id === hotelId)?.name || 'Hotel' : 'ALL PROPERTIES'
            const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
            const fromDisplay = new Date(fromIST).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
            const toDisplay = new Date(toIST).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
            const genAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })

            if (!reportRef.current) throw new Error('Report container not found')

            {
                const el = reportRef.current
                el.style.display = 'block'
                el.style.position = 'fixed'
                el.style.left = '0'
                el.style.top = '0'
                el.style.zIndex = '-1'
                el.innerHTML = `<div style="width:800px;padding:40px;background:white;font-family:system-ui,sans-serif;">
                    <div style="text-align:center;margin-bottom:30px;">
                        <h1 style="font-size:24px;font-weight:800;color:#0f172a;margin:0;">${hotelName}</h1>
                        <h2 style="font-size:18px;font-weight:600;color:#475569;margin:4px 0 0;">FINANCIAL REPORT</h2>
                        <div style="margin-top:12px;padding:8px 16px;background:#f8fafc;border-radius:8px;display:inline-block;">
                            <p style="font-size:13px;color:#64748b;margin:0;">Period: ${fromDisplay}</p>
                            <p style="font-size:13px;color:#64748b;margin:2px 0 0;">to ${toDisplay}</p>
                        </div>
                    </div>
                    <div style="display:flex;gap:16px;margin-bottom:24px;">
                        <div style="flex:1;border:2px solid #d1fae5;border-radius:12px;padding:20px;text-align:center;background:#f0fdf4;">
                            <p style="font-size:12px;font-weight:700;color:#059669;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Rooms</p>
                            <p style="font-size:32px;font-weight:800;color:#065f46;margin:0;">${rooms.length}</p>
                            <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">units sold</p>
                            <div style="margin-top:12px;display:flex;justify-content:center;gap:16px;">
                                <div><p style="font-size:10px;color:#16a34a;font-weight:700;margin:0;">CASH</p><p style="font-size:16px;font-weight:700;color:#15803d;margin:2px 0 0;">${fmt(roomRev.cash)}</p></div>
                                <div><p style="font-size:10px;color:#2563eb;font-weight:700;margin:0;">DIGITAL</p><p style="font-size:16px;font-weight:700;color:#1d4ed8;margin:2px 0 0;">${fmt(roomRev.digital)}</p></div>
                            </div>
                        </div>
                        <div style="flex:1;border:2px solid #dbeafe;border-radius:12px;padding:20px;text-align:center;background:#eff6ff;">
                            <p style="font-size:12px;font-weight:700;color:#2563eb;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Dorms</p>
                            <p style="font-size:32px;font-weight:800;color:#1e40af;margin:0;">${dorms.length}</p>
                            <p style="font-size:11px;color:#6b7280;margin:4px 0 0;">beds sold</p>
                            <div style="margin-top:12px;display:flex;justify-content:center;gap:16px;">
                                <div><p style="font-size:10px;color:#16a34a;font-weight:700;margin:0;">CASH</p><p style="font-size:16px;font-weight:700;color:#15803d;margin:2px 0 0;">${fmt(dormRev.cash)}</p></div>
                                <div><p style="font-size:10px;color:#2563eb;font-weight:700;margin:0;">DIGITAL</p><p style="font-size:16px;font-weight:700;color:#1d4ed8;margin:2px 0 0;">${fmt(dormRev.digital)}</p></div>
                            </div>
                        </div>
                    </div>
                    <div style="border:3px solid #c4b5fd;border-radius:12px;padding:20px;text-align:center;background:#f5f3ff;margin-bottom:24px;">
                        <p style="font-size:12px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">Grand Total</p>
                        <p style="font-size:40px;font-weight:900;color:#5b21b6;margin:0;">${fmt(grandTotal)}</p>
                        <div style="margin-top:12px;display:flex;justify-content:center;gap:24px;">
                            <div><p style="font-size:11px;color:#16a34a;font-weight:700;margin:0;">TOTAL CASH</p><p style="font-size:20px;font-weight:800;color:#15803d;margin:2px 0 0;">${fmt(grandCash)}</p></div>
                            <div><p style="font-size:11px;color:#2563eb;font-weight:700;margin:0;">TOTAL DIGITAL</p><p style="font-size:20px;font-weight:800;color:#1d4ed8;margin:2px 0 0;">${fmt(grandDigital)}</p></div>
                        </div>
                    </div>
                    <div style="text-align:center;padding-top:16px;border-top:1px solid #e2e8f0;">
                        <p style="font-size:11px;color:#94a3b8;margin:0;">Generated: ${genAt} | FAJO ERP</p>
                    </div>
                </div>`

                await new Promise(r => setTimeout(r, 300))
                const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true })
                el.style.display = 'none'

                const url = canvas.toDataURL('image/png')
                const link = document.createElement('a')
                link.download = `Financial-Report_${hotelName.replace(/\s+/g, '-')}_${dateFrom}_to_${dateTo}.png`
                link.href = url
                link.click()
                toast.success('Financial report downloaded')
            }
        } catch (err) {
            console.error('Report error:', err)
            toast.error(err instanceof Error ? `Report failed: ${err.message}` : 'Failed to generate report')
        } finally {
            setGeneratingReport(false)
        }
    }

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
                <div className="flex gap-2">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleDownloadReport}
                        disabled={generatingReport || loading}
                        className="border-emerald-200"
                    >
                        {generatingReport ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                        {generatingReport ? 'Generating...' : 'Download Report'}
                    </Button>
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
            </div>

            {/* Date Range Filter */}
            <Card className="border-slate-200">
                <CardContent className="py-3 px-4">
                    <div className="flex flex-wrap items-center gap-3">
                        <Calendar className="h-4 w-4 text-slate-400" />
                        <Label className="text-sm text-slate-600">Date Range:</Label>
                        <div className="flex gap-1">
                            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-8 text-sm" />
                            <Input type="time" value={timeFrom} onChange={e => setTimeFrom(e.target.value)} className="w-24 h-8 text-sm" />
                        </div>
                        <span className="text-slate-400 text-sm">to</span>
                        <div className="flex gap-1">
                            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-8 text-sm" />
                            <Input type="time" value={timeTo} onChange={e => setTimeTo(e.target.value)} className="w-24 h-8 text-sm" />
                        </div>
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
            {/* Hidden report div for html2canvas */}
            <div ref={reportRef} style={{ display: 'none' }} />
        </div>
    )
}
