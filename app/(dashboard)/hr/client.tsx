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
} from 'lucide-react'
import type {
    StaffMember,
    Attendance,
    StaffIncident,
    Payroll,
    IncidentCategory,
} from '@/lib/types'

interface HRClientProps {
    hotelId: string
    staffId: string
}

type Tab = 'attendance' | 'incidents' | 'payroll'

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

export function HRClient({ hotelId, staffId }: HRClientProps) {
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

    useEffect(() => {
        fetchStaff()
    }, [fetchStaff])

    useEffect(() => {
        if (tab === 'attendance') fetchAttendance()
        if (tab === 'incidents') fetchIncidents()
        if (tab === 'payroll') fetchPayroll()
    }, [tab, fetchAttendance, fetchIncidents, fetchPayroll])

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
                    base_salary: editSalary,
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
        </div>
    )
}
