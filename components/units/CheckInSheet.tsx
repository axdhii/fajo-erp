'use client'

import { useState, useMemo, useEffect } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import type { GuestInput } from '@/lib/types'
import { calculateBookingPrice } from '@/lib/pricing'
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
    CheckCircle2,
    Banknote,
    Smartphone,
    Check,
    AlertCircle,
    CalendarClock,
    Sun,
    Moon,
    Printer,
    UserSearch,
} from 'lucide-react'
import type { AadharMatch } from '@/lib/utils/merge-aadhar'

/** Holds pending front/back blobs before stitching */
interface PendingAadhar {
    front?: Blob
    back?: Blob
}

interface CheckInSheetProps {
    unit: UnitWithBooking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    role?: string
}

const emptyGuest = (): GuestInput => ({
    name: '',
    phone: '',
    aadhar_number: '',
    aadhar_url_front: '',
    aadhar_url_back: '',
})

function getDormBedLabel(unitNumber: string): string {
    const match = unitNumber.match(/A(\d+)/)
    if (!match) return 'Dorm Bed'
    return parseInt(match[1]) <= 13 ? 'Lower Bed' : 'Upper Bed'
}

function formatDateTime(d: Date): string {
    return d.toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
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
    role,
}: CheckInSheetProps) {
    const [guests, setGuests] = useState<GuestInput[]>([emptyGuest()])
    const [numberOfDays, setNumberOfDays] = useState(1)
    const [manualCheckout, setManualCheckout] = useState('')
    const [grandTotalOverride, setGrandTotalOverride] = useState<string>('')
    const [amountCash, setAmountCash] = useState('')
    const [amountDigital, setAmountDigital] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
    const [bypassTimer, setBypassTimer] = useState(0)
    const [payLater, setPayLater] = useState(false)
    const [conflictError, setConflictError] = useState<string | null>(null)
    const [successBookingId, setSuccessBookingId] = useState<string | null>(null)
    const [isBypass, setIsBypass] = useState(false)
    const [aadharBypass, setAadharBypass] = useState(false)
    const [aadharPreviews, setAadharPreviews] = useState<Record<string, string>>({})
    const [aadharMatches, setAadharMatches] = useState<Record<number, AadharMatch>>({})
    const [lookingUp, setLookingUp] = useState<number | null>(null)
    const [pendingAadhar, setPendingAadhar] = useState<Record<number, PendingAadhar>>({})

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

    // Capture check-in time once when sheet opens (not continuously)
    const [checkInDate, setCheckInDate] = useState<Date>(new Date())

    useEffect(() => {
        if (open) {
            setCheckInDate(new Date())
        }
    }, [open])
    const checkOutDate = useMemo(() => {
        if (manualCheckout) {
            const d = new Date(manualCheckout)
            if (!isNaN(d.getTime()) && d > checkInDate) return d
        }
        if (!unit) return new Date()
        const isDorm = unit.type === 'DORM'
        const d = new Date(checkInDate)
        d.setDate(d.getDate() + numberOfDays)
        // Construct checkout time explicitly in IST
        const dateStr = d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
        return new Date(`${dateStr}T${isDorm ? '10' : '11'}:00:00+05:30`)
    }, [checkInDate, numberOfDays, manualCheckout, unit])

    const maxGuests = unit ? (unit.max_guests || 3) : 3

    // Calculate pricing — multi-day: base price × days for both rooms and dorms
    const pricing = useMemo(() => {
        if (!unit) return null
        const basePrice = Number(unit.base_price)
        const perDayBase = basePrice * numberOfDays
        const result = calculateBookingPrice(
            unit.type,
            perDayBase,
            guests.length,
            maxGuests
        )
        return result
    }, [unit, guests.length, numberOfDays, maxGuests])

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

    const handlePhoneLookup = async (index: number, phone: string) => {
        const digits = phone.replace(/\D/g, '')
        if (digits.length !== 10) return
        // Skip if we already have aadhar photos for this guest
        if (guests[index].aadhar_url_front && guests[index].aadhar_url_back) return

        setLookingUp(index)
        try {
            const { lookupAadhar } = await import('@/lib/utils/merge-aadhar')
            const match = await lookupAadhar(digits)
            if (match) {
                setAadharMatches(prev => ({ ...prev, [index]: match }))
            }
        } catch {
            // silent — lookup is best-effort
        } finally {
            setLookingUp(null)
        }
    }

    const applyAadharMerge = async (index: number) => {
        const match = aadharMatches[index]
        if (!match) return

        updateGuest(index, 'aadhar_url_front', match.aadhar_url_front)
        updateGuest(index, 'aadhar_url_back', match.aadhar_url_back)

        // Generate public URL previews for the merged/stitched photos
        try {
            const { getAadharPublicUrl } = await import('@/lib/utils/merge-aadhar')
            if (match.stitched) {
                // Single stitched image — show in stitched preview slot
                setAadharPreviews(prev => ({
                    ...prev,
                    [`${index}_stitched`]: getAadharPublicUrl(match.aadhar_url_front),
                }))
            } else {
                // Legacy separate front/back
                setAadharPreviews(prev => ({
                    ...prev,
                    [`${index}_front`]: getAadharPublicUrl(match.aadhar_url_front),
                    [`${index}_back`]: getAadharPublicUrl(match.aadhar_url_back),
                }))
            }
        } catch {
            // previews are non-critical
        }

        // Clear the match banner
        setAadharMatches(prev => {
            const next = { ...prev }
            delete next[index]
            return next
        })
        toast.success('Aadhar photos linked from previous stay')
    }

    const dismissAadharMatch = (index: number) => {
        setAadharMatches(prev => {
            const next = { ...prev }
            delete next[index]
            return next
        })
    }

    const handleAadharCapture = async (
        index: number,
        side: 'front' | 'back',
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0]
        if (!file || !unit) return

        try {
            // Compress the individual capture
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)

            // Store the compressed blob and show a local preview
            const previewUrl = URL.createObjectURL(compressed)
            setAadharPreviews(prev => ({ ...prev, [`${index}_${side}`]: previewUrl }))

            const updated: PendingAadhar = { ...pendingAadhar[index], [side]: compressed }
            setPendingAadhar(prev => ({ ...prev, [index]: updated }))

            // If both sides are now captured, stitch + upload automatically
            if (updated.front && updated.back) {
                setUploadingIndex(index)
                try {
                    const { stitchAadhar } = await import('@/lib/utils/stitch-aadhar')
                    const guestName = (guests[index].name || 'Guest').replace(/[^a-zA-Z0-9]/g, '_')
                    const phone = guests[index].phone || '0000000000'
                    const dateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
                    const roomNum = unit?.unit_number || 'Unit'
                    const guestLabel = guests.length > 1 ? `_Guest${index + 1}of${guests.length}` : ''
                    const stitched = await stitchAadhar(updated.front, updated.back, {
                        roomNumber: roomNum, guestName: guests[index].name || 'Guest', phone, date: dateStr,
                    })

                    // Generate storage path with room number + guest index
                    const monthStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7)
                    const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '-')
                    const fileName = `${monthStr}/${roomNum}_${guestName}_${phone}_${dateStr}_${timeStr}${guestLabel}.jpg`

                    const { error: uploadErr } = await supabase.storage
                        .from('aadhars')
                        .upload(fileName, stitched, { contentType: 'image/jpeg', upsert: true })

                    if (uploadErr) {
                        toast.error('Failed to upload stitched Aadhar')
                        console.error('Upload error:', uploadErr)
                        return
                    }

                    // Store the same path in both front and back for backward compatibility
                    updateGuest(index, 'aadhar_url_front', fileName)
                    updateGuest(index, 'aadhar_url_back', fileName)

                    // Replace individual previews with stitched preview
                    const stitchedPreview = URL.createObjectURL(stitched)
                    setAadharPreviews(prev => ({
                        ...prev,
                        [`${index}_stitched`]: stitchedPreview,
                    }))

                    toast.success('Aadhar photos stitched & uploaded')
                } catch (err) {
                    console.error('Stitch/upload error:', err)
                    toast.error('Failed to stitch Aadhar photos')
                } finally {
                    setUploadingIndex(null)
                }
            } else {
                toast.info(`Aadhar ${side} captured — now capture the ${side === 'front' ? 'back' : 'front'} side`)
            }
        } catch (err) {
            console.error('Aadhar capture error:', err)
            toast.error('Failed to process Aadhar photo')
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
            if (!aadharBypass && (!guests[i].aadhar_url_front || !guests[i].aadhar_url_back)) {
                toast.error(`Guest ${i + 1}: Both Aadhar front and back photos are mandatory`)
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
                        aadhar_url_front: isBypassEnabled
                            ? 'https://ui-avatars.com/api/?name=Dev+Guest'
                            : (g.aadhar_url_front || null),
                        aadhar_url_back: isBypassEnabled
                            ? 'https://ui-avatars.com/api/?name=Dev+Guest'
                            : (g.aadhar_url_back || null),
                    })),
                    numberOfDays,
                    checkOutOverride: manualCheckout ? manualCheckout + ':00+05:30' : null,
                    grandTotalOverride: isBypass
                        ? 0
                        : (grandTotalOverride && !isNaN(Number(grandTotalOverride))
                            ? Number(grandTotalOverride)
                            : null),
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

            if (!payLater && !isBypass && data.booking?.id) {
                setSuccessBookingId(data.booking.id)
            } else {
                resetForm()
                onSuccess()
            }
        } catch {
            toast.error('Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetForm = () => {
        // Clean up blob preview URLs to prevent memory leaks
        Object.values(aadharPreviews).forEach(url => URL.revokeObjectURL(url))
        setAadharPreviews({})
        setAadharMatches({})
        setPendingAadhar({})
        setGuests([emptyGuest()])
        setNumberOfDays(1)
        setManualCheckout('')
        setGrandTotalOverride('')
        setAmountCash('')
        setAmountDigital('')
        setPayLater(false)
        setIsBypass(false)
        setAadharBypass(false)
        setBypassTimer(0)
        setConflictError(null)
        setSuccessBookingId(null)
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) {
            resetForm()
        }
        onOpenChange(openState)
    }

    if (successBookingId) {
        return (
            <Sheet open={open} onOpenChange={resetAndClose}>
                <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-md shadow-2xl p-0 flex flex-col items-center justify-center text-center">
                    <div className="p-12 space-y-6 w-full animate-in zoom-in-95 duration-500">
                        <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 shadow-inner">
                            <CheckCircle2 className="h-12 w-12" />
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Check-In Complete!</h2>
                            <p className="text-slate-500 mt-2 text-sm">Room {unit.unit_number} has been officially locked. Payment received in full.</p>
                        </div>
                        <div className="pt-8 space-y-3">
                            <Button 
                                onClick={() => window.open(`/invoice/${successBookingId}`, '_blank')}
                                className="w-full h-14 text-base font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl flex items-center justify-center gap-2 shadow-xl shadow-slate-900/20 active:scale-[0.98] transition-all"
                            >
                                <Printer className="h-5 w-5" />
                                Print Invoice
                            </Button>
                            <Button 
                                variant="outline" 
                                onClick={() => {
                                    resetForm()
                                    onSuccess()
                                }}
                                className="w-full h-12 text-sm font-semibold text-slate-600 rounded-xl"
                            >
                                Done
                            </Button>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>
        )
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
                                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                >
                                    <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="flex h-8 w-12 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
                                    {numberOfDays}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setNumberOfDays((n) => n + 1)}
                                    className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-50 transition-colors"
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

                    {/* Aadhar Bypass Toggle — Admin/Developer only */}
                    {(role === 'Admin' || role === 'Developer') && (
                        <div className="flex items-center gap-3 px-1 py-2">
                            <label className="flex items-center gap-2 cursor-pointer text-sm">
                                <input
                                    type="checkbox"
                                    checked={aadharBypass}
                                    onChange={(e) => setAadharBypass(e.target.checked)}
                                    className="rounded border-slate-300"
                                />
                                <span className="text-slate-600">Skip Aadhar Upload</span>
                            </label>
                        </div>
                    )}

                    {/* Guest List */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-500" />
                                <Label className="text-sm font-semibold text-slate-700">
                                    Guests ({guests.length}){guests.length > maxGuests ? ` — ${guests.length - maxGuests} extra` : ` (${maxGuests} included)`}
                                </Label>
                            </div>
                            {!isDorm && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    onClick={addGuest}
                                    disabled={false}
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
                                    <div className="relative">
                                        <Input
                                            placeholder="+91 98765 43210"
                                            value={guest.phone}
                                            onChange={(e) => updateGuest(index, 'phone', e.target.value)}
                                            onBlur={() => handlePhoneLookup(index, guest.phone)}
                                            className="h-9 text-sm bg-white"
                                        />
                                        {lookingUp === index && (
                                            <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                <UserSearch className="h-3.5 w-3.5 text-blue-400 animate-pulse" />
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Aadhar Merge Banner */}
                                {aadharMatches[index] && (
                                    <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 animate-in fade-in slide-in-from-top-1 duration-300">
                                        <p className="text-xs font-semibold text-blue-700 mb-1.5">
                                            Returning guest — Aadhar on file
                                        </p>
                                        <p className="text-[10px] text-blue-600 mb-2">
                                            {aadharMatches[index].name} ({aadharMatches[index].phone})
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                size="sm"
                                                onClick={() => applyAadharMerge(index)}
                                                className="h-7 text-[10px] bg-blue-600 hover:bg-blue-700 text-white gap-1"
                                            >
                                                <CheckCircle2 className="h-3 w-3" />
                                                Use Previous Aadhar
                                            </Button>
                                            <Button
                                                type="button"
                                                size="sm"
                                                variant="ghost"
                                                onClick={() => dismissAadharMatch(index)}
                                                className="h-7 text-[10px] text-blue-600 hover:text-blue-800"
                                            >
                                                Upload New
                                            </Button>
                                        </div>
                                    </div>
                                )}

                                {/* Aadhar Photo Upload — Stitched (Front + Back) */}
                                <div className="space-y-1.5">
                                    <Label className="text-xs text-slate-600">Aadhar Photos *</Label>
                                    {aadharPreviews[`${index}_stitched`] ? (
                                        /* Stitched result — single combined image */
                                        <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                            <img
                                                src={aadharPreviews[`${index}_stitched`]}
                                                alt={`Aadhar Stitched - Guest ${index + 1}`}
                                                className="w-full h-auto max-h-48 object-contain"
                                            />
                                            <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                <CheckCircle2 className="h-2.5 w-2.5" />
                                                Front + Back
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    // Clear stitched data to allow re-capture
                                                    setPendingAadhar(prev => { const n = { ...prev }; delete n[index]; return n })
                                                    setAadharPreviews(prev => {
                                                        const n = { ...prev }
                                                        delete n[`${index}_front`]
                                                        delete n[`${index}_back`]
                                                        delete n[`${index}_stitched`]
                                                        return n
                                                    })
                                                    updateGuest(index, 'aadhar_url_front', '')
                                                    updateGuest(index, 'aadhar_url_back', '')
                                                }}
                                                className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors"
                                            >
                                                Re-capture
                                            </button>
                                        </div>
                                    ) : (
                                        /* Capture flow: front then back */
                                        <div className="grid grid-cols-2 gap-2">
                                            {/* FRONT side */}
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">Front</p>
                                                {aadharPreviews[`${index}_front`] ? (
                                                    <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                        <img
                                                            src={aadharPreviews[`${index}_front`]}
                                                            alt={`Aadhar Front - Guest ${index + 1}`}
                                                            className="w-full h-24 object-cover"
                                                        />
                                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                                        </div>
                                                        <label className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors">
                                                            Replace
                                                            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleAadharCapture(index, 'front', e)} />
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-2 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                                        <Camera className="h-4 w-4 text-slate-400" />
                                                        <span className="text-[9px] font-semibold text-slate-500">
                                                            {uploadingIndex === index ? 'Stitching...' : 'Capture Front'}
                                                        </span>
                                                        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploadingIndex !== null} onChange={(e) => handleAadharCapture(index, 'front', e)} />
                                                    </label>
                                                )}
                                            </div>
                                            {/* BACK side */}
                                            <div className="space-y-1">
                                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">Back</p>
                                                {aadharPreviews[`${index}_back`] ? (
                                                    <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                        <img
                                                            src={aadharPreviews[`${index}_back`]}
                                                            alt={`Aadhar Back - Guest ${index + 1}`}
                                                            className="w-full h-24 object-cover"
                                                        />
                                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                                        </div>
                                                        <label className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors">
                                                            Replace
                                                            <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleAadharCapture(index, 'back', e)} />
                                                        </label>
                                                    </div>
                                                ) : (
                                                    <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-2 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                                        <Camera className="h-4 w-4 text-slate-400" />
                                                        <span className="text-[9px] font-semibold text-slate-500">
                                                            {uploadingIndex === index ? 'Stitching...' : 'Capture Back'}
                                                        </span>
                                                        <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploadingIndex !== null} onChange={(e) => handleAadharCapture(index, 'back', e)} />
                                                    </label>
                                                )}
                                            </div>
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
