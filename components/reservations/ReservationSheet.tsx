'use client'

import { useState, useMemo, useEffect } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import type { GuestInput } from '@/lib/types'
import { useUnitStore } from '@/lib/store/unit-store'
import { useCurrentTime } from '@/lib/hooks/use-current-time'
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
import {
    CalendarPlus,
    Plus,
    Minus,
    Trash2,
    IndianRupee,
    Users,
    Banknote,
    Smartphone,
    Clock,
    AlertTriangle,
    Check,
} from 'lucide-react'

interface ReservationSheetProps {
    unit: UnitWithBooking | null
    defaultCheckIn: Date | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

const emptyGuest = (): GuestInput => ({
    name: '',
    phone: '',
    aadhar_number: '',
    aadhar_url_front: '',
    aadhar_url_back: '',
})

function formatLocalYYYYMMDD(d: Date): string {
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
}

export function ReservationSheet({
    unit: preSelectedUnit,
    defaultCheckIn,
    open,
    onOpenChange,
    onSuccess,
}: ReservationSheetProps) {
    const { units } = useUnitStore()
    const devNow = useCurrentTime()

    const [selectedUnitId, setSelectedUnitId] = useState<string>('')
    const [bookingMode, setBookingMode] = useState<'ROOM' | 'DORM'>('ROOM')
    const [selectedDormIds, setSelectedDormIds] = useState<string[]>([])
    const [checkInDate, setCheckInDate] = useState('')
    const [checkInTime, setCheckInTime] = useState('12:00')
    const [guests, setGuests] = useState<GuestInput[]>([emptyGuest()])
    const [expectedArrival, setExpectedArrival] = useState('')
    const [numberOfDays, setNumberOfDays] = useState(1)
    const [advanceAmount, setAdvanceAmount] = useState('')
    const [advanceType, setAdvanceType] = useState<'CASH' | 'DIGITAL'>('CASH')
    const [grandTotalOverride, setGrandTotalOverride] = useState('')
    const [notes, setNotes] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [conflictError, setConflictError] = useState<string | null>(null)

    // Room-only units for dropdown
    const roomUnits = useMemo(() => {
        return units.filter((u) => u.type === 'ROOM')
    }, [units])

    // Available dorm beds for multi-select (sorted by bed number)
    const dormBeds = useMemo(() => {
        return units
            .filter((u) => u.type === 'DORM')
            .sort((a, b) => {
                const numA = parseInt(a.unit_number.replace(/\D/g, ''))
                const numB = parseInt(b.unit_number.replace(/\D/g, ''))
                return numA - numB
            })
    }, [units])

    const isDormEligible = guests.length >= 5

    // Reset dorm mode when guest count drops below 5
    useEffect(() => {
        if (!isDormEligible) {
            setBookingMode('ROOM')
            setSelectedDormIds([])
        }
    }, [isDormEligible])

    // Populate defaults when sheet opens
    // Populate defaults ONCE when sheet opens — not on every clock tick
    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => {
        if (open) {
            if (preSelectedUnit) setSelectedUnitId(preSelectedUnit.id)
            if (defaultCheckIn) {
                setCheckInDate(formatLocalYYYYMMDD(defaultCheckIn))
                setCheckInTime(
                    `${String(defaultCheckIn.getHours()).padStart(2, '0')}:${String(defaultCheckIn.getMinutes()).padStart(2, '0')}`
                )
            } else {
                const now = new Date()
                setCheckInDate(formatLocalYYYYMMDD(now))
            }
        }
    }, [open, preSelectedUnit, defaultCheckIn])

    const toggleDormBed = (id: string) => {
        setSelectedDormIds((prev) => {
            if (prev.includes(id)) return prev.filter((x) => x !== id)
            if (prev.length >= guests.length) {
                toast.error(`Maximum ${guests.length} beds (1 per guest)`)
                return prev
            }
            return [...prev, id]
        })
    }

    const selectedUnit = roomUnits.find((r) => r.id === selectedUnitId)

    const roomMaxGuests = selectedUnit ? (selectedUnit.max_guests || 3) : 3

    // Pricing for room mode
    const roomPricing = useMemo(() => {
        if (bookingMode !== 'ROOM' || !selectedUnit) return null
        const perDayBase = Number(selectedUnit.base_price) * numberOfDays
        return calculateBookingPrice(selectedUnit.type, perDayBase, guests.length, roomMaxGuests)
    }, [bookingMode, selectedUnit, guests.length, numberOfDays, roomMaxGuests])

    // Pricing for dorm mode
    const dormPricing = useMemo(() => {
        if (bookingMode !== 'DORM' || selectedDormIds.length === 0) return null
        const selectedBeds = units.filter((u) => selectedDormIds.includes(u.id))
        const totalBase = selectedBeds.reduce(
            (sum, bed) => sum + Number(bed.base_price) * numberOfDays,
            0
        )
        return {
            baseAmount: totalBase,
            extraHeads: 0,
            surcharge: 0,
            grandTotal: totalBase,
        }
    }, [bookingMode, selectedDormIds, units, numberOfDays])

    const pricing = bookingMode === 'DORM' ? dormPricing : roomPricing

    const finalTotal = useMemo(() => {
        if (!pricing) return 0
        if (
            bookingMode === 'ROOM' &&
            grandTotalOverride &&
            !isNaN(Number(grandTotalOverride))
        )
            return Number(grandTotalOverride)
        return pricing.grandTotal
    }, [pricing, grandTotalOverride, bookingMode])

    const addGuest = () => setGuests((p) => [...p, emptyGuest()])
    const removeGuest = (i: number) => {
        if (guests.length <= 1) return
        setGuests((p) => p.filter((_, idx) => idx !== i))
    }
    const updateGuest = (i: number, f: keyof GuestInput, v: string) =>
        setGuests((p) => p.map((g, idx) => (idx === i ? { ...g, [f]: v } : g)))

    const handleSubmit = async () => {
        if (bookingMode === 'DORM') {
            if (selectedDormIds.length !== guests.length) {
                toast.error(
                    `Select exactly ${guests.length} dorm beds (${selectedDormIds.length} selected)`
                )
                return
            }
        } else {
            if (!selectedUnitId) {
                toast.error('Please select a room')
                return
            }
        }

        if (!checkInDate) {
            toast.error('Please select a check-in date')
            return
        }

        const isBypassEnabled =
            typeof window !== 'undefined' &&
            localStorage.getItem('fajo_bypass_credentials') === 'true'

        if (!isBypassEnabled) {
            for (let i = 0; i < guests.length; i++) {
                if (!guests[i].name.trim()) {
                    toast.error(`Guest ${i + 1}: Name is required`)
                    return
                }
                const phoneDigits = guests[i].phone.replace(/\D/g, '')
                if (phoneDigits.length !== 10) {
                    toast.error(
                        `Guest ${i + 1}: Phone number must be exactly 10 digits`
                    )
                    return
                }
            }
        }

        setIsSubmitting(true)
        setConflictError(null)

        try {
            const checkIn = new Date(`${checkInDate}T${checkInTime}:00+05:30`)
            const guestPayload = guests.map((g, i) => ({
                name:
                    g.name.trim() ||
                    (isBypassEnabled ? `Dev Guest ${i + 1}` : ''),
                phone:
                    g.phone.trim() || (isBypassEnabled ? '0000000000' : ''),
                aadhar_number: g.aadhar_number.trim() || null,
                aadhar_url_front: g.aadhar_url_front || null,
                aadhar_url_back: g.aadhar_url_back || null,
            }))

            const payload =
                bookingMode === 'DORM'
                    ? {
                          unitIds: selectedDormIds,
                          checkIn: checkIn.toISOString(),
                          guests: guestPayload,
                          expectedArrival: expectedArrival || null,
                          advanceAmount: Number(advanceAmount) || 0,
                          advancePaid:
                              Number(advanceAmount) > 0 ? advanceType : null,
                          notes: notes.trim() || null,
                          numberOfDays,
                      }
                    : {
                          unitId: selectedUnitId,
                          checkIn: checkIn.toISOString(),
                          guests: guestPayload,
                          expectedArrival: expectedArrival || null,
                          advanceAmount: Number(advanceAmount) || 0,
                          advancePaid:
                              Number(advanceAmount) > 0 ? advanceType : null,
                          grandTotalOverride:
                              grandTotalOverride &&
                              !isNaN(Number(grandTotalOverride))
                                  ? Number(grandTotalOverride)
                                  : null,
                          notes: notes.trim() || null,
                          numberOfDays,
                      }

            const res = await fetch('/api/reservations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })

            const data = await res.json()

            if (res.status === 409) {
                setConflictError(data.error || 'Booking conflict')
                toast.error(data.error || 'Booking conflict')
                return
            }

            if (!res.ok) {
                toast.error(data.error || 'Failed to create reservation')
                return
            }

            if (bookingMode === 'DORM') {
                toast.success(
                    `Dorm reservation confirmed — ${selectedDormIds.length} beds · ₹${finalTotal.toLocaleString('en-IN')}`
                )
            } else {
                toast.success(
                    `Reservation confirmed for ${selectedUnit?.unit_number} — ₹${finalTotal.toLocaleString('en-IN')}`
                )
            }
            resetForm()
            onSuccess()
        } catch {
            toast.error('Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetForm = () => {
        setSelectedUnitId('')
        setBookingMode('ROOM')
        setSelectedDormIds([])
        setCheckInDate('')
        setCheckInTime('12:00')
        setGuests([emptyGuest()])
        setExpectedArrival('')
        setAdvanceAmount('')
        setAdvanceType('CASH')
        setGrandTotalOverride('')
        setNotes('')
        setNumberOfDays(1)
        setConflictError(null)
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) resetForm()
        onOpenChange(openState)
    }

    return (
        <Sheet open={open} onOpenChange={resetAndClose}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-lg border-l border-slate-200/80 shadow-2xl overflow-y-auto p-0">
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                <CalendarPlus className="h-5 w-5" />
                            </div>
                            <div>
                                <SheetTitle className="text-xl font-semibold tracking-tight">
                                    New Reservation
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    Pre-book a room{isDormEligible ? ' or dorm beds' : ''} with advance payment
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Unit Selection */}
                    <div className="space-y-3">
                        {/* Mode Toggle - visible when 5+ guests */}
                        {isDormEligible && (
                            <div className="flex gap-2 p-1 bg-slate-100 rounded-lg">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBookingMode('ROOM')
                                        setSelectedDormIds([])
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-semibold transition-all ${
                                        bookingMode === 'ROOM'
                                            ? 'bg-white text-slate-800 shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    Room
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setBookingMode('DORM')
                                        setSelectedUnitId('')
                                    }}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-8 rounded-md text-xs font-semibold transition-all ${
                                        bookingMode === 'DORM'
                                            ? 'bg-violet-600 text-white shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700'
                                    }`}
                                >
                                    Dorm Beds ({guests.length})
                                </button>
                            </div>
                        )}

                        {bookingMode === 'ROOM' ? (
                            <div className="space-y-1.5">
                                <Label className="text-xs text-slate-600">
                                    Room *
                                </Label>
                                <select
                                    value={selectedUnitId}
                                    onChange={(e) => setSelectedUnitId(e.target.value)}
                                    className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                                >
                                    <option value="">Select a room...</option>
                                    {roomUnits.map((r) => (
                                        <option key={r.id} value={r.id}>
                                            Room {r.unit_number} — ₹
                                            {Number(r.base_price).toLocaleString('en-IN')}
                                        </option>
                                    ))}
                                </select>
                                {isDormEligible && (
                                    <p className="text-[10px] text-violet-600 font-medium mt-1">
                                        Dorm beds available for bulk booking (5+ guests)
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs text-slate-600">
                                        Select {guests.length} Dorm Beds *
                                    </Label>
                                    <span
                                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                                            selectedDormIds.length === guests.length
                                                ? 'bg-emerald-100 text-emerald-700'
                                                : 'bg-amber-100 text-amber-700'
                                        }`}
                                    >
                                        {selectedDormIds.length}/{guests.length}
                                    </span>
                                </div>
                                {/* Lower Beds */}
                                <div className="space-y-1.5">
                                    {(() => {
                                        const lowerBeds = dormBeds.filter((b) => parseInt(b.unit_number.replace(/\D/g, '')) <= 13)
                                        const lowerPrice = lowerBeds.length > 0 ? Number(lowerBeds[0].base_price) : 0
                                        return (
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                Lower Beds{lowerPrice > 0 ? ` — ₹${lowerPrice.toLocaleString('en-IN')}/night` : ''}
                                            </p>
                                        )
                                    })()}
                                    <div className="grid grid-cols-5 gap-1.5">
                                        {dormBeds
                                            .filter((b) => {
                                                const num = parseInt(b.unit_number.replace(/\D/g, ''))
                                                return num <= 13
                                            })
                                            .map((bed) => {
                                                const isSelected = selectedDormIds.includes(bed.id)
                                                return (
                                                    <button
                                                        key={bed.id}
                                                        type="button"
                                                        onClick={() => toggleDormBed(bed.id)}
                                                        className={`relative h-10 rounded-lg text-xs font-semibold border transition-all ${
                                                            isSelected
                                                                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:bg-violet-50'
                                                        }`}
                                                    >
                                                        {bed.unit_number}
                                                        {isSelected && (
                                                            <Check className="absolute top-0.5 right-0.5 h-3 w-3" />
                                                        )}
                                                    </button>
                                                )
                                            })}
                                    </div>
                                </div>
                                {/* Upper Beds */}
                                <div className="space-y-1.5">
                                    {(() => {
                                        const upperBeds = dormBeds.filter((b) => parseInt(b.unit_number.replace(/\D/g, '')) >= 14)
                                        const upperPrice = upperBeds.length > 0 ? Number(upperBeds[0].base_price) : 0
                                        return (
                                            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                                Upper Beds{upperPrice > 0 ? ` — ₹${upperPrice.toLocaleString('en-IN')}/night` : ''}
                                            </p>
                                        )
                                    })()}
                                    <div className="grid grid-cols-5 gap-1.5">
                                        {dormBeds
                                            .filter((b) => {
                                                const num = parseInt(b.unit_number.replace(/\D/g, ''))
                                                return num >= 14
                                            })
                                            .map((bed) => {
                                                const isSelected = selectedDormIds.includes(bed.id)
                                                return (
                                                    <button
                                                        key={bed.id}
                                                        type="button"
                                                        onClick={() => toggleDormBed(bed.id)}
                                                        className={`relative h-10 rounded-lg text-xs font-semibold border transition-all ${
                                                            isSelected
                                                                ? 'bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-600/20'
                                                                : 'bg-white text-slate-600 border-slate-200 hover:border-violet-300 hover:bg-violet-50'
                                                        }`}
                                                    >
                                                        {bed.unit_number}
                                                        {isSelected && (
                                                            <Check className="absolute top-0.5 right-0.5 h-3 w-3" />
                                                        )}
                                                    </button>
                                                )
                                            })}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Date & Time */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                            <Label className="text-xs text-slate-600">
                                Check-in Date *
                            </Label>
                            <Input
                                type="date"
                                value={checkInDate}
                                onChange={(e) =>
                                    setCheckInDate(e.target.value)
                                }
                                className="h-10 text-sm bg-white"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-slate-600">
                                Check-in Time
                            </Label>
                            <Input
                                type="time"
                                value={checkInTime}
                                onChange={(e) =>
                                    setCheckInTime(e.target.value)
                                }
                                className="h-10 text-sm bg-white"
                            />
                        </div>
                    </div>

                    {/* Number of Days */}
                    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                        <Label className="text-sm text-slate-700 font-medium">
                            Number of Days
                        </Label>
                        <div className="flex items-center gap-1.5">
                            <button
                                type="button"
                                onClick={() => setNumberOfDays((n) => Math.max(1, n - 1))}
                                disabled={numberOfDays <= 1}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 disabled:opacity-30 transition-colors"
                            >
                                <Minus className="h-3.5 w-3.5" />
                            </button>
                            <span className="flex h-8 w-12 items-center justify-center rounded-lg bg-blue-600 text-white text-sm font-bold">
                                {numberOfDays}
                            </span>
                            <button
                                type="button"
                                onClick={() => setNumberOfDays((n) => n + 1)}
                                className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 hover:bg-slate-100 transition-colors"
                            >
                                <Plus className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>

                    {/* Expected Arrival */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600 flex items-center gap-1.5">
                            <Clock className="h-3 w-3" />
                            Expected Arrival Time
                        </Label>
                        <Input
                            type="text"
                            placeholder="e.g. Around 4 PM, Late night arrival..."
                            value={expectedArrival}
                            onChange={(e) =>
                                setExpectedArrival(e.target.value)
                            }
                            className="h-9 text-sm bg-white"
                        />
                    </div>

                    {/* Conflict Warning */}
                    {conflictError && (
                        <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
                            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
                            <p className="text-xs text-red-700 font-medium">
                                {conflictError}
                            </p>
                        </div>
                    )}

                    {/* Guests */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-500" />
                                <Label className="text-sm font-semibold text-slate-700">
                                    Guests ({guests.length}{bookingMode === 'ROOM' ? `/${roomMaxGuests} max` : ''})
                                </Label>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={addGuest}
                                disabled={bookingMode === 'ROOM' && guests.length >= roomMaxGuests}
                                className="h-7 text-xs gap-1 border-dashed"
                            >
                                <Plus className="h-3 w-3" />
                                Add
                            </Button>
                        </div>

                        {guests.map((guest, i) => (
                            <div
                                key={i}
                                className="relative rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2"
                            >
                                {guests.length > 1 && (
                                    <button
                                        onClick={() => removeGuest(i)}
                                        className="absolute top-2 right-2 text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </button>
                                )}
                                <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
                                    Guest {i + 1}
                                </p>
                                <div className="grid grid-cols-2 gap-2">
                                    <Input
                                        placeholder="Full Name *"
                                        value={guest.name}
                                        onChange={(e) =>
                                            updateGuest(i, 'name', e.target.value)
                                        }
                                        className="h-8 text-xs bg-white"
                                    />
                                    <Input
                                        placeholder="Phone *"
                                        value={guest.phone}
                                        onChange={(e) =>
                                            updateGuest(i, 'phone', e.target.value)
                                        }
                                        className="h-8 text-xs bg-white"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Advance Payment */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Advance Payment
                        </p>
                        <div className="space-y-1.5">
                            <Label className="text-xs text-slate-600">
                                Advance Amount (₹)
                            </Label>
                            <Input
                                type="number"
                                placeholder="0"
                                value={advanceAmount}
                                onChange={(e) =>
                                    setAdvanceAmount(e.target.value)
                                }
                                className="h-9 text-sm bg-white"
                            />
                        </div>
                        {Number(advanceAmount) > 0 && (
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setAdvanceType('CASH')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold border transition-all ${advanceType === 'CASH'
                                        ? 'bg-green-50 border-green-300 text-green-700'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <Banknote className="h-3.5 w-3.5" />
                                    Cash
                                </button>
                                <button
                                    onClick={() => setAdvanceType('DIGITAL')}
                                    className={`flex-1 flex items-center justify-center gap-1.5 h-9 rounded-lg text-xs font-semibold border transition-all ${advanceType === 'DIGITAL'
                                        ? 'bg-blue-50 border-blue-300 text-blue-700'
                                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                        }`}
                                >
                                    <Smartphone className="h-3.5 w-3.5" />
                                    Digital
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Pricing */}
                    {pricing && (
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-2 text-sm">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Pricing
                            </p>
                            {bookingMode === 'DORM' ? (
                                <div className="flex justify-between text-slate-600">
                                    <span>
                                        {selectedDormIds.length} bed{selectedDormIds.length !== 1 ? 's' : ''} &times; {numberOfDays} night{numberOfDays > 1 ? 's' : ''}
                                    </span>
                                    <span>
                                        ₹{pricing.baseAmount.toLocaleString('en-IN')}
                                    </span>
                                </div>
                            ) : (
                                <>
                                    <div className="flex justify-between text-slate-600">
                                        <span>Base Rate</span>
                                        <span>
                                            ₹{pricing.baseAmount.toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                    {pricing.extraHeads > 0 && (
                                        <div className="flex justify-between text-amber-600 font-medium">
                                            <span>
                                                Extra Surcharge (×{pricing.extraHeads})
                                            </span>
                                            <span>
                                                +₹
                                                {pricing.surcharge.toLocaleString('en-IN')}
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}
                            {Number(advanceAmount) > 0 && (
                                <div className="flex justify-between text-blue-600 font-medium">
                                    <span>Advance Paid</span>
                                    <span>
                                        -₹
                                        {Number(advanceAmount).toLocaleString(
                                            'en-IN'
                                        )}
                                    </span>
                                </div>
                            )}
                            <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                                <span>Balance Due at Checkout</span>
                                <span className="text-emerald-600">
                                    ₹
                                    {Math.max(
                                        0,
                                        finalTotal -
                                        (Number(advanceAmount) || 0)
                                    ).toLocaleString('en-IN')}
                                </span>
                            </div>
                            {bookingMode === 'ROOM' && (
                                <div className="pt-2 border-t border-dashed border-slate-200 space-y-1.5">
                                    <Label className="text-xs text-slate-500 flex items-center gap-1.5">
                                        <IndianRupee className="h-3 w-3" />
                                        Override Grand Total
                                    </Label>
                                    <Input
                                        type="number"
                                        placeholder={String(pricing.grandTotal)}
                                        value={grandTotalOverride}
                                        onChange={(e) =>
                                            setGrandTotalOverride(e.target.value)
                                        }
                                        className="h-8 text-xs bg-white"
                                    />
                                </div>
                            )}
                        </div>
                    )}

                    {/* Notes */}
                    <div className="space-y-1.5">
                        <Label className="text-xs text-slate-600">
                            Notes
                        </Label>
                        <Input
                            placeholder="Special requests, preferences..."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="h-9 text-sm bg-white"
                        />
                    </div>

                    {/* Submit */}
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full h-12 text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-xl shadow-blue-600/15 rounded-xl transition-all active:scale-[0.98]"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Creating Reservation...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <CalendarPlus className="h-4 w-4" />
                                {bookingMode === 'DORM'
                                    ? `Reserve ${selectedDormIds.length} Dorm Beds`
                                    : 'Confirm Reservation'}
                                {finalTotal > 0 &&
                                    ` · ₹${finalTotal.toLocaleString('en-IN')}`}
                            </span>
                        )}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
