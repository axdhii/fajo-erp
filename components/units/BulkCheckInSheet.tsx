'use client'

// ─────────────────────────────────────────────────────────────
// BulkCheckInSheet — 4-step wizard for Kaloor group walk-ins.
//
// Step 1: pick beds (multi-select grid + auto-pick N cheapest)
// Step 2: guest name + phone per bed (with aadhar lookup)
// Step 3: aadhar capture per guest (or per-guest bypass)
// Step 4: pricing review + cash/digital payment + submit
//
// Mobile-first: full-screen sheet on mobile, side sheet on
// desktop. Sticky bottom action bar with Back / Next / Submit.
// Bed chip grid uses 4 cols on phone, 6 on tablet, 8 on
// desktop so nothing wraps awkwardly.
//
// Submit hits POST /api/bookings/bulk which calls the atomic
// Postgres function fn_bulk_dorm_checkin.
// ─────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useRef } from 'react'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AadharCapture } from './AadharCapture'
import {
    BedSingle,
    ArrowLeft,
    ArrowRight,
    Check,
    UserSearch,
    Users,
    AlertTriangle,
    IndianRupee,
    Banknote,
    Smartphone,
    Loader2,
    CheckCircle2,
    Plus,
    Minus,
    Trash2,
    Wand2,
    ShieldAlert,
} from 'lucide-react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import { lookupAadhar, getAadharPublicUrl, type AadharMatch } from '@/lib/utils/merge-aadhar'

interface BulkCheckInSheetProps {
    hotelId: string
    units: UnitWithBooking[] // ALL units at the hotel (already in store)
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

interface GuestRow {
    unitId: string
    name: string
    phone: string
    aadharUrl?: string
    aadharPublicUrl?: string
    aadharFromMerge?: boolean
    aadharNumber?: string
    bypassReason?: string
    bypassEnabled: boolean
    aadharMatch?: AadharMatch
    matchDismissed?: boolean
}

type Step = 1 | 2 | 3 | 4

// Lower (₹400) vs Upper (₹450) — matches the inference in
// CheckInSheet.getDormBedLabel(). bed_position is nullable today.
function isLowerBed(unit: UnitWithBooking): boolean {
    if (unit.bed_position) return unit.bed_position === 'LOWER'
    const m = unit.unit_number.match(/A(\d+)/)
    if (!m) return false
    return parseInt(m[1]) <= 13
}

function bedLabel(unit: UnitWithBooking): string {
    return isLowerBed(unit) ? 'Lower' : 'Upper'
}

// Natural sort: A1 < A2 < A10 < A13 < A14 < A36
function naturalCompare(a: string, b: string): number {
    const re = /^([A-Za-z]*)(\d+)$/
    const ma = a.match(re), mb = b.match(re)
    if (ma && mb && ma[1] === mb[1]) return parseInt(ma[2]) - parseInt(mb[2])
    return a.localeCompare(b)
}

export function BulkCheckInSheet({
    hotelId,
    units,
    open,
    onOpenChange,
    onSuccess,
}: BulkCheckInSheetProps) {
    const [step, setStep] = useState<Step>(1)
    const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([])
    const [guests, setGuests] = useState<GuestRow[]>([])
    const [autoPickN, setAutoPickN] = useState<string>('')
    const [numberOfDays, setNumberOfDays] = useState(1)
    const [amountCash, setAmountCash] = useState('')
    const [amountDigital, setAmountDigital] = useState('')
    const [payLater, setPayLater] = useState(false)
    const [aadharStepIndex, setAadharStepIndex] = useState(0) // which guest we're capturing
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [lookingUpIdx, setLookingUpIdx] = useState<number | null>(null)
    const clientRequestIdRef = useRef<string>('')

    // Reset everything when the sheet closes or opens fresh.
    useEffect(() => {
        if (open) {
            clientRequestIdRef.current = (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
                ? crypto.randomUUID()
                : `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`
        } else {
            setStep(1)
            setSelectedUnitIds([])
            setGuests([])
            setAutoPickN('')
            setNumberOfDays(1)
            setAmountCash('')
            setAmountDigital('')
            setPayLater(false)
            setAadharStepIndex(0)
            setIsSubmitting(false)
        }
    }, [open])

    // Available DORM beds at this hotel, naturally sorted.
    const availableDorms = useMemo(() => {
        return units
            .filter(u => u.type === 'DORM' && u.status === 'AVAILABLE')
            .sort((a, b) => naturalCompare(a.unit_number, b.unit_number))
    }, [units])

    const unitsById = useMemo(() => {
        const m = new Map<string, UnitWithBooking>()
        for (const u of availableDorms) m.set(u.id, u)
        return m
    }, [availableDorms])

    const selectedUnits = useMemo(() => {
        return selectedUnitIds
            .map(id => unitsById.get(id))
            .filter((u): u is UnitWithBooking => !!u)
    }, [selectedUnitIds, unitsById])

    const selectedTotal = useMemo(() => {
        return selectedUnits.reduce((sum, u) => sum + Number(u.base_price), 0)
    }, [selectedUnits])

    const grandTotal = useMemo(() => {
        return selectedTotal * numberOfDays
    }, [selectedTotal, numberOfDays])

    // Keep guests array in sync with selectedUnitIds (preserve typed values).
    useEffect(() => {
        setGuests(prev => {
            const byUnit = new Map(prev.map(g => [g.unitId, g]))
            return selectedUnitIds.map(uid =>
                byUnit.get(uid) || {
                    unitId: uid,
                    name: '',
                    phone: '',
                    bypassEnabled: false,
                },
            )
        })
    }, [selectedUnitIds])

    const toggleBed = (id: string) => {
        setSelectedUnitIds(prev => {
            if (prev.includes(id)) return prev.filter(x => x !== id)
            return [...prev, id]
        })
    }

    const autoPick = () => {
        const n = parseInt(autoPickN, 10)
        if (!n || n < 1) {
            toast.error('Enter a number of beds to auto-pick')
            return
        }
        // Sort by base_price ASC then unit_number — lowers (cheaper) first.
        const sorted = [...availableDorms].sort((a, b) => {
            const pa = Number(a.base_price), pb = Number(b.base_price)
            if (pa !== pb) return pa - pb
            return naturalCompare(a.unit_number, b.unit_number)
        })
        const take = sorted.slice(0, n).map(u => u.id)
        setSelectedUnitIds(take)
        if (take.length < n) {
            toast.warning(`Only ${take.length} bed${take.length === 1 ? '' : 's'} available — selected what we could.`)
        } else {
            toast.success(`Auto-picked ${take.length} bed${take.length === 1 ? '' : 's'}`)
        }
        setAutoPickN('')
    }

    const clearAll = () => {
        setSelectedUnitIds([])
        setGuests([])
    }

    // ── Validation per step ─────────────────────────────────────
    const step1Valid = selectedUnitIds.length >= 2

    const step2Valid = useMemo(() => {
        return guests.every(g => {
            const phoneDigits = (g.phone || '').replace(/\D/g, '')
            return g.name.trim().length > 0 && phoneDigits.length === 10
        })
    }, [guests])

    const step3Valid = useMemo(() => {
        return guests.every(g => {
            if (g.bypassEnabled) return (g.bypassReason || '').trim().length >= 3
            return !!g.aadharUrl
        })
    }, [guests])

    const cashNum = Number(amountCash) || 0
    const digitalNum = Number(amountDigital) || 0
    const totalPaid = cashNum + digitalNum
    const paymentMatches = payLater
        ? cashNum === 0 && digitalNum === 0
        : Math.abs(totalPaid - grandTotal) < 0.01

    // ── Step navigation ─────────────────────────────────────────
    const goNext = () => {
        if (step === 1 && !step1Valid) {
            toast.error('Select at least 2 beds to continue')
            return
        }
        if (step === 2 && !step2Valid) {
            toast.error('Every guest needs a name and 10-digit phone')
            return
        }
        if (step === 3 && !step3Valid) {
            toast.error('Every guest needs an Aadhar photo OR a bypass reason (min 3 chars)')
            return
        }
        if (step === 3) setAadharStepIndex(0)
        setStep((step + 1) as Step)
    }

    const goBack = () => {
        if (step === 1) return
        setStep((step - 1) as Step)
    }

    // ── Phone lookup (Step 2) ───────────────────────────────────
    const handlePhoneLookup = async (idx: number) => {
        const g = guests[idx]
        if (!g) return
        const digits = (g.phone || '').replace(/\D/g, '')
        if (digits.length !== 10) return
        if (g.aadharUrl) return // already have aadhar

        setLookingUpIdx(idx)
        try {
            const match = await lookupAadhar(digits)
            if (match) {
                setGuests(prev => prev.map((row, i) => i === idx ? { ...row, aadharMatch: match } : row))
            }
        } catch {
            // best-effort; ignore
        } finally {
            setLookingUpIdx(null)
        }
    }

    const applyAadharMerge = (idx: number) => {
        setGuests(prev => prev.map((row, i) => {
            if (i !== idx || !row.aadharMatch) return row
            return {
                ...row,
                aadharUrl: row.aadharMatch.aadhar_url_front,
                aadharPublicUrl: getAadharPublicUrl(row.aadharMatch.aadhar_url_front),
                aadharFromMerge: true,
                aadharMatch: undefined,
            }
        }))
        toast.success('Aadhar linked from previous stay')
    }

    const dismissMerge = (idx: number) => {
        setGuests(prev => prev.map((row, i) => i === idx ? { ...row, aadharMatch: undefined, matchDismissed: true } : row))
    }

    // ── Submit ──────────────────────────────────────────────────
    const handleSubmit = async () => {
        if (!step3Valid) {
            toast.error('Every guest needs an Aadhar photo OR bypass reason')
            return
        }
        if (!paymentMatches) {
            toast.error(payLater
                ? 'Pay Later: cash and digital must both be 0'
                : `Payment must equal ₹${grandTotal.toLocaleString('en-IN')}`)
            return
        }

        setIsSubmitting(true)
        try {
            const payload = {
                hotelId,
                unitIds: selectedUnitIds,
                numberOfDays,
                guests: guests.map(g => ({
                    unitId: g.unitId,
                    name: g.name.trim(),
                    phone: g.phone.replace(/\D/g, ''),
                    ...(g.bypassEnabled
                        ? { bypass: { reason: (g.bypassReason || '').trim() } }
                        : { aadhar: { stitchedUrl: g.aadharUrl!, aadharNumber: g.aadharNumber || null } }
                    ),
                })),
                amountCash: payLater ? 0 : cashNum,
                amountDigital: payLater ? 0 : digitalNum,
                payLater,
                clientRequestId: clientRequestIdRef.current,
            }

            const res = await fetch('/api/bookings/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Bulk check-in failed')
                return
            }

            toast.success(
                `Checked in ${selectedUnitIds.length} guests · ${payLater ? 'Pay Later' : `₹${grandTotal.toLocaleString('en-IN')} collected`}`
            )
            onSuccess()
            onOpenChange(false)
        } catch (err) {
            console.error('Bulk submit error:', err)
            toast.error('Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                className="bg-white p-0 flex flex-col w-full sm:max-w-2xl border-l border-slate-200 shadow-2xl overflow-hidden"
                side="right"
            >
                {/* Header — sticky */}
                <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-4 sm:px-6 pt-5 pb-3">
                    <SheetHeader>
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 shrink-0">
                                <Users className="h-5 w-5" />
                            </div>
                            <div className="min-w-0">
                                <SheetTitle className="text-lg sm:text-xl font-semibold tracking-tight">
                                    Bulk Dorm Check-In
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    Step {step} of 4 · {selectedUnitIds.length} bed{selectedUnitIds.length === 1 ? '' : 's'} selected
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>

                    {/* Step progress */}
                    <div className="mt-3 flex gap-1.5">
                        {([1, 2, 3, 4] as Step[]).map(s => (
                            <div
                                key={s}
                                className={`h-1.5 flex-1 rounded-full transition-colors ${
                                    s < step
                                        ? 'bg-emerald-500'
                                        : s === step
                                            ? 'bg-violet-500'
                                            : 'bg-slate-200'
                                }`}
                            />
                        ))}
                    </div>
                </div>

                {/* Body — scrollable */}
                <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 pb-32">
                    {step === 1 && (
                        <Step1PickBeds
                            availableDorms={availableDorms}
                            selectedUnitIds={selectedUnitIds}
                            toggleBed={toggleBed}
                            autoPickN={autoPickN}
                            setAutoPickN={setAutoPickN}
                            autoPick={autoPick}
                            clearAll={clearAll}
                            selectedTotal={selectedTotal}
                        />
                    )}

                    {step === 2 && (
                        <Step2GuestDetails
                            guests={guests}
                            setGuests={setGuests}
                            unitsById={unitsById}
                            lookingUpIdx={lookingUpIdx}
                            onPhoneBlur={handlePhoneLookup}
                            applyAadharMerge={applyAadharMerge}
                            dismissMerge={dismissMerge}
                        />
                    )}

                    {step === 3 && (
                        <Step3AadharCapture
                            guests={guests}
                            setGuests={setGuests}
                            unitsById={unitsById}
                            currentIndex={aadharStepIndex}
                            setCurrentIndex={setAadharStepIndex}
                        />
                    )}

                    {step === 4 && (
                        <Step4Payment
                            selectedUnits={selectedUnits}
                            numberOfDays={numberOfDays}
                            setNumberOfDays={setNumberOfDays}
                            grandTotal={grandTotal}
                            amountCash={amountCash}
                            setAmountCash={setAmountCash}
                            amountDigital={amountDigital}
                            setAmountDigital={setAmountDigital}
                            payLater={payLater}
                            setPayLater={setPayLater}
                            totalPaid={totalPaid}
                            paymentMatches={paymentMatches}
                        />
                    )}
                </div>

                {/* Sticky action bar */}
                <div className="sticky bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur-xl border-t border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={goBack}
                        disabled={step === 1 || isSubmitting}
                        className="h-11 px-4"
                    >
                        <ArrowLeft className="h-4 w-4 mr-1" />
                        Back
                    </Button>

                    <div className="flex-1 text-right">
                        {step === 1 && (
                            <p className="text-xs text-slate-500">
                                {selectedUnitIds.length} selected · ₹{selectedTotal.toLocaleString('en-IN')}/night
                            </p>
                        )}
                        {step === 4 && (
                            <p className="text-xs font-bold text-slate-700">
                                Total: ₹{grandTotal.toLocaleString('en-IN')}
                            </p>
                        )}
                    </div>

                    {step < 4 ? (
                        <Button
                            type="button"
                            onClick={goNext}
                            disabled={
                                (step === 1 && !step1Valid)
                                || (step === 2 && !step2Valid)
                                || (step === 3 && !step3Valid)
                            }
                            className="h-11 px-5 bg-violet-600 hover:bg-violet-700 text-white"
                        >
                            Next
                            <ArrowRight className="h-4 w-4 ml-1" />
                        </Button>
                    ) : (
                        <Button
                            type="button"
                            onClick={handleSubmit}
                            disabled={isSubmitting || !paymentMatches}
                            className="h-11 px-5 bg-emerald-600 hover:bg-emerald-700 text-white"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                    Processing...
                                </>
                            ) : (
                                <>
                                    <Check className="h-4 w-4 mr-1" />
                                    Check In {selectedUnitIds.length}
                                </>
                            )}
                        </Button>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}

// ============================================================
// Step 1 — Pick beds
// ============================================================

interface Step1Props {
    availableDorms: UnitWithBooking[]
    selectedUnitIds: string[]
    toggleBed: (id: string) => void
    autoPickN: string
    setAutoPickN: (v: string) => void
    autoPick: () => void
    clearAll: () => void
    selectedTotal: number
}

function Step1PickBeds({
    availableDorms,
    selectedUnitIds,
    toggleBed,
    autoPickN,
    setAutoPickN,
    autoPick,
    clearAll,
    selectedTotal,
}: Step1Props) {
    if (availableDorms.length === 0) {
        return (
            <div className="text-center py-16">
                <BedSingle className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm font-medium text-slate-600">No dorm beds are available right now.</p>
                <p className="text-xs text-slate-400 mt-1">All beds are occupied, dirty, or in maintenance.</p>
            </div>
        )
    }

    return (
        <div className="space-y-4">
            {/* Counter + controls */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/60 px-4 py-3">
                <div className="flex items-center justify-between gap-2">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-violet-500">Selected</p>
                        <p className="text-xl font-bold text-violet-900 leading-tight">
                            {selectedUnitIds.length} bed{selectedUnitIds.length === 1 ? '' : 's'}
                        </p>
                        <p className="text-xs text-violet-700 mt-0.5">
                            ₹{selectedTotal.toLocaleString('en-IN')} per night
                        </p>
                    </div>
                    {selectedUnitIds.length > 0 && (
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={clearAll}
                            className="h-9 text-xs text-violet-600 hover:bg-violet-100"
                        >
                            <Trash2 className="h-3.5 w-3.5 mr-1" />
                            Clear all
                        </Button>
                    )}
                </div>
            </div>

            {/* Auto-pick */}
            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
                <Label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <Wand2 className="h-3.5 w-3.5 text-amber-500" />
                    Auto-pick cheapest beds
                </Label>
                <div className="mt-2 flex items-center gap-2">
                    <Input
                        type="number"
                        inputMode="numeric"
                        placeholder="e.g. 15"
                        value={autoPickN}
                        onChange={(e) => setAutoPickN(e.target.value.replace(/\D/g, ''))}
                        className="h-11 text-sm flex-1 max-w-[120px]"
                        min={1}
                        max={availableDorms.length}
                    />
                    <Button
                        type="button"
                        onClick={autoPick}
                        disabled={!autoPickN}
                        className="h-11 px-4 bg-amber-500 hover:bg-amber-600 text-white"
                    >
                        <Check className="h-4 w-4" />
                    </Button>
                    <p className="text-[10px] text-slate-400 ml-1">
                        of {availableDorms.length}
                    </p>
                </div>
            </div>

            {/* Bed grid — 4 cols mobile, 6 tablet, 8 desktop */}
            <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Available beds
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-7 gap-2">
                    {availableDorms.map(unit => {
                        const isSelected = selectedUnitIds.includes(unit.id)
                        const lower = isLowerBed(unit)
                        return (
                            <button
                                key={unit.id}
                                type="button"
                                onClick={() => toggleBed(unit.id)}
                                className={`relative flex flex-col items-center justify-center gap-0.5 h-16 rounded-xl border-2 transition-all active:scale-95 ${
                                    isSelected
                                        ? 'border-violet-500 bg-violet-100 shadow-md shadow-violet-200/50'
                                        : lower
                                            ? 'border-emerald-200 bg-emerald-50/40 hover:border-emerald-400'
                                            : 'border-blue-200 bg-blue-50/40 hover:border-blue-400'
                                }`}
                            >
                                <span className="text-sm font-bold text-slate-800">{unit.unit_number}</span>
                                <span className={`text-[9px] font-semibold uppercase tracking-wide ${
                                    lower ? 'text-emerald-600' : 'text-blue-600'
                                }`}>
                                    {bedLabel(unit)} · ₹{Number(unit.base_price)}
                                </span>
                                {isSelected && (
                                    <div className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-sm">
                                        <Check className="h-3 w-3" />
                                    </div>
                                )}
                            </button>
                        )
                    })}
                </div>

                {/* Legend */}
                <div className="mt-3 flex items-center gap-3 text-[10px] text-slate-500">
                    <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
                        Lower bed
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="inline-block h-2 w-2 rounded-full bg-blue-400" />
                        Upper bed
                    </span>
                </div>
            </div>
        </div>
    )
}

// ============================================================
// Step 2 — Guest name + phone per bed
// ============================================================

interface Step2Props {
    guests: GuestRow[]
    setGuests: React.Dispatch<React.SetStateAction<GuestRow[]>>
    unitsById: Map<string, UnitWithBooking>
    lookingUpIdx: number | null
    onPhoneBlur: (idx: number) => void
    applyAadharMerge: (idx: number) => void
    dismissMerge: (idx: number) => void
}

function Step2GuestDetails({
    guests,
    setGuests,
    unitsById,
    lookingUpIdx,
    onPhoneBlur,
    applyAadharMerge,
    dismissMerge,
}: Step2Props) {
    const updateGuest = (idx: number, field: keyof GuestRow, value: string) => {
        setGuests(prev => prev.map((g, i) => i === idx ? { ...g, [field]: value } : g))
    }

    return (
        <div className="space-y-3">
            <p className="text-xs text-slate-500">
                Enter each guest&apos;s name and phone. We&apos;ll auto-fill Aadhar if they&apos;ve stayed with us before.
            </p>

            {guests.map((g, idx) => {
                const unit = unitsById.get(g.unitId)
                if (!unit) return null
                const lower = isLowerBed(unit)
                return (
                    <div
                        key={g.unitId}
                        className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 sm:p-4 space-y-2.5"
                    >
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-bold text-slate-600">
                                Guest {idx + 1}
                            </p>
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                                lower ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                            }`}>
                                {unit.unit_number} · {bedLabel(unit)}
                            </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-600">Full Name *</Label>
                                <Input
                                    placeholder="e.g. Rahul Kumar"
                                    value={g.name}
                                    onChange={(e) => updateGuest(idx, 'name', e.target.value)}
                                    className="h-11 text-sm bg-white"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-xs text-slate-600">Phone *</Label>
                                <div className="relative">
                                    <Input
                                        placeholder="10-digit phone"
                                        inputMode="numeric"
                                        maxLength={10}
                                        value={g.phone}
                                        onChange={(e) => updateGuest(idx, 'phone', e.target.value.replace(/\D/g, ''))}
                                        onBlur={() => onPhoneBlur(idx)}
                                        className="h-11 text-sm bg-white"
                                    />
                                    {lookingUpIdx === idx && (
                                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                            <UserSearch className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Returning guest banner */}
                        {g.aadharMatch && (
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5">
                                <p className="text-xs font-semibold text-blue-700 mb-1">
                                    Returning guest — Aadhar on file
                                </p>
                                <p className="text-[10px] text-blue-600 mb-2">
                                    {g.aadharMatch.name} ({g.aadharMatch.phone})
                                </p>
                                <div className="flex gap-2">
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => applyAadharMerge(idx)}
                                        className="h-8 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
                                    >
                                        <CheckCircle2 className="h-3 w-3 mr-1" />
                                        Use Previous Aadhar
                                    </Button>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => dismissMerge(idx)}
                                        className="h-8 text-[11px] text-blue-600"
                                    >
                                        New Photo
                                    </Button>
                                </div>
                            </div>
                        )}

                        {g.aadharUrl && g.aadharFromMerge && (
                            <p className="text-[10px] text-emerald-600 font-medium">
                                Aadhar pre-filled from previous stay
                            </p>
                        )}
                    </div>
                )
            })}
        </div>
    )
}

// ============================================================
// Step 3 — Aadhar capture sequential
// ============================================================

interface Step3Props {
    guests: GuestRow[]
    setGuests: React.Dispatch<React.SetStateAction<GuestRow[]>>
    unitsById: Map<string, UnitWithBooking>
    currentIndex: number
    setCurrentIndex: (n: number) => void
}

function Step3AadharCapture({
    guests,
    setGuests,
    unitsById,
    currentIndex,
    setCurrentIndex,
}: Step3Props) {
    const current = guests[currentIndex]
    const unit = current ? unitsById.get(current.unitId) : undefined

    if (!current || !unit) {
        return (
            <div className="text-center py-10 text-slate-400">
                No guests to capture
            </div>
        )
    }

    const setAadhar = (storagePath: string) => {
        setGuests(prev => prev.map((g, i) => i === currentIndex
            ? { ...g, aadharUrl: storagePath, aadharFromMerge: false }
            : g))
    }

    const clearAadhar = () => {
        setGuests(prev => prev.map((g, i) => i === currentIndex
            ? { ...g, aadharUrl: undefined, aadharPublicUrl: undefined, aadharFromMerge: false }
            : g))
    }

    const toggleBypass = () => {
        setGuests(prev => prev.map((g, i) => i === currentIndex
            ? { ...g, bypassEnabled: !g.bypassEnabled }
            : g))
    }

    const setBypassReason = (reason: string) => {
        setGuests(prev => prev.map((g, i) => i === currentIndex
            ? { ...g, bypassReason: reason }
            : g))
    }

    const guestDone = (g: GuestRow) =>
        g.bypassEnabled ? (g.bypassReason || '').trim().length >= 3 : !!g.aadharUrl

    const doneCount = guests.filter(guestDone).length

    return (
        <div className="space-y-4">
            {/* Progress */}
            <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-slate-700">
                        Guest {currentIndex + 1} of {guests.length}
                    </p>
                    <p className="text-xs text-slate-500">
                        {doneCount}/{guests.length} done
                    </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                    {guests.map((g, i) => {
                        const u = unitsById.get(g.unitId)
                        const done = guestDone(g)
                        const isActive = i === currentIndex
                        return (
                            <button
                                key={g.unitId}
                                type="button"
                                onClick={() => setCurrentIndex(i)}
                                className={`px-2 py-1 rounded-md text-[10px] font-bold transition-colors min-h-[28px] ${
                                    isActive
                                        ? 'bg-violet-600 text-white'
                                        : done
                                            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {u?.unit_number || `G${i + 1}`}
                                {done && !isActive && <Check className="h-2.5 w-2.5 inline ml-0.5" />}
                            </button>
                        )
                    })}
                </div>
            </div>

            {/* Current guest card */}
            <div className="rounded-xl border border-violet-200 bg-violet-50/40 p-4 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs font-bold text-violet-700 uppercase tracking-wide">
                            Capturing — {unit.unit_number}
                        </p>
                        <p className="text-base font-semibold text-slate-900 mt-0.5">{current.name}</p>
                        <p className="text-xs text-slate-500">{current.phone}</p>
                    </div>
                </div>

                {!current.bypassEnabled && (
                    <AadharCapture
                        roomNumber={unit.unit_number}
                        guestName={current.name}
                        guestPhone={current.phone}
                        guestLabel={`Guest${currentIndex + 1}of${guests.length}`}
                        value={current.aadharUrl}
                        valuePublicUrl={current.aadharPublicUrl}
                        onChange={setAadhar}
                        onClear={clearAadhar}
                    />
                )}

                {/* Bypass toggle + reason */}
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
                    <label className="flex items-center justify-between cursor-pointer">
                        <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                            <ShieldAlert className="h-3.5 w-3.5" />
                            Emergency bypass for this guest
                        </span>
                        <button
                            type="button"
                            onClick={toggleBypass}
                            className={`relative w-10 h-5 rounded-full transition-colors ${
                                current.bypassEnabled ? 'bg-amber-500' : 'bg-slate-300'
                            }`}
                        >
                            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
                                current.bypassEnabled ? 'translate-x-5' : 'translate-x-0.5'
                            }`} />
                        </button>
                    </label>
                    {current.bypassEnabled && (
                        <>
                            <Label className="text-[10px] text-amber-700">
                                Reason (logged on booking — min 3 characters) *
                            </Label>
                            <Input
                                value={current.bypassReason || ''}
                                onChange={(e) => setBypassReason(e.target.value)}
                                placeholder="e.g. ID lost, will provide tomorrow"
                                className="h-11 text-sm bg-white"
                            />
                        </>
                    )}
                </div>

                {/* Navigation buttons */}
                <div className="flex gap-2 pt-1">
                    <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
                        disabled={currentIndex === 0}
                        className="flex-1 h-11"
                    >
                        <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                        Previous Guest
                    </Button>
                    <Button
                        type="button"
                        size="sm"
                        onClick={() => setCurrentIndex(Math.min(guests.length - 1, currentIndex + 1))}
                        disabled={currentIndex >= guests.length - 1 || !guestDone(current)}
                        className="flex-1 h-11 bg-violet-600 hover:bg-violet-700 text-white"
                    >
                        Next Guest
                        <ArrowRight className="h-3.5 w-3.5 ml-1" />
                    </Button>
                </div>
            </div>
        </div>
    )
}

// ============================================================
// Step 4 — Pricing + payment
// ============================================================

interface Step4Props {
    selectedUnits: UnitWithBooking[]
    numberOfDays: number
    setNumberOfDays: (n: number) => void
    grandTotal: number
    amountCash: string
    setAmountCash: (v: string) => void
    amountDigital: string
    setAmountDigital: (v: string) => void
    payLater: boolean
    setPayLater: (v: boolean) => void
    totalPaid: number
    paymentMatches: boolean
}

function Step4Payment({
    selectedUnits,
    numberOfDays,
    setNumberOfDays,
    grandTotal,
    amountCash,
    setAmountCash,
    amountDigital,
    setAmountDigital,
    payLater,
    setPayLater,
    totalPaid,
    paymentMatches,
}: Step4Props) {
    const remaining = grandTotal - totalPaid
    const overpaid = totalPaid > grandTotal + 0.01

    return (
        <div className="space-y-4">
            {/* Days */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold text-slate-700">Number of nights</Label>
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setNumberOfDays(Math.max(1, numberOfDays - 1))}
                            disabled={numberOfDays <= 1}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                        >
                            <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="flex h-8 w-12 items-center justify-center rounded-lg bg-violet-600 text-white text-sm font-bold">
                            {numberOfDays}
                        </span>
                        <button
                            type="button"
                            onClick={() => setNumberOfDays(Math.min(30, numberOfDays + 1))}
                            disabled={numberOfDays >= 30}
                            className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Pricing line items */}
            <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2.5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Pricing</p>
                <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    {selectedUnits.map(unit => {
                        const perDay = Number(unit.base_price)
                        const total = perDay * numberOfDays
                        return (
                            <div key={unit.id} className="flex justify-between items-center text-xs">
                                <span className="text-slate-600">
                                    {unit.unit_number} ({bedLabel(unit)}) — ₹{perDay}{numberOfDays > 1 ? ` × ${numberOfDays}` : ''}
                                </span>
                                <span className="font-semibold text-slate-800">
                                    ₹{total.toLocaleString('en-IN')}
                                </span>
                            </div>
                        )
                    })}
                </div>
                <div className="border-t border-slate-200 pt-2 flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-900">Grand Total</span>
                    <span className="text-lg font-bold text-emerald-600">
                        ₹{grandTotal.toLocaleString('en-IN')}
                    </span>
                </div>
            </div>

            {/* Pay Later toggle */}
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-amber-800">Pay Later / Credit</p>
                    <p className="text-[10px] text-amber-600 mt-0.5">Guest will pay at checkout</p>
                </div>
                <button
                    type="button"
                    onClick={() => setPayLater(!payLater)}
                    className={`relative w-12 h-6 rounded-full transition-colors ${payLater ? 'bg-amber-500' : 'bg-slate-300'}`}
                >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${payLater ? 'translate-x-6' : 'translate-x-0.5'}`} />
                </button>
            </div>

            {/* Payment input */}
            {!payLater && (
                <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Payment</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="space-y-1">
                            <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                                <Banknote className="h-3.5 w-3.5 text-emerald-600" />
                                Cash
                            </Label>
                            <Input
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                value={amountCash}
                                onChange={(e) => setAmountCash(e.target.value)}
                                className="h-11 text-sm bg-emerald-50/50 border-emerald-200"
                            />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                                <Smartphone className="h-3.5 w-3.5 text-blue-600" />
                                Digital
                            </Label>
                            <Input
                                type="number"
                                inputMode="decimal"
                                placeholder="0"
                                value={amountDigital}
                                onChange={(e) => setAmountDigital(e.target.value)}
                                className="h-11 text-sm bg-blue-50/50 border-blue-200"
                            />
                        </div>
                    </div>
                    <div className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-medium ${
                        paymentMatches
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : overpaid
                                ? 'bg-red-50 text-red-700 border border-red-200'
                                : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}>
                        <span className="flex items-center gap-1.5">
                            {paymentMatches ? <Check className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                            {paymentMatches
                                ? 'Payment matches'
                                : overpaid
                                    ? `Overpaid by ₹${(totalPaid - grandTotal).toLocaleString('en-IN')}`
                                    : `₹${Math.abs(remaining).toLocaleString('en-IN')} remaining`}
                        </span>
                        <span className="font-bold flex items-center gap-0.5">
                            <IndianRupee className="h-3 w-3" />
                            {totalPaid.toLocaleString('en-IN')} / {grandTotal.toLocaleString('en-IN')}
                        </span>
                    </div>
                </div>
            )}
        </div>
    )
}
