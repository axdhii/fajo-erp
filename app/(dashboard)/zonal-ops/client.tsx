'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import html2canvas from 'html2canvas'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
    Package,
    Banknote,
    Receipt,
    AlertTriangle,
    CheckCircle2,
    Clock,
    Loader2,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    XCircle,
    ThumbsUp,
    ThumbsDown,
    Play,
    ClipboardList,
    ChevronLeft,
    ChevronRight,
    DollarSign,
    Smartphone,
    Download,
} from 'lucide-react'
import type { RestockRequest, PropertyExpense, CustomerIssue, ShiftReport } from '@/lib/types'

interface ZonalOpsClientProps {
    staffId: string
    hotels: { id: string; name: string }[]
}

type Tab = 'restock' | 'payments' | 'expenses' | 'issues' | 'shift-reports'

function timeAgo(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay}d ago`
}

function formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

interface PaymentRow {
    id: string
    booking_id: string
    amount_cash: number
    amount_digital: number
    total_paid: number
    created_at: string
    booking?: {
        unit?: { unit_number: string; hotel_id: string } | null
        guests?: { name: string }[]
    } | null
}

export function ZonalOpsClient({ staffId: _staffId, hotels }: ZonalOpsClientProps) {
    void _staffId // reserved for future per-staff audit trails
    const [selectedHotelId, setSelectedHotelId] = useState(hotels[0]?.id || '')
    const [tab, setTab] = useState<Tab>('restock')
    const [loading, setLoading] = useState(false)

    // ============ RESTOCK STATE ============
    const [pendingRestocks, setPendingRestocks] = useState<RestockRequest[]>([])
    const [doneRestocks, setDoneRestocks] = useState<RestockRequest[]>([])
    const [showDoneRestocks, setShowDoneRestocks] = useState(false)
    const [completingRestock, setCompletingRestock] = useState<string | null>(null)

    // ============ PAYMENTS STATE ============
    const [payments, setPayments] = useState<PaymentRow[]>([])

    // ============ EXPENSES STATE ============
    const [pendingExpenses, setPendingExpenses] = useState<PropertyExpense[]>([])
    const [reviewedExpenses, setReviewedExpenses] = useState<PropertyExpense[]>([])
    const [showReviewedExpenses, setShowReviewedExpenses] = useState(false)
    const [reviewingExpense, setReviewingExpense] = useState<string | null>(null)
    const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({})
    const [showRejectInput, setShowRejectInput] = useState<Record<string, boolean>>({})

    // ============ CUSTOMER ISSUES STATE ============
    const [openIssues, setOpenIssues] = useState<CustomerIssue[]>([])
    const [resolvedIssues, setResolvedIssues] = useState<CustomerIssue[]>([])
    const [showResolvedIssues, setShowResolvedIssues] = useState(false)
    const [updatingIssue, setUpdatingIssue] = useState<string | null>(null)
    const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({})

    // ============ SHIFT REPORTS STATE ============
    const [shiftReports, setShiftReports] = useState<ShiftReport[]>([])
    const [shiftReportDate, setShiftReportDate] = useState(
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    )
    const [expandedReport, setExpandedReport] = useState<string | null>(null)
    const reportRef = useRef<HTMLDivElement>(null)

    const selectedHotelName = hotels.find(h => h.id === selectedHotelId)?.name || 'Unknown'

    // ============ DOWNLOAD SHIFT REPORT AS IMAGE ============
    const handleDownloadReport = useCallback(async (report: ShiftReport) => {
        if (!reportRef.current) return
        const el = reportRef.current

        // Populate the hidden report div
        const shiftStart = new Date(report.shift_start).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
        const shiftEnd = new Date(report.shift_end).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
        const shiftDate = new Date(report.shift_start).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })

        el.innerHTML = `
            <div style="width:420px;padding:32px;background:#fff;font-family:system-ui,-apple-system,sans-serif;color:#1e293b;">
                <div style="text-align:center;margin-bottom:20px;">
                    <div style="font-size:22px;font-weight:800;color:#1e293b;">${selectedHotelName}</div>
                    <div style="font-size:13px;color:#94a3b8;margin-top:4px;">Shift Report</div>
                </div>
                <div style="border-top:2px solid #e2e8f0;padding-top:16px;margin-bottom:16px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:8px;">
                        <div>
                            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Staff</div>
                            <div style="font-size:15px;font-weight:700;">${report.staff?.name || 'Unknown'}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Role</div>
                            <div style="font-size:13px;font-weight:600;color:#64748b;">${report.staff?.role || ''}</div>
                        </div>
                    </div>
                    <div style="display:flex;justify-content:space-between;">
                        <div>
                            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Date</div>
                            <div style="font-size:13px;font-weight:600;">${shiftDate}</div>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;">Shift</div>
                            <div style="font-size:13px;font-weight:600;">${shiftStart} - ${shiftEnd}</div>
                        </div>
                    </div>
                </div>
                <div style="display:flex;gap:8px;margin-bottom:16px;">
                    <div style="flex:1;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:12px;padding:12px;text-align:center;">
                        <div style="font-size:11px;color:#16a34a;">Check-ins</div>
                        <div style="font-size:22px;font-weight:800;color:#15803d;">${report.total_check_ins}</div>
                    </div>
                    <div style="flex:1;background:#eff6ff;border:1px solid #bfdbfe;border-radius:12px;padding:12px;text-align:center;">
                        <div style="font-size:11px;color:#2563eb;">Check-outs</div>
                        <div style="font-size:22px;font-weight:800;color:#1d4ed8;">${report.total_check_outs}</div>
                    </div>
                    <div style="flex:1;background:#f5f3ff;border:1px solid #ddd6fe;border-radius:12px;padding:12px;text-align:center;">
                        <div style="font-size:11px;color:#7c3aed;">Reservations</div>
                        <div style="font-size:22px;font-weight:800;color:#6d28d9;">${report.total_reservations_created}</div>
                    </div>
                </div>
                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px;margin-bottom:16px;">
                    <div style="font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px;">Revenue</div>
                    <div style="display:flex;gap:12px;margin-bottom:12px;">
                        <div style="flex:1;background:#f0fdf4;border-radius:10px;padding:12px;">
                            <div style="font-size:11px;color:#16a34a;">Cash</div>
                            <div style="font-size:24px;font-weight:800;color:#15803d;">${formatCurrency(report.revenue_cash)}</div>
                        </div>
                        <div style="flex:1;background:#eff6ff;border-radius:10px;padding:12px;">
                            <div style="font-size:11px;color:#2563eb;">Digital</div>
                            <div style="font-size:24px;font-weight:800;color:#1d4ed8;">${formatCurrency(report.revenue_digital)}</div>
                        </div>
                    </div>
                    <div style="text-align:center;background:#fff7ed;border-radius:10px;padding:12px;">
                        <div style="font-size:11px;color:#ea580c;">Total Revenue</div>
                        <div style="font-size:28px;font-weight:800;color:#c2410c;">${formatCurrency(report.revenue_total)}</div>
                    </div>
                </div>
                ${(report.restock_requests_count > 0 || report.customer_issues_count > 0 || report.expense_requests_count > 0) ? `
                <div style="display:flex;gap:8px;margin-bottom:16px;">
                    ${report.restock_requests_count > 0 ? `<div style="background:#fff7ed;color:#ea580c;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">${report.restock_requests_count} restocks</div>` : ''}
                    ${report.customer_issues_count > 0 ? `<div style="background:#fef2f2;color:#dc2626;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">${report.customer_issues_count} issues</div>` : ''}
                    ${report.expense_requests_count > 0 ? `<div style="background:#eff6ff;color:#2563eb;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px;">${report.expense_requests_count} expenses</div>` : ''}
                </div>` : ''}
                ${(report.check_in_units as any[])?.length > 0 ? `
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:6px;">Check-in Units</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${(report.check_in_units as any[]).map((u: any) => `<span style="font-size:11px;background:#dcfce7;color:#15803d;padding:3px 8px;border-radius:8px;font-weight:500;">${u.unit_number}${u.guest_names ? ` - ${u.guest_names}` : ''}</span>`).join('')}
                    </div>
                </div>` : ''}
                ${(report.check_out_units as any[])?.length > 0 ? `
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:6px;">Check-out Units</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${(report.check_out_units as any[]).map((u: any) => `<span style="font-size:11px;background:#dbeafe;color:#1d4ed8;padding:3px 8px;border-radius:8px;font-weight:500;">${u.unit_number}${u.guest_names ? ` - ${u.guest_names}` : ''}</span>`).join('')}
                    </div>
                </div>` : ''}
                ${(report.reservations_list as any[])?.length > 0 ? `
                <div style="margin-bottom:12px;">
                    <div style="font-size:11px;color:#64748b;font-weight:600;margin-bottom:6px;">Reservations</div>
                    <div style="display:flex;flex-wrap:wrap;gap:4px;">
                        ${(report.reservations_list as any[]).map((u: any) => `<span style="font-size:11px;background:#ede9fe;color:#6d28d9;padding:3px 8px;border-radius:8px;font-weight:500;">${u.unit_number}${u.guest_names ? ` - ${u.guest_names}` : ''}</span>`).join('')}
                    </div>
                </div>` : ''}
                <div style="text-align:center;font-size:10px;color:#cbd5e1;margin-top:16px;border-top:1px solid #e2e8f0;padding-top:12px;">
                    Generated by Fajo ERP
                </div>
            </div>
        `

        // Show the element temporarily for capture
        el.style.position = 'fixed'
        el.style.left = '-9999px'
        el.style.top = '0'
        el.style.display = 'block'
        el.style.zIndex = '-1'

        try {
            const canvas = await html2canvas(el, { scale: 2, backgroundColor: '#ffffff' })
            const link = document.createElement('a')
            link.download = `shift-report-${report.staff?.name?.replace(/\s+/g, '-') || 'staff'}-${shiftDate}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
            toast.success('Report downloaded')
        } catch (err) {
            console.error('Download report error:', err)
            toast.error('Failed to download report')
        } finally {
            el.style.display = 'none'
        }
    }, [selectedHotelName])

    // ============ FETCH FUNCTIONS ============

    const fetchPendingRestocks = useCallback(async () => {
        if (!selectedHotelId) return
        const { data } = await supabase
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .eq('hotel_id', selectedHotelId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
        if (data) setPendingRestocks(data)
    }, [selectedHotelId])

    const fetchDoneRestocks = useCallback(async () => {
        if (!selectedHotelId) return
        const { data } = await supabase
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .eq('hotel_id', selectedHotelId)
            .eq('status', 'DONE')
            .order('completed_at', { ascending: false })
            .limit(10)
        if (data) setDoneRestocks(data)
    }, [selectedHotelId])

    const fetchPayments = useCallback(async () => {
        if (!selectedHotelId) return
        // Get all unit IDs for the selected hotel
        const { data: units } = await supabase
            .from('units')
            .select('id')
            .eq('hotel_id', selectedHotelId)
        if (!units || units.length === 0) { setPayments([]); return }
        const unitIds = units.map(u => u.id)

        // Get today's IST date range
        const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const todayStart = `${todayIST}T00:00:00+05:30`
        const tomorrowDate = new Date(new Date(todayStart).getTime() + 86400000).toISOString()

        // Get today's bookings for this hotel
        const { data: bookings } = await supabase
            .from('bookings')
            .select('id, unit_id')
            .in('unit_id', unitIds)

        if (!bookings || bookings.length === 0) { setPayments([]); return }
        const bookingIds = bookings.map(b => b.id)

        // Get today's payments
        const { data: paymentData } = await supabase
            .from('payments')
            .select('*')
            .in('booking_id', bookingIds)
            .gte('created_at', todayStart)
            .lt('created_at', tomorrowDate)
            .order('created_at', { ascending: false })

        if (!paymentData) { setPayments([]); return }

        // Enrich each payment with booking + unit + guest info
        const bookingMap = new Map(bookings.map(b => [b.id, b]))
        const enriched: PaymentRow[] = []

        for (const p of paymentData) {
            const booking = bookingMap.get(p.booking_id)
            if (!booking) continue

            // Find unit info
            const { data: unitData } = await supabase
                .from('units')
                .select('unit_number, hotel_id')
                .eq('id', booking.unit_id)
                .single()

            // Find guest name
            const { data: guests } = await supabase
                .from('guests')
                .select('name')
                .eq('booking_id', p.booking_id)
                .limit(1)

            enriched.push({
                ...p,
                booking: {
                    unit: unitData,
                    guests: guests || [],
                },
            })
        }

        setPayments(enriched)
    }, [selectedHotelId])

    const fetchPendingExpenses = useCallback(async () => {
        if (!selectedHotelId) return
        const { data } = await supabase
            .from('property_expenses')
            .select('*, requester:requested_by(name), reviewer:reviewed_by(name)')
            .eq('hotel_id', selectedHotelId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
        if (data) setPendingExpenses(data)
    }, [selectedHotelId])

    const fetchReviewedExpenses = useCallback(async () => {
        if (!selectedHotelId) return
        const { data } = await supabase
            .from('property_expenses')
            .select('*, requester:requested_by(name), reviewer:reviewed_by(name)')
            .eq('hotel_id', selectedHotelId)
            .in('status', ['APPROVED', 'REJECTED'])
            .order('reviewed_at', { ascending: false })
            .limit(15)
        if (data) setReviewedExpenses(data)
    }, [selectedHotelId])

    const fetchOpenIssues = useCallback(async () => {
        if (!selectedHotelId) return
        const { data } = await supabase
            .from('customer_issues')
            .select('*, unit:units(unit_number), reporter:reported_by(name), resolver:resolved_by(name)')
            .eq('hotel_id', selectedHotelId)
            .in('status', ['OPEN', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })
        if (data) setOpenIssues(data)
    }, [selectedHotelId])

    const fetchResolvedIssues = useCallback(async () => {
        if (!selectedHotelId) return
        const { data } = await supabase
            .from('customer_issues')
            .select('*, unit:units(unit_number), reporter:reported_by(name), resolver:resolved_by(name)')
            .eq('hotel_id', selectedHotelId)
            .eq('status', 'RESOLVED')
            .order('resolved_at', { ascending: false })
            .limit(10)
        if (data) setResolvedIssues(data)
    }, [selectedHotelId])

    const fetchShiftReports = useCallback(async () => {
        if (!selectedHotelId) return
        const from = `${shiftReportDate}T00:00:00+05:30`
        const nextDay = new Date(new Date(from).getTime() + 86400000).toISOString()
        try {
            const res = await fetch(`/api/shift-reports?hotel_id=${selectedHotelId}&from=${from}&to=${nextDay}`)
            const json = await res.json()
            if (json.data) setShiftReports(json.data)
        } catch {
            setShiftReports([])
        }
    }, [selectedHotelId, shiftReportDate])

    // ============ DATA LOADING ============

    useEffect(() => {
        if (!selectedHotelId) return
        setLoading(true)
        const load = async () => {
            if (tab === 'restock') {
                await Promise.all([fetchPendingRestocks(), fetchDoneRestocks()])
            } else if (tab === 'payments') {
                await fetchPayments()
            } else if (tab === 'expenses') {
                await Promise.all([fetchPendingExpenses(), fetchReviewedExpenses()])
            } else if (tab === 'issues') {
                await Promise.all([fetchOpenIssues(), fetchResolvedIssues()])
            } else if (tab === 'shift-reports') {
                await fetchShiftReports()
            }
            setLoading(false)
        }
        load()
    }, [tab, selectedHotelId, fetchPendingRestocks, fetchDoneRestocks, fetchPayments, fetchPendingExpenses, fetchReviewedExpenses, fetchOpenIssues, fetchResolvedIssues, fetchShiftReports])

    // ============ REALTIME SUBSCRIPTIONS ============

    // Restock realtime
    useEffect(() => {
        if (tab !== 'restock' || !selectedHotelId) return
        const channel = supabase
            .channel(`restock_zonalops_${selectedHotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'restock_requests',
                filter: `hotel_id=eq.${selectedHotelId}`,
            }, () => {
                fetchPendingRestocks()
                fetchDoneRestocks()
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, selectedHotelId, fetchPendingRestocks, fetchDoneRestocks])

    // Expenses realtime
    useEffect(() => {
        if (tab !== 'expenses' || !selectedHotelId) return
        const channel = supabase
            .channel(`expenses_zonalops_${selectedHotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'property_expenses',
                filter: `hotel_id=eq.${selectedHotelId}`,
            }, () => {
                fetchPendingExpenses()
                fetchReviewedExpenses()
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, selectedHotelId, fetchPendingExpenses, fetchReviewedExpenses])

    // Customer issues realtime
    useEffect(() => {
        if (tab !== 'issues' || !selectedHotelId) return
        const channel = supabase
            .channel(`issues_zonalops_${selectedHotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'customer_issues',
                filter: `hotel_id=eq.${selectedHotelId}`,
            }, () => {
                fetchOpenIssues()
                fetchResolvedIssues()
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, selectedHotelId, fetchOpenIssues, fetchResolvedIssues])

    // ============ ACTION HANDLERS ============

    // Mark restock as done
    const handleCompleteRestock = async (requestId: string) => {
        setCompletingRestock(requestId)
        try {
            const res = await fetch('/api/restock', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Restock completed')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to complete restock')
        } finally {
            setCompletingRestock(null)
        }
    }

    // Approve expense
    const handleApproveExpense = async (expenseId: string) => {
        setReviewingExpense(expenseId)
        try {
            const res = await fetch('/api/expenses', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expense_id: expenseId, action: 'APPROVED' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Expense approved')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to approve expense')
        } finally {
            setReviewingExpense(null)
        }
    }

    // Reject expense
    const handleRejectExpense = async (expenseId: string) => {
        const reason = rejectionReasons[expenseId]?.trim()
        if (!reason) {
            toast.error('Please provide a rejection reason')
            return
        }
        setReviewingExpense(expenseId)
        try {
            const res = await fetch('/api/expenses', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expense_id: expenseId, action: 'REJECTED', rejection_reason: reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Expense rejected')
            setRejectionReasons(prev => { const n = { ...prev }; delete n[expenseId]; return n })
            setShowRejectInput(prev => { const n = { ...prev }; delete n[expenseId]; return n })
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to reject expense')
        } finally {
            setReviewingExpense(null)
        }
    }

    // Update customer issue status
    const handleUpdateIssue = async (issueId: string, status: string) => {
        setUpdatingIssue(issueId)
        try {
            const body: Record<string, unknown> = { issue_id: issueId, status }
            if (status === 'RESOLVED') {
                body.resolution_notes = resolutionNotes[issueId] || ''
            }
            const res = await fetch('/api/customer-issues', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(status === 'IN_PROGRESS' ? 'Issue started' : 'Issue resolved')
            if (status === 'RESOLVED') {
                setResolutionNotes(prev => { const n = { ...prev }; delete n[issueId]; return n })
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update issue')
        } finally {
            setUpdatingIssue(null)
        }
    }

    // Refresh current tab
    const handleRefresh = () => {
        if (tab === 'restock') { fetchPendingRestocks(); fetchDoneRestocks() }
        else if (tab === 'payments') { fetchPayments() }
        else if (tab === 'expenses') { fetchPendingExpenses(); fetchReviewedExpenses() }
        else if (tab === 'issues') { fetchOpenIssues(); fetchResolvedIssues() }
        else if (tab === 'shift-reports') { fetchShiftReports() }
        toast.success('Refreshed')
    }

    // ============ PAYMENT TOTALS ============

    const paymentTotals = useMemo(() => {
        let cash = 0
        let digital = 0
        for (const p of payments) {
            cash += Number(p.amount_cash || 0)
            digital += Number(p.amount_digital || 0)
        }
        return { cash, digital, total: cash + digital }
    }, [payments])

    // Badge counts
    const pendingRestockCount = pendingRestocks.length
    const pendingExpenseCount = pendingExpenses.length
    const openIssueCount = openIssues.length

    const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'restock', label: 'Restocks', icon: <Package className="h-4 w-4" />, badge: pendingRestockCount },
        { key: 'payments', label: 'Payments', icon: <Banknote className="h-4 w-4" /> },
        { key: 'expenses', label: 'Expenses', icon: <Receipt className="h-4 w-4" />, badge: pendingExpenseCount },
        { key: 'issues', label: 'Issues', icon: <AlertTriangle className="h-4 w-4" />, badge: openIssueCount },
        { key: 'shift-reports', label: 'Shift Reports', icon: <ClipboardList className="h-4 w-4" /> },
    ]

    const STATUS_STYLES: Record<string, string> = {
        OPEN: 'bg-red-100 text-red-700',
        IN_PROGRESS: 'bg-amber-100 text-amber-700',
        RESOLVED: 'bg-green-100 text-green-700',
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Zonal Ops Dashboard</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage restocks, payments, expenses, and customer issues across properties.</p>
                </div>
                <div className="flex items-center gap-3">
                    {/* Hotel selector */}
                    <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                        <SelectTrigger className="w-[200px] h-9">
                            <SelectValue placeholder="Select hotel..." />
                        </SelectTrigger>
                        <SelectContent>
                            {hotels.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    <Button variant="outline" size="sm" onClick={handleRefresh} className="gap-2">
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit flex-wrap gap-1">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-all ${
                            tab === t.key
                                ? 'bg-orange-600 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        {t.icon}
                        {t.label}
                        {(t.badge ?? 0) > 0 && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                tab === t.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                            }`}>
                                {t.badge}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                </div>
            )}

            {/* ======================== RESTOCK TAB ======================== */}
            {tab === 'restock' && !loading && (
                <div className="space-y-4">
                    {pendingRestocks.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <Package className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No pending restock requests</p>
                                <p className="text-slate-400 text-sm mt-1">All caught up for {selectedHotelName}!</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3">
                            {pendingRestocks.map(req => (
                                <Card key={req.id} className="rounded-2xl border-l-4 border-l-amber-400">
                                    <CardContent className="py-4 px-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className="font-bold text-slate-900">
                                                        {req.unit?.unit_number || 'Hotel Supplies'}
                                                    </span>
                                                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                                                        PENDING
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-700 mb-2">{req.items}</p>
                                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                                    {req.staff?.name && (
                                                        <span>Requested by {req.staff.name}</span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {timeAgo(req.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleCompleteRestock(req.id)}
                                                disabled={completingRestock === req.id}
                                                className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                                            >
                                                {completingRestock === req.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 mr-1" />
                                                        Mark Done
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Recently Completed */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowDoneRestocks(!showDoneRestocks)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showDoneRestocks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Recently Completed ({doneRestocks.length})
                        </button>
                        {showDoneRestocks && (
                            <div className="grid gap-2 mt-3">
                                {doneRestocks.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No completed requests yet.</p>
                                ) : (
                                    doneRestocks.map(req => (
                                        <Card key={req.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-semibold text-slate-700 text-sm">
                                                            {req.unit?.unit_number || 'Hotel Supplies'}
                                                        </span>
                                                        <span className="text-slate-400 text-sm ml-2">{req.items}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-400">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                        {req.completed_at ? timeAgo(req.completed_at) : timeAgo(req.created_at)}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== PAYMENTS TAB ======================== */}
            {tab === 'payments' && !loading && (
                <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <Card className="rounded-2xl">
                            <CardContent className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100 text-green-600">
                                        <Banknote className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Cash Today</p>
                                        <p className="text-xl font-bold text-slate-900">{formatCurrency(paymentTotals.cash)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl">
                            <CardContent className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                        <Receipt className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-slate-500 font-medium">Digital Today</p>
                                        <p className="text-xl font-bold text-slate-900">{formatCurrency(paymentTotals.digital)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card className="rounded-2xl border-2 border-orange-200">
                            <CardContent className="py-4 px-5">
                                <div className="flex items-center gap-3">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                                        <Banknote className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <p className="text-xs text-orange-600 font-bold">Total Today</p>
                                        <p className="text-xl font-bold text-orange-700">{formatCurrency(paymentTotals.total)}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Payment List */}
                    {payments.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <Banknote className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No payments recorded today</p>
                                <p className="text-slate-400 text-sm mt-1">{selectedHotelName}</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-2">
                            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Today&apos;s Payments ({payments.length})</h3>
                            {payments.map(p => (
                                <Card key={p.id} className="rounded-2xl">
                                    <CardContent className="py-3 px-5">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="flex items-center gap-3 min-w-0">
                                                <span className="font-bold text-slate-900 text-sm">
                                                    {p.booking?.unit?.unit_number || '—'}
                                                </span>
                                                <span className="text-xs text-slate-400 truncate">
                                                    {p.booking?.guests?.[0]?.name || 'Guest'}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0">
                                                {Number(p.amount_cash) > 0 && (
                                                    <span className="text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full font-medium">
                                                        Cash {formatCurrency(Number(p.amount_cash))}
                                                    </span>
                                                )}
                                                {Number(p.amount_digital) > 0 && (
                                                    <span className="text-xs text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                                                        Digital {formatCurrency(Number(p.amount_digital))}
                                                    </span>
                                                )}
                                                <span className="text-xs text-slate-400">
                                                    {new Date(p.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                                                </span>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ======================== EXPENSES TAB ======================== */}
            {tab === 'expenses' && !loading && (
                <div className="space-y-4">
                    {pendingExpenses.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <Receipt className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No pending expense requests</p>
                                <p className="text-slate-400 text-sm mt-1">All expenses reviewed for {selectedHotelName}!</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3">
                            {pendingExpenses.map(exp => (
                                <Card key={exp.id} className="rounded-2xl border-l-4 border-l-blue-400">
                                    <CardContent className="py-4 px-5">
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className="font-bold text-slate-900">{exp.description}</span>
                                                        <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full font-medium">
                                                            PENDING
                                                        </span>
                                                        {exp.category && (
                                                            <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                                                                {exp.category}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-lg font-bold text-slate-900 mt-1">{formatCurrency(Number(exp.amount))}</p>
                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                        {exp.requester?.name && (
                                                            <span>Requested by {exp.requester.name}</span>
                                                        )}
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {timeAgo(exp.created_at)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Action buttons */}
                                            <div className="flex items-end gap-2 flex-wrap">
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleApproveExpense(exp.id)}
                                                    disabled={reviewingExpense === exp.id}
                                                    className="bg-green-600 hover:bg-green-700 text-white"
                                                >
                                                    {reviewingExpense === exp.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <ThumbsUp className="h-3.5 w-3.5 mr-1" />
                                                            Approve
                                                        </>
                                                    )}
                                                </Button>

                                                {!showRejectInput[exp.id] ? (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => setShowRejectInput(prev => ({ ...prev, [exp.id]: true }))}
                                                        disabled={reviewingExpense === exp.id}
                                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                                    >
                                                        <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                                                        Reject
                                                    </Button>
                                                ) : (
                                                    <div className="flex items-end gap-2 flex-1 min-w-[200px]">
                                                        <textarea
                                                            placeholder="Rejection reason..."
                                                            value={rejectionReasons[exp.id] || ''}
                                                            onChange={e => setRejectionReasons(prev => ({ ...prev, [exp.id]: e.target.value }))}
                                                            className="flex-1 text-sm border border-red-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-red-300"
                                                            rows={1}
                                                        />
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleRejectExpense(exp.id)}
                                                            disabled={reviewingExpense === exp.id}
                                                            className="bg-red-600 hover:bg-red-700 text-white shrink-0"
                                                        >
                                                            {reviewingExpense === exp.id ? (
                                                                <Loader2 className="h-4 w-4 animate-spin" />
                                                            ) : (
                                                                'Confirm Reject'
                                                            )}
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => {
                                                                setShowRejectInput(prev => { const n = { ...prev }; delete n[exp.id]; return n })
                                                                setRejectionReasons(prev => { const n = { ...prev }; delete n[exp.id]; return n })
                                                            }}
                                                            className="shrink-0 text-slate-400"
                                                        >
                                                            <XCircle className="h-4 w-4" />
                                                        </Button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Reviewed Expenses */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowReviewedExpenses(!showReviewedExpenses)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showReviewedExpenses ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Reviewed ({reviewedExpenses.length})
                        </button>
                        {showReviewedExpenses && (
                            <div className="grid gap-2 mt-3">
                                {reviewedExpenses.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No reviewed expenses yet.</p>
                                ) : (
                                    reviewedExpenses.map(exp => (
                                        <Card key={exp.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                                                            <span className="font-semibold text-slate-700 text-sm">{exp.description}</span>
                                                            <span className="font-bold text-sm text-slate-900">{formatCurrency(Number(exp.amount))}</span>
                                                            {exp.category && (
                                                                <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-full">{exp.category}</span>
                                                            )}
                                                        </div>
                                                        {exp.status === 'REJECTED' && exp.rejection_reason && (
                                                            <p className="text-xs text-red-500 mt-0.5 italic">Reason: {exp.rejection_reason}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 shrink-0">
                                                        {exp.status === 'APPROVED' ? (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">APPROVED</span>
                                                        ) : (
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">REJECTED</span>
                                                        )}
                                                        <span className="text-xs text-slate-400">
                                                            {exp.reviewed_at ? timeAgo(exp.reviewed_at) : ''}
                                                        </span>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== CUSTOMER ISSUES TAB ======================== */}
            {tab === 'issues' && !loading && (
                <div className="space-y-4">
                    {openIssues.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <CheckCircle2 className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No open customer issues</p>
                                <p className="text-slate-400 text-sm mt-1">All clear for {selectedHotelName}!</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3">
                            {openIssues.map(issue => {
                                const sStyle = STATUS_STYLES[issue.status] || STATUS_STYLES.OPEN
                                return (
                                    <Card key={issue.id} className={`rounded-2xl border-l-4 ${issue.status === 'IN_PROGRESS' ? 'border-l-amber-400' : 'border-l-red-400'}`}>
                                        <CardContent className="py-4 px-5">
                                            <div className="space-y-3">
                                                {/* Header */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            {issue.unit?.unit_number && (
                                                                <span className="font-bold text-slate-900">{issue.unit.unit_number}</span>
                                                            )}
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${sStyle}`}>
                                                                {issue.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-slate-700">{issue.description}</p>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                                            {issue.guest_name && (
                                                                <span className="font-medium text-slate-600">Guest: {issue.guest_name}</span>
                                                            )}
                                                            {issue.guest_phone && (
                                                                <span>{issue.guest_phone}</span>
                                                            )}
                                                            {issue.reporter?.name && (
                                                                <span>Reported by {issue.reporter.name}</span>
                                                            )}
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {timeAgo(issue.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-end gap-2">
                                                    {issue.status === 'OPEN' && (
                                                        <>
                                                            <textarea
                                                                placeholder="Notes (optional)..."
                                                                value={resolutionNotes[issue.id] || ''}
                                                                onChange={e => setResolutionNotes(prev => ({ ...prev, [issue.id]: e.target.value }))}
                                                                className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-orange-300"
                                                                rows={1}
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateIssue(issue.id, 'IN_PROGRESS')}
                                                                disabled={updatingIssue === issue.id}
                                                                className="bg-slate-700 hover:bg-slate-800 text-white shrink-0"
                                                            >
                                                                {updatingIssue === issue.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Play className="h-3.5 w-3.5 mr-1" />
                                                                        Start
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </>
                                                    )}
                                                    {issue.status === 'IN_PROGRESS' && (
                                                        <>
                                                            <textarea
                                                                placeholder="Resolution notes..."
                                                                value={resolutionNotes[issue.id] || ''}
                                                                onChange={e => setResolutionNotes(prev => ({ ...prev, [issue.id]: e.target.value }))}
                                                                className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-orange-300"
                                                                rows={1}
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateIssue(issue.id, 'RESOLVED')}
                                                                disabled={updatingIssue === issue.id}
                                                                className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                                                            >
                                                                {updatingIssue === issue.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                                                        Resolve
                                                                    </>
                                                                )}
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}

                    {/* Resolved Issues */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowResolvedIssues(!showResolvedIssues)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showResolvedIssues ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Resolved ({resolvedIssues.length})
                        </button>
                        {showResolvedIssues && (
                            <div className="grid gap-2 mt-3">
                                {resolvedIssues.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No resolved issues yet.</p>
                                ) : (
                                    resolvedIssues.map(issue => (
                                        <Card key={issue.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            {issue.unit?.unit_number && (
                                                                <span className="font-semibold text-slate-700 text-sm">{issue.unit.unit_number}</span>
                                                            )}
                                                            {issue.guest_name && (
                                                                <span className="text-xs text-slate-500">{issue.guest_name}</span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate">{issue.description}</p>
                                                        {issue.resolution_notes && (
                                                            <p className="text-xs text-green-600 mt-0.5 italic">{issue.resolution_notes}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                        {issue.resolved_at ? timeAgo(issue.resolved_at) : timeAgo(issue.created_at)}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== SHIFT REPORTS TAB ======================== */}
            {tab === 'shift-reports' && !loading && (
                <div className="space-y-4">
                    {/* Date Navigation */}
                    <Card className="rounded-2xl">
                        <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => {
                                        const d = new Date(shiftReportDate + 'T00:00:00')
                                        d.setDate(d.getDate() - 1)
                                        setShiftReportDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
                                    }} className="h-8 w-8 p-0">
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Input
                                        type="date"
                                        value={shiftReportDate}
                                        onChange={e => setShiftReportDate(e.target.value)}
                                        className="w-44 h-8 text-sm"
                                    />
                                    <Button variant="outline" size="sm" onClick={() => {
                                        const d = new Date(shiftReportDate + 'T00:00:00')
                                        d.setDate(d.getDate() + 1)
                                        setShiftReportDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
                                    }} className="h-8 w-8 p-0">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    {shiftReportDate !== new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) && (
                                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShiftReportDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))}>
                                            Today
                                        </Button>
                                    )}
                                </div>
                                <span className="text-xs text-slate-500">{shiftReports.length} reports</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Reports List */}
                    {shiftReports.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <ClipboardList className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No shift reports for this date</p>
                                <p className="text-slate-400 text-sm mt-1">Reports are generated when staff clock out at {selectedHotelName}.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {shiftReports.map(r => {
                                const isExpanded = expandedReport === r.id
                                const shiftStart = new Date(r.shift_start).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
                                const shiftEnd = new Date(r.shift_end).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })

                                return (
                                    <Card key={r.id} className="rounded-2xl overflow-hidden">
                                        <CardContent className="p-0">
                                            {/* Summary row */}
                                            <button
                                                onClick={() => setExpandedReport(isExpanded ? null : r.id)}
                                                className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-slate-50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                                                        <ClipboardList className="h-4 w-4 text-orange-600" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 flex-wrap">
                                                            <span className="font-bold text-slate-800">{r.staff?.name || 'Unknown'}</span>
                                                            <span className="text-xs text-slate-400">{r.staff?.role}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                                            <span>{shiftStart} - {shiftEnd}</span>
                                                            <span className="text-emerald-600 font-semibold">
                                                                {r.total_check_ins} in / {r.total_check_outs} out
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-3 shrink-0">
                                                    <span className="text-sm font-bold text-slate-800">
                                                        {formatCurrency(r.revenue_total)}
                                                    </span>
                                                    {isExpanded ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                                                </div>
                                            </button>

                                            {/* Expanded details */}
                                            {isExpanded && (
                                                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/50 space-y-4">
                                                    {/* Stats grid */}
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                                                            <p className="text-xs text-slate-400">Check-ins</p>
                                                            <p className="text-lg font-bold text-emerald-600">{r.total_check_ins}</p>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                                                            <p className="text-xs text-slate-400">Check-outs</p>
                                                            <p className="text-lg font-bold text-blue-600">{r.total_check_outs}</p>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                                                            <p className="text-xs text-slate-400">Reservations</p>
                                                            <p className="text-lg font-bold text-violet-600">{r.total_reservations_created}</p>
                                                        </div>
                                                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                                                            <p className="text-xs text-slate-400">Guests Handled</p>
                                                            <p className="text-lg font-bold text-slate-700">{r.total_guests_handled}</p>
                                                        </div>
                                                    </div>

                                                    {/* Revenue breakdown */}
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Banknote className="h-4 w-4 text-emerald-600" />
                                                                <p className="text-xs text-emerald-500">Cash</p>
                                                            </div>
                                                            <p className="text-xl font-extrabold text-emerald-700">{formatCurrency(r.revenue_cash)}</p>
                                                        </div>
                                                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Smartphone className="h-4 w-4 text-blue-600" />
                                                                <p className="text-xs text-blue-500">Digital</p>
                                                            </div>
                                                            <p className="text-xl font-extrabold text-blue-700">{formatCurrency(r.revenue_digital)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="bg-orange-50 rounded-xl p-4 border border-orange-100 text-center">
                                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                                            <DollarSign className="h-4 w-4 text-orange-600" />
                                                            <p className="text-xs text-orange-500">Total Revenue</p>
                                                        </div>
                                                        <p className="text-2xl font-extrabold text-orange-700">{formatCurrency(r.revenue_total)}</p>
                                                    </div>

                                                    {/* Other activity */}
                                                    <div className="flex items-center gap-4 text-xs text-slate-500">
                                                        {r.restock_requests_count > 0 && (
                                                            <span className="px-2 py-1 rounded-full bg-orange-50 text-orange-600 font-medium">
                                                                {r.restock_requests_count} restocks
                                                            </span>
                                                        )}
                                                        {r.customer_issues_count > 0 && (
                                                            <span className="px-2 py-1 rounded-full bg-red-50 text-red-600 font-medium">
                                                                {r.customer_issues_count} issues
                                                            </span>
                                                        )}
                                                        {r.expense_requests_count > 0 && (
                                                            <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
                                                                {r.expense_requests_count} expenses
                                                            </span>
                                                        )}
                                                        {r.restock_requests_count === 0 && r.customer_issues_count === 0 && r.expense_requests_count === 0 && (
                                                            <span className="text-slate-400 italic">No other activity</span>
                                                        )}
                                                    </div>

                                                    {/* Unit details */}
                                                    {(r.check_in_units as any[])?.length > 0 && (
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Check-in Units</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(r.check_in_units as any[]).map((u: any, i: number) => (
                                                                    <span key={i} className="text-xs bg-emerald-100 text-emerald-700 rounded-lg px-2 py-1 font-medium">
                                                                        {u.unit_number} {u.guest_names && `- ${u.guest_names}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(r.check_out_units as any[])?.length > 0 && (
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Check-out Units</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(r.check_out_units as any[]).map((u: any, i: number) => (
                                                                    <span key={i} className="text-xs bg-blue-100 text-blue-700 rounded-lg px-2 py-1 font-medium">
                                                                        {u.unit_number} {u.guest_names && `- ${u.guest_names}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(r.reservations_list as any[])?.length > 0 && (
                                                        <div>
                                                            <p className="text-xs font-semibold text-slate-500 mb-1.5">Reservations Created</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {(r.reservations_list as any[]).map((u: any, i: number) => (
                                                                    <span key={i} className="text-xs bg-violet-100 text-violet-700 rounded-lg px-2 py-1 font-medium">
                                                                        {u.unit_number} {u.guest_names && `- ${u.guest_names}`}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}

                                                    {/* Download button */}
                                                    <div className="pt-2 border-t border-slate-100">
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="w-full gap-2 text-xs"
                                                            onClick={(e) => { e.stopPropagation(); handleDownloadReport(r) }}
                                                        >
                                                            <Download className="h-3.5 w-3.5" />
                                                            Download Report
                                                        </Button>
                                                    </div>
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* Hidden div for report image generation */}
            <div ref={reportRef} style={{ display: 'none' }} />
        </div>
    )
}
