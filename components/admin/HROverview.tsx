'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Clock,
    AlertTriangle,
    DollarSign,
    Users,
    CheckCircle2,
    AlertCircle,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    FileText,
    History,
    RefreshCw,
} from 'lucide-react'
import type {
    Attendance,
    StaffIncident,
    Payroll,
} from '@/lib/types'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

type HRTab = 'attendance' | 'incidents' | 'payroll'

// Extended types with cross-hotel hotel join
interface AttendanceWithHotel extends Attendance {
    hotel?: { name: string } | null
}

interface IncidentWithHotel extends StaffIncident {
    hotel?: { name: string } | null
}

interface PayrollWithHotel extends Payroll {
    hotel?: { name: string } | null
}

export function HROverview({ hotelId, hotels, staffId }: AdminTabProps) {
    const [tab, setTab] = useState<HRTab>('attendance')

    // --- Attendance state ---
    const [attendance, setAttendance] = useState<AttendanceWithHotel[]>([])
    const [attendanceDate, setAttendanceDate] = useState(
        new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    )
    const [validating, setValidating] = useState<string | null>(null)

    // --- Incidents state ---
    const [incidents, setIncidents] = useState<IncidentWithHotel[]>([])

    // --- Payroll state ---
    const [payrolls, setPayrolls] = useState<PayrollWithHotel[]>([])
    const [payrollMonth, setPayrollMonth] = useState(() => {
        const now = new Date()
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
    })
    const [loading, setLoading] = useState(false)

    // --- Payroll History state ---
    interface PayrollHistoryMonth {
        month: string
        label: string
        staffCount: number
        totalNet: number
        draftCount: number
        finalizedCount: number
        paidCount: number
    }
    const [payrollHistory, setPayrollHistory] = useState<PayrollHistoryMonth[]>([])
    const [historyOpen, setHistoryOpen] = useState(false)

    // ======================== DATA FETCHING ========================

    const fetchAttendance = useCallback(async () => {
        const nextDay = new Date(new Date(attendanceDate + 'T00:00:00+05:30').getTime() + 86400000).toISOString()

        let query = supabase
            .from('attendance')
            .select('*, staff:staff!staff_id(name, role, hotel_id), hotel:hotels!hotel_id(name)')
            .gte('clock_in', attendanceDate + 'T00:00:00+05:30')
            .lt('clock_in', nextDay)
            .order('clock_in', { ascending: false })

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { data } = await query
        if (data) setAttendance(data as AttendanceWithHotel[])
    }, [hotelId, attendanceDate])

    const fetchIncidents = useCallback(async () => {
        const thirtyDaysAgo = new Date()
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
        const thirtyDaysAgoStr = thirtyDaysAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

        let query = supabase
            .from('staff_incidents')
            .select('*, staff:staff!staff_id(name, role), hotel:hotels!hotel_id(name)')
            .gte('incident_date', thirtyDaysAgoStr)
            .order('incident_date', { ascending: false })

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { data } = await query
        if (data) setIncidents(data as IncidentWithHotel[])
    }, [hotelId])

    const fetchPayroll = useCallback(async () => {
        const monthStart = `${payrollMonth}-01`

        let query = supabase
            .from('payroll')
            .select('*, staff:staff!staff_id(name, role, base_salary), hotel:hotels!hotel_id(name)')
            .eq('month', monthStart)
            .order('created_at', { ascending: false })

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { data } = await query
        if (data) setPayrolls(data as PayrollWithHotel[])
    }, [hotelId, payrollMonth])

    // Fetch payroll history (last 6 months)
    const fetchPayrollHistory = useCallback(async () => {
        let query = supabase
            .from('payroll')
            .select('month, status, net_salary, staff_id')
            .order('month', { ascending: false })

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { data } = await query
        if (!data) return

        // Group by month in JS
        const grouped = new Map<string, { staffIds: Set<string>; totalNet: number; draft: number; finalized: number; paid: number }>()
        for (const row of data) {
            const m = typeof row.month === 'string' ? row.month.slice(0, 7) : String(row.month)
            if (!grouped.has(m)) {
                grouped.set(m, { staffIds: new Set(), totalNet: 0, draft: 0, finalized: 0, paid: 0 })
            }
            const g = grouped.get(m)!
            g.staffIds.add(row.staff_id)
            g.totalNet += Number(row.net_salary)
            if (row.status === 'DRAFT') g.draft++
            else if (row.status === 'FINALIZED') g.finalized++
            else if (row.status === 'PAID') g.paid++
        }

        // Convert to array, sort descending, take last 6
        const months = Array.from(grouped.entries())
            .sort((a, b) => b[0].localeCompare(a[0]))
            .slice(0, 6)
            .map(([m, g]) => {
                const [y, mo] = m.split('-')
                const label = new Date(Number(y), Number(mo) - 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
                return {
                    month: m,
                    label,
                    staffCount: g.staffIds.size,
                    totalNet: g.totalNet,
                    draftCount: g.draft,
                    finalizedCount: g.finalized,
                    paidCount: g.paid,
                }
            })

        setPayrollHistory(months)
    }, [hotelId])

    // Fetch data when tab changes
    useEffect(() => {
        if (tab === 'attendance') fetchAttendance()
        if (tab === 'incidents') fetchIncidents()
        if (tab === 'payroll') {
            fetchPayroll()
            fetchPayrollHistory()
        }
    }, [tab, fetchAttendance, fetchIncidents, fetchPayroll, fetchPayrollHistory])

    // Realtime: attendance
    useEffect(() => {
        if (tab !== 'attendance') return

        const pgFilter = hotelId ? `hotel_id=eq.${hotelId}` : undefined

        const channel = supabase
            .channel(`admin_attendance_${hotelId ?? 'all'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'attendance',
                ...(pgFilter ? { filter: pgFilter } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any, () => {
                fetchAttendance()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchAttendance])

    // ======================== HELPERS ========================

    const getHotelName = (item: { hotel_id: string; hotel?: { name: string } | null }): string => {
        if (item.hotel && typeof item.hotel === 'object' && 'name' in item.hotel) {
            return (item.hotel as { name: string }).name
        }
        const found = hotels.find(h => h.id === item.hotel_id)
        return found?.name ?? 'Unknown'
    }

    const shiftDate = (days: number) => {
        const d = new Date(attendanceDate + 'T00:00:00')
        d.setDate(d.getDate() + days)
        setAttendanceDate(d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))
    }

    const isToday = attendanceDate === new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })

    // ======================== ACTIONS ========================

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

    // Generate payroll (for a specific hotel or all hotels)
    const handleGeneratePayroll = async () => {
        setLoading(true)
        try {
            // If hotelId is set, generate for that hotel. Otherwise generate for all hotels.
            const targetHotels = hotelId ? [hotelId] : hotels.map(h => h.id)
            let totalGenerated = 0

            for (const hId of targetHotels) {
                const res = await fetch('/api/payroll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hotel_id: hId, month: payrollMonth }),
                })
                const json = await res.json()
                if (res.ok) totalGenerated += json.generated ?? 0
            }

            toast.success(`Generated payroll for ${totalGenerated} staff`)
            fetchPayroll()
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

    // Regenerate payroll -- deletes DRAFT and recreates from current data
    const handleRegeneratePayroll = async () => {
        const drafts = payrolls.filter(p => p.status === 'DRAFT').length
        if (drafts === 0) {
            toast.error('No DRAFT records to regenerate')
            return
        }

        setLoading(true)
        try {
            const targetHotels = hotelId ? [hotelId] : hotels.map(h => h.id)
            let totalGenerated = 0

            for (const hId of targetHotels) {
                // Delete all DRAFT payroll for this month/hotel
                const delRes = await fetch('/api/payroll', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hotel_id: hId, month: payrollMonth }),
                })
                const delJson = await delRes.json()
                if (!delRes.ok) throw new Error(delJson.error)

                // Re-generate
                const genRes = await fetch('/api/payroll', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ hotel_id: hId, month: payrollMonth }),
                })
                const genJson = await genRes.json()
                if (!genRes.ok) throw new Error(genJson.error)
                totalGenerated += genJson.generated ?? 0
            }

            toast.success(`Regenerated payroll for ${totalGenerated} staff`)
            fetchPayroll()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to regenerate payroll')
        } finally {
            setLoading(false)
        }
    }

    // ======================== COMPUTED ========================

    const pendingCount = attendance.filter(a => a.validation_status === 'PENDING_REVIEW').length
    const clockedInCount = attendance.filter(a => a.status === 'CLOCKED_IN').length

    const draftCount = payrolls.filter(p => p.status === 'DRAFT').length
    const finalizedCount = payrolls.filter(p => p.status === 'FINALIZED').length
    const paidCount = payrolls.filter(p => p.status === 'PAID').length
    const totalNet = payrolls.reduce((sum, p) => sum + Number(p.net_salary), 0)

    // ======================== TABS ========================

    const hrTabs: { key: HRTab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'attendance', label: 'Attendance', icon: <Clock className="h-4 w-4" />, badge: pendingCount },
        { key: 'incidents', label: 'Incidents', icon: <AlertTriangle className="h-4 w-4" /> },
        { key: 'payroll', label: 'Payroll', icon: <DollarSign className="h-4 w-4" /> },
    ]

    return (
        <div className="space-y-5">
            {/* Sub-tabs */}
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit">
                {hrTabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg cursor-pointer transition-all ${
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

            {/* ======================== ATTENDANCE TAB ======================== */}
            {tab === 'attendance' && (
                <div className="space-y-4">
                    {/* Date Navigation */}
                    <Card>
                        <CardContent className="py-3 px-4">
                            <div className="flex items-center justify-between flex-wrap gap-2">
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
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="h-8 text-xs"
                                            onClick={() => setAttendanceDate(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))}
                                        >
                                            Today
                                        </Button>
                                    )}
                                </div>
                                <div className="flex items-center gap-3 text-xs">
                                    <span className="text-slate-500">{clockedInCount} clocked in</span>
                                    {(pendingCount ?? 0) > 0 && (
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
                        <div className="space-y-2">
                            {attendance.map(a => (
                                <Card key={a.id} className="overflow-hidden">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex items-start gap-3 flex-1 min-w-0">
                                                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center">
                                                    <Users className="h-5 w-5 text-slate-300" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <span className="font-bold text-slate-800">
                                                            {a.staff && typeof a.staff === 'object' && 'name' in a.staff
                                                                ? (a.staff as { name: string | null }).name ?? 'Unknown'
                                                                : 'Unknown'}
                                                        </span>
                                                        <span className="text-xs text-slate-400">
                                                            {a.staff && typeof a.staff === 'object' && 'role' in a.staff
                                                                ? (a.staff as { role: string }).role
                                                                : ''}
                                                        </span>
                                                        {!hotelId && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                                {getHotelName(a)}
                                                            </span>
                                                        )}
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

                                            {/* Validation */}
                                            <div className="flex flex-col items-end gap-2 flex-shrink-0">
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
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* ======================== INCIDENTS TAB ======================== */}
            {tab === 'incidents' && (
                <div className="space-y-4">
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <AlertTriangle className="h-5 w-5 text-red-600" />
                                Incidents (Last 30 Days) -- {incidents.length} records
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {incidents.length === 0 ? (
                                <div className="py-10 text-center">
                                    <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                                    <p className="text-sm text-slate-400">No incidents recorded in the last 30 days.</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {incidents.map(i => (
                                        <div key={i.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-semibold text-slate-800">
                                                        {i.staff && typeof i.staff === 'object' && 'name' in i.staff
                                                            ? (i.staff as { name: string | null }).name ?? 'Unknown'
                                                            : 'Unknown'}
                                                    </span>
                                                    {!hotelId && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                            {getHotelName(i)}
                                                        </span>
                                                    )}
                                                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                                        {i.category.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                                {i.description && (
                                                    <p className="text-xs text-slate-500 mt-1">{i.description}</p>
                                                )}
                                            </div>
                                            <div className="text-right flex-shrink-0 ml-3">
                                                {Number(i.penalty_amount) > 0 && (
                                                    <span className="text-sm font-bold text-red-600">
                                                        -₹{Number(i.penalty_amount).toLocaleString('en-IN')}
                                                    </span>
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
                <div className="space-y-4">
                    {/* Summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
                            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Total Net</p>
                            <p className="text-xl font-bold text-slate-900 mt-0.5">₹{totalNet.toLocaleString('en-IN')}</p>
                        </div>
                        <div className="bg-amber-50 rounded-xl border border-amber-200 px-4 py-3">
                            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Draft</p>
                            <p className="text-xl font-bold text-amber-700 mt-0.5">{draftCount}</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl border border-blue-200 px-4 py-3">
                            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wider">Finalized</p>
                            <p className="text-xl font-bold text-blue-700 mt-0.5">{finalizedCount}</p>
                        </div>
                        <div className="bg-emerald-50 rounded-xl border border-emerald-200 px-4 py-3">
                            <p className="text-[10px] font-semibold text-emerald-600 uppercase tracking-wider">Paid</p>
                            <p className="text-xl font-bold text-emerald-700 mt-0.5">{paidCount}</p>
                        </div>
                    </div>

                    {/* Generate + Month selector */}
                    <Card>
                        <CardHeader className="pb-3">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <FileText className="h-5 w-5 text-emerald-600" />
                                Payroll -- {payrollMonth}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center gap-3 flex-wrap">
                                <Input
                                    type="month"
                                    value={payrollMonth}
                                    onChange={e => setPayrollMonth(e.target.value)}
                                    className="w-48 h-9"
                                />
                                <Button
                                    onClick={handleGeneratePayroll}
                                    disabled={loading}
                                    className="bg-violet-600 hover:bg-violet-700"
                                >
                                    <DollarSign className="h-4 w-4 mr-1" /> Generate Payroll
                                </Button>
                                {payrolls.some(p => p.status === 'DRAFT') && (
                                    <Button
                                        variant="outline"
                                        onClick={handleRegeneratePayroll}
                                        disabled={loading}
                                        className="text-amber-700 border-amber-300 hover:bg-amber-50"
                                    >
                                        <RefreshCw className="h-4 w-4 mr-1" /> Regenerate Drafts
                                    </Button>
                                )}
                            </div>

                            {payrolls.length === 0 ? (
                                <p className="text-sm text-slate-400 py-6 text-center">
                                    No payroll records for this month. Click Generate to create.
                                </p>
                            ) : (
                                <div className="space-y-2">
                                    {payrolls.map(p => (
                                        <div key={p.id} className="bg-white rounded-xl px-4 py-4 border border-slate-200 shadow-sm">
                                            <div className="flex items-center justify-between mb-2">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <span className="font-bold text-slate-800">
                                                        {p.staff && typeof p.staff === 'object' && 'name' in p.staff
                                                            ? (p.staff as { name: string | null }).name ?? 'Unknown'
                                                            : 'Unknown'}
                                                    </span>
                                                    <span className="text-xs text-slate-500">
                                                        {p.staff && typeof p.staff === 'object' && 'role' in p.staff
                                                            ? (p.staff as { role: string }).role
                                                            : ''}
                                                    </span>
                                                    {!hotelId && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                            {getHotelName(p)}
                                                        </span>
                                                    )}
                                                </div>
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                                    p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
                                                    p.status === 'FINALIZED' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-amber-100 text-amber-700'
                                                }`}>
                                                    {p.status}
                                                </span>
                                            </div>

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
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handlePayrollAction(p.id, 'finalize')}
                                                        disabled={loading}
                                                        className="bg-blue-600 hover:bg-blue-700"
                                                    >
                                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Finalize
                                                    </Button>
                                                </div>
                                            )}
                                            {p.status === 'FINALIZED' && (
                                                <div className="mt-3 flex gap-2">
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handlePayrollAction(p.id, 'pay')}
                                                        disabled={loading}
                                                        className="bg-emerald-600 hover:bg-emerald-700"
                                                    >
                                                        <DollarSign className="h-3 w-3 mr-1" /> Mark Paid
                                                    </Button>
                                                </div>
                                            )}
                                            {p.status === 'PAID' && p.paid_at && (
                                                <p className="mt-2 text-xs text-slate-400">
                                                    Paid on {new Date(p.paid_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {/* Payroll History (last 6 months) */}
                    <Card>
                        <CardHeader className="pb-0 cursor-pointer" onClick={() => setHistoryOpen(v => !v)}>
                            <CardTitle className="flex items-center justify-between text-base">
                                <div className="flex items-center gap-2">
                                    <History className="h-5 w-5 text-slate-500" />
                                    Payroll History
                                </div>
                                <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${historyOpen ? 'rotate-180' : ''}`} />
                            </CardTitle>
                        </CardHeader>
                        {historyOpen && (
                            <CardContent className="pt-4">
                                {payrollHistory.length === 0 ? (
                                    <p className="text-sm text-slate-400 text-center py-4">No payroll history found.</p>
                                ) : (
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {payrollHistory.map(h => (
                                            <div key={h.month} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 space-y-2">
                                                <div className="flex items-center justify-between">
                                                    <span className="font-bold text-slate-800 text-sm">{h.label}</span>
                                                    <span className="text-xs text-slate-400">{h.staffCount} staff</span>
                                                </div>
                                                <p className="text-lg font-bold text-slate-900">
                                                    ₹{h.totalNet.toLocaleString('en-IN')}
                                                </p>
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    {h.draftCount > 0 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                                                            {h.draftCount} Draft
                                                        </span>
                                                    )}
                                                    {h.finalizedCount > 0 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                            {h.finalizedCount} Finalized
                                                        </span>
                                                    )}
                                                    {h.paidCount > 0 && (
                                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                                                            {h.paidCount} Paid
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </CardContent>
                        )}
                    </Card>
                </div>
            )}
        </div>
    )
}
