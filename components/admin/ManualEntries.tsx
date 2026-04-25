'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
    Banknote, Smartphone, Plus, ClipboardList, Calendar, Loader2, BedDouble,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { AdminTabProps } from '@/app/(dashboard)/admin/client'
import type { ManualRevenueEntry, ManualRevenueKind } from '@/lib/types'

const KINDS: { value: ManualRevenueKind; label: string }[] = [
    { value: 'CHECKIN', label: 'Check-in' },
    { value: 'CHECKOUT', label: 'Check-out' },
    { value: 'FRESHUP', label: 'Freshup' },
    { value: 'EXTRAS', label: 'Extras' },
    { value: 'OTHER', label: 'Other' },
]

function nowLocal(): string {
    // Format current time as a value compatible with <input type="datetime-local">.
    const d = new Date()
    const tz = d.getTimezoneOffset() * 60000
    return new Date(d.getTime() - tz).toISOString().slice(0, 16)
}

function inr(n: number) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)
}

function fmtDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: 'numeric', month: 'short', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
    })
}

export function ManualEntries({ hotelId, hotels }: AdminTabProps) {
    // ─── Quick entry state ────────────────────────────────────────────
    const [cash, setCash] = useState('')
    const [digital, setDigital] = useState('')
    const [kind, setKind] = useState<ManualRevenueKind>('CHECKIN')
    const [txnAt, setTxnAt] = useState(nowLocal())
    const [description, setDescription] = useState('')
    const [submitting, setSubmitting] = useState(false)

    // ─── Recent entries log ───────────────────────────────────────────
    const [entries, setEntries] = useState<ManualRevenueEntry[]>([])
    const [loadingEntries, setLoadingEntries] = useState(false)

    // ─── Retroactive booking modal ────────────────────────────────────
    const [retroOpen, setRetroOpen] = useState(false)

    // Default to first hotel when "All Hotels" is selected — manual revenue is
    // always written against a specific hotel.
    const targetHotelId = hotelId || hotels[0]?.id || ''
    const targetHotel = hotels.find(h => h.id === targetHotelId)

    const fetchEntries = useCallback(async () => {
        if (!targetHotelId) return
        setLoadingEntries(true)
        try {
            const res = await fetch(`/api/manual-revenue?hotel_id=${targetHotelId}&limit=50`)
            const json = await res.json()
            if (res.ok) setEntries(json.data || [])
        } catch {
            // silent
        } finally {
            setLoadingEntries(false)
        }
    }, [targetHotelId])

    useEffect(() => { fetchEntries() }, [fetchEntries])

    const handleSubmit = async () => {
        if (submitting) return
        const cashNum = Number(cash) || 0
        const digitalNum = Number(digital) || 0
        if (cashNum < 0 || digitalNum < 0) { toast.error('Amounts cannot be negative'); return }
        if (cashNum + digitalNum <= 0) { toast.error('Total amount must be greater than 0'); return }
        if (!targetHotelId) { toast.error('Select a hotel first (top-right)'); return }

        // Convert datetime-local (no timezone) to ISO assuming user's local TZ
        const txnIso = new Date(txnAt).toISOString()

        setSubmitting(true)
        try {
            const res = await fetch('/api/manual-revenue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hotel_id: targetHotelId,
                    amount_cash: cashNum,
                    amount_digital: digitalNum,
                    transaction_kind: kind,
                    description: description.trim() || null,
                    transaction_at: txnIso,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Failed to record entry')
            toast.success(`Recorded ${inr(cashNum + digitalNum)} (${kind})`)
            setCash('')
            setDigital('')
            setDescription('')
            setTxnAt(nowLocal())
            fetchEntries()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to record entry')
        } finally {
            setSubmitting(false)
        }
    }

    const totalCash = entries.reduce((s, e) => s + Number(e.amount_cash || 0), 0)
    const totalDigital = entries.reduce((s, e) => s + Number(e.amount_digital || 0), 0)

    if (!targetHotelId) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                <ClipboardList className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-600">Select a hotel from the scope dropdown above to record manual revenue entries.</p>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Quick Entry Form */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <Plus className="h-5 w-5 text-emerald-600" />
                            Quick Manual Entry
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Recording for <strong>{targetHotel?.name || 'hotel'}</strong> — register reconciliation when CRE is on leave
                        </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setRetroOpen(true)}>
                        <BedDouble className="h-4 w-4 mr-1.5" />
                        Retroactive Booking
                    </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Amounts */}
                    <div className="space-y-3">
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Cash</Label>
                            <div className="relative mt-1">
                                <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                    value={cash}
                                    onChange={(e) => setCash(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Digital</Label>
                            <div className="relative mt-1">
                                <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                                <Input
                                    type="number"
                                    inputMode="decimal"
                                    min="0"
                                    step="1"
                                    placeholder="0"
                                    value={digital}
                                    onChange={(e) => setDigital(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                        </div>
                        <div className="text-sm text-slate-700 pt-1">
                            Total: <strong>{inr((Number(cash) || 0) + (Number(digital) || 0))}</strong>
                        </div>
                    </div>

                    {/* Kind + Date + Notes */}
                    <div className="space-y-3">
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Kind</Label>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                                {KINDS.map(k => (
                                    <button
                                        key={k.value}
                                        type="button"
                                        onClick={() => setKind(k.value)}
                                        className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${kind === k.value
                                                ? 'bg-slate-900 text-white border-slate-900'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                            }`}
                                    >
                                        {k.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">When did this happen?</Label>
                            <Input
                                type="datetime-local"
                                value={txnAt}
                                onChange={(e) => setTxnAt(e.target.value)}
                                className="mt-1"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Backdate up to 1 year. Defaults to now.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-4">
                    <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Description (optional)</Label>
                    <textarea
                        placeholder="e.g. Walk-in dorm bed, paid Anand 25-Apr 11pm. Register page 14."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        rows={2}
                        maxLength={500}
                        className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                    />
                    <p className="text-[10px] text-slate-400 mt-1 text-right">{description.length}/500</p>
                </div>

                <div className="mt-4 flex justify-end">
                    <Button
                        onClick={handleSubmit}
                        disabled={submitting || ((Number(cash) || 0) + (Number(digital) || 0) <= 0)}
                        className="bg-emerald-600 hover:bg-emerald-700"
                    >
                        {submitting ? (
                            <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</>
                        ) : (
                            <><Plus className="h-4 w-4 mr-1.5" /> Record Entry</>
                        )}
                    </Button>
                </div>
            </div>

            {/* Recent Entries Log */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div>
                        <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-slate-600" />
                            Recent Entries
                        </h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            Last {entries.length} entries · Cash {inr(totalCash)} · Digital {inr(totalDigital)}
                        </p>
                    </div>
                    <Button variant="ghost" size="sm" onClick={fetchEntries} disabled={loadingEntries}>
                        {loadingEntries ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                    </Button>
                </div>

                {loadingEntries && entries.length === 0 ? (
                    <div className="py-10 text-center text-slate-400">
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </div>
                ) : entries.length === 0 ? (
                    <div className="py-10 text-center text-slate-400 text-sm">
                        No manual entries recorded for this hotel yet.
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                                <tr>
                                    <th className="px-4 py-2 text-left font-semibold">When</th>
                                    <th className="px-4 py-2 text-left font-semibold">Kind</th>
                                    <th className="px-4 py-2 text-right font-semibold">Cash</th>
                                    <th className="px-4 py-2 text-right font-semibold">Digital</th>
                                    <th className="px-4 py-2 text-right font-semibold">Total</th>
                                    <th className="px-4 py-2 text-left font-semibold">Description</th>
                                    <th className="px-4 py-2 text-left font-semibold">Entered By</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {entries.map(e => {
                                    const total = Number(e.amount_cash || 0) + Number(e.amount_digital || 0)
                                    const enteredByName = e.staff?.name || '—'
                                    return (
                                        <tr key={e.id} className="hover:bg-slate-50">
                                            <td className="px-4 py-2 whitespace-nowrap text-slate-700">
                                                <div>{fmtDateTime(e.transaction_at)}</div>
                                                <div className="text-[10px] text-slate-400">entered {fmtDateTime(e.entered_at)}</div>
                                            </td>
                                            <td className="px-4 py-2">
                                                <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                                    {e.transaction_kind}
                                                </span>
                                            </td>
                                            <td className="px-4 py-2 text-right text-emerald-700 font-medium">
                                                {Number(e.amount_cash) > 0 ? inr(Number(e.amount_cash)) : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-right text-blue-700 font-medium">
                                                {Number(e.amount_digital) > 0 ? inr(Number(e.amount_digital)) : '—'}
                                            </td>
                                            <td className="px-4 py-2 text-right font-bold text-slate-900">{inr(total)}</td>
                                            <td className="px-4 py-2 text-slate-600 max-w-xs truncate" title={e.description || ''}>
                                                {e.description || '—'}
                                            </td>
                                            <td className="px-4 py-2 text-slate-700">{enteredByName}</td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Retroactive Booking Modal */}
            <RetroactiveBookingModal
                open={retroOpen}
                onClose={() => setRetroOpen(false)}
                onSuccess={() => { setRetroOpen(false); fetchEntries() }}
                hotelId={targetHotelId}
                hotelName={targetHotel?.name || ''}
            />
        </div>
    )
}

// ============================================================
// Retroactive Booking Modal — admin enters a booking that already happened
// ============================================================

interface RetroProps {
    open: boolean
    onClose: () => void
    onSuccess: () => void
    hotelId: string
    hotelName: string
}

interface UnitOption {
    id: string
    unit_number: string
    type: string
    base_price: number
    max_guests: number
}

function RetroactiveBookingModal({ open, onClose, onSuccess, hotelId, hotelName }: RetroProps) {
    const [units, setUnits] = useState<UnitOption[]>([])
    const [unitId, setUnitId] = useState('')
    const [checkInAt, setCheckInAt] = useState(nowLocal())
    const [checkOutAt, setCheckOutAt] = useState(nowLocal())
    const [guestName, setGuestName] = useState('')
    const [guestPhone, setGuestPhone] = useState('')
    const [cash, setCash] = useState('')
    const [digital, setDigital] = useState('')
    const [submitting, setSubmitting] = useState(false)

    useEffect(() => {
        if (!open || !hotelId) return
        supabase
            .from('units')
            .select('id, unit_number, type, base_price, max_guests')
            .eq('hotel_id', hotelId)
            .order('unit_number')
            .then(({ data }) => setUnits((data as UnitOption[]) || []))
    }, [open, hotelId])

    const reset = () => {
        setUnitId('')
        setCheckInAt(nowLocal())
        setCheckOutAt(nowLocal())
        setGuestName('')
        setGuestPhone('')
        setCash('')
        setDigital('')
    }

    const handleSubmit = async () => {
        if (submitting) return
        if (!unitId) { toast.error('Select a unit'); return }
        if (!guestName.trim()) { toast.error('Guest name required'); return }
        const phoneDigits = guestPhone.replace(/\D/g, '')
        if (phoneDigits.length !== 10) { toast.error('Guest phone must be 10 digits'); return }
        if (new Date(checkOutAt) <= new Date(checkInAt)) { toast.error('Check-out must be after check-in'); return }
        const cashNum = Number(cash) || 0
        const digitalNum = Number(digital) || 0
        if (cashNum + digitalNum <= 0) { toast.error('Payment cannot be zero'); return }

        setSubmitting(true)
        try {
            const res = await fetch('/api/admin/retroactive-booking', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitId,
                    check_in_at: new Date(checkInAt).toISOString(),
                    check_out_at: new Date(checkOutAt).toISOString(),
                    payment_at: new Date(checkInAt).toISOString(),
                    guests: [{ name: guestName.trim(), phone: phoneDigits }],
                    cashAmount: cashNum,
                    digitalAmount: digitalNum,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Failed to record retroactive booking')
            toast.success('Retroactive booking recorded')
            reset()
            onSuccess()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to record retroactive booking')
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { if (!o) onClose() }}>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <BedDouble className="h-5 w-5 text-slate-700" />
                        Retroactive Booking — {hotelName}
                    </DialogTitle>
                    <DialogDescription>
                        Enter a booking that has already happened. Payment will be recorded with the check-in date so it appears in the correct revenue period.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-3">
                    <div>
                        <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Unit</Label>
                        <Select value={unitId} onValueChange={setUnitId}>
                            <SelectTrigger className="mt-1"><SelectValue placeholder="Select a unit" /></SelectTrigger>
                            <SelectContent>
                                {units.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.unit_number} — {u.type} (₹{u.base_price}/night)
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Check-in at</Label>
                            <Input type="datetime-local" value={checkInAt} onChange={(e) => setCheckInAt(e.target.value)} className="mt-1" />
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Check-out at</Label>
                            <Input type="datetime-local" value={checkOutAt} onChange={(e) => setCheckOutAt(e.target.value)} className="mt-1" />
                        </div>
                    </div>

                    <div>
                        <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Guest name</Label>
                        <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Full name" className="mt-1" />
                    </div>
                    <div>
                        <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Guest phone (10 digits)</Label>
                        <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} placeholder="e.g. 9876543210" className="mt-1" />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Cash</Label>
                            <Input type="number" min="0" step="1" value={cash} onChange={(e) => setCash(e.target.value)} placeholder="0" className="mt-1" />
                        </div>
                        <div>
                            <Label className="text-xs uppercase tracking-wider text-slate-500 font-bold">Digital</Label>
                            <Input type="number" min="0" step="1" value={digital} onChange={(e) => setDigital(e.target.value)} placeholder="0" className="mt-1" />
                        </div>
                    </div>
                    <div className="text-xs text-slate-500 italic">
                        Total payment must equal the booking grand total (calculated server-side from unit base price × days).
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-2">
                    <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={submitting} className="bg-slate-900 hover:bg-slate-800">
                        {submitting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Recording...</> : <><Calendar className="h-4 w-4 mr-1.5" /> Record Booking</>}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}
