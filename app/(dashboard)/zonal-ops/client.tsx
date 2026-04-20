'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
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
    Camera,
    FileText,
    Eye,
} from 'lucide-react'
import type { RestockRequest, PropertyExpense, CustomerIssue, ShiftReport, PropertyReport } from '@/lib/types'
import { timeAgo } from '@/lib/utils/time'
import { useUnitStore } from '@/lib/store/unit-store'
import { useCurrentTime, getCheckoutAlert } from '@/lib/hooks/use-current-time'

interface ZonalOpsClientProps {
    staffId: string
    hotels: { id: string; name: string }[]
}

type Tab = 'monitor' | 'restock' | 'payments' | 'expenses' | 'issues' | 'shift-reports' | 'reports'

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
    const [tab, setTab] = useState<Tab>('monitor')
    const [loading, setLoading] = useState(false)

    // ============ MONITOR STATE ============
    const { units, fetchUnitsWithBookings, subscribeToUnits } = useUnitStore()
    const now = useCurrentTime(30000) // Update every 30 seconds

    // ============ RESTOCK STATE ============
    const [pendingRestocks, setPendingRestocks] = useState<RestockRequest[]>([])
    const [doneRestocks, setDoneRestocks] = useState<RestockRequest[]>([])
    const [showDoneRestocks, setShowDoneRestocks] = useState(false)
    const [completingRestock, setCompletingRestock] = useState<string | null>(null)

    // ============ PAYMENTS STATE ============
    const [payments, setPayments] = useState<PaymentRow[]>([])
    const [rptGenerating, setRptGenerating] = useState(false)

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
    const [shiftReportFromTime, setShiftReportFromTime] = useState('00:00')
    const [shiftReportToTime, setShiftReportToTime] = useState('23:59')
    const [expandedReport, setExpandedReport] = useState<string | null>(null)
    const [downloadingReport, setDownloadingReport] = useState<string | null>(null)

    // ============ PROPERTY REPORTS STATE ============
    const [reports, setReports] = useState<PropertyReport[]>([])
    const [reportDescription, setReportDescription] = useState('')
    const [reportCategory, setReportCategory] = useState('OTHER')
    const [reportType, setReportType] = useState<'REPORT' | 'ISSUE'>('REPORT')
    const [reportPhotoUrl, setReportPhotoUrl] = useState('')
    const [reportSubmitting, setReportSubmitting] = useState(false)
    const [reportUploading, setReportUploading] = useState(false)

    const selectedHotelName = hotels.find(h => h.id === selectedHotelId)?.name || 'Unknown'

    // ============ DOWNLOAD SHIFT REPORT AS IMAGE (native Canvas — no html2canvas) ============
    const handleDownloadReport = useCallback(async (report: ShiftReport) => {
        setDownloadingReport(report.id)

        const shiftStart = new Date(report.shift_start).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
        const shiftEnd = new Date(report.shift_end).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
        const shiftDate = new Date(report.shift_start).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric' })
        const fmt = (n: number) => formatCurrency(n)

        const checkInUnits = (report.check_in_units as any[]) || []
        const checkOutUnits = (report.check_out_units as any[]) || []
        const reservationsList = (report.reservations_list as any[]) || []
        const badges: string[] = []
        if (report.restock_requests_count > 0) badges.push(`${report.restock_requests_count} restocks`)
        if (report.customer_issues_count > 0) badges.push(`${report.customer_issues_count} issues`)
        if (report.expense_requests_count > 0) badges.push(`${report.expense_requests_count} expenses`)

        // Calculate dynamic height
        let H = 520
        if (badges.length > 0) H += 30
        if (checkInUnits.length > 0) H += 20 + Math.ceil(checkInUnits.length / 3) * 22
        if (checkOutUnits.length > 0) H += 20 + Math.ceil(checkOutUnits.length / 3) * 22
        if (reservationsList.length > 0) H += 20 + Math.ceil(reservationsList.length / 3) * 22
        H += 40 // footer

        try {
            const W = 480
            const canvas = document.createElement('canvas')
            canvas.width = W * 2
            canvas.height = H * 2
            const ctx = canvas.getContext('2d')!
            ctx.scale(2, 2)

            // Background
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, W, H)

            let y = 30

            // Header — hotel name + subtitle
            ctx.textAlign = 'center'
            ctx.fillStyle = '#1e293b'
            ctx.font = 'bold 20px system-ui, sans-serif'
            ctx.fillText(selectedHotelName, W / 2, y)
            y += 18
            ctx.fillStyle = '#94a3b8'
            ctx.font = '12px system-ui, sans-serif'
            ctx.fillText('Shift Report', W / 2, y)
            y += 20

            // Divider
            ctx.fillStyle = '#e2e8f0'
            ctx.fillRect(30, y, W - 60, 2)
            y += 18

            // Staff info row
            ctx.textAlign = 'left'
            ctx.fillStyle = '#94a3b8'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('STAFF', 30, y)
            ctx.textAlign = 'right'
            ctx.fillText('ROLE', W - 30, y)
            y += 14
            ctx.textAlign = 'left'
            ctx.fillStyle = '#1e293b'
            ctx.font = 'bold 14px system-ui, sans-serif'
            ctx.fillText(report.staff?.name || 'Unknown', 30, y)
            ctx.textAlign = 'right'
            ctx.fillStyle = '#64748b'
            ctx.font = '600 12px system-ui, sans-serif'
            ctx.fillText(report.staff?.role || '', W - 30, y)
            y += 16

            // Date + shift row
            ctx.textAlign = 'left'
            ctx.fillStyle = '#94a3b8'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('DATE', 30, y)
            ctx.textAlign = 'right'
            ctx.fillText('SHIFT', W - 30, y)
            y += 14
            ctx.textAlign = 'left'
            ctx.fillStyle = '#1e293b'
            ctx.font = '600 12px system-ui, sans-serif'
            ctx.fillText(shiftDate, 30, y)
            ctx.textAlign = 'right'
            ctx.fillText(`${shiftStart} - ${shiftEnd}`, W - 30, y)
            y += 24

            // Stats cards (Check-ins / Check-outs / Reservations)
            const cardW = (W - 76) / 3
            const drawStatCard = (x: number, label: string, value: number, bgColor: string, borderColor: string, labelColor: string, valueColor: string) => {
                ctx.fillStyle = bgColor
                ctx.beginPath()
                ctx.roundRect(x, y, cardW, 55, 10)
                ctx.fill()
                ctx.strokeStyle = borderColor
                ctx.lineWidth = 1
                ctx.stroke()
                ctx.textAlign = 'center'
                ctx.fillStyle = labelColor
                ctx.font = '600 9px system-ui, sans-serif'
                ctx.fillText(label, x + cardW / 2, y + 18)
                ctx.fillStyle = valueColor
                ctx.font = 'bold 20px system-ui, sans-serif'
                ctx.fillText(String(value), x + cardW / 2, y + 44)
            }
            drawStatCard(30, 'Check-ins', report.total_check_ins, '#f0fdf4', '#bbf7d0', '#16a34a', '#15803d')
            drawStatCard(30 + cardW + 8, 'Check-outs', report.total_check_outs, '#eff6ff', '#bfdbfe', '#2563eb', '#1d4ed8')
            drawStatCard(30 + (cardW + 8) * 2, 'Reservations', report.total_reservations_created, '#f5f3ff', '#ddd6fe', '#7c3aed', '#6d28d9')
            y += 70

            // Revenue section
            ctx.fillStyle = '#f8fafc'
            ctx.beginPath()
            ctx.roundRect(30, y, W - 60, 140, 10)
            ctx.fill()
            ctx.strokeStyle = '#e2e8f0'
            ctx.lineWidth = 1
            ctx.stroke()

            ctx.textAlign = 'left'
            ctx.fillStyle = '#94a3b8'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('REVENUE', 46, y + 18)

            // Cash box
            const revBoxW = (W - 90) / 2
            ctx.fillStyle = '#f0fdf4'
            ctx.beginPath()
            ctx.roundRect(42, y + 28, revBoxW, 45, 8)
            ctx.fill()
            ctx.textAlign = 'center'
            ctx.fillStyle = '#16a34a'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('Cash', 42 + revBoxW / 2, y + 44)
            ctx.fillStyle = '#15803d'
            ctx.font = 'bold 18px system-ui, sans-serif'
            ctx.fillText(fmt(report.revenue_cash), 42 + revBoxW / 2, y + 66)

            // Digital box
            ctx.fillStyle = '#eff6ff'
            ctx.beginPath()
            ctx.roundRect(42 + revBoxW + 8, y + 28, revBoxW, 45, 8)
            ctx.fill()
            ctx.textAlign = 'center'
            ctx.fillStyle = '#2563eb'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('Digital', 42 + revBoxW + 8 + revBoxW / 2, y + 44)
            ctx.fillStyle = '#1d4ed8'
            ctx.font = 'bold 18px system-ui, sans-serif'
            ctx.fillText(fmt(report.revenue_digital), 42 + revBoxW + 8 + revBoxW / 2, y + 66)

            // Total revenue box
            ctx.fillStyle = '#fff7ed'
            ctx.beginPath()
            ctx.roundRect(42, y + 82, W - 84, 48, 8)
            ctx.fill()
            ctx.textAlign = 'center'
            ctx.fillStyle = '#ea580c'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('Total Revenue', W / 2, y + 98)
            ctx.fillStyle = '#c2410c'
            ctx.font = 'bold 22px system-ui, sans-serif'
            ctx.fillText(fmt(report.revenue_total), W / 2, y + 122)
            y += 150

            // Badges
            if (badges.length > 0) {
                ctx.textAlign = 'left'
                ctx.font = '600 10px system-ui, sans-serif'
                let bx = 30
                for (const badge of badges) {
                    const tw = ctx.measureText(badge).width + 16
                    ctx.fillStyle = badge.includes('restock') ? '#fff7ed' : badge.includes('issues') ? '#fef2f2' : '#eff6ff'
                    ctx.beginPath()
                    ctx.roundRect(bx, y, tw, 20, 10)
                    ctx.fill()
                    ctx.fillStyle = badge.includes('restock') ? '#ea580c' : badge.includes('issues') ? '#dc2626' : '#2563eb'
                    ctx.fillText(badge, bx + 8, y + 14)
                    bx += tw + 6
                }
                y += 30
            }

            // Unit lists helper
            const drawUnitList = (title: string, units: any[], bgColor: string, textColor: string) => {
                if (units.length === 0) return
                ctx.textAlign = 'left'
                ctx.fillStyle = '#64748b'
                ctx.font = '600 9px system-ui, sans-serif'
                ctx.fillText(title, 30, y + 10)
                y += 18
                let ux = 30
                for (const u of units) {
                    const label = `${u.unit_number}${u.guest_names ? ` - ${u.guest_names}` : ''}`
                    const tw = ctx.measureText(label).width + 14
                    if (ux + tw > W - 30) { ux = 30; y += 22 }
                    ctx.fillStyle = bgColor
                    ctx.beginPath()
                    ctx.roundRect(ux, y - 4, tw, 18, 6)
                    ctx.fill()
                    ctx.fillStyle = textColor
                    ctx.font = '500 9px system-ui, sans-serif'
                    ctx.fillText(label, ux + 7, y + 8)
                    ux += tw + 4
                }
                y += 22
            }

            drawUnitList('Check-in Units', checkInUnits, '#dcfce7', '#15803d')
            drawUnitList('Check-out Units', checkOutUnits, '#dbeafe', '#1d4ed8')
            drawUnitList('Reservations', reservationsList, '#ede9fe', '#6d28d9')

            // Footer
            ctx.fillStyle = '#e2e8f0'
            ctx.fillRect(30, y + 5, W - 60, 1)
            ctx.fillStyle = '#cbd5e1'
            ctx.font = '9px system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText('Generated by Fajo ERP', W / 2, y + 22)

            // Download
            const link = document.createElement('a')
            link.download = `shift-report-${report.staff?.name?.replace(/\s+/g, '-') || 'staff'}-${shiftDate}.png`
            link.href = canvas.toDataURL('image/png')
            link.click()
            toast.success('Report downloaded')
        } catch (err) {
            console.error('Download report error:', err)
            toast.error('Failed to download report')
        } finally {
            setDownloadingReport(null)
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

        const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const todayStart = `${todayIST}T00:00:00+05:30`
        const tomorrowDate = new Date(new Date(todayStart).getTime() + 86400000).toISOString()

        // Single joined query — no N+1 loops
        const { data: paymentData } = await supabase
            .from('payments')
            .select('id, booking_id, amount_cash, amount_digital, total_paid, created_at, booking:bookings(unit_id, unit:units(unit_number, hotel_id), guests(name))')
            .gte('created_at', todayStart)
            .lt('created_at', tomorrowDate)
            .order('created_at', { ascending: false })

        if (!paymentData) { setPayments([]); return }

        // Filter by hotel and map to PaymentRow shape
        const enriched: PaymentRow[] = []
        for (const p of paymentData) {
            const bk = p.booking as unknown as Record<string, unknown> | null
            if (!bk) continue
            const unit = bk.unit as Record<string, unknown> | null
            if (!unit || unit.hotel_id !== selectedHotelId) continue
            const guests = Array.isArray(bk.guests) ? bk.guests : bk.guests ? [bk.guests] : []
            enriched.push({
                id: p.id,
                booking_id: p.booking_id,
                amount_cash: p.amount_cash,
                amount_digital: p.amount_digital,
                total_paid: p.total_paid,
                created_at: p.created_at,
                booking: {
                    unit: { unit_number: unit.unit_number as string, hotel_id: unit.hotel_id as string },
                    guests: guests as { name: string }[],
                },
            })
        }

        setPayments(enriched)
    }, [selectedHotelId])

    // ============ DOWNLOAD FINANCIAL REPORT (Payments) AS PNG — exact admin canvas layout ============
    const handleDownloadPaymentReport = useCallback(async () => {
        setRptGenerating(true)
        try {
            const todayIST = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            const rptFromIST = `${todayIST}T00:00:00+05:30`
            const rptToIST = `${todayIST}T23:59:59+05:30`

            const { data: bookings, error: queryError } = await supabase
                .from('bookings')
                .select('id, grand_total, advance_amount, advance_type, status, unit:units!inner(type, hotel_id), payments(amount_cash, amount_digital, total_paid)')
                .in('status', ['CHECKED_IN', 'CHECKED_OUT'])
                .gte('check_in', rptFromIST)
                .lte('check_in', rptToIST)

            if (queryError) throw new Error(`Query failed: ${queryError.message}`)

            let rptFiltered = bookings || []
            if (selectedHotelId) {
                rptFiltered = rptFiltered.filter((b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.hotel_id === selectedHotelId)
            }

            const rptRooms = rptFiltered.filter((b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.type === 'ROOM')
            const rptDorms = rptFiltered.filter((b: Record<string, unknown>) => (b.unit as Record<string, unknown>)?.type === 'DORM')

            const rptCalcRev = (list: typeof rptFiltered) => {
                let cash = 0, digital = 0
                for (const b of list) {
                    const bk = b as Record<string, unknown>
                    const advance = Number(bk.advance_amount || 0)
                    if (advance > 0) {
                        const advType = String(bk.advance_type || '').toUpperCase()
                        if (advType === 'DIGITAL' || advType === 'UPI' || advType === 'GPAY') {
                            digital += advance
                        } else {
                            cash += advance
                        }
                    }
                    const raw = bk.payments
                    const pmts = Array.isArray(raw) ? raw : raw ? [raw] : []
                    for (const p of pmts) {
                        const pay = p as Record<string, unknown>
                        cash += Number(pay.amount_cash || 0)
                        digital += Number(pay.amount_digital || 0)
                    }
                }
                return { cash, digital }
            }

            const rptRoomRev = rptCalcRev(rptRooms)
            const rptDormRev = rptCalcRev(rptDorms)
            const rptGrandCash = rptRoomRev.cash + rptDormRev.cash
            const rptGrandDigital = rptRoomRev.digital + rptDormRev.digital
            const rptGrandTotal = rptGrandCash + rptGrandDigital
            const rptHotelName = selectedHotelName
            const fmt = (n: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
            const rptFromDisplay = new Date(rptFromIST).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
            const rptToDisplay = new Date(rptToIST).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })
            const rptGenAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true })

            // Draw report directly on canvas (no html2canvas — avoids Tailwind v4 CSS issues)
            const canvas = document.createElement('canvas')
            const W = 800, H = 600
            canvas.width = W * 2
            canvas.height = H * 2
            const ctx = canvas.getContext('2d')!
            ctx.scale(2, 2)

            // Background
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, W, H)

            // Header
            ctx.textAlign = 'center'
            ctx.fillStyle = '#0f172a'
            ctx.font = 'bold 22px system-ui, sans-serif'
            ctx.fillText(rptHotelName.toUpperCase(), W / 2, 45)
            ctx.fillStyle = '#475569'
            ctx.font = '600 16px system-ui, sans-serif'
            ctx.fillText('FINANCIAL REPORT', W / 2, 70)
            ctx.fillStyle = '#64748b'
            ctx.font = '13px system-ui, sans-serif'
            ctx.fillText(`Period: ${rptFromDisplay}`, W / 2, 100)
            ctx.fillText(`to ${rptToDisplay}`, W / 2, 118)

            // Rooms card
            const drawCard = (x: number, y: number, w: number, h: number, title: string, count: number, unit: string, cash: number, digital: number, borderColor: string, bgColor: string, titleColor: string) => {
                ctx.fillStyle = bgColor
                ctx.beginPath()
                ctx.roundRect(x, y, w, h, 12)
                ctx.fill()
                ctx.strokeStyle = borderColor
                ctx.lineWidth = 2
                ctx.stroke()

                ctx.textAlign = 'center'
                ctx.fillStyle = titleColor
                ctx.font = 'bold 11px system-ui, sans-serif'
                ctx.fillText(title.toUpperCase(), x + w / 2, y + 25)
                ctx.fillStyle = '#0f172a'
                ctx.font = 'bold 32px system-ui, sans-serif'
                ctx.fillText(String(count), x + w / 2, y + 62)
                ctx.fillStyle = '#6b7280'
                ctx.font = '11px system-ui, sans-serif'
                ctx.fillText(unit, x + w / 2, y + 80)

                ctx.font = 'bold 9px system-ui, sans-serif'
                ctx.fillStyle = '#16a34a'
                ctx.fillText('CASH', x + w / 4, y + 105)
                ctx.fillStyle = '#2563eb'
                ctx.fillText('DIGITAL', x + (w * 3) / 4, y + 105)

                ctx.font = 'bold 14px system-ui, sans-serif'
                ctx.fillStyle = '#15803d'
                ctx.fillText(fmt(cash), x + w / 4, y + 122)
                ctx.fillStyle = '#1d4ed8'
                ctx.fillText(fmt(digital), x + (w * 3) / 4, y + 122)
            }

            drawCard(40, 145, 350, 140, 'Rooms', rptRooms.length, 'units sold', rptRoomRev.cash, rptRoomRev.digital, '#d1fae5', '#f0fdf4', '#059669')
            drawCard(410, 145, 350, 140, 'Dorms', rptDorms.length, 'beds sold', rptDormRev.cash, rptDormRev.digital, '#dbeafe', '#eff6ff', '#2563eb')

            // Grand Total card
            ctx.fillStyle = '#f5f3ff'
            ctx.beginPath()
            ctx.roundRect(40, 310, 720, 150, 12)
            ctx.fill()
            ctx.strokeStyle = '#c4b5fd'
            ctx.lineWidth = 3
            ctx.stroke()

            ctx.textAlign = 'center'
            ctx.fillStyle = '#7c3aed'
            ctx.font = 'bold 11px system-ui, sans-serif'
            ctx.fillText('GRAND TOTAL', W / 2, 335)
            ctx.fillStyle = '#5b21b6'
            ctx.font = 'bold 38px system-ui, sans-serif'
            ctx.fillText(fmt(rptGrandTotal), W / 2, 380)

            ctx.font = 'bold 10px system-ui, sans-serif'
            ctx.fillStyle = '#16a34a'
            ctx.fillText('TOTAL CASH', W / 2 - 120, 410)
            ctx.fillStyle = '#2563eb'
            ctx.fillText('TOTAL DIGITAL', W / 2 + 120, 410)

            ctx.font = 'bold 18px system-ui, sans-serif'
            ctx.fillStyle = '#15803d'
            ctx.fillText(fmt(rptGrandCash), W / 2 - 120, 435)
            ctx.fillStyle = '#1d4ed8'
            ctx.fillText(fmt(rptGrandDigital), W / 2 + 120, 435)

            // Footer
            ctx.fillStyle = '#e2e8f0'
            ctx.fillRect(40, 490, 720, 1)
            ctx.fillStyle = '#94a3b8'
            ctx.font = '11px system-ui, sans-serif'
            ctx.textAlign = 'center'
            ctx.fillText(`Generated: ${rptGenAt} | FAJO ERP`, W / 2, 520)

            // Download
            const url = canvas.toDataURL('image/png')
            const link = document.createElement('a')
            link.download = `Financial-Report_${rptHotelName.replace(/\s+/g, '-')}_${todayIST}.png`
            link.href = url
            link.click()
            toast.success('Financial report downloaded')
        } catch (err) {
            console.error('Report error:', err)
            toast.error(err instanceof Error ? `Report failed: ${err.message}` : 'Failed to generate report')
        } finally {
            setRptGenerating(false)
        }
    }, [selectedHotelId, selectedHotelName])

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
        const from = `${shiftReportDate}T${shiftReportFromTime}:00+05:30`
        const to = `${shiftReportDate}T${shiftReportToTime}:59+05:30`
        try {
            const res = await fetch(`/api/shift-reports?hotel_id=${selectedHotelId}&from=${from}&to=${to}`)
            const json = await res.json()
            if (json.data) setShiftReports(json.data)
        } catch {
            setShiftReports([])
        }
    }, [selectedHotelId, shiftReportDate, shiftReportFromTime, shiftReportToTime])

    // ============ PROPERTY REPORTS FETCH & HANDLERS ============

    const fetchReports = useCallback(async () => {
        if (!selectedHotelId) return
        try {
            const res = await fetch(`/api/property-reports?hotel_id=${selectedHotelId}&limit=30`)
            if (res.ok) {
                const json = await res.json()
                setReports(json.data || [])
            }
        } catch {}
    }, [selectedHotelId])

    const handleSubmitReport = async () => {
        if (!reportDescription.trim()) { toast.error('Please describe the report'); return }
        setReportSubmitting(true)
        try {
            const res = await fetch('/api/property-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: reportType,
                    category: reportCategory,
                    description: reportDescription.trim(),
                    photo_url: reportPhotoUrl || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(reportType === 'ISSUE' ? 'Issue reported to Admin' : 'Report submitted to Admin')
            setReportDescription('')
            setReportCategory('OTHER')
            setReportType('REPORT')
            setReportPhotoUrl('')
            fetchReports()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit report')
        } finally {
            setReportSubmitting(false)
        }
    }

    const handleReportPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setReportUploading(true)
        try {
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)
            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '-')
            const fileName = `${dateStr.slice(0, 7)}/report_${dateStr}_${timeStr}_${Date.now()}.jpg`
            const { error: uploadErr } = await supabase.storage
                .from('reports')
                .upload(fileName, compressed, { contentType: 'image/jpeg', upsert: true })
            if (uploadErr) { toast.error('Failed to upload photo'); return }
            const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName)
            setReportPhotoUrl(urlData.publicUrl)
            toast.success('Photo uploaded')
        } catch {
            toast.error('Failed to process photo')
        } finally {
            setReportUploading(false)
        }
    }

    // ============ DATA LOADING ============

    useEffect(() => {
        if (!selectedHotelId) return
        setLoading(true)
        const load = async () => {
            if (tab === 'monitor') {
                await fetchUnitsWithBookings(selectedHotelId)
            } else if (tab === 'restock') {
                await Promise.all([fetchPendingRestocks(), fetchDoneRestocks()])
            } else if (tab === 'payments') {
                await fetchPayments()
            } else if (tab === 'expenses') {
                await Promise.all([fetchPendingExpenses(), fetchReviewedExpenses()])
            } else if (tab === 'issues') {
                await Promise.all([fetchOpenIssues(), fetchResolvedIssues()])
            } else if (tab === 'shift-reports') {
                await fetchShiftReports()
            } else if (tab === 'reports') {
                await fetchReports()
            }
            setLoading(false)
        }
        load()
    }, [tab, selectedHotelId, fetchUnitsWithBookings, fetchPendingRestocks, fetchDoneRestocks, fetchPayments, fetchPendingExpenses, fetchReviewedExpenses, fetchOpenIssues, fetchResolvedIssues, fetchShiftReports, fetchReports])

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

    // Realtime: payments
    useEffect(() => {
        if (tab !== 'payments' || !selectedHotelId) return
        const channel = supabase
            .channel(`payments_zonalops_${selectedHotelId.slice(0, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, () => {
                fetchPayments()
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, selectedHotelId, fetchPayments])

    // Realtime: shift reports
    useEffect(() => {
        if (tab !== 'shift-reports' || !selectedHotelId) return
        const channel = supabase
            .channel(`shiftreports_zonalops_${selectedHotelId.slice(0, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shift_reports' }, () => {
                fetchShiftReports()
            })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, selectedHotelId, fetchShiftReports])

    // Property reports realtime
    useEffect(() => {
        if (tab !== 'reports' || !selectedHotelId) return
        const channel = supabase
            .channel(`reports_zonalops_${selectedHotelId.slice(0, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'property_reports', filter: `hotel_id=eq.${selectedHotelId}` }, () => { fetchReports() })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, selectedHotelId, fetchReports])

    // Monitor tab realtime (unit status changes)
    useEffect(() => {
        if (tab !== 'monitor' || !selectedHotelId) return
        const unsub = subscribeToUnits(selectedHotelId, true)
        return unsub
    }, [tab, selectedHotelId, subscribeToUnits])

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
        if (tab === 'monitor') { fetchUnitsWithBookings(selectedHotelId) }
        else if (tab === 'restock') { fetchPendingRestocks(); fetchDoneRestocks() }
        else if (tab === 'payments') { fetchPayments() }
        else if (tab === 'expenses') { fetchPendingExpenses(); fetchReviewedExpenses() }
        else if (tab === 'issues') { fetchOpenIssues(); fetchResolvedIssues() }
        else if (tab === 'shift-reports') { fetchShiftReports() }
        else if (tab === 'reports') { fetchReports() }
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

    // Monitor badge computation
    const overdueUnits = units
        .filter(u => u.status === 'OCCUPIED' && u.active_booking?.check_out)
        .filter(u => getCheckoutAlert(u.active_booking!.check_out!, now).level === 'critical')
    const dirtyUnits = units.filter(u => u.status === 'DIRTY')
    const cleaningUnits = units.filter(u => u.status === 'IN_PROGRESS')
    const overdueBadge = overdueUnits.length + dirtyUnits.length + cleaningUnits.length

    const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'monitor', label: 'Monitor', icon: <Eye className="h-4 w-4" />, badge: overdueBadge || undefined },
        { key: 'restock', label: 'Restocks', icon: <Package className="h-4 w-4" />, badge: pendingRestockCount },
        { key: 'payments', label: 'Payments', icon: <Banknote className="h-4 w-4" /> },
        { key: 'expenses', label: 'Expenses', icon: <Receipt className="h-4 w-4" />, badge: pendingExpenseCount },
        { key: 'issues', label: 'Issues', icon: <AlertTriangle className="h-4 w-4" />, badge: openIssueCount },
        { key: 'shift-reports', label: 'Shift Reports', icon: <ClipboardList className="h-4 w-4" /> },
        { key: 'reports', label: 'Reports', icon: <FileText className="h-4 w-4" />, badge: reports.filter(r => r.status === 'OPEN').length || undefined },
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
            <div className="relative">
                <div className="overflow-x-auto scrollbar-hide -mx-2 px-2 pb-1">
                    <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit min-w-fit">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-all whitespace-nowrap ${
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
                </div>
                <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none md:hidden" />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                </div>
            )}

            {/* ======================== MONITOR TAB ======================== */}
            {tab === 'monitor' && !loading && (
                <div className="space-y-4">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
                            <p className="text-2xl font-bold text-red-700">{overdueUnits.length}</p>
                            <p className="text-[10px] font-medium text-red-500 uppercase tracking-wider mt-0.5">Overdue</p>
                        </div>
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-center">
                            <p className="text-2xl font-bold text-amber-700">{dirtyUnits.length}</p>
                            <p className="text-[10px] font-medium text-amber-500 uppercase tracking-wider mt-0.5">Dirty</p>
                        </div>
                        <div className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-center">
                            <p className="text-2xl font-bold text-blue-700">{cleaningUnits.length}</p>
                            <p className="text-[10px] font-medium text-blue-500 uppercase tracking-wider mt-0.5">Cleaning</p>
                        </div>
                        <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                            <p className="text-2xl font-bold text-emerald-700">{units.filter(u => u.status === 'AVAILABLE').length}</p>
                            <p className="text-[10px] font-medium text-emerald-500 uppercase tracking-wider mt-0.5">Available</p>
                        </div>
                    </div>

                    {/* Overdue Checkouts */}
                    {overdueUnits.length > 0 && (
                        <div className="rounded-2xl border border-red-200 bg-red-50/50 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                                    <AlertTriangle className="h-4 w-4" />
                                </div>
                                <h3 className="text-sm font-bold text-red-900">
                                    Overdue Checkouts
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-200 text-red-700 text-[10px] font-bold">{overdueUnits.length}</span>
                                </h3>
                            </div>
                            <div className="space-y-2">
                                {overdueUnits
                                    .sort((a, b) => {
                                        const aAlert = getCheckoutAlert(a.active_booking!.check_out!, now)
                                        const bAlert = getCheckoutAlert(b.active_booking!.check_out!, now)
                                        return aAlert.minutesRemaining - bAlert.minutesRemaining
                                    })
                                    .map(u => {
                                        const alert = getCheckoutAlert(u.active_booking!.check_out!, now)
                                        const guestName = u.active_booking?.guests?.[0]?.name || 'Unknown'
                                        return (
                                            <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-red-100/80 text-red-700 text-xs font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span className="relative flex h-2 w-2">
                                                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                                        <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                                    </span>
                                                    <span className="font-bold">{u.unit_number}</span>
                                                    <span className="text-[10px] opacity-70 truncate max-w-[120px]">{guestName}</span>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    <span className="font-bold">{alert.label}</span>
                                                </div>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                    )}

                    {/* Dirty Rooms — Waiting for Housekeeping */}
                    {dirtyUnits.length > 0 && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                                    <AlertTriangle className="h-4 w-4" />
                                </div>
                                <h3 className="text-sm font-bold text-amber-900">
                                    Dirty — Waiting for Housekeeping
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold">{dirtyUnits.length}</span>
                                </h3>
                            </div>
                            <div className="space-y-2">
                                {dirtyUnits
                                    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
                                    .map(u => {
                                        const dirtyMinutes = Math.floor((now.getTime() - new Date(u.updated_at).getTime()) / 60000)
                                        const durationLabel = dirtyMinutes < 60
                                            ? `${dirtyMinutes}m`
                                            : `${Math.floor(dirtyMinutes / 60)}h ${dirtyMinutes % 60}m`
                                        return (
                                            <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-amber-100/80 text-amber-700 text-xs font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold">{u.unit_number}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-800">
                                                        {u.type === 'DORM' ? 'Dorm' : 'Room'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-amber-800">
                                                    <Clock className="h-3 w-3" />
                                                    <span className="font-bold">Dirty {durationLabel}</span>
                                                </div>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                    )}

                    {/* Currently Cleaning */}
                    {cleaningUnits.length > 0 && (
                        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                                    <Play className="h-4 w-4" />
                                </div>
                                <h3 className="text-sm font-bold text-blue-900">
                                    Currently Cleaning
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-blue-200 text-blue-700 text-[10px] font-bold">{cleaningUnits.length}</span>
                                </h3>
                            </div>
                            <div className="space-y-2">
                                {cleaningUnits
                                    .sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime())
                                    .map(u => {
                                        const cleaningMinutes = Math.floor((now.getTime() - new Date(u.updated_at).getTime()) / 60000)
                                        const durationLabel = cleaningMinutes < 60
                                            ? `${cleaningMinutes}m`
                                            : `${Math.floor(cleaningMinutes / 60)}h ${cleaningMinutes % 60}m`
                                        return (
                                            <div key={u.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-blue-100/80 text-blue-700 text-xs font-medium">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold">{u.unit_number}</span>
                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-blue-200 text-blue-800">
                                                        {u.type === 'DORM' ? 'Dorm' : 'Room'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-1 text-blue-800">
                                                    <Clock className="h-3 w-3" />
                                                    <span className="font-bold">Cleaning {durationLabel}</span>
                                                </div>
                                            </div>
                                        )
                                    })
                                }
                            </div>
                        </div>
                    )}

                    {/* All Clear */}
                    {overdueUnits.length === 0 && dirtyUnits.length === 0 && cleaningUnits.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 text-emerald-400" />
                            <p className="text-sm font-medium text-slate-600">All rooms are clear</p>
                            <p className="text-xs mt-1">No overdue checkouts or pending housekeeping</p>
                        </div>
                    )}
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

                    {/* Download Financial Report */}
                    <div className="flex justify-end">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleDownloadPaymentReport}
                            disabled={rptGenerating}
                            className="gap-2 border-emerald-200"
                        >
                            {rptGenerating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                            {rptGenerating ? 'Generating...' : 'Download Report'}
                        </Button>
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
                                                <div className="flex items-end gap-2 flex-wrap">
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
                    {/* Date & Time Navigation */}
                    <Card className="rounded-2xl">
                        <CardContent className="py-3 px-4 space-y-2">
                            <div className="flex items-center justify-between flex-wrap gap-2">
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
                                        className="w-36 sm:w-44 h-8 text-sm"
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
                            <div className="flex items-center gap-2 text-xs flex-wrap">
                                <span className="text-slate-400">From</span>
                                <Input
                                    type="time"
                                    value={shiftReportFromTime}
                                    onChange={e => setShiftReportFromTime(e.target.value)}
                                    className="w-28 h-7 text-xs"
                                />
                                <span className="text-slate-400">To</span>
                                <Input
                                    type="time"
                                    value={shiftReportToTime}
                                    onChange={e => setShiftReportToTime(e.target.value)}
                                    className="w-28 h-7 text-xs"
                                />
                                {(shiftReportFromTime !== '00:00' || shiftReportToTime !== '23:59') && (
                                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setShiftReportFromTime('00:00'); setShiftReportToTime('23:59') }}>
                                        Reset
                                    </Button>
                                )}
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
                                                            <p className="text-2xl font-extrabold text-emerald-700">{formatCurrency(r.revenue_cash)}</p>
                                                        </div>
                                                        <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                                                            <div className="flex items-center gap-1.5 mb-1">
                                                                <Smartphone className="h-4 w-4 text-blue-600" />
                                                                <p className="text-xs text-blue-500">Digital</p>
                                                            </div>
                                                            <p className="text-2xl font-extrabold text-blue-700">{formatCurrency(r.revenue_digital)}</p>
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
                                                    <div className="flex items-center gap-2 sm:gap-4 text-xs text-slate-500 flex-wrap">
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
                                                            disabled={downloadingReport === r.id}
                                                            onClick={(e) => { e.stopPropagation(); handleDownloadReport(r) }}
                                                        >
                                                            {downloadingReport === r.id ? (
                                                                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Downloading...</>
                                                            ) : (
                                                                <><Download className="h-3.5 w-3.5" /> Download Report</>
                                                            )}
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

            {/* ======================== REPORTS TAB ======================== */}
            {tab === 'reports' && !loading && (
                <div className="space-y-4">
                    {/* Submit Report/Issue Form */}
                    <Card className="rounded-2xl border-orange-200 bg-orange-50/40">
                        <CardContent className="py-5 px-5 space-y-4">
                            <h3 className="text-sm font-bold text-orange-800 flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Submit Report / Issue
                            </h3>

                            {/* Type toggle */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setReportType('REPORT')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                                        reportType === 'REPORT'
                                            ? 'bg-orange-600 text-white'
                                            : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-50'
                                    }`}
                                >
                                    Report
                                </button>
                                <button
                                    onClick={() => setReportType('ISSUE')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                                        reportType === 'ISSUE'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white border border-red-200 text-red-700 hover:bg-red-50'
                                    }`}
                                >
                                    Issue
                                </button>
                            </div>

                            {/* Category */}
                            <Select value={reportCategory} onValueChange={setReportCategory}>
                                <SelectTrigger className="w-full bg-white border-orange-200">
                                    <SelectValue placeholder="Category" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="OBSERVATION">Observation</SelectItem>
                                    <SelectItem value="DAMAGE">Damage</SelectItem>
                                    <SelectItem value="SAFETY">Safety</SelectItem>
                                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                                    <SelectItem value="GUEST_COMPLAINT">Guest Complaint</SelectItem>
                                    <SelectItem value="OTHER">Other</SelectItem>
                                </SelectContent>
                            </Select>

                            {/* Description */}
                            <textarea
                                placeholder="Describe the report or issue in detail..."
                                value={reportDescription}
                                onChange={e => setReportDescription(e.target.value)}
                                className="w-full text-sm border border-orange-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-orange-300 bg-white"
                                rows={3}
                            />

                            {/* Photo capture */}
                            <div className="flex items-center gap-3">
                                <label className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                                    reportUploading ? 'bg-slate-100 text-slate-400' : 'bg-white border border-orange-200 text-orange-700 hover:bg-orange-50'
                                }`}>
                                    {reportUploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Camera className="h-4 w-4" />
                                    )}
                                    {reportUploading ? 'Uploading...' : 'Attach Photo'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleReportPhotoCapture}
                                        disabled={reportUploading}
                                        className="hidden"
                                    />
                                </label>
                                {reportPhotoUrl && (
                                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Photo attached
                                    </span>
                                )}
                            </div>

                            {/* Submit */}
                            <Button
                                onClick={handleSubmitReport}
                                disabled={reportSubmitting || !reportDescription.trim()}
                                className="w-full bg-orange-600 hover:bg-orange-700 text-white"
                            >
                                {reportSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <FileText className="h-4 w-4 mr-2" />
                                        Submit {reportType === 'ISSUE' ? 'Issue' : 'Report'}
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* My Reports List */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                            Recent Reports ({reports.length})
                        </h3>
                        {reports.length === 0 ? (
                            <Card className="rounded-2xl">
                                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                    <FileText className="h-12 w-12 text-slate-300 mb-4" />
                                    <p className="text-slate-500 font-medium">No reports submitted yet</p>
                                    <p className="text-slate-400 text-sm mt-1">Use the form above to submit a report or issue.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-3">
                                {reports.map(r => (
                                    <Card key={r.id} className={`rounded-2xl border-l-4 ${
                                        r.type === 'ISSUE' ? 'border-l-red-400' : 'border-l-orange-400'
                                    }`}>
                                        <CardContent className="py-4 px-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                            r.type === 'ISSUE' ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                                                        }`}>
                                                            {r.type}
                                                        </span>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-600">
                                                            {r.category.replace('_', ' ')}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                            r.status === 'OPEN' ? 'bg-amber-100 text-amber-700'
                                                            : r.status === 'ACKNOWLEDGED' ? 'bg-blue-100 text-blue-700'
                                                            : r.status === 'RESOLVED' ? 'bg-green-100 text-green-700'
                                                            : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {r.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-700">{r.description}</p>
                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                                        {r.reporter?.name && (
                                                            <span>By {r.reporter.name}</span>
                                                        )}
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {timeAgo(r.created_at)}
                                                        </span>
                                                    </div>
                                                    {r.review_notes && (
                                                        <p className="text-xs text-blue-600 mt-1 italic">Admin: {r.review_notes}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

        </div>
    )
}
