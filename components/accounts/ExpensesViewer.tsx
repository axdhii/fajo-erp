'use client'

// ============================================================
// Accounts Manager - Property Expenses Viewer (read-only)
// ============================================================
// Tab #2 of /accounts.  The Accounts Manager can browse and
// export every property expense across one or all hotels but
// CANNOT approve, reject, edit, or delete anything.  Approval
// continues to live with ZonalOps/Admin (see app/api/expenses
// PATCH handler — its role gate intentionally excludes
// 'Accounts').
//
// Mobile-first: filters stack on phones, the list renders as
// stacked cards under the sm breakpoint and as a table from md
// upwards.

import { useState, useEffect, useMemo, useCallback } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Receipt,
    Loader2,
    Download,
    AlertCircle,
    CheckCircle2,
    XCircle,
    Clock,
    RefreshCw,
} from 'lucide-react'
import { toast } from 'sonner'
import type { PropertyExpense } from '@/lib/types'
import { exportToCSV } from '@/lib/export-csv'

interface Hotel {
    id: string
    name: string
    city: string
    status: string
}

interface ExpensesViewerProps {
    /** null = all hotels (fan out per-hotel and merge) */
    hotelId: string | null
    hotels: Hotel[]
}

type StatusFilter = 'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'

interface ExpenseRow extends PropertyExpense {
    /** Hotel name resolved from the parent `hotels` list — useful when the
     *  Accounts Manager is viewing the merged "All Hotels" feed. */
    _hotelName?: string
}

function formatINR(amount: number): string {
    return '₹' + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })
}

function formatDateTimeIST(iso: string): string {
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

function formatDateShortIST(iso: string): string {
    return new Date(iso).toLocaleDateString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    })
}

/** Same date helper as Financials uses — keeps the two tabs coherent. */
function todayIST(): string {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function thirtyDaysAgoIST(): string {
    const d = new Date(Date.now() - 30 * 86400000)
    return d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}

function statusBadge(status: PropertyExpense['status']): React.ReactNode {
    if (status === 'APPROVED') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-700 px-2 py-0.5 text-[10px] font-bold tracking-wide">
                <CheckCircle2 className="h-3 w-3" />
                APPROVED
            </span>
        )
    }
    if (status === 'REJECTED') {
        return (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-700 px-2 py-0.5 text-[10px] font-bold tracking-wide">
                <XCircle className="h-3 w-3" />
                REJECTED
            </span>
        )
    }
    return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-700 px-2 py-0.5 text-[10px] font-bold tracking-wide">
            <Clock className="h-3 w-3" />
            PENDING
        </span>
    )
}

export function ExpensesViewer({ hotelId, hotels }: ExpensesViewerProps) {
    const [loading, setLoading] = useState(false)
    const [rows, setRows] = useState<ExpenseRow[]>([])

    // Filters
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
    const [categoryFilter, setCategoryFilter] = useState<string>('ALL')
    const [dateFrom, setDateFrom] = useState<string>(thirtyDaysAgoIST())
    const [dateTo, setDateTo] = useState<string>(todayIST())

    // Build the lookup once so we can stamp _hotelName on merged rows.
    const hotelById = useMemo(() => {
        const m = new Map<string, Hotel>()
        for (const h of hotels) m.set(h.id, h)
        return m
    }, [hotels])

    const fetchExpenses = useCallback(async () => {
        setLoading(true)
        try {
            // Build the query string. Treat 'ALL' as no filter — never send
            // status=ALL because the API would do an exact-match and return
            // zero rows (Bug Prevention Rule #2: status filter "all").
            const buildUrl = (h: string) => {
                const sp = new URLSearchParams()
                sp.set('hotel_id', h)
                if (statusFilter !== 'ALL') sp.set('status', statusFilter)
                return `/api/expenses?${sp.toString()}`
            }

            const targetHotels = hotelId ? [hotelId] : hotels.map(h => h.id)
            if (targetHotels.length === 0) {
                setRows([])
                return
            }

            // Fan out one fetch per hotel.  For "All Hotels" this is at most
            // 2-3 requests in the FAJO setup; doing it client-side avoids
            // changing the existing per-hotel-scoped API contract.
            const responses = await Promise.all(
                targetHotels.map(async h => {
                    const r = await fetch(buildUrl(h), { cache: 'no-store' })
                    if (!r.ok) {
                        const j = await r.json().catch(() => ({}))
                        throw new Error(j.error || `Failed to fetch expenses for hotel ${h}`)
                    }
                    const j = await r.json()
                    return (j.data || []) as PropertyExpense[]
                })
            )

            // Merge, stamp hotel name, sort newest first.
            const merged: ExpenseRow[] = []
            for (const list of responses) {
                for (const exp of list) {
                    merged.push({
                        ...exp,
                        _hotelName: hotelById.get(exp.hotel_id)?.name,
                    })
                }
            }
            merged.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
            setRows(merged)
        } catch (err) {
            console.error('Expenses fetch error:', err)
            toast.error(err instanceof Error ? err.message : 'Failed to load expenses')
        } finally {
            setLoading(false)
        }
    }, [hotelId, hotels, hotelById, statusFilter])

    useEffect(() => {
        fetchExpenses()
    }, [fetchExpenses])

    // Build category dropdown options from the rows we actually fetched
    // (per-instructions: do NOT hardcode the list — categories are free-text).
    const categoryOptions = useMemo(() => {
        const set = new Set<string>()
        for (const r of rows) {
            if (r.category) set.add(r.category)
        }
        return Array.from(set).sort((a, b) => a.localeCompare(b))
    }, [rows])

    // Apply client-side filters (date range + category) on top of the
    // server-side status filter.  The expenses API does not support
    // date-range params today (see app/api/expenses/route.ts:24-28), so
    // we filter in memory.
    const visibleRows = useMemo(() => {
        const fromMs = dateFrom ? new Date(`${dateFrom}T00:00:00+05:30`).getTime() : -Infinity
        // Use exclusive next-day upper bound (Bug Prevention Rule #21)
        const toMs = dateTo
            ? new Date(`${dateTo}T00:00:00+05:30`).getTime() + 86400000
            : Infinity
        return rows.filter(r => {
            const ms = new Date(r.created_at).getTime()
            if (ms < fromMs || ms >= toMs) return false
            if (categoryFilter !== 'ALL') {
                if (categoryFilter === '__UNCATEGORISED__') {
                    if (r.category) return false
                } else if (r.category !== categoryFilter) {
                    return false
                }
            }
            return true
        })
    }, [rows, dateFrom, dateTo, categoryFilter])

    // Totals row — sum approved and pending separately.  Use Number()
    // explicitly so we don't accidentally string-concat (Rule #20).
    const totals = useMemo(() => {
        let approved = 0
        let pending = 0
        let rejected = 0
        for (const r of visibleRows) {
            const amt = Number(r.amount) || 0
            if (r.status === 'APPROVED') approved += amt
            else if (r.status === 'PENDING') pending += amt
            else if (r.status === 'REJECTED') rejected += amt
        }
        return { approved, pending, rejected, count: visibleRows.length }
    }, [visibleRows])

    const handleExport = () => {
        if (visibleRows.length === 0) {
            toast.error('Nothing to export — adjust your filters')
            return
        }
        const header = [
            'Date',
            'Hotel',
            'Description',
            'Category',
            'Amount (INR)',
            'Status',
            'Requested By',
            'Reviewed By',
            'Reviewed At',
            'Rejection Reason',
        ]
        const dataRows = visibleRows.map(r => [
            new Date(r.created_at), // serialised as ISO-8601 by the helper
            r._hotelName || '',
            r.description,
            r.category || '',
            Number(r.amount) || 0,
            r.status,
            r.requester?.name || '',
            r.reviewer?.name || '',
            r.reviewed_at ? new Date(r.reviewed_at) : '',
            r.rejection_reason || '',
        ])

        // Spacer + totals so the file is self-explanatory when shared
        // (Think 8: every output must contain its own context).
        const totalsRows = [
            [],
            ['Filters'],
            ['Hotel', hotelId ? (hotelById.get(hotelId)?.name || hotelId) : 'All Hotels'],
            ['Status', statusFilter],
            ['Category', categoryFilter === '__UNCATEGORISED__' ? '(Uncategorised)' : categoryFilter],
            ['Date from', dateFrom],
            ['Date to', dateTo],
            [],
            ['Totals'],
            ['Approved spend', totals.approved],
            ['Pending pipeline', totals.pending],
            ['Rejected', totals.rejected],
            ['Row count', totals.count],
            [],
            ['Generated at', new Date()],
        ]

        const filename = `fajo-expenses-${todayIST()}`
        exportToCSV(filename, [header, ...dataRows, ...totalsRows])
    }

    const hotelLabel = hotelId
        ? hotelById.get(hotelId)?.name || 'Selected hotel'
        : 'All Hotels'

    return (
        <div className="space-y-4">
            {/* ==================== Filters Card ==================== */}
            <Card className="rounded-2xl">
                <CardContent className="py-4 px-4 sm:px-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div>
                            <Label htmlFor="status-filter" className="text-xs font-medium text-slate-600 mb-1 block">
                                Status
                            </Label>
                            <Select value={statusFilter} onValueChange={v => setStatusFilter(v as StatusFilter)}>
                                <SelectTrigger id="status-filter" className="w-full bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All statuses</SelectItem>
                                    <SelectItem value="PENDING">Pending</SelectItem>
                                    <SelectItem value="APPROVED">Approved</SelectItem>
                                    <SelectItem value="REJECTED">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="category-filter" className="text-xs font-medium text-slate-600 mb-1 block">
                                Category
                            </Label>
                            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                                <SelectTrigger id="category-filter" className="w-full bg-white">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All categories</SelectItem>
                                    <SelectItem value="__UNCATEGORISED__">(Uncategorised)</SelectItem>
                                    {categoryOptions.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label htmlFor="date-from" className="text-xs font-medium text-slate-600 mb-1 block">
                                Date from
                            </Label>
                            <Input
                                id="date-from"
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="w-full bg-white"
                                max={dateTo || undefined}
                            />
                        </div>

                        <div>
                            <Label htmlFor="date-to" className="text-xs font-medium text-slate-600 mb-1 block">
                                Date to
                            </Label>
                            <Input
                                id="date-to"
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="w-full bg-white"
                                min={dateFrom || undefined}
                                max={todayIST()}
                            />
                        </div>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2 mt-4">
                        <Button
                            variant="outline"
                            onClick={fetchExpenses}
                            disabled={loading}
                            className="h-11 w-full sm:w-auto"
                        >
                            {loading ? (
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                                <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Refresh
                        </Button>
                        <Button
                            onClick={handleExport}
                            disabled={loading || visibleRows.length === 0}
                            className="h-11 w-full sm:w-auto bg-slate-900 text-white hover:bg-slate-800"
                        >
                            <Download className="h-4 w-4 mr-2" />
                            Export CSV
                        </Button>
                        <div className="flex-1" />
                        <div className="text-xs text-slate-500 self-center text-center sm:text-right">
                            Showing <span className="font-semibold text-slate-700">{totals.count}</span> {totals.count === 1 ? 'row' : 'rows'} for {hotelLabel}
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* ==================== Totals Card ==================== */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Card className="rounded-2xl border-l-4 border-l-green-400">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center gap-2 text-xs font-medium text-green-700 uppercase tracking-wide">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Approved spend
                        </div>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totals.approved)}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border-l-4 border-l-blue-400">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center gap-2 text-xs font-medium text-blue-700 uppercase tracking-wide">
                            <Clock className="h-3.5 w-3.5" />
                            Pending pipeline
                        </div>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totals.pending)}</p>
                    </CardContent>
                </Card>
                <Card className="rounded-2xl border-l-4 border-l-red-300">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center gap-2 text-xs font-medium text-red-600 uppercase tracking-wide">
                            <XCircle className="h-3.5 w-3.5" />
                            Rejected
                        </div>
                        <p className="text-2xl font-bold text-slate-900 mt-1">{formatINR(totals.rejected)}</p>
                    </CardContent>
                </Card>
            </div>

            {/* ==================== Body ==================== */}
            {loading ? (
                <Card className="rounded-2xl">
                    <CardContent className="flex items-center justify-center py-16">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    </CardContent>
                </Card>
            ) : visibleRows.length === 0 ? (
                <Card className="rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <Receipt className="h-12 w-12 text-slate-300 mb-4" />
                        <p className="text-slate-500 font-medium">No expenses match these filters</p>
                        <p className="text-slate-400 text-sm mt-1">Try widening the date range or switching the status.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* Mobile (< md): stacked cards */}
                    <div className="grid gap-3 md:hidden">
                        {visibleRows.map(r => (
                            <Card key={r.id} className="rounded-2xl">
                                <CardContent className="py-4 px-4">
                                    <div className="flex items-start justify-between gap-3 mb-2">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-slate-900 break-words">{r.description}</p>
                                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                                                {statusBadge(r.status)}
                                                {r.category && (
                                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                        {r.category}
                                                    </span>
                                                )}
                                                {r._hotelName && (
                                                    <span className="text-[10px] font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-full">
                                                        {r._hotelName}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xl font-bold text-slate-900 leading-tight">{formatINR(Number(r.amount) || 0)}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-y-1 gap-x-3 text-xs text-slate-500 mt-2">
                                        <div>
                                            <span className="text-slate-400">Requested</span>
                                            <p className="text-slate-700 font-medium truncate">{r.requester?.name || '—'}</p>
                                            <p className="text-[10px] text-slate-400">{formatDateShortIST(r.created_at)}</p>
                                        </div>
                                        <div>
                                            <span className="text-slate-400">Reviewed</span>
                                            <p className="text-slate-700 font-medium truncate">{r.reviewer?.name || '—'}</p>
                                            <p className="text-[10px] text-slate-400">
                                                {r.reviewed_at ? formatDateShortIST(r.reviewed_at) : '—'}
                                            </p>
                                        </div>
                                    </div>

                                    {r.status === 'REJECTED' && r.rejection_reason && (
                                        <div className="mt-2 flex items-start gap-1.5 text-xs text-red-600 bg-red-50 rounded-lg p-2">
                                            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                            <span className="italic break-words">{r.rejection_reason}</span>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Desktop (>= md): proper table */}
                    <Card className="rounded-2xl hidden md:block overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        <th className="py-3 px-4">Date</th>
                                        <th className="py-3 px-4">Description</th>
                                        <th className="py-3 px-4">Hotel</th>
                                        <th className="py-3 px-4">Category</th>
                                        <th className="py-3 px-4 text-right">Amount</th>
                                        <th className="py-3 px-4">Status</th>
                                        <th className="py-3 px-4">Requested By</th>
                                        <th className="py-3 px-4">Reviewed By</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {visibleRows.map(r => (
                                        <tr key={r.id} className="hover:bg-slate-50/60 transition-colors">
                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                                <div>{formatDateShortIST(r.created_at)}</div>
                                                <div className="text-[11px] text-slate-400">{formatDateTimeIST(r.created_at).split(', ')[1] || ''}</div>
                                            </td>
                                            <td className="py-3 px-4">
                                                <div className="font-medium text-slate-900 max-w-xs">{r.description}</div>
                                                {r.status === 'REJECTED' && r.rejection_reason && (
                                                    <div className="text-[11px] text-red-500 italic mt-1 max-w-xs">
                                                        Reason: {r.rejection_reason}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{r._hotelName || '—'}</td>
                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{r.category || '—'}</td>
                                            <td className="py-3 px-4 text-right font-semibold text-slate-900 whitespace-nowrap">{formatINR(Number(r.amount) || 0)}</td>
                                            <td className="py-3 px-4">{statusBadge(r.status)}</td>
                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{r.requester?.name || '—'}</td>
                                            <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                                                <div>{r.reviewer?.name || '—'}</div>
                                                {r.reviewed_at && (
                                                    <div className="text-[11px] text-slate-400">{formatDateShortIST(r.reviewed_at)}</div>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </>
            )}
        </div>
    )
}
