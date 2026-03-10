'use client'

import { useState, useMemo, useEffect } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import type { GuestInput } from '@/lib/types'
import { calculateBookingPrice } from '@/lib/pricing'
import { useCurrentTime } from '@/lib/hooks/use-current-time'
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
import { supabase } from '@/lib/supabase/client'
import {
    Plus,
    Minus,
    Trash2,
    UserPlus,
    IndianRupee,
    Clock,
    BedDouble,
    BedSingle,
    Users,
    Camera,
    UploadCloud,
    CheckCircle2,
    Banknote,
    Smartphone,
    Check,
    AlertCircle,
    CalendarClock,
    Sun,
    Moon,
} from 'lucide-react'

interface CheckInSheetProps {
    unit: UnitWithBooking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

const emptyGuest = (): GuestInput => ({
    name: '',
    phone: '',
    aadhar_number: '',
    aadhar_url: '',
})

function getDormBedLabel(unitNumber: string): string {
    const match = unitNumber.match(/A(\d+)/)
    if (!match) return 'Dorm Bed'
    return parseInt(match[1]) <= 13 ? 'Lower Bed' : 'Upper Bed'
}

function formatDateTime(d: Date): string {
    return d.toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
}

export function CheckInSheet({
    unit,
    open,
    onOpenChange,
    onSuccess,
}: CheckInSheetProps) {
    const [guests, setGuests] = useState<GuestInput[]>([emptyGuest()])
    const [numberOfDays, setNumberOfDays] = useState(1)
    const [manualCheckout, setManualCheckout] = useState('')
    const [grandTotalOverride, setGrandTotalOverride] = useState<string>('')
    const [amountCash, setAmountCash] = useState('')
    const [amountDigital, setAmountDigital] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
    const [payLater, setPayLater] = useState(false)
    const [conflictError, setConflictError] = useState<string | null>(null)
    const [isBypass, setIsBypass] = useState(false)
    const [bypassTimer, setBypassTimer] = useState(0)

    // Countdown timer for emergency bypass
    useEffect(() => {
        let interval: NodeJS.Timeout
        if (isBypass && bypassTimer > 0) {
            interval = setInterval(() => {
                setBypassTimer((prev) => prev - 1)
            }, 1000)
        }
        return () => clearInterval(interval)
    }, [isBypass, bypassTimer])

    const toggleBypass = () => {
        if (!isBypass) {
            setIsBypass(true)
            setBypassTimer(5)
            toast.warning('Emergency Bypass activated: Financial verification disabled for room shifts.')
        } else {
            setIsBypass(false)
            setBypassTimer(0)
        }
    }

    const now = useCurrentTime()

    // Calculate check-in/check-out dates
    const checkInDate = useMemo(() => now, [now, open]) // Uses dev time in dev mode
    const checkOutDate = useMemo(() => {
        if (manualCheckout) {
            const d = new Date(manualCheckout)
            if (!isNaN(d.getTime()) && d > checkInDate) return d
        }
        if (!unit) return new Date()
        const isDorm = unit.type === 'DORM'
        const d = new Date(checkInDate)
        if (isDorm) {
            d.setDate(d.getDate() + numberOfDays)
            d.setHours(10, 0, 0, 0)
        } else {
            if (checkInDate.getHours() < 12) {
                d.setDate(d.getDate() + (numberOfDays - 1))
            } else {
                d.setDate(d.getDate() + numberOfDays)
            }
            d.setHours(11, 0, 0, 0)
        }
        return d
    }, [checkInDate, numberOfDays, manualCheckout, unit])

    // Calculate pricing — multi-day: base price × days for both rooms and dorms
    const pricing = useMemo(() => {
        if (!unit) return null
        const basePrice = Number(unit.base_price)
        const perDayBase = basePrice * numberOfDays
        const result = calculateBookingPrice(
            unit.type,
            perDayBase,
            guests.length
        )
        return result
    }, [unit, guests.length, numberOfDays])

    const finalTotal = useMemo(() => {
        if (!pricing) return 0
        if (grandTotalOverride && !isNaN(Number(grandTotalOverride))) {
            return Number(grandTotalOverride)
        }
        return pricing.grandTotal
    }, [pricing, grandTotalOverride])

    // Payment validation
    const cashNum = Number(amountCash) || 0
    const digitalNum = Number(amountDigital) || 0
    const totalPaid = cashNum + digitalNum
    const difference = finalTotal - totalPaid
    const isExactMatch = Math.abs(difference) < 0.01
    const isOverpaid = totalPaid > finalTotal + 0.01

    if (!unit) return null

    const isDorm = unit.type === 'DORM'
    const dormLabel = isDorm ? getDormBedLabel(unit.unit_number) : null

    const addGuest = () => {
        setGuests((prev) => [...prev, emptyGuest()])
    }

    const removeGuest = (index: number) => {
        if (guests.length <= 1) return
        setGuests((prev) => prev.filter((_, i) => i !== index))
    }

    const updateGuest = (
        index: number,
        field: keyof GuestInput,
        value: string
    ) => {
        setGuests((prev) =>
            prev.map((g, i) => (i === index ? { ...g, [field]: value } : g))
        )
    }

    const handleAadharUpload = async (
        index: number,
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0]
        if (!file || !unit) return

        setUploadingIndex(index)
        try {
            const fileExt = file.name.split('.').pop() || 'jpg'
            const fileName = `aadhar-${unit.id}-${index}-${Date.now()}.${fileExt}`

            const { error: uploadError } = await supabase.storage
                .from('aadhars')
                .upload(fileName, file)

            if (uploadError) throw uploadError

            const {
                data: { publicUrl },
            } = supabase.storage.from('aadhars').getPublicUrl(fileName)

            updateGuest(index, 'aadhar_url', publicUrl)
            toast.success(`Aadhar photo uploaded for Guest ${index + 1}`)
        } catch (err) {
            console.error('Upload error:', err)
            toast.error('Failed to upload Aadhar photo')
        } finally {
            setUploadingIndex(null)
        }
    }

    const validateGuests = (isBypassEnabled: boolean): boolean => {
        if (isBypassEnabled) return true // Skip validation entirely if bypass is on

        for (let i = 0; i < guests.length; i++) {
            if (!guests[i].name.trim()) {
                toast.error(`Guest ${i + 1}: Name is required`)
                return false
            }
            const phoneDigits = guests[i].phone.replace(/\D/g, '')
            if (phoneDigits.length !== 10) {
                toast.error(`Guest ${i + 1}: Phone number must be exactly 10 digits`)
                return false
            }
            if (!guests[i].aadhar_url) {
                toast.error(`Guest ${i + 1}: Aadhar photo is mandatory`)
                return false
            }
        }
        return true
    }

    const handleSubmit = async (overrideConflict = false) => {
        const isBypassEnabled = typeof window !== 'undefined' && localStorage.getItem('fajo_bypass_credentials') === 'true'

        if (!validateGuests(isBypassEnabled)) return

        if (!payLater && !isBypass && !isExactMatch) {
            toast.error(
                `Payment must equal ₹${finalTotal.toLocaleString('en-IN')}. Currently ₹${totalPaid.toLocaleString('en-IN')}`
            )
            return
        }

        setIsSubmitting(true)
        setConflictError(null)

        try {
            const res = await fetch('/api/bookings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitId: unit.id,
                    guests: guests.map((g, i) => ({
                        name: g.name.trim() || (isBypassEnabled ? `Dev Guest ${i + 1}` : ''),
                        phone: g.phone.trim() || (isBypassEnabled ? '0000000000' : ''),
                        aadhar_number: g.aadhar_number.trim() || null,
                        aadhar_url: g.aadhar_url || (isBypassEnabled ? 'https://ui-avatars.com/api/?name=Dev+Guest' : null),
                    })),
                    numberOfDays,
                    checkOutOverride: manualCheckout || null,
                    grandTotalOverride:
                        grandTotalOverride && !isNaN(Number(grandTotalOverride))
                            ? Number(grandTotalOverride)
                            : null,
                    amountCash: (payLater || isBypass) ? 0 : cashNum,
                    amountDigital: (payLater || isBypass) ? 0 : digitalNum,
                    payLater: (payLater || isBypass) ? true : undefined,
                    bypassConflict: overrideConflict || undefined,
                    isBypass,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                if (res.status === 409) {
                    setConflictError(data.error || 'Booking conflict detected')
                }
                toast.error(data.error || 'Check-in failed')
                return
            }

            const payMsg = (payLater || isBypass) ? '(Pay Later / Bypassed)' : `₹${finalTotal.toLocaleString('en-IN')} collected`
            toast.success(
                `Checked in to ${unit.unit_number} for ${numberOfDays} day${numberOfDays > 1 ? 's' : ''} — ${payMsg}`
            )

            resetForm()
            onSuccess()
        } catch (err) {
            toast.error('Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetForm = () => {
        setGuests([emptyGuest()])
        setNumberOfDays(1)
        setManualCheckout('')
        setGrandTotalOverride('')
        setAmountCash('')
        setAmountDigital('')
        setPayLater(false)
        setIsBypass(false)
        setBypassTimer(0)
        setConflictError(null)
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) resetForm()
        onOpenChange(openState)
    }

    return (
        <Sheet open={open} onOpenChange={resetAndClose}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-lg border-l border-slate-200/80 shadow-2xl overflow-y-auto p-0">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader className="space-y-1">
                        <div className="flex items-center gap-3">
                            {isDorm ? (
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
                                    <BedSingle className="h-5 w-5" />
                                </div>
                            ) : (
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                                    <BedDouble className="h-5 w-5" />
                                </div>
                            )}
                            <div>
                                <SheetTitle className="text-xl font-semibold tracking-tight">
                                    Check-In · {unit.unit_number}
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    {isDorm
                                        ? `${dormLabel} · 2:00 PM in / 10:00 AM out`
                                        : 'Private Room · 12 PM in / 11 AM out'}
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Stay Duration */}
                    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-blue-50/50 to-white p-4 space-y-4">
                        <div className="flex items-center gap-2">
                            <CalendarClock className="h-4 w-4 text-blue-500" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Stay Duration
                            </p>
                        </div>

                        {/* Number of Days Stepper */}
                        <div className="flex items-center justify-between">
                            <Label className="text-sm text-slate-700 font-medium">
                                Number of Days
                            </Label>
                            <div className="flex items-center gap-1.5">
                                <button
                                    type="button"
                                    onClick={() => setNumberOfDays((n) => Math.max(1, n - 1))}
                                    disabled={numberOfDays <= 1}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="flex h-8 w-12 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
                                    {numberOfDays}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setNumberOfDays((n) => n + 1)}
                                    className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Calculated Dates */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="rounded-lg bg-green-50 border border-green-200 p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <Sun className="h-3 w-3 text-green-500" />
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-green-500">
                                        Check-In
                                    </p>
                                </div>
                                <p className="text-xs font-semibold text-green-800">
                                    {formatDateTime(checkInDate)}
                                </p>
                            </div>
                            <div className="rounded-lg bg-orange-50 border border-orange-200 p-3">
                                <div className="flex items-center gap-1 mb-1">
                                    <Moon className="h-3 w-3 text-orange-500" />
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-orange-500">
                                        Check-Out
                                    </p>
                                </div>
                                <p className="text-xs font-semibold text-orange-800">
                                    {formatDateTime(checkOutDate)}
                                </p>
                            </div>
                        </div>

                        {/* Manual checkout override */}
                        <div className="space-y-1.5">
                            <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                                <Clock className="h-3 w-3" />
                                Override Check-Out (optional)
                            </Label>
                            <Input
                                type="datetime-local"
                                value={manualCheckout}
                                onChange={(e) => setManualCheckout(e.target.value)}
                                className="h-9 text-sm bg-white"
                            />
                        </div>
                    </div>

                    {/* Guest List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-500" />
                                <Label className="text-sm font-semibold text-slate-700">
                                    Guests ({guests.length})
                                </Label>
                            </div>
                            {!isDorm && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addGuest}
                                    className="h-8 text-xs gap-1.5 border-dashed"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add Guest
                                </Button>
                            )}
                        </div>

                        {guests.map((guest, index) => (
                            <div
                                key={index}
                                className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3 transition-all"
                            >
                                {guests.length > 1 && (
                                    <button
                                        onClick={() => removeGuest(index)}
                                        className="absolute top-3 right-3 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                )}

                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Guest {index + 1}
                                </p>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Full Name *</Label>
                                    <Input
                                        placeholder="John Doe"
                                        value={guest.name}
                                        onChange={(e) => updateGuest(index, 'name', e.target.value)}
                                        className="h-9 text-sm bg-white"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Phone *</Label>
                                    <Input
                                        placeholder="+91 98765 43210"
                                        value={guest.phone}
                                        onChange={(e) => updateGuest(index, 'phone', e.target.value)}
                                        className="h-9 text-sm bg-white"
                                    />
                                </div>

                                {/* Aadhar Photo Upload */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Aadhar Photo *</Label>
                                    {guest.aadhar_url ? (
                                        <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                            <img
                                                src={guest.aadhar_url}
                                                alt={`Aadhar - Guest ${index + 1}`}
                                                className="w-full h-28 object-cover"
                                            />
                                            <div className="absolute top-2 right-2 flex items-center gap-1 bg-emerald-600 text-white text-[9px] font-bold px-2 py-0.5 rounded-full">
                                                <CheckCircle2 className="h-3 w-3" />
                                                Uploaded
                                            </div>
                                            <label className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-xs py-1.5 cursor-pointer hover:bg-black/60 transition-colors">
                                                Replace Photo
                                                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleAadharUpload(index, e)} />
                                            </label>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-2 gap-2">
                                            <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                                <Camera className="h-5 w-5 text-slate-400" />
                                                <span className="text-[10px] font-semibold text-slate-500">
                                                    {uploadingIndex === index ? 'Uploading...' : 'Take Photo'}
                                                </span>
                                                <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploadingIndex !== null} onChange={(e) => handleAadharUpload(index, e)} />
                                            </label>
                                            <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-slate-300 px-3 py-4 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                                <UploadCloud className="h-5 w-5 text-slate-400" />
                                                <span className="text-[10px] font-semibold text-slate-500">
                                                    {uploadingIndex === index ? 'Uploading...' : 'Upload File'}
                                                </span>
                                                <input type="file" accept="image/*" className="sr-only" disabled={uploadingIndex !== null} onChange={(e) => handleAadharUpload(index, e)} />
                                            </label>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pricing Breakdown */}
                    {pricing && (
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Pricing Breakdown
                            </p>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>
                                        Base Rate {numberOfDays > 1 ? `(₹${Number(unit.base_price).toLocaleString('en-IN')} × ${numberOfDays} days)` : ''}
                                    </span>
                                    <span>₹{pricing.baseAmount.toLocaleString('en-IN')}</span>
                                </div>

                                {pricing.extraHeads > 0 && (
                                    <div className="flex justify-between text-amber-600 font-medium">
                                        <span>Extra Head Surcharge (×{pricing.extraHeads})</span>
                                        <span>+₹{pricing.surcharge.toLocaleString('en-IN')}</span>
                                    </div>
                                )}

                                <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                                    <span>Grand Total</span>
                                    <span className="text-emerald-600">₹{finalTotal.toLocaleString('en-IN')}</span>
                                </div>
                            </div>

                            <div className="pt-2 border-t border-dashed border-slate-200 space-y-1.5">
                                <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                                    <IndianRupee className="h-3 w-3" />
                                    Override Grand Total (optional)
                                </Label>
                                <Input
                                    type="number"
                                    placeholder={String(pricing.grandTotal)}
                                    value={grandTotalOverride}
                                    onChange={(e) => setGrandTotalOverride(e.target.value)}
                                    className="h-9 text-sm bg-white"
                                />
                            </div>
                        </div>
                    )}

                    {/* Pay Later Toggle */}
                    <div className="rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 flex items-center justify-between">
                        <div>
                            <p className="text-sm font-semibold text-amber-800">Pay Later / Credit</p>
                            <p className="text-[10px] text-amber-600">Skip payment — guest pays at checkout</p>
                        </div>
                        <button
                            type="button"
                            onClick={() => setPayLater(!payLater)}
                            className={`relative w-12 h-6 rounded-full transition-colors ${payLater ? 'bg-amber-500' : 'bg-slate-300'}`}
                        >
                            <span className={`block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${payLater ? 'translate-x-6' : 'translate-x-0.5'}`} />
                        </button>
                    </div>

                    {/* Conflict Error + Override */}
                    {conflictError && (
                        <div className="rounded-xl border border-red-200 bg-red-50 p-4 space-y-2">
                            <p className="text-xs text-red-700 font-medium">{conflictError}</p>
                            <button
                                onClick={() => handleSubmit(true)}
                                disabled={isSubmitting}
                                className="w-full py-2 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 transition-colors"
                            >
                                ⚠ Override Conflict & Check In Anyway
                            </button>
                        </div>
                    )}

                    {/* Emergency Bypass */}
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="space-y-0.5">
                            <p className="text-sm font-semibold text-slate-700">Payment Bypass</p>
                            <p className="text-[10px] sm:text-xs text-slate-500 max-w-[200px]">Skip financial verification (For Emergency Room Shifts)</p>
                        </div>
                        <button
                            type="button"
                            onClick={toggleBypass}
                            className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 ${isBypass ? 'bg-red-500' : 'bg-slate-200'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isBypass ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>

                    {/* Split Payment (hidden when payLater or isBypass) */}
                    {(!payLater && !isBypass) && (
                        <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Payment Collection
                            </p>

                            <div className="space-y-3">
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                                        <Banknote className="h-3.5 w-3.5 text-green-600" />
                                        Amount — Cash *
                                    </Label>
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        value={amountCash}
                                        onChange={(e) => setAmountCash(e.target.value)}
                                        className="h-10 text-sm bg-green-50/50 border-green-200 focus-visible:ring-green-500/30"
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                                        <Smartphone className="h-3.5 w-3.5 text-blue-600" />
                                        Amount — Digital (GPay/Card) *
                                    </Label>
                                    <Input
                                        type="number"
                                        placeholder="0"
                                        value={amountDigital}
                                        onChange={(e) => setAmountDigital(e.target.value)}
                                        className="h-10 text-sm bg-blue-50/50 border-blue-200 focus-visible:ring-blue-500/30"
                                    />
                                </div>
                            </div>

                            {/* Live Validation */}
                            <div
                                className={`flex items-center justify-between rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isExactMatch
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                    : isOverpaid
                                        ? 'bg-red-50 text-red-700 border border-red-200'
                                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                                    }`}
                            >
                                <span className="flex items-center gap-1.5">
                                    {isExactMatch ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
                                    {isExactMatch
                                        ? 'Payment matches!'
                                        : isOverpaid
                                            ? 'Overpayment!'
                                            : `₹${Math.abs(difference).toLocaleString('en-IN')} remaining`}
                                </span>
                                <span className="font-bold">
                                    ₹{totalPaid.toLocaleString('en-IN')} / ₹{finalTotal.toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Submit */}
                    <Button
                        onClick={() => handleSubmit()}
                        disabled={isSubmitting || (!payLater && !isBypass && !isExactMatch) || (isBypass && bypassTimer > 0)}
                        className={`w-full h-12 text-sm font-semibold rounded-xl transition-all active:scale-[0.98]
                            ${isBypass 
                                ? 'bg-red-600 hover:bg-red-700 text-white shadow-red-600/20'
                                : ((payLater || isExactMatch)
                                    ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-xl shadow-slate-900/10'
                                    : 'bg-slate-200 text-slate-400 cursor-not-allowed')}
                            `}
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Processing...
                            </span>
                        ) : isBypass && bypassTimer > 0 ? (
                             <span className="flex items-center gap-2 animate-pulse">
                                 <AlertCircle className="h-4 w-4" />
                                 Security Lock: Wait {bypassTimer}s
                             </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <UserPlus className="h-4 w-4" />
                                {isBypass 
                                    ? `Force Emergency Check-In`
                                    : (isExactMatch || payLater
                                       ? `Check-In · ${numberOfDays} Day${numberOfDays > 1 ? 's' : ''} · ₹${finalTotal.toLocaleString('en-IN')}`
                                       : 'Payment must match Grand Total')}
                            </span>
                        )}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
