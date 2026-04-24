'use client'

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
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
import { Search, AlertTriangle, Save, Trash2, BookOpen, UserCheck, Droplets, Package, Users, Banknote, FileText, Receipt } from 'lucide-react'

type Section = 'bookings' | 'attendance' | 'freshup' | 'extras' | 'staff' | 'payroll' | 'incidents' | 'expenses'

interface BookingRow {
    id: string
    unit_id: string | null
    check_in: string
    check_out: string | null
    guest_count: number
    base_amount: number
    surcharge: number
    grand_total: number
    status: string
    notes: string | null
    advance_amount: number
    advance_type: string | null
    unit?: { unit_number: string; hotel_id: string } | null
}

interface PaymentRow {
    id: string
    booking_id: string
    amount_cash: number
    amount_digital: number
    total_paid: number
}

interface GuestRow {
    id: string
    booking_id: string
    name: string
    phone: string
    aadhar_number: string | null
}

interface AttendanceRow {
    id: string
    staff_id: string
    clock_in: string
    clock_out: string | null
    shift: string
    status: string
    validation_status: string | null
    staff?: { name: string | null; role: string } | null
}

interface FreshupRow {
    id: string
    guest_name: string
    guest_phone: string
    guest_count: number
    amount: number
    payment_method: string
    ac_type: string | null
    created_at: string
}

interface ExtraRow {
    id: string
    booking_id: string | null
    description: string
    amount: number
    payment_method: string
    created_at: string
}

export function OverrideConsole() {
    const [section, setSection] = useState<Section>('bookings')
    const [searchQuery, setSearchQuery] = useState('')
    const [reason, setReason] = useState('')
    const [saving, setSaving] = useState(false)

    // ===== Booking state =====
    const [booking, setBooking] = useState<BookingRow | null>(null)
    const [payment, setPayment] = useState<PaymentRow | null>(null)
    const [guests, setGuests] = useState<GuestRow[]>([])
    const [bookingForm, setBookingForm] = useState<Partial<BookingRow>>({})
    const [paymentForm, setPaymentForm] = useState<Partial<PaymentRow>>({})

    // ===== Attendance state =====
    const [attendanceList, setAttendanceList] = useState<AttendanceRow[]>([])
    const [attendanceDate, setAttendanceDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))

    // ===== Freshup state =====
    const [freshupList, setFreshupList] = useState<FreshupRow[]>([])
    const [freshupDate, setFreshupDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))

    // ===== Extras state =====
    const [extrasList, setExtrasList] = useState<ExtraRow[]>([])
    const [extrasDate, setExtrasDate] = useState(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }))

    // ===== Staff state =====
    const [staffList, setStaffList] = useState<Array<{ id: string; name: string | null; phone: string | null; role: string; base_salary: number; hotel_id: string }>>([])

    // ===== Payroll state =====
    const [payrollList, setPayrollList] = useState<Array<{ id: string; staff_id: string; month: string; base_salary: number; total_penalties: number; total_days_present: number; total_days_absent: number; net_salary: number; status: string; staff?: { name: string | null; role: string } }>>([])
    const [payrollMonth, setPayrollMonth] = useState(new Date().toISOString().slice(0, 7))

    // ===== Incidents state =====
    const [incidentList, setIncidentList] = useState<Array<{ id: string; staff_id: string; category: string; description: string | null; penalty_amount: number; incident_date: string; staff?: { name: string | null } }>>([])

    // ===== Expenses state =====
    const [expenseList, setExpenseList] = useState<Array<{ id: string; description: string; amount: number; category: string | null; status: string; created_at: string; rejection_reason: string | null }>>([])

    // ===== Recent bookings list =====
    const [recentBookings, setRecentBookings] = useState<Array<{ id: string; status: string; check_in: string; grand_total: number; unit?: { unit_number: string } | null; guests?: Array<{ name: string }> | null }>>([])

    // ===== Booking search =====
    // Accepts an optional explicit query (for direct clicks); falls back to searchQuery state
    const searchBooking = useCallback(async (explicitQuery?: string) => {
        const q = (explicitQuery ?? searchQuery).trim()
        if (!q) {
            toast.error('Enter booking ID or unit number')
            return
        }

        // Try to find by booking id first, then by unit_number (search recent bookings for that unit)
        let found: BookingRow | null = null

        if (q.length >= 30) {
            // UUID-like — try direct booking id lookup
            const { data } = await supabase
                .from('bookings')
                .select('*, unit:units(unit_number, hotel_id)')
                .eq('id', q)
                .maybeSingle()
            found = data as BookingRow | null
        }

        if (!found) {
            // Search by unit number — find the most recent booking for that unit
            const { data: unit } = await supabase
                .from('units')
                .select('id')
                .eq('unit_number', q)
                .maybeSingle()

            if (unit) {
                const { data } = await supabase
                    .from('bookings')
                    .select('*, unit:units(unit_number, hotel_id)')
                    .eq('unit_id', unit.id)
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .maybeSingle()
                found = data as BookingRow | null
            }
        }

        if (!found) {
            toast.error('Booking not found')
            setBooking(null)
            return
        }

        setBooking(found)
        setBookingForm({
            check_in: found.check_in,
            check_out: found.check_out,
            status: found.status,
            base_amount: found.base_amount,
            surcharge: found.surcharge,
            grand_total: found.grand_total,
            advance_amount: found.advance_amount,
            advance_type: found.advance_type,
            guest_count: found.guest_count,
            notes: found.notes,
        })

        // Fetch linked payment
        const { data: pay } = await supabase
            .from('payments')
            .select('*')
            .eq('booking_id', found.id)
            .maybeSingle()
        if (pay) {
            setPayment(pay as PaymentRow)
            setPaymentForm({
                amount_cash: pay.amount_cash,
                amount_digital: pay.amount_digital,
                total_paid: pay.total_paid,
            })
        } else {
            setPayment(null)
            setPaymentForm({})
        }

        // Fetch guests
        const { data: gs } = await supabase
            .from('guests')
            .select('*')
            .eq('booking_id', found.id)
            .order('created_at', { ascending: true })
        setGuests((gs as GuestRow[]) || [])

        toast.success('Booking loaded')
    }, [searchQuery])

    const saveBooking = async () => {
        if (!booking) return
        if (!reason.trim()) {
            toast.error('Please provide a reason for this override')
            return
        }
        setSaving(true)
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    table: 'bookings',
                    id: booking.id,
                    updates: bookingForm,
                    reason,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Booking updated')
            setBooking({ ...booking, ...bookingForm } as BookingRow)
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update')
        } finally {
            setSaving(false)
        }
    }

    const savePayment = async () => {
        if (!payment) return
        if (!reason.trim()) {
            toast.error('Please provide a reason')
            return
        }
        setSaving(true)
        try {
            // Recompute total_paid
            const cash = Number(paymentForm.amount_cash ?? payment.amount_cash)
            const digital = Number(paymentForm.amount_digital ?? payment.amount_digital)
            const updates = {
                amount_cash: cash,
                amount_digital: digital,
                total_paid: cash + digital,
            }
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'payments', id: payment.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Payment updated')
            setPayment({ ...payment, ...updates })
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update payment')
        } finally {
            setSaving(false)
        }
    }

    const saveGuest = async (guest: GuestRow, updates: Partial<GuestRow>) => {
        if (!reason.trim()) {
            toast.error('Please provide a reason')
            return
        }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'guests', id: guest.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Guest updated')
            setGuests(gs => gs.map(g => g.id === guest.id ? { ...g, ...updates } : g))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update guest')
        }
    }

    // ===== Attendance search =====
    const searchAttendance = useCallback(async () => {
        const dayStart = `${attendanceDate}T00:00:00+05:30`
        const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString()

        let query = supabase
            .from('attendance')
            .select('*, staff:staff_id(name, role)')
            .gte('clock_in', dayStart)
            .lt('clock_in', dayEnd)
            .order('clock_in', { ascending: false })

        const { data } = await query.limit(100)
        let list = (data as AttendanceRow[]) || []

        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase()
            list = list.filter(a => (a.staff?.name || '').toLowerCase().includes(q))
        }

        setAttendanceList(list)
        toast.success(`Found ${list.length} records`)
    }, [attendanceDate, searchQuery])

    const saveAttendance = async (att: AttendanceRow, updates: Partial<AttendanceRow>) => {
        if (!reason.trim()) {
            toast.error('Please provide a reason')
            return
        }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'attendance', id: att.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Attendance updated')
            setAttendanceList(list => list.map(a => a.id === att.id ? { ...a, ...updates } : a))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update attendance')
        }
    }

    // ===== Freshup search =====
    const searchFreshup = useCallback(async () => {
        const dayStart = `${freshupDate}T00:00:00+05:30`
        const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString()

        // DB column is `phone`, not `guest_phone` — alias so downstream `.guest_phone` reads work.
        const { data } = await supabase
            .from('freshup')
            .select('*, guest_phone:phone')
            .gte('created_at', dayStart)
            .lt('created_at', dayEnd)
            .order('created_at', { ascending: false })
            .limit(100)

        let list = (data as FreshupRow[]) || []
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase()
            list = list.filter(f => (f.guest_name || '').toLowerCase().includes(q) || (f.guest_phone || '').includes(q))
        }

        setFreshupList(list)
        toast.success(`Found ${list.length} records`)
    }, [freshupDate, searchQuery])

    const saveFreshup = async (fr: FreshupRow, updates: Partial<FreshupRow>) => {
        if (!reason.trim()) {
            toast.error('Please provide a reason')
            return
        }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'freshup', id: fr.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Freshup updated')
            setFreshupList(list => list.map(f => f.id === fr.id ? { ...f, ...updates } : f))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update freshup')
        }
    }

    const deleteFreshup = async (id: string) => {
        if (!confirm('Delete this freshup record? This cannot be undone.')) return
        try {
            const res = await fetch(`/api/overrides/developer?table=freshup&id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Deleted')
            setFreshupList(list => list.filter(f => f.id !== id))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete')
        }
    }

    // ===== Extras search =====
    const searchExtras = useCallback(async () => {
        const dayStart = `${extrasDate}T00:00:00+05:30`
        const dayEnd = new Date(new Date(dayStart).getTime() + 86400000).toISOString()

        const { data } = await supabase
            .from('booking_extras')
            .select('*')
            .gte('created_at', dayStart)
            .lt('created_at', dayEnd)
            .order('created_at', { ascending: false })
            .limit(100)

        let list = (data as ExtraRow[]) || []
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase()
            list = list.filter(e => (e.description || '').toLowerCase().includes(q))
        }

        setExtrasList(list)
        toast.success(`Found ${list.length} records`)
    }, [extrasDate, searchQuery])

    const saveExtra = async (ex: ExtraRow, updates: Partial<ExtraRow>) => {
        if (!reason.trim()) {
            toast.error('Please provide a reason')
            return
        }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'booking_extras', id: ex.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Extra updated')
            setExtrasList(list => list.map(e => e.id === ex.id ? { ...e, ...updates } : e))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update extra')
        }
    }

    const deleteExtra = async (id: string) => {
        if (!confirm('Delete this extra record? This cannot be undone.')) return
        try {
            const res = await fetch(`/api/overrides/developer?table=booking_extras&id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Deleted')
            setExtrasList(list => list.filter(e => e.id !== id))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete')
        }
    }

    // ===== Recent bookings (auto-load) =====
    const loadRecentBookings = useCallback(async () => {
        const { data } = await supabase
            .from('bookings')
            .select('id, status, check_in, grand_total, unit:units(unit_number), guests(name)')
            .order('created_at', { ascending: false })
            .limit(30)
        setRecentBookings((data as unknown as Array<{ id: string; status: string; check_in: string; grand_total: number; unit?: { unit_number: string } | null; guests?: Array<{ name: string }> | null }>) || [])
    }, [])

    // ===== Staff search =====
    const loadStaff = useCallback(async () => {
        const { data } = await supabase.from('staff').select('id, name, phone, role, base_salary, hotel_id').order('name')
        let list = (data as Array<{ id: string; name: string | null; phone: string | null; role: string; base_salary: number; hotel_id: string }>) || []
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase()
            list = list.filter(s => (s.name || '').toLowerCase().includes(q) || s.role.toLowerCase().includes(q))
        }
        setStaffList(list)
    }, [searchQuery])

    const saveStaff = async (staff: { id: string; name: string | null; phone: string | null; role: string; base_salary: number }, updates: Partial<{ name: string; phone: string; role: string; base_salary: number }>) => {
        if (!reason.trim()) { toast.error('Please provide a reason'); return }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'staff', id: staff.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Staff updated')
            setStaffList(list => list.map(s => s.id === staff.id ? { ...s, ...updates } : s))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update staff')
        }
    }

    // ===== Payroll =====
    const loadPayroll = useCallback(async () => {
        const monthStart = payrollMonth + '-01'
        const { data } = await supabase
            .from('payroll')
            .select('*, staff:staff_id(name, role)')
            .eq('month', monthStart)
            .order('created_at', { ascending: false })
        setPayrollList((data as Array<{ id: string; staff_id: string; month: string; base_salary: number; total_penalties: number; total_days_present: number; total_days_absent: number; net_salary: number; status: string; staff?: { name: string | null; role: string } }>) || [])
    }, [payrollMonth])

    const savePayroll = async (p: { id: string }, updates: Partial<{ total_days_present: number; total_penalties: number; net_salary: number; status: string }>) => {
        if (!reason.trim()) { toast.error('Please provide a reason'); return }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'payroll', id: p.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Payroll updated')
            setPayrollList(list => list.map(x => x.id === p.id ? { ...x, ...updates } : x))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update payroll')
        }
    }

    // ===== Incidents =====
    const loadIncidents = useCallback(async () => {
        const { data } = await supabase
            .from('staff_incidents')
            .select('*, staff:staff_id(name)')
            .order('incident_date', { ascending: false })
            .limit(50)
        let list = (data as Array<{ id: string; staff_id: string; category: string; description: string | null; penalty_amount: number; incident_date: string; staff?: { name: string | null } }>) || []
        if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase()
            list = list.filter(i => (i.staff?.name || '').toLowerCase().includes(q) || (i.description || '').toLowerCase().includes(q))
        }
        setIncidentList(list)
    }, [searchQuery])

    const saveIncident = async (inc: { id: string }, updates: Partial<{ penalty_amount: number; description: string; category: string }>) => {
        if (!reason.trim()) { toast.error('Please provide a reason'); return }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'staff_incidents', id: inc.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Incident updated')
            setIncidentList(list => list.map(x => x.id === inc.id ? { ...x, ...updates } : x))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update incident')
        }
    }

    const deleteIncident = async (id: string) => {
        if (!confirm('Delete this incident? This cannot be undone.')) return
        try {
            const res = await fetch(`/api/overrides/developer?table=staff_incidents&id=${id}`, { method: 'DELETE' })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Deleted')
            setIncidentList(list => list.filter(i => i.id !== id))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete')
        }
    }

    // ===== Expenses =====
    const loadExpenses = useCallback(async () => {
        const { data } = await supabase
            .from('property_expenses')
            .select('id, description, amount, category, status, created_at, rejection_reason')
            .order('created_at', { ascending: false })
            .limit(50)
        setExpenseList((data as Array<{ id: string; description: string; amount: number; category: string | null; status: string; created_at: string; rejection_reason: string | null }>) || [])
    }, [])

    const saveExpense = async (ex: { id: string }, updates: Partial<{ amount: number; status: string; rejection_reason: string | null }>) => {
        if (!reason.trim()) { toast.error('Please provide a reason'); return }
        try {
            const res = await fetch('/api/overrides/developer', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table: 'property_expenses', id: ex.id, updates, reason }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Expense updated')
            setExpenseList(list => list.map(x => x.id === ex.id ? { ...x, ...updates } : x))
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update expense')
        }
    }

    // Auto-load data when section changes
    useEffect(() => {
        if (section === 'bookings') loadRecentBookings()
        else if (section === 'attendance') searchAttendance()
        else if (section === 'freshup') searchFreshup()
        else if (section === 'extras') searchExtras()
        else if (section === 'staff') loadStaff()
        else if (section === 'payroll') loadPayroll()
        else if (section === 'incidents') loadIncidents()
        else if (section === 'expenses') loadExpenses()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [section])

    // Re-load when date/month changes
    useEffect(() => { if (section === 'attendance') searchAttendance() // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attendanceDate])
    useEffect(() => { if (section === 'freshup') searchFreshup() // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [freshupDate])
    useEffect(() => { if (section === 'extras') searchExtras() // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [extrasDate])
    useEffect(() => { if (section === 'payroll') loadPayroll() // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [payrollMonth])

    // Convert ISO timestamp to datetime-local format (YYYY-MM-DDTHH:MM in IST)
    // Uses manual arithmetic (UTC + 5:30) to avoid locale-dependent string formatting bugs
    const toDTLocal = (iso: string | null | undefined) => {
        if (!iso) return ''
        try {
            const d = new Date(iso)
            if (isNaN(d.getTime())) return ''
            const ist = new Date(d.getTime() + 330 * 60 * 1000)
            const pad = (n: number) => String(n).padStart(2, '0')
            return `${ist.getUTCFullYear()}-${pad(ist.getUTCMonth() + 1)}-${pad(ist.getUTCDate())}T${pad(ist.getUTCHours())}:${pad(ist.getUTCMinutes())}`
        } catch {
            return ''
        }
    }

    // Convert datetime-local to ISO with IST offset
    const fromDTLocal = (dt: string) => {
        if (!dt) return null
        return `${dt}:00+05:30`
    }

    const sections: { key: Section; label: string; icon: React.ReactNode }[] = [
        { key: 'bookings', label: 'Bookings', icon: <BookOpen className="h-4 w-4" /> },
        { key: 'attendance', label: 'Attendance', icon: <UserCheck className="h-4 w-4" /> },
        { key: 'freshup', label: 'Freshup', icon: <Droplets className="h-4 w-4" /> },
        { key: 'extras', label: 'Extras', icon: <Package className="h-4 w-4" /> },
        { key: 'staff', label: 'Staff', icon: <Users className="h-4 w-4" /> },
        { key: 'payroll', label: 'Payroll', icon: <Banknote className="h-4 w-4" /> },
        { key: 'incidents', label: 'Incidents', icon: <FileText className="h-4 w-4" /> },
        { key: 'expenses', label: 'Expenses', icon: <Receipt className="h-4 w-4" /> },
    ]

    return (
        <div className="space-y-4">
            {/* Warning banner */}
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div>
                    <p className="text-sm font-bold text-red-800">Developer Override Console</p>
                    <p className="text-xs text-red-700 mt-0.5">
                        This page lets you edit any booking, payment, attendance, freshup, or extras record.
                        All changes are logged with your name and reason. Use carefully.
                    </p>
                </div>
            </div>

            {/* Section tabs */}
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit">
                {sections.map(s => (
                    <button
                        key={s.key}
                        onClick={() => setSection(s.key)}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg transition-all ${
                            section === s.key
                                ? 'bg-red-600 text-white shadow-sm'
                                : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                        }`}
                    >
                        {s.icon}
                        {s.label}
                    </button>
                ))}
            </div>

            {/* Reason field (shared) */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
                <Label className="text-xs font-semibold">Reason for override *</Label>
                <Input
                    placeholder="e.g. CRE entered wrong check-in time, correcting to 14:30"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="h-9 text-sm mt-1"
                />
            </div>

            {/* ========== BOOKINGS SECTION ========== */}
            {section === 'bookings' && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <Label className="text-xs font-semibold">Search by Booking ID or Unit Number</Label>
                        <div className="flex gap-2">
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="e.g. 101 or booking UUID"
                                onKeyDown={(e) => { if (e.key === 'Enter') searchBooking() }}
                                className="h-9 text-sm"
                            />
                            <Button onClick={() => searchBooking()} className="h-9 gap-1 bg-red-600 hover:bg-red-700">
                                <Search className="h-4 w-4" /> Search
                            </Button>
                        </div>
                    </div>

                    {/* Recent Bookings list */}
                    {!booking && recentBookings.length > 0 && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                            <div className="flex items-center justify-between mb-1">
                                <p className="text-xs font-bold text-slate-600 uppercase tracking-wider">Recent Bookings</p>
                                <Button size="sm" variant="ghost" onClick={loadRecentBookings} className="h-7 text-[10px]">Refresh</Button>
                            </div>
                            {recentBookings.map(b => (
                                <button
                                    key={b.id}
                                    onClick={() => { setSearchQuery(b.id); searchBooking(b.id) }}
                                    className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 border border-slate-100 transition-colors text-left"
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="font-bold text-sm">Unit {b.unit?.unit_number || '?'}</span>
                                        <span className="text-xs text-slate-500">{b.guests?.[0]?.name || 'Unknown'}</span>
                                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                            b.status === 'CHECKED_IN' ? 'bg-emerald-100 text-emerald-700' :
                                            b.status === 'CHECKED_OUT' ? 'bg-slate-200 text-slate-700' :
                                            b.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                                            b.status === 'CONFIRMED' ? 'bg-blue-100 text-blue-700' :
                                            'bg-red-100 text-red-700'
                                        }`}>{b.status}</span>
                                    </div>
                                    <span className="text-xs text-slate-500">₹{Number(b.grand_total).toLocaleString('en-IN')}</span>
                                </button>
                            ))}
                        </div>
                    )}

                    {booking && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                            <div className="flex items-center justify-between">
                                <p className="text-sm font-bold text-slate-800">
                                    Booking {booking.id.slice(0, 8)}... · Unit {booking.unit?.unit_number || '?'}
                                </p>
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                                    {booking.status}
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <Label className="text-xs">Check-in (IST)</Label>
                                    <Input
                                        type="datetime-local"
                                        value={toDTLocal(bookingForm.check_in as string)}
                                        onChange={(e) => setBookingForm({ ...bookingForm, check_in: fromDTLocal(e.target.value) as string })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Check-out (IST)</Label>
                                    <Input
                                        type="datetime-local"
                                        value={toDTLocal(bookingForm.check_out as string)}
                                        onChange={(e) => setBookingForm({ ...bookingForm, check_out: fromDTLocal(e.target.value) })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Status</Label>
                                    <Select
                                        value={bookingForm.status || booking.status}
                                        onValueChange={(v) => setBookingForm({ ...bookingForm, status: v })}
                                    >
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="PENDING">PENDING</SelectItem>
                                            <SelectItem value="CONFIRMED">CONFIRMED</SelectItem>
                                            <SelectItem value="CHECKED_IN">CHECKED_IN</SelectItem>
                                            <SelectItem value="CHECKED_OUT">CHECKED_OUT</SelectItem>
                                            <SelectItem value="CANCELLED">CANCELLED</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div>
                                    <Label className="text-xs">Guest Count</Label>
                                    <Input
                                        type="number"
                                        value={bookingForm.guest_count ?? booking.guest_count}
                                        onChange={(e) => setBookingForm({ ...bookingForm, guest_count: Number(e.target.value) })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Base Amount</Label>
                                    <Input
                                        type="number"
                                        value={bookingForm.base_amount ?? booking.base_amount}
                                        onChange={(e) => setBookingForm({ ...bookingForm, base_amount: Number(e.target.value) })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Surcharge</Label>
                                    <Input
                                        type="number"
                                        value={bookingForm.surcharge ?? booking.surcharge}
                                        onChange={(e) => setBookingForm({ ...bookingForm, surcharge: Number(e.target.value) })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Grand Total</Label>
                                    <Input
                                        type="number"
                                        value={bookingForm.grand_total ?? booking.grand_total}
                                        onChange={(e) => setBookingForm({ ...bookingForm, grand_total: Number(e.target.value) })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Advance Amount</Label>
                                    <Input
                                        type="number"
                                        value={bookingForm.advance_amount ?? booking.advance_amount}
                                        onChange={(e) => setBookingForm({ ...bookingForm, advance_amount: Number(e.target.value) })}
                                        className="h-9 text-sm"
                                    />
                                </div>
                                <div>
                                    <Label className="text-xs">Advance Type</Label>
                                    <Select
                                        value={bookingForm.advance_type || booking.advance_type || 'CASH'}
                                        onValueChange={(v) => setBookingForm({ ...bookingForm, advance_type: v })}
                                    >
                                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="CASH">CASH</SelectItem>
                                            <SelectItem value="DIGITAL">DIGITAL</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <Button onClick={saveBooking} disabled={saving} className="bg-red-600 hover:bg-red-700 gap-1">
                                <Save className="h-4 w-4" /> Save Booking
                            </Button>

                            {/* Payment edit */}
                            {payment && (
                                <div className="border-t border-slate-200 pt-4 space-y-3">
                                    <p className="text-xs font-bold text-slate-600">Payment Record</p>
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <Label className="text-xs">Cash</Label>
                                            <Input
                                                type="number"
                                                value={paymentForm.amount_cash ?? payment.amount_cash}
                                                onChange={(e) => setPaymentForm({ ...paymentForm, amount_cash: Number(e.target.value) })}
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Digital</Label>
                                            <Input
                                                type="number"
                                                value={paymentForm.amount_digital ?? payment.amount_digital}
                                                onChange={(e) => setPaymentForm({ ...paymentForm, amount_digital: Number(e.target.value) })}
                                                className="h-9 text-sm"
                                            />
                                        </div>
                                        <div>
                                            <Label className="text-xs">Total (auto)</Label>
                                            <Input
                                                readOnly
                                                value={Number(paymentForm.amount_cash ?? payment.amount_cash) + Number(paymentForm.amount_digital ?? payment.amount_digital)}
                                                className="h-9 text-sm bg-slate-50"
                                            />
                                        </div>
                                    </div>
                                    <Button onClick={savePayment} disabled={saving} className="bg-red-600 hover:bg-red-700 gap-1">
                                        <Save className="h-4 w-4" /> Save Payment
                                    </Button>
                                </div>
                            )}

                            {/* Guests edit */}
                            {guests.length > 0 && (
                                <div className="border-t border-slate-200 pt-4 space-y-3">
                                    <p className="text-xs font-bold text-slate-600">Guests ({guests.length})</p>
                                    {guests.map((g, i) => (
                                        <div key={g.id} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-end">
                                            <span className="text-xs text-slate-500 mb-2">#{i + 1}</span>
                                            <Input
                                                value={g.name}
                                                onChange={(e) => setGuests(gs => gs.map(x => x.id === g.id ? { ...x, name: e.target.value } : x))}
                                                placeholder="Name"
                                                className="h-9 text-sm"
                                            />
                                            <Input
                                                value={g.phone}
                                                onChange={(e) => setGuests(gs => gs.map(x => x.id === g.id ? { ...x, phone: e.target.value } : x))}
                                                placeholder="Phone"
                                                className="h-9 text-sm"
                                            />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => saveGuest(g, { name: g.name, phone: g.phone })}
                                                className="h-9"
                                            >
                                                <Save className="h-3.5 w-3.5" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ========== ATTENDANCE SECTION ========== */}
            {section === 'attendance' && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <div>
                                <Label className="text-xs">Date</Label>
                                <Input
                                    type="date"
                                    value={attendanceDate}
                                    onChange={(e) => setAttendanceDate(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Staff name filter (optional)</Label>
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    placeholder="Filter by name"
                                    className="h-9 text-sm"
                                />
                            </div>
                            <Button onClick={searchAttendance} className="h-9 self-end gap-1 bg-red-600 hover:bg-red-700">
                                <Search className="h-4 w-4" /> Load
                            </Button>
                        </div>
                    </div>

                    {attendanceList.map(att => (
                        <AttendanceEditor key={att.id} att={att} onSave={saveAttendance} toDTLocal={toDTLocal} fromDTLocal={fromDTLocal} />
                    ))}
                </div>
            )}

            {/* ========== FRESHUP SECTION ========== */}
            {section === 'freshup' && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <div>
                                <Label className="text-xs">Date</Label>
                                <Input
                                    type="date"
                                    value={freshupDate}
                                    onChange={(e) => setFreshupDate(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Name/phone filter (optional)</Label>
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <Button onClick={searchFreshup} className="h-9 self-end gap-1 bg-red-600 hover:bg-red-700">
                                <Search className="h-4 w-4" /> Load
                            </Button>
                        </div>
                    </div>

                    {freshupList.map(fr => (
                        <FreshupEditor key={fr.id} fr={fr} onSave={saveFreshup} onDelete={deleteFreshup} />
                    ))}
                </div>
            )}

            {/* ========== EXTRAS SECTION ========== */}
            {section === 'extras' && (
                <div className="space-y-4">
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <div className="grid grid-cols-[1fr_1fr_auto] gap-2">
                            <div>
                                <Label className="text-xs">Date</Label>
                                <Input
                                    type="date"
                                    value={extrasDate}
                                    onChange={(e) => setExtrasDate(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <div>
                                <Label className="text-xs">Description filter (optional)</Label>
                                <Input
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                    className="h-9 text-sm"
                                />
                            </div>
                            <Button onClick={searchExtras} className="h-9 self-end gap-1 bg-red-600 hover:bg-red-700">
                                <Search className="h-4 w-4" /> Load
                            </Button>
                        </div>
                    </div>

                    {extrasList.map(ex => (
                        <ExtraEditor key={ex.id} ex={ex} onSave={saveExtra} onDelete={deleteExtra} />
                    ))}
                </div>
            )}

            {/* ========== STAFF SECTION ========== */}
            {section === 'staff' && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex gap-2">
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Filter by name or role..."
                                className="h-9 text-sm"
                            />
                            <Button onClick={loadStaff} className="h-9 gap-1 bg-red-600 hover:bg-red-700">
                                <Search className="h-4 w-4" /> Filter
                            </Button>
                        </div>
                    </div>

                    {staffList.map(s => (
                        <StaffEditor key={s.id} staff={s} onSave={saveStaff} />
                    ))}
                </div>
            )}

            {/* ========== PAYROLL SECTION ========== */}
            {section === 'payroll' && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <Label className="text-xs">Month</Label>
                        <Input
                            type="month"
                            value={payrollMonth}
                            onChange={(e) => setPayrollMonth(e.target.value)}
                            className="h-9 text-sm"
                        />
                    </div>

                    {payrollList.length === 0 && (
                        <div className="text-center py-8 text-slate-400 text-sm">No payroll records for this month</div>
                    )}

                    {payrollList.map(p => (
                        <PayrollEditor key={p.id} p={p} onSave={savePayroll} />
                    ))}
                </div>
            )}

            {/* ========== INCIDENTS SECTION ========== */}
            {section === 'incidents' && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <div className="flex gap-2">
                            <Input
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Filter by staff name or description..."
                                className="h-9 text-sm"
                            />
                            <Button onClick={loadIncidents} className="h-9 gap-1 bg-red-600 hover:bg-red-700">
                                <Search className="h-4 w-4" /> Filter
                            </Button>
                        </div>
                    </div>

                    {incidentList.map(inc => (
                        <IncidentEditor key={inc.id} inc={inc} onSave={saveIncident} onDelete={deleteIncident} />
                    ))}
                </div>
            )}

            {/* ========== EXPENSES SECTION ========== */}
            {section === 'expenses' && (
                <div className="space-y-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-3">
                        <Button onClick={loadExpenses} className="h-9 gap-1 bg-red-600 hover:bg-red-700">
                            <Search className="h-4 w-4" /> Refresh
                        </Button>
                    </div>

                    {expenseList.map(ex => (
                        <ExpenseEditor key={ex.id} ex={ex} onSave={saveExpense} />
                    ))}
                </div>
            )}
        </div>
    )
}

// ============ Subcomponents ============

function AttendanceEditor({ att, onSave, toDTLocal, fromDTLocal }: {
    att: AttendanceRow
    onSave: (att: AttendanceRow, updates: Partial<AttendanceRow>) => void
    toDTLocal: (iso: string | null | undefined) => string
    fromDTLocal: (dt: string) => string | null
}) {
    const [clockIn, setClockIn] = useState(toDTLocal(att.clock_in))
    const [clockOut, setClockOut] = useState(toDTLocal(att.clock_out))
    const [status, setStatus] = useState(att.status)

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{att.staff?.name || 'Unknown'} <span className="text-xs text-slate-400 ml-2">{att.staff?.role}</span></p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200">{att.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Clock-in (IST)</Label>
                    <Input type="datetime-local" value={clockIn} onChange={(e) => setClockIn(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Clock-out (IST)</Label>
                    <Input type="datetime-local" value={clockOut} onChange={(e) => setClockOut(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CLOCKED_IN">CLOCKED_IN</SelectItem>
                            <SelectItem value="CLOCKED_OUT">CLOCKED_OUT</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(att, {
                    clock_in: fromDTLocal(clockIn) as string,
                    clock_out: fromDTLocal(clockOut),
                    status,
                })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}

function FreshupEditor({ fr, onSave, onDelete }: {
    fr: FreshupRow
    onSave: (fr: FreshupRow, updates: Partial<FreshupRow>) => void
    onDelete: (id: string) => void
}) {
    const [amount, setAmount] = useState(String(fr.amount))
    const [paymentMethod, setPaymentMethod] = useState(fr.payment_method)
    const [guestCount, setGuestCount] = useState(String(fr.guest_count))

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{fr.guest_name} <span className="text-xs text-slate-400 ml-2">{fr.guest_phone}</span></p>
                <Button size="sm" variant="ghost" onClick={() => onDelete(fr.id)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-3 gap-3">
                <div>
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Payment</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CASH">CASH</SelectItem>
                            <SelectItem value="DIGITAL">DIGITAL</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs">Guest Count</Label>
                    <Input type="number" value={guestCount} onChange={(e) => setGuestCount(e.target.value)} className="h-9 text-sm" />
                </div>
            </div>
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(fr, {
                    amount: Number(amount),
                    payment_method: paymentMethod,
                    guest_count: Number(guestCount),
                })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}

function ExtraEditor({ ex, onSave, onDelete }: {
    ex: ExtraRow
    onSave: (ex: ExtraRow, updates: Partial<ExtraRow>) => void
    onDelete: (id: string) => void
}) {
    const [description, setDescription] = useState(ex.description)
    const [amount, setAmount] = useState(String(ex.amount))
    const [paymentMethod, setPaymentMethod] = useState(ex.payment_method)

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">{new Date(ex.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                <Button size="sm" variant="ghost" onClick={() => onDelete(ex.id)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
                <div>
                    <Label className="text-xs">Description</Label>
                    <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Payment</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="CASH">CASH</SelectItem>
                            <SelectItem value="DIGITAL">DIGITAL</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(ex, {
                    description,
                    amount: Number(amount),
                    payment_method: paymentMethod,
                })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}

function StaffEditor({ staff, onSave }: {
    staff: { id: string; name: string | null; phone: string | null; role: string; base_salary: number }
    onSave: (s: { id: string; name: string | null; phone: string | null; role: string; base_salary: number }, updates: Partial<{ name: string; phone: string; role: string; base_salary: number }>) => void
}) {
    const [name, setName] = useState(staff.name || '')
    const [phone, setPhone] = useState(staff.phone || '')
    const [role, setRole] = useState(staff.role)
    const [baseSalary, setBaseSalary] = useState(String(staff.base_salary ?? 0))

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <p className="text-sm font-bold">{staff.name || 'Unknown'} <span className="text-xs text-slate-400 ml-2">{staff.role}</span></p>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Name</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Phone</Label>
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Role</Label>
                    <Select value={role} onValueChange={setRole}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="FrontDesk">FrontDesk</SelectItem>
                            <SelectItem value="Housekeeping">Housekeeping</SelectItem>
                            <SelectItem value="HR">HR</SelectItem>
                            <SelectItem value="ZonalOps">ZonalOps</SelectItem>
                            <SelectItem value="ZonalHK">ZonalHK</SelectItem>
                            <SelectItem value="Admin">Admin</SelectItem>
                            <SelectItem value="Developer">Developer</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs">Base Salary</Label>
                    <Input type="number" value={baseSalary} onChange={(e) => setBaseSalary(e.target.value)} className="h-9 text-sm" />
                </div>
            </div>
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(staff, { name, phone, role, base_salary: Number(baseSalary) })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}

function PayrollEditor({ p, onSave }: {
    p: { id: string; staff_id: string; month: string; base_salary: number; total_penalties: number; total_days_present: number; total_days_absent: number; net_salary: number; status: string; staff?: { name: string | null; role: string } }
    onSave: (p: { id: string }, updates: Partial<{ total_days_present: number; total_penalties: number; net_salary: number; status: string }>) => void
}) {
    const [daysPresent, setDaysPresent] = useState(String(p.total_days_present))
    const [penalties, setPenalties] = useState(String(p.total_penalties))
    const [netSalary, setNetSalary] = useState(String(p.net_salary))
    const [status, setStatus] = useState(p.status)

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{p.staff?.name || 'Unknown'} <span className="text-xs text-slate-400 ml-2">{p.staff?.role}</span></p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-200">{p.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Days Present</Label>
                    <Input type="number" value={daysPresent} onChange={(e) => setDaysPresent(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Total Penalties</Label>
                    <Input type="number" value={penalties} onChange={(e) => setPenalties(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Net Salary</Label>
                    <Input type="number" value={netSalary} onChange={(e) => setNetSalary(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="DRAFT">DRAFT</SelectItem>
                            <SelectItem value="FINALIZED">FINALIZED</SelectItem>
                            <SelectItem value="PAID">PAID</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(p, {
                    total_days_present: Number(daysPresent),
                    total_penalties: Number(penalties),
                    net_salary: Number(netSalary),
                    status,
                })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}

function IncidentEditor({ inc, onSave, onDelete }: {
    inc: { id: string; staff_id: string; category: string; description: string | null; penalty_amount: number; incident_date: string; staff?: { name: string | null } }
    onSave: (inc: { id: string }, updates: Partial<{ penalty_amount: number; description: string; category: string }>) => void
    onDelete: (id: string) => void
}) {
    const [penalty, setPenalty] = useState(String(inc.penalty_amount))
    const [description, setDescription] = useState(inc.description || '')
    const [category, setCategory] = useState(inc.category)

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <p className="text-sm font-bold">{inc.staff?.name || 'Unknown'} <span className="text-xs text-slate-400 ml-2">{new Date(inc.incident_date).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</span></p>
                <Button size="sm" variant="ghost" onClick={() => onDelete(inc.id)} className="text-red-600 hover:text-red-700">
                    <Trash2 className="h-4 w-4" />
                </Button>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Category</Label>
                    <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="LATE_ARRIVAL">Late Arrival</SelectItem>
                            <SelectItem value="EARLY_DEPARTURE">Early Departure</SelectItem>
                            <SelectItem value="ABSENCE">Absence</SelectItem>
                            <SelectItem value="UNIFORM_VIOLATION">Uniform Violation</SelectItem>
                            <SelectItem value="GROOMING">Grooming</SelectItem>
                            <SelectItem value="MISCONDUCT">Misconduct</SelectItem>
                            <SelectItem value="DAMAGE">Damage</SelectItem>
                            <SelectItem value="OTHER">Other</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div>
                    <Label className="text-xs">Penalty Amount</Label>
                    <Input type="number" value={penalty} onChange={(e) => setPenalty(e.target.value)} className="h-9 text-sm" />
                </div>
            </div>
            <div>
                <Label className="text-xs">Description</Label>
                <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm" />
            </div>
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(inc, { penalty_amount: Number(penalty), description, category })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}

function ExpenseEditor({ ex, onSave }: {
    ex: { id: string; description: string; amount: number; category: string | null; status: string; created_at: string; rejection_reason: string | null }
    onSave: (ex: { id: string }, updates: Partial<{ amount: number; status: string; rejection_reason: string | null }>) => void
}) {
    const [amount, setAmount] = useState(String(ex.amount))
    const [status, setStatus] = useState(ex.status)
    const [rejectionReason, setRejectionReason] = useState(ex.rejection_reason || '')

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-sm font-bold">{ex.description}</p>
                    <p className="text-xs text-slate-400">{ex.category || 'No category'} · {new Date(ex.created_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                </div>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    ex.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' :
                    ex.status === 'REJECTED' ? 'bg-red-100 text-red-700' :
                    'bg-amber-100 text-amber-700'
                }`}>{ex.status}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="h-9 text-sm" />
                </div>
                <div>
                    <Label className="text-xs">Status</Label>
                    <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="PENDING">PENDING</SelectItem>
                            <SelectItem value="APPROVED">APPROVED</SelectItem>
                            <SelectItem value="REJECTED">REJECTED</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
            {status === 'REJECTED' && (
                <div>
                    <Label className="text-xs">Rejection Reason</Label>
                    <Input value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} className="h-9 text-sm" />
                </div>
            )}
            <Button
                size="sm"
                className="bg-red-600 hover:bg-red-700 gap-1"
                onClick={() => onSave(ex, {
                    amount: Number(amount),
                    status,
                    rejection_reason: status === 'REJECTED' ? rejectionReason : null,
                })}
            >
                <Save className="h-4 w-4" /> Save
            </Button>
        </div>
    )
}
