'use client'

import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase/client'
import { UnitGrid } from '@/components/units/UnitGrid'
import { useUnitStore } from '@/lib/store/unit-store'
import { useCurrentTime, getCheckoutAlert } from '@/lib/hooks/use-current-time'
import type { UnitType, UnitStatus, StaffMember, Attendance } from '@/lib/types'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
    BedDouble,
    BedSingle,
    LayoutGrid,
    CheckCircle2,
    Users,
    AlertTriangle,
    Loader2,
    Wrench,
    Clock,
    Bell,
    ChevronDown,
    ChevronUp,
    Camera,
    LogIn,
    LogOut,
    Package,
    Receipt,
    MessageSquareWarning,
} from 'lucide-react'
import { RestockSheet as RestockForm } from '@/components/units/RestockSheet'

interface FrontDeskClientProps {
    hotelId: string
    staffId: string
}

type TypeFilter = UnitType | 'ALL'
type StatusFilter = UnitStatus | 'ALL'

export function FrontDeskClient({ hotelId, staffId }: FrontDeskClientProps) {
    const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL')
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL')
    const { units } = useUnitStore()

    // Restock state
    const [restockOpen, setRestockOpen] = useState(false)

    // Customer issue report state
    const [issueOpen, setIssueOpen] = useState(false)
    const [issueDescription, setIssueDescription] = useState('')
    const [issueGuestName, setIssueGuestName] = useState('')
    const [issueGuestPhone, setIssueGuestPhone] = useState('')
    const [issueSubmitting, setIssueSubmitting] = useState(false)

    // Expense request state
    const [expenseOpen, setExpenseOpen] = useState(false)
    const [expenseDescription, setExpenseDescription] = useState('')
    const [expenseAmount, setExpenseAmount] = useState('')
    const [expenseCategory, setExpenseCategory] = useState('')
    const [expenseSubmitting, setExpenseSubmitting] = useState(false)

    // Attendance state
    const [attendanceOpen, setAttendanceOpen] = useState(false)
    const [staffList, setStaffList] = useState<StaffMember[]>([])
    const [attendance, setAttendance] = useState<Attendance[]>([])
    const [clockInStaffId, setClockInStaffId] = useState('')
    const [clockInPhoto, setClockInPhoto] = useState<string | null>(null)
    const [cameraActive, setCameraActive] = useState(false)
    const [attendanceLoading, setAttendanceLoading] = useState(false)
    const videoRef = useRef<HTMLVideoElement>(null)

    // Fetch staff (excluding Admin)
    const fetchStaff = useCallback(async () => {
        const { data } = await supabase
            .from('staff')
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .eq('hotel_id', hotelId)
            .neq('role', 'Admin')
            .is('user_id', null)
            .order('name', { ascending: true })
        if (data) setStaffList(data)
    }, [hotelId])

    // Fetch today's attendance
    const fetchAttendance = useCallback(async () => {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        const nextDay = new Date(new Date(today + 'T00:00:00+05:30').getTime() + 86400000).toISOString()
        const { data } = await supabase
            .from('attendance')
            .select('*, staff:staff_id(name, role)')
            .eq('hotel_id', hotelId)
            .gte('clock_in', today + 'T00:00:00+05:30')
            .lt('clock_in', nextDay)
            .order('clock_in', { ascending: false })
        if (data) setAttendance(data)
    }, [hotelId])

    useEffect(() => {
        fetchStaff()
        fetchAttendance()
    }, [fetchStaff, fetchAttendance])

    // Supabase Realtime: instant attendance updates without polling
    useEffect(() => {
        const channel = supabase
            .channel(`attendance_fd_${hotelId.slice(0, 8)}`)
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
    }, [hotelId, fetchAttendance])

    // Camera functions
    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } })
            if (videoRef.current) {
                videoRef.current.srcObject = stream
                videoRef.current.play()
            }
            setCameraActive(true)
        } catch {
            toast.error('Camera access denied')
        }
    }

    const capturePhoto = () => {
        if (!videoRef.current) return
        const canvas = document.createElement('canvas')
        canvas.width = 320
        canvas.height = 240
        const ctx = canvas.getContext('2d')
        if (ctx) {
            ctx.drawImage(videoRef.current, 0, 0, 320, 240)
            setClockInPhoto(canvas.toDataURL('image/jpeg', 0.6))
        }
        stopCamera()
    }

    const stopCamera = () => {
        if (videoRef.current?.srcObject) {
            const stream = videoRef.current.srcObject as MediaStream
            stream.getTracks().forEach(t => t.stop())
            videoRef.current.srcObject = null
        }
        setCameraActive(false)
    }

    // Cleanup camera stream on unmount
    useEffect(() => {
        return () => {
            if (videoRef.current?.srcObject) {
                const stream = videoRef.current.srcObject as MediaStream
                stream.getTracks().forEach(t => t.stop())
            }
        }
    }, [])

    const handleClockIn = async () => {
        if (!clockInStaffId) { toast.error('Select a staff member'); return }
        setAttendanceLoading(true)
        try {
            const res = await fetch('/api/attendance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ staff_id: clockInStaffId, hotel_id: hotelId, photo: clockInPhoto }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(`Clocked in — ${json.shift} shift`)
            setClockInStaffId('')
            setClockInPhoto(null)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Clock in failed')
        } finally {
            setAttendanceLoading(false)
        }
    }

    const handleClockOut = async (attendanceId: string) => {
        setAttendanceLoading(true)
        try {
            const res = await fetch('/api/attendance/clock-out', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ attendance_id: attendanceId }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Clocked out')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Clock out failed')
        } finally {
            setAttendanceLoading(false)
        }
    }

    // Submit customer issue
    const handleSubmitIssue = async () => {
        if (!issueDescription.trim()) { toast.error('Please describe the issue'); return }
        setIssueSubmitting(true)
        try {
            const res = await fetch('/api/customer-issues', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: issueDescription.trim(),
                    guest_name: issueGuestName.trim() || null,
                    guest_phone: issueGuestPhone.trim() || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Customer issue reported to Zonal Ops')
            setIssueDescription('')
            setIssueGuestName('')
            setIssueGuestPhone('')
            setIssueOpen(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to report issue')
        } finally {
            setIssueSubmitting(false)
        }
    }

    // Submit expense request
    const handleSubmitExpense = async () => {
        if (!expenseDescription.trim()) { toast.error('Please describe the expense'); return }
        if (!expenseAmount || Number(expenseAmount) <= 0) { toast.error('Please enter a valid amount'); return }
        setExpenseSubmitting(true)
        try {
            const res = await fetch('/api/expenses', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    description: expenseDescription.trim(),
                    amount: Number(expenseAmount),
                    category: expenseCategory || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Expense request sent to Zonal Ops')
            setExpenseDescription('')
            setExpenseAmount('')
            setExpenseCategory('')
            setExpenseOpen(false)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit expense')
        } finally {
            setExpenseSubmitting(false)
        }
    }

    const clockedIn = attendance.filter(a => a.status === 'CLOCKED_IN')
    const clockedInIds = new Set(clockedIn.map(a => a.staff_id))
    const availableForClockIn = staffList.filter(s => !clockedInIds.has(s.id))
    const now = useCurrentTime(15000) // Poll every 15 seconds for time-sensitive alerts

    // Stats
    const stats = useMemo(() => {
        const filtered = typeFilter === 'ALL' ? units : units.filter(u => u.type === typeFilter)
        return {
            total: filtered.length,
            available: filtered.filter((u) => u.status === 'AVAILABLE').length,
            occupied: filtered.filter((u) => u.status === 'OCCUPIED').length,
            dirty: filtered.filter((u) => u.status === 'DIRTY').length,
            inProgress: filtered.filter((u) => u.status === 'IN_PROGRESS').length,
            maintenance: filtered.filter((u) => u.status === 'MAINTENANCE').length,
        }
    }, [units, typeFilter])

    // Checkout alerts for occupied units
    const checkoutAlerts = useMemo(() => {
        const occupied = units.filter(u => u.status === 'OCCUPIED' && u.active_booking?.check_out)
        return occupied
            .map(u => {
                const alert = getCheckoutAlert(u.active_booking!.check_out!, now)
                return {
                    unit: u,
                    alert,
                    guestName: u.active_booking?.guests?.[0]?.name || 'Unknown',
                }
            })
            .filter(a => a.alert.level !== 'none')
            .sort((a, b) => a.alert.minutesRemaining - b.alert.minutesRemaining)
    }, [units, now])

    const criticalCount = checkoutAlerts.filter(a => a.alert.level === 'critical').length
    const warningCount = checkoutAlerts.filter(a => a.alert.level === 'warning').length

    const typeFilters: { key: TypeFilter; label: string; icon: React.ReactNode }[] = [
        { key: 'ALL', label: 'All Units', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
        { key: 'ROOM', label: 'Rooms', icon: <BedDouble className="h-3.5 w-3.5" /> },
        { key: 'DORM', label: 'Dorms', icon: <BedSingle className="h-3.5 w-3.5" /> },
    ]

    const statusFilters: { key: StatusFilter; label: string; count: number; icon: React.ReactNode; color: string }[] = [
        { key: 'ALL', label: 'All', count: stats.total, icon: <LayoutGrid className="h-3 w-3" />, color: 'text-slate-600 bg-slate-100' },
        { key: 'AVAILABLE', label: 'Available', count: stats.available, icon: <CheckCircle2 className="h-3 w-3" />, color: 'text-emerald-700 bg-emerald-50' },
        { key: 'OCCUPIED', label: 'Occupied', count: stats.occupied, icon: <Users className="h-3 w-3" />, color: 'text-red-700 bg-red-50' },
        { key: 'DIRTY', label: 'Dirty', count: stats.dirty, icon: <AlertTriangle className="h-3 w-3" />, color: 'text-amber-700 bg-amber-50' },
        { key: 'IN_PROGRESS', label: 'Cleaning', count: stats.inProgress, icon: <Loader2 className="h-3 w-3" />, color: 'text-sky-700 bg-sky-50' },
        { key: 'MAINTENANCE', label: 'Maintenance', count: stats.maintenance, icon: <Wrench className="h-3 w-3" />, color: 'text-purple-700 bg-purple-50' },
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Checkout Alert Banner */}
            {checkoutAlerts.length > 0 && (
                <div className={`rounded-2xl border px-5 py-4 ${criticalCount > 0
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                    }`}>
                    <div className="flex items-center gap-3 mb-3">
                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${criticalCount > 0 ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'
                            }`}>
                            <Bell className="h-4 w-4" />
                        </div>
                        <div>
                            <h3 className={`text-sm font-bold ${criticalCount > 0 ? 'text-red-800' : 'text-amber-800'}`}>
                                Checkout Alerts
                                {criticalCount > 0 && (
                                    <span className="ml-2 px-2 py-0.5 rounded-full bg-red-200 text-red-700 text-[10px] font-bold uppercase">
                                        {criticalCount} overdue
                                    </span>
                                )}
                                {warningCount > 0 && (
                                    <span className="ml-1 px-2 py-0.5 rounded-full bg-amber-200 text-amber-700 text-[10px] font-bold uppercase">
                                        {warningCount} soon
                                    </span>
                                )}
                            </h3>
                        </div>
                    </div>
                    <div className="space-y-1.5">
                        {checkoutAlerts.map((item) => (
                            <div
                                key={item.unit.id}
                                className={`flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium ${item.alert.level === 'critical'
                                    ? 'bg-red-100/80 text-red-700'
                                    : item.alert.level === 'warning'
                                        ? 'bg-amber-100/80 text-amber-700'
                                        : 'bg-blue-50 text-blue-600'
                                    }`}
                            >
                                <div className="flex items-center gap-2">
                                    {item.alert.level === 'critical' && (
                                        <span className="relative flex h-2 w-2">
                                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                            <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                        </span>
                                    )}
                                    <span className="font-bold">{item.unit.unit_number}</span>
                                    <span className="text-[10px] opacity-70 truncate max-w-[120px]">
                                        {item.guestName}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    <span className="font-bold">{item.alert.label}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Staff Attendance Section */}
            <div className="rounded-2xl border border-violet-200 bg-violet-50/50 overflow-hidden">
                <button
                    onClick={() => setAttendanceOpen(!attendanceOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-violet-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600">
                            <Users className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-violet-900">Staff Attendance</span>
                            <span className="ml-3 text-xs text-violet-500">
                                {clockedIn.length}/{staffList.length} clocked in
                            </span>
                        </div>
                    </div>
                    {attendanceOpen ? <ChevronUp className="h-4 w-4 text-violet-400" /> : <ChevronDown className="h-4 w-4 text-violet-400" />}
                </button>

                {attendanceOpen && (
                    <div className="px-5 pb-5 space-y-4 border-t border-violet-200 pt-4">
                        {/* Clock-In Form */}
                        <div className="bg-white rounded-xl border border-violet-100 p-4 space-y-3">
                            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <LogIn className="h-4 w-4 text-emerald-600" />
                                Clock In Staff
                            </h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Staff Member</Label>
                                    <Select value={clockInStaffId} onValueChange={setClockInStaffId}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select staff..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {availableForClockIn.map(s => (
                                                <SelectItem key={s.id} value={s.id}>
                                                    {s.name || s.role} — {s.role}
                                                </SelectItem>
                                            ))}
                                            {availableForClockIn.length === 0 && (
                                                <div className="px-2 py-1.5 text-xs text-slate-400">All staff clocked in</div>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs">Photo <span className="text-red-500">*</span></Label>
                                    <div className="flex items-center gap-2">
                                        {!cameraActive && !clockInPhoto && (
                                            <Button variant="outline" size="sm" onClick={startCamera} className="h-8 text-xs">
                                                <Camera className="h-3.5 w-3.5 mr-1" /> Take Photo
                                            </Button>
                                        )}
                                        {cameraActive && (
                                            <Button size="sm" onClick={capturePhoto} className="h-8 text-xs">
                                                <Camera className="h-3.5 w-3.5 mr-1" /> Capture
                                            </Button>
                                        )}
                                        {clockInPhoto && (
                                            <div className="flex items-center gap-2">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                                <span className="text-xs text-emerald-600">Photo captured</span>
                                                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => { setClockInPhoto(null); startCamera() }}>Retake</Button>
                                            </div>
                                        )}
                                    </div>
                                    <video ref={videoRef} className={`rounded-lg border ${cameraActive ? 'block' : 'hidden'}`} width={240} height={180} />
                                    {clockInPhoto && <img src={clockInPhoto} alt="Clock-in" className="rounded-lg border w-28" />}
                                </div>
                            </div>
                            <Button onClick={handleClockIn} disabled={attendanceLoading || !clockInStaffId || !clockInPhoto} size="sm" className="bg-emerald-600 hover:bg-emerald-700 h-8 text-xs">
                                <LogIn className="h-3.5 w-3.5 mr-1" /> Clock In
                            </Button>
                        </div>

                        {/* Currently Clocked In */}
                        {clockedIn.length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Currently Clocked In</h3>
                                {clockedIn.map(a => (
                                    <div key={a.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white rounded-xl px-4 py-2.5 border border-violet-100">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="font-semibold text-sm text-slate-800 truncate">{a.staff?.name || 'Unknown'}</span>
                                            <span className="text-[10px] text-slate-400 shrink-0">{a.staff?.role}</span>
                                            <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.shift === 'DAY' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                {a.shift}
                                            </span>
                                            <span className="text-[10px] text-slate-400 shrink-0">
                                                {new Date(a.clock_in).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        </div>
                                        <Button variant="outline" size="sm" onClick={() => handleClockOut(a.id)} disabled={attendanceLoading} className="h-7 text-xs text-red-600 border-red-200 hover:bg-red-50">
                                            <LogOut className="h-3 w-3 mr-1" /> Clock Out
                                        </Button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Clocked Out Today */}
                        {attendance.filter(a => a.status === 'CLOCKED_OUT').length > 0 && (
                            <div className="space-y-2">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Clocked Out Today</h3>
                                {attendance.filter(a => a.status === 'CLOCKED_OUT').map(a => (
                                    <div key={a.id} className="flex items-center justify-between bg-white/50 rounded-xl px-4 py-2 border border-slate-100">
                                        <div className="flex items-center gap-2">
                                            <span className="font-medium text-sm text-slate-600">{a.staff?.name || 'Unknown'}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${a.shift === 'DAY' ? 'bg-amber-100 text-amber-700' : 'bg-indigo-100 text-indigo-700'}`}>
                                                {a.shift}
                                            </span>
                                        </div>
                                        <span className="text-[10px] text-slate-400">
                                            {new Date(a.clock_in).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })}
                                            {' → '}
                                            {a.clock_out ? new Date(a.clock_out).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Restock Request Section */}
            <div className="rounded-2xl border border-orange-200 bg-orange-50/50 overflow-hidden">
                <button
                    onClick={() => setRestockOpen(!restockOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-orange-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                            <Package className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-orange-900">Request Restock</span>
                            <span className="ml-3 text-xs text-orange-500">Send supply requests to Zonal Ops</span>
                        </div>
                    </div>
                    {restockOpen ? <ChevronUp className="h-4 w-4 text-orange-400" /> : <ChevronDown className="h-4 w-4 text-orange-400" />}
                </button>

                {restockOpen && (
                    <div className="px-5 pb-5 border-t border-orange-200 pt-4">
                        <RestockForm open={restockOpen} onClose={() => setRestockOpen(false)} hotelId={hotelId} staffId={staffId} />
                    </div>
                )}
            </div>

            {/* Report Customer Issue Section */}
            <div className="rounded-2xl border border-red-200 bg-red-50/50 overflow-hidden">
                <button
                    onClick={() => setIssueOpen(!issueOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-red-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                            <MessageSquareWarning className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-red-900">Report Customer Issue</span>
                            <span className="ml-3 text-xs text-red-500">Send to Zonal Ops for resolution</span>
                        </div>
                    </div>
                    {issueOpen ? <ChevronUp className="h-4 w-4 text-red-400" /> : <ChevronDown className="h-4 w-4 text-red-400" />}
                </button>

                {issueOpen && (
                    <div className="px-5 pb-5 border-t border-red-200 pt-4">
                        <div className="bg-white rounded-xl border border-red-100 p-4 space-y-3">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Guest Name</Label>
                                    <input
                                        type="text"
                                        placeholder="e.g. John Doe"
                                        value={issueGuestName}
                                        onChange={(e) => setIssueGuestName(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Guest Phone</Label>
                                    <input
                                        type="text"
                                        placeholder="e.g. 9876543210"
                                        value={issueGuestPhone}
                                        onChange={(e) => setIssueGuestPhone(e.target.value)}
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600">Issue Description *</Label>
                                <textarea
                                    placeholder="Describe the customer issue in detail..."
                                    value={issueDescription}
                                    onChange={(e) => setIssueDescription(e.target.value)}
                                    rows={3}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 resize-none placeholder:text-slate-400"
                                />
                            </div>
                            <Button
                                onClick={handleSubmitIssue}
                                disabled={issueSubmitting || !issueDescription.trim()}
                                size="sm"
                                className="bg-red-600 hover:bg-red-700 h-8 text-xs"
                            >
                                {issueSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Sending...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <MessageSquareWarning className="h-3.5 w-3.5" />
                                        Report Issue
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Property Expense Request Section */}
            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 overflow-hidden">
                <button
                    onClick={() => setExpenseOpen(!expenseOpen)}
                    className="w-full flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-blue-50 transition-colors"
                >
                    <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600">
                            <Receipt className="h-4 w-4" />
                        </div>
                        <div className="text-left">
                            <span className="text-sm font-bold text-blue-900">Property Expense Request</span>
                            <span className="ml-3 text-xs text-blue-500">Submit for Zonal Ops approval</span>
                        </div>
                    </div>
                    {expenseOpen ? <ChevronUp className="h-4 w-4 text-blue-400" /> : <ChevronDown className="h-4 w-4 text-blue-400" />}
                </button>

                {expenseOpen && (
                    <div className="px-5 pb-5 border-t border-blue-200 pt-4">
                        <div className="bg-white rounded-xl border border-blue-100 p-4 space-y-3">
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600">Description *</Label>
                                <textarea
                                    placeholder="e.g. Plumbing repair in bathroom, AC filter replacement..."
                                    value={expenseDescription}
                                    onChange={(e) => setExpenseDescription(e.target.value)}
                                    rows={2}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 resize-none placeholder:text-slate-400"
                                />
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Amount (INR) *</Label>
                                    <input
                                        type="number"
                                        placeholder="e.g. 500"
                                        value={expenseAmount}
                                        onChange={(e) => setExpenseAmount(e.target.value)}
                                        min="1"
                                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-400/20 placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Category</Label>
                                    <Select value={expenseCategory} onValueChange={setExpenseCategory}>
                                        <SelectTrigger className="h-9">
                                            <SelectValue placeholder="Select category..." />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Plumbing">Plumbing</SelectItem>
                                            <SelectItem value="Electrical">Electrical</SelectItem>
                                            <SelectItem value="Supplies">Supplies</SelectItem>
                                            <SelectItem value="Cleaning">Cleaning</SelectItem>
                                            <SelectItem value="Furniture">Furniture</SelectItem>
                                            <SelectItem value="Other">Other</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <Button
                                onClick={handleSubmitExpense}
                                disabled={expenseSubmitting || !expenseDescription.trim() || !expenseAmount || Number(expenseAmount) <= 0}
                                size="sm"
                                className="bg-blue-600 hover:bg-blue-700 h-8 text-xs"
                            >
                                {expenseSubmitting ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Sending...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Receipt className="h-3.5 w-3.5" />
                                        Submit Expense Request
                                    </span>
                                )}
                            </Button>
                        </div>
                    </div>
                )}
            </div>

            {/* Page Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Front Desk
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Manage check-ins, check-outs, and room statuses in
                        real-time.
                    </p>
                </div>

                {/* Type Filter Tabs */}
                <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm">
                    {typeFilters.map((f) => (
                        <button
                            key={f.key}
                            onClick={() => setTypeFilter(f.key)}
                            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg cursor-pointer transition-all ${typeFilter === f.key
                                ? 'bg-slate-900 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                        >
                            {f.icon}
                            {f.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {statusFilters.map((sf) => (
                    <button
                        key={sf.key}
                        onClick={() => setStatusFilter(sf.key)}
                        className={`flex items-center gap-2.5 rounded-xl px-4 py-3 text-left transition-all border ${statusFilter === sf.key
                            ? 'border-slate-300 shadow-sm ring-1 ring-slate-200 bg-white'
                            : 'border-transparent bg-white/50 hover:bg-white hover:border-slate-200'
                            }`}
                    >
                        <div
                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${sf.color}`}
                        >
                            {sf.icon}
                        </div>
                        <div>
                            <p className="text-lg font-bold text-slate-900 leading-none">
                                {sf.count}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">
                                {sf.label}
                            </p>
                        </div>
                    </button>
                ))}
            </div>

            {/* Unit Grid */}
            <UnitGrid
                hotelId={hotelId}
                typeFilter={typeFilter}
                statusFilter={statusFilter}
                now={now}
            />
        </div>
    )
}
