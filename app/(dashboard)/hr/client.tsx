'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
    Clock,
    AlertTriangle,
    DollarSign,
    Users,
    Plus,
    FileText,
    CheckCircle2,
    Ban,
    Pencil,
    Save,
    ChevronLeft,
    ChevronRight,
    Eye,
    AlertCircle,
    RefreshCw,
    X,
    ClipboardList,
    ChevronDown,
    ChevronUp,
    Banknote,
    Smartphone,
    Download,
} from 'lucide-react'
import type {
    StaffMember,
    Attendance,
    StaffIncident,
    Payroll,
    IncidentCategory,
    ShiftReport,
} from '@/lib/types'

interface HRClientProps {
    hotelId: string
    staffId: string
    hotelName: string
}

function formatCurrency(n: number): string {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

type Tab = 'attendance' | 'incidents' | 'payroll' | 'shift-reports'

const INCIDENT_CATEGORIES: { value: IncidentCategory; label: string }[] = [
    { value: 'LATE_ARRIVAL', label: 'Late Arrival' },
    { value: 'EARLY_DEPARTURE', label: 'Early Departure' },
    { value: 'ABSENCE', label: 'Absence' },
    { value: 'UNIFORM_VIOLATION', label: 'Uniform Violation' },
    { value: 'GROOMING', label: 'Grooming' },
    { value: 'MISCONDUCT', label: 'Misconduct' },
    { value: 'DAMAGE', label: 'Damage' },
    { value: 'OTHER', label: 'Other' },
]

export function HRClient({ hotelId, staffId, hotelName }: HRClientProps) {
    const [tab, setTab] = useState<Tab>('attendance')
    const [staff, setStaff] = useState<StaffMember[]>([])
    const [attendance, setAttendance] = useState<Attendance[]>([])
    const [incidents, setIncidents] = useState<StaffIncident[]>([])
    const [payrolls, setPayrolls] = useState<Payroll[]>([])
    const [loading, setLoading] = useState(false)

    // Attendance date picker
    const [attendanceDate, setAttendanceDate] = useState(
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    )
    const [validating, setValidating] = useState<string | null>(null)

    // Photo preview
    const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)

    // Incident form state
    const [incidentStaffId, setIncidentStaffId] = useState('')
    const [incidentCategory, setIncidentCategory] = useState<IncidentCategory>('OTHER')
    const [incidentDescription, setIncidentDescription] = useState('')
    const [incidentPenalty, setIncidentPenalty] = useState('')
    const [incidentDate, setIncidentDate] = useState(
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    )

    // Payroll state
    const [payrollMonth, setPayrollMonth] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })

    // Staff edit state
    const [editingStaff, setEditingStaff] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [editPhone, setEditPhone] = useState('')
    const [editSalary, setEditSalary] = useState('')

    // Payroll edit state
    const [editingPayroll, setEditingPayroll] = useState<string | null>(null)
    const [editDaysPresent, setEditDaysPresent] = useState('')
    const [editPenalties, setEditPenalties] = useState('')
    const [editNetSalary, setEditNetSalary] = useState('')
    const [editNotes, setEditNotes] = useState('')

    // Shift reports state
    const [shiftReports, setShiftReports] = useState<ShiftReport[]>([])
    const [shiftReportDate, setShiftReportDate] = useState(
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    )
    const [shiftReportFromTime, setShiftReportFromTime] = useState('00:00')
    const [shiftReportToTime, setShiftReportToTime] = useState('23:59')
    const [expandedReport, setExpandedReport] = useState<string | null>(null)
    const [downloadingReport, setDownloadingReport] = useState<string | null>(null)

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
            ctx.fillText(hotelName, W / 2, y)
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
            ctx.fillStyle = '#faf5ff'
            ctx.beginPath()
            ctx.roundRect(42, y + 82, W - 84, 48, 8)
            ctx.fill()
            ctx.textAlign = 'center'
            ctx.fillStyle = '#7c3aed'
            ctx.font = '600 9px system-ui, sans-serif'
            ctx.fillText('Total Revenue', W / 2, y + 98)
            ctx.fillStyle = '#6d28d9'
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
    }, [hotelName])

    // Fetch staff list (excluding Admin)
    const fetchStaff = useCallback(async () => {
        const { data } = await supabase
            .from('staff')
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .eq('hotel_id', hotelId)
            .neq('role', 'Admin')
            .order('name', { ascending: true })
        if (data) setStaff(data)
    }, [hotelId])

    // Fetch attendance for selected date
    const fetchAttendance = useCallback(async () => {
        const nextDay = new Date(new Date(attendanceDate + 'T00:00:00+05:30').getTime() + 86400000).toISOString()
        const { data } = await supabase
            .from('attendance')
            .select('*, staff:staff_id(name, role)')
            .eq('hotel_id', hotelId)
            .gte('clock_in', attendanceDate + 'T00:00:00+05:30')
            .lt('clock_in', nextDay)
            .order('clock_in', { ascending: false })
        if (data) setAttendance(data)
    }, [hotelId, attendanceDate])

    // Fetch incidents
    const fetchIncidents = useCallback(async () => {
        const { data } = await supabase
            .from('staff_incidents')
            .select('*, staff:staff_id(name, role)')
            .eq('hotel_id', hotelId)
            .order('incident_date', { ascending: false })
        if (data) setIncidents(data)
    }, [hotelId])

    // Fetch payroll
    const fetchPayroll = useCallback(async () => {
        const { data } = await supabase
            .from('payroll')
            .select('*, staff:staff_id(name, role, base_salary)')
            .eq('hotel_id', hotelId)
            .eq('month', payrollMonth + '-01')
            .order('created_at', { ascending: false })
        if (data) setPayrolls(data)
    }, [hotelId, payrollMonth])

    // Fetch shift reports
    const fetchShiftReports = useCallback(async () => {
        const from = `${shiftReportDate}T${shiftReportFromTime}:00+05:30`
        const to = `${shiftReportDate}T${shiftReportToTime}:59+05:30`
        try {
            const res = await fetch(`/api/shift-reports?hotel_id=${hotelId}&from=${from}&to=${to}`)
            const json = await res.json()
            if (json.data) setShiftReports(json.data)
        } catch {
            setShiftReports([])
        }
    }, [hotelId, shiftReportDate, shiftReportFromTime, shiftReportToTime])

    useEffect(() => {
        fetchStaff()
    }, [fetchStaff])

    useEffect(() => {
        if (tab === 'attendance') fetchAttendance()
        if (tab === 'incidents') fetchIncidents()
        if (tab === 'payroll') fetchPayroll()
        if (tab === 'shift-reports') fetchShiftReports()
    }, [tab, fetchAttendance, fetchIncidents, fetchPayroll, fetchShiftReports])

    // Supabase Realtime: instant attendance updates without polling
    useEffect(() => {
        if (tab !== 'attendance') return
        const channel = supabase
            .channel(`attendance_hr_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance',
                filter: `hotel_id=eq.${hotelId}`,
            }, () => {
                fetchAttendance()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchAttendance])

    // Supabase Realtime: instant incident updates without polling
    useEffect(() => {
        if (tab !== 'incidents') return
        const channel = supabase
            .channel(`incidents_hr_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'staff_incidents',
                filter: `hotel_id=eq.${hotelId}`,
            }, () => {
                fetchIncidents()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchIncidents])

    // Supabase Realtime: instant payroll updates without polling
    useEffect(() => {
        if (tab !== 'payroll') return
        const channel = supabase
            .channel(`payroll_hr_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'payroll',
                filter: `hotel_id=eq.${hotelId}`,
            }, () => {
                fetchPayroll()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchPayroll])

    // Date navigation
    const shiftDate = (days: number) => {
        const d = new Date(attendanceDate + 'T00:00:00')
        d.setDate(d.getDate() + days)
        setAttendanceDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
    }

    const isToday = attendanceDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    // Validate attendance
    const handleValidate = async (attendanceId: string, status: 'APPROVED' | 'LATE') => {
        setValidating(attendanceId)
        try {
            const res = await fetch('/api/attendance', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    attendance_id: attendanceId,
                    validation_status: status,
                    validated_by: staffId,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(status === 'APPROVED' ? 'Attendance approved' : 'Marked as late')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Validation failed')
        } finally {
            setValidating(null)
        }
    }

    // Record Incident
    const handleRecordIncident = async () => {
        if (!incidentStaffId) { toast.error('Select a staff member'); return }
        setLoading(true)
        try {
            const res = await fetch('/api/staff-incidents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: incidentStaffId,
                    hotel_id: hotelId,
                    category: incidentCategory,
                    description: incidentDescription,
                    penalty_amount: incidentPenalty,
                    incident_date: incidentDate,
                    recorded_by: staffId,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Incident recorded')
            setIncidentStaffId('')
            setIncidentDescription('')
            setIncidentPenalty('')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to record incident')
        } finally {
            setLoading(false)
        }
    }

    // Generate Payroll
    const handleGeneratePayroll = async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/payroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hotel_id: hotelId, month: payrollMonth }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`Generated payroll for ${json.generated} staff`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate payroll')
        } finally {
            setLoading(false)
        }
    }

    // Payroll action (finalize/pay)
    const handlePayrollAction = async (payrollId: string, action: 'finalize' | 'pay') => {
        setLoading(true)
        try {
            const res = await fetch('/api/payroll', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ payroll_id: payrollId, action }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(action === 'finalize' ? 'Payroll finalized' : 'Marked as paid')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Payroll update failed')
        } finally {
            setLoading(false)
        }
    }

    // Start editing payroll
    const startEditPayroll = (p: Payroll) => {
        setEditingPayroll(p.id)
        setEditDaysPresent(String(p.total_days_present))
        setEditPenalties(String(p.total_penalties))
        setEditNetSalary('')  // Empty = auto-calculate
        setEditNotes(p.notes || '')
    }

    // Save payroll edit
    const handleSavePayroll = async (payrollId: string) => {
        const p = payrolls.find(pr => pr.id === payrollId)
        if (!p) return

        setLoading(true)
        try {
            const daysPresent = Number(editDaysPresent)
            const [yearStr, monthStr] = payrollMonth.split('-')
            const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate()
            const daysAbsent = Math.max(0, daysInMonth - daysPresent)
            const penalties = Number(editPenalties) || 0

            // Auto-calculate net salary if not manually overridden
            let netSalary: number
            if (editNetSalary.trim() !== '') {
                netSalary = Number(editNetSalary)
            } else {
                const baseSalary = Number(p.base_salary)
                const perDay = daysInMonth > 0 ? baseSalary / daysInMonth : 0
                netSalary = Math.max(0, perDay * daysPresent - penalties)
            }

            const res = await fetch('/api/payroll', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    payroll_id: payrollId,
                    action: 'edit',
                    total_days_present: daysPresent,
                    total_days_absent: daysAbsent,
                    total_penalties: penalties,
                    net_salary: netSalary,
                    notes: editNotes || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Payroll updated')
            setEditingPayroll(null)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update payroll')
        } finally {
            setLoading(false)
        }
    }

    // Regenerate payroll — deletes DRAFT and recreates from current data
    const handleRegeneratePayroll = async () => {
        const draftCount = payrolls.filter(p => p.status === 'DRAFT').length
        if (draftCount === 0) {
            toast.error('No DRAFT records to regenerate')
            return
        }

        setLoading(true)
        try {
            // Delete all DRAFT payroll for this month/hotel
            const res = await fetch('/api/payroll', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hotel_id: hotelId, month: payrollMonth }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            // Re-generate
            const genRes = await fetch('/api/payroll', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ hotel_id: hotelId, month: payrollMonth }),
            })
            const genJson = await genRes.json()
            if (!genRes.ok) throw new Error(genJson.error)

            toast.success(`Regenerated payroll for ${genJson.generated} staff`)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to regenerate payroll')
        } finally {
            setLoading(false)
        }
    }

    // Staff edit
    const handleSaveStaff = async (sid: string) => {
        setLoading(true)
        try {
            const res = await fetch('/api/staff', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: sid,
                    name: editName,
                    phone: editPhone,
                    base_salary: editSalary ? Number(editSalary) : 0,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Staff updated')
            setEditingStaff(null)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Update failed')
        } finally {
            setLoading(false)
        }
    }

    const pendingCount = attendance.filter(a => a.validation_status === 'PENDING_REVIEW').length

    const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'attendance', label: 'Attendance', icon: <Clock className="h-4 w-4" />, badge: pendingCount },
        { key: 'incidents', label: 'Incidents', icon: <AlertTriangle className="h-4 w-4" /> },
        { key: 'payroll', label: 'Payroll', icon: <DollarSign className="h-4 w-4" /> },
        { key: 'shift-reports', label: 'Shift Reports', icon: <ClipboardList className="h-4 w-4" /> },
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">HR Dashboard</h1>
                    <p className="text-slate-500 mt-1 text-sm">Review attendance, manage incidents, and process payroll.</p>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Users className="h-4 w-4" />
                    <span>{staff.length} staff members</span>
                </div>
            </div>

            {/* Tabs */}
            <div className="overflow-x-auto scrollbar-hide">
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-all ${
                            tab === t.key
                                ? 'bg-violet-600 text-white shadow-sm'
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

            {/* ======================== ATTENDANCE TAB ======================== */}
            {tab === 'attendance' && (
                <div className="space-y-4">
                    {/* Date Navigation */}
                    <Card>
                        <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => shiftDate(-1)} className="h-8 w-8 p-0">
                                        <ChevronLeft className="h-4 w-4" />
                                    </Button>
                                    <Input
                                        type="date"
                                        value={attendanceDate}
                                        onChange={e => setAttendanceDate(e.target.value)}
                                        className="w-44 h-8 text-sm"
                                    />
                                    <Button variant="outline" size="sm" onClick={() => shiftDate(1)} className="h-8 w-8 p-0">
                                        <ChevronRight className="h-4 w-4" />
                                    </Button>
                                    {!isToday && (
                                        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setAttendanceDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))}>
                                            Today
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-slate-500">{attendance.length} records</span>
                                    {pendingCount > 0 && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">
                                            {pendingCount} pending review
                                        </span>
                                    )}
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Attendance Records */}
                    {attendance.length === 0 ? (
                        <Card>
                            <CardContent className="py-12 text-center">
                                <Clock className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                                <p className="text-sm text-slate-400">No attendance records for this date.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {attendance.map(a => (
                                <Card key={a.id} className="overflow-hidden">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            {/* Left: Staff info + times */}
                                            <div className="flex items-start gap-3 flex-1">
                                                {/* Photo thumbnail */}
                                                {a.clock_in_photo ? (
                                                    <button
                                                        onClick={() => setPreviewPhoto(a.clock_in_photo)}
                                                        className="flex-shrink-0 w-12 h-12 rounded-lg overflow-hidden border border-slate-200 hover:ring-2 hover:ring-violet-300 transition-all cursor-pointer"
                                                    >
                                                        <img src={a.clock_in_photo} alt="Clock-in" className="w-full h-full object-cover" />
                                                    </button>
                                                ) : (
                                                    <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-slate-100 flex items-center justify-center">
                                                        <Users className="h-5 w-5 text-slate-300" />
                                                    </div>
                                                )}

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-slate-800">{a.staff?.name || 'Unknown'}</span>
                                                        <span className="text-xs text-slate-400">{a.staff?.role}</span>
                                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                            a.shift === 'DAY' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'
                                                        }`}>
                                                            {a.shift}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-500">
                                                        <span>
                                                            In: <strong className="text-slate-700">
                                                                {new Date(a.clock_in).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                                                            </strong>
                                                        </span>
                                                        {a.clock_out ? (
                                                            <span>
                                                                Out: <strong className="text-slate-700">
                                                                    {new Date(a.clock_out).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                                                                </strong>
                                                            </span>
                                                        ) : (
                                                            <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-bold text-[10px]">
                                                                Still working
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Right: Validation */}
                                            <div className="flex flex-col items-end gap-2">
                                                {a.validation_status === 'PENDING_REVIEW' ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleValidate(a.id, 'APPROVED')}
                                                            disabled={validating === a.id}
                                                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700"
                                                        >
                                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Approve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={() => handleValidate(a.id, 'LATE')}
                                                            disabled={validating === a.id}
                                                            className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50"
                                                        >
                                                            <AlertCircle className="h-3 w-3 mr-1" /> Late
                                                        </Button>
                                                    </div>
                                                ) : (
                                                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                                        a.validation_status === 'APPROVED'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-red-100 text-red-700'
                                                    }`}>
                                                        {a.validation_status === 'APPROVED' ? 'Approved' : 'Late'}
                                                    </span>
                                                )}
                                                {a.validated_at && (
                                                    <span className="text-[10px] text-slate-400">
                                                        {new Date(a.validated_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Photo Preview Modal */}
            {previewPhoto && (
                <div
                    className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
                    onClick={() => setPreviewPhoto(null)}
                >
                    <div className="bg-white rounded-2xl p-2 shadow-2xl max-w-sm" onClick={e => e.stopPropagation()}>
                        <img src={previewPhoto} alt="Clock-in photo" className="rounded-xl w-full" />
                        <div className="flex justify-center mt-2 pb-1">
                            <Button variant="ghost" size="sm" onClick={() => setPreviewPhoto(null)} className="text-xs">
                                <X className="h-3 w-3 mr-1" /> Close
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* ======================== INCIDENTS TAB ======================== */}
            {tab === 'incidents' && (
                <div className="space-y-6">
                    {/* Record Incident Form */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Plus className="h-5 w-5 text-red-600" />
                                Record Incident
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <Label>Staff Member</Label>
                                    <Select value={incidentStaffId} onValueChange={setIncidentStaffId}>
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select staff..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {staff.map(s => (
                                                <SelectItem key={s.id} value={s.id}>
                                                    {s.name || s.role} — {s.role}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Category</Label>
                                    <Select value={incidentCategory} onValueChange={(v) => setIncidentCategory(v as IncidentCategory)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {INCIDENT_CATEGORIES.map(c => (
                                                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Penalty (₹)</Label>
                                    <Input type="number" min="0" value={incidentPenalty} onChange={e => setIncidentPenalty(e.target.value)} placeholder="0" />
                                </div>
                                <div className="space-y-2">
                                    <Label>Date</Label>
                                    <Input type="date" value={incidentDate} onChange={e => setIncidentDate(e.target.value)} />
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label>Description</Label>
                                <Input value={incidentDescription} onChange={e => setIncidentDescription(e.target.value)} placeholder="Brief description of the incident..." />
                            </div>
                            <Button onClick={handleRecordIncident} disabled={loading || !incidentStaffId} className="bg-red-600 hover:bg-red-700">
                                <AlertTriangle className="h-4 w-4 mr-1" /> Record Incident
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Incidents List */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-lg">Recent Incidents ({incidents.length})</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {incidents.length === 0 ? (
                                <p className="text-sm text-slate-400">No incidents recorded.</p>
                            ) : (
                                <div className="space-y-2">
                                    {incidents.map(i => (
                                        <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                                            <div className="flex-1">
                                                <span className="font-semibold text-slate-800">{i.staff?.name || 'Unknown'}</span>
                                                <span className="ml-2 text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                                    {i.category.replace(/_/g, ' ')}
                                                </span>
                                                {i.description && (
                                                    <p className="text-xs text-slate-500 mt-1">{i.description}</p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                {Number(i.penalty_amount) > 0 && (
                                                    <span className="text-sm font-bold text-red-600">-₹{Number(i.penalty_amount).toLocaleString('en-IN')}</span>
                                                )}
                                                <p className="text-xs text-slate-400">{i.incident_date}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ======================== PAYROLL TAB ======================== */}
            {tab === 'payroll' && (
                <div className="space-y-6">
                    {/* Staff Management */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Users className="h-5 w-5 text-violet-600" />
                                Staff & Salaries
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-2">
                                {staff.map(s => (
                                    <div key={s.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                                        {editingStaff === s.id ? (
                                            <div className="flex items-center gap-3 flex-1">
                                                <Input className="w-40" value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                                                <Input className="w-32" value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="Phone" />
                                                <Input className="w-28" type="number" value={editSalary} onChange={e => setEditSalary(e.target.value)} placeholder="Salary" />
                                                <Button size="sm" onClick={() => handleSaveStaff(s.id)} disabled={loading}>
                                                    <Save className="h-3 w-3 mr-1" /> Save
                                                </Button>
                                                <Button size="sm" variant="ghost" onClick={() => setEditingStaff(null)}>
                                                    <Ban className="h-3 w-3" />
                                                </Button>
                                            </div>
                                        ) : (
                                            <>
                                                <div>
                                                    <span className="font-semibold text-slate-800">{s.name || '(No Name)'}</span>
                                                    <span className="ml-2 text-xs text-slate-500">{s.role}</span>
                                                    {s.phone && <span className="ml-2 text-xs text-slate-400">{s.phone}</span>}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-sm font-bold text-slate-700">₹{Number(s.base_salary).toLocaleString('en-IN')}/mo</span>
                                                    <Button variant="ghost" size="sm" onClick={() => {
                                                        setEditingStaff(s.id)
                                                        setEditName(s.name || '')
                                                        setEditPhone(s.phone || '')
                                                        setEditSalary(String(s.base_salary || 0))
                                                    }}>
                                                        <Pencil className="h-3 w-3" />
                                                    </Button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Generate & View Payroll */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FileText className="h-5 w-5 text-emerald-600" />
                                Payroll — {payrollMonth}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <Input type="month" value={payrollMonth} onChange={e => setPayrollMonth(e.target.value)} className="w-48" />
                                <Button onClick={handleGeneratePayroll} disabled={loading} className="bg-violet-600 hover:bg-violet-700">
                                    <DollarSign className="h-4 w-4 mr-1" /> Generate Payroll
                                </Button>
                                {payrolls.some(p => p.status === 'DRAFT') && (
                                    <Button variant="outline" onClick={handleRegeneratePayroll} disabled={loading} className="text-amber-700 border-amber-300 hover:bg-amber-50">
                                        <RefreshCw className="h-4 w-4 mr-1" /> Regenerate Drafts
                                    </Button>
                                )}
                            </div>

                            {payrolls.length === 0 ? (
                                <p className="text-sm text-slate-400">No payroll records for this month. Click Generate to create.</p>
                            ) : (
                                <div className="space-y-2">
                                    {payrolls.map(p => {
                                        const isEditing = editingPayroll === p.id

                                        // Auto-calculate helpers for edit mode
                                        const [yearStr, monthStr] = payrollMonth.split('-')
                                        const daysInMonth = new Date(parseInt(yearStr), parseInt(monthStr), 0).getDate()
                                        const autoAbsent = Math.max(0, daysInMonth - (Number(editDaysPresent) || 0))
                                        const autoNet = (() => {
                                            const base = Number(p.base_salary)
                                            const perDay = daysInMonth > 0 ? base / daysInMonth : 0
                                            return Math.max(0, perDay * (Number(editDaysPresent) || 0) - (Number(editPenalties) || 0))
                                        })()

                                        return (
                                        <div key={p.id} className="bg-white rounded-xl px-4 py-4 border border-slate-200 shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-800">{p.staff?.name || 'Unknown'}</span>
                                                    <span className="text-xs text-slate-500">{p.staff?.role}</span>
                                                    {p.notes && !isEditing && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700">Edited</span>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                        p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                                        p.status === 'FINALIZED' ? 'bg-blue-100 text-blue-700' :
                                                        'bg-amber-100 text-amber-700'
                                                    }`}>{p.status}</span>
                                                    {p.status === 'DRAFT' && !isEditing && (
                                                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => startEditPayroll(p)}>
                                                            <Pencil className="h-3.5 w-3.5 text-slate-500" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </div>

                                            {isEditing ? (
                                                /* ===== EDIT MODE ===== */
                                                <div className="space-y-3">
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-slate-500">Base Salary</label>
                                                            <p className="text-sm font-semibold text-slate-600">₹{Number(p.base_salary).toLocaleString('en-IN')}</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-slate-500">Days Present</label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                max={daysInMonth}
                                                                value={editDaysPresent}
                                                                onChange={e => setEditDaysPresent(e.target.value)}
                                                                className="h-8 text-sm"
                                                            />
                                                            <p className="text-[10px] text-slate-400">Absent: {autoAbsent} / {daysInMonth} days</p>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-slate-500">Penalties (₹)</label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                value={editPenalties}
                                                                onChange={e => setEditPenalties(e.target.value)}
                                                                className="h-8 text-sm"
                                                            />
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-xs text-slate-500">Net Salary (₹)</label>
                                                            <Input
                                                                type="number"
                                                                min="0"
                                                                value={editNetSalary}
                                                                onChange={e => setEditNetSalary(e.target.value)}
                                                                placeholder={`₹${Math.round(autoNet).toLocaleString('en-IN')}`}
                                                                className="h-8 text-sm"
                                                            />
                                                            <p className="text-[10px] text-slate-400">Leave empty for auto-calc</p>
                                                        </div>
                                                    </div>
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-slate-500">Notes (reason for override)</label>
                                                        <Input
                                                            value={editNotes}
                                                            onChange={e => setEditNotes(e.target.value)}
                                                            placeholder="e.g. Bonus added, leave adjustment..."
                                                            className="h-8 text-sm"
                                                        />
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Button size="sm" onClick={() => handleSavePayroll(p.id)} disabled={loading} className="bg-violet-600 hover:bg-violet-700">
                                                            <Save className="h-3 w-3 mr-1" /> Save
                                                        </Button>
                                                        <Button size="sm" variant="ghost" onClick={() => setEditingPayroll(null)}>
                                                            <X className="h-3 w-3 mr-1" /> Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                /* ===== DISPLAY MODE ===== */
                                                <>
                                                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-sm">
                                                        <div>
                                                            <p className="text-xs text-slate-400">Base Salary</p>
                                                            <p className="font-semibold">₹{Number(p.base_salary).toLocaleString('en-IN')}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-slate-400">Days Present</p>
                                                            <p className="font-semibold text-emerald-600">{p.total_days_present}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-slate-400">Days Absent</p>
                                                            <p className="font-semibold text-red-600">{p.total_days_absent}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-slate-400">Penalties</p>
                                                            <p className="font-semibold text-red-600">-₹{Number(p.total_penalties).toLocaleString('en-IN')}</p>
                                                        </div>
                                                        <div>
                                                            <p className="text-xs text-slate-400">Net Salary</p>
                                                            <p className="font-bold text-lg text-slate-900">₹{Number(p.net_salary).toLocaleString('en-IN')}</p>
                                                        </div>
                                                    </div>
                                                    {p.notes && (
                                                        <p className="mt-2 text-xs text-violet-600 italic">Note: {p.notes}</p>
                                                    )}
                                                    {p.status === 'DRAFT' && (
                                                        <div className="mt-3 flex gap-2">
                                                            <Button size="sm" onClick={() => handlePayrollAction(p.id, 'finalize')} disabled={loading} className="bg-blue-600 hover:bg-blue-700">
                                                                <CheckCircle2 className="h-3 w-3 mr-1" /> Finalize
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {p.status === 'FINALIZED' && (
                                                        <div className="mt-3 flex gap-2">
                                                            <Button size="sm" onClick={() => handlePayrollAction(p.id, 'pay')} disabled={loading} className="bg-emerald-600 hover:bg-emerald-700">
                                                                <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
                                                            </Button>
                                                        </div>
                                                    )}
                                                    {p.status === 'PAID' && p.paid_at && (
                                                        <p className="mt-2 text-xs text-slate-400">
                                                            Paid on {new Date(p.paid_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                                        </p>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                        )
                                    })}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* ======================== SHIFT REPORTS TAB ======================== */}
            {tab === 'shift-reports' && (
                <div className="space-y-4">
                    {/* Date & Time Navigation */}
                    <Card>
                        <CardContent className="py-3 px-4 space-y-2">
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
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-slate-500">{shiftReports.length} reports</span>
                                    <Button variant="outline" size="sm" onClick={fetchShiftReports} className="h-7 text-xs gap-1">
                                        <RefreshCw className="h-3 w-3" /> Refresh
                                    </Button>
                                </div>
                            </div>
                            <div className="flex items-center gap-2 text-xs">
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
                        <Card>
                            <CardContent className="py-12 text-center">
                                <ClipboardList className="h-8 w-8 text-slate-300 mx-auto mb-3" />
                                <p className="text-sm text-slate-400">No shift reports for this date.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="space-y-3">
                            {shiftReports.map(r => {
                                const isExpanded = expandedReport === r.id
                                const shiftStart = new Date(r.shift_start).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })
                                const shiftEnd = new Date(r.shift_end).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })

                                return (
                                    <Card key={r.id} className="overflow-hidden">
                                        <CardContent className="p-0">
                                            {/* Summary row — always visible */}
                                            <button
                                                onClick={() => setExpandedReport(isExpanded ? null : r.id)}
                                                className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-slate-50 transition-colors text-left"
                                            >
                                                <div className="flex items-center gap-3 flex-1 min-w-0">
                                                    <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                                                        <ClipboardList className="h-4 w-4 text-violet-600" />
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
                                                <div className="border-t border-slate-100 px-4 py-4 bg-slate-50/50 space-y-4">
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
                                                    <div className="bg-violet-50 rounded-xl p-4 border border-violet-100 text-center">
                                                        <div className="flex items-center justify-center gap-1.5 mb-1">
                                                            <DollarSign className="h-4 w-4 text-violet-600" />
                                                            <p className="text-xs text-violet-500">Total Revenue</p>
                                                        </div>
                                                        <p className="text-2xl font-extrabold text-violet-700">{formatCurrency(r.revenue_total)}</p>
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

        </div>
    )
}
