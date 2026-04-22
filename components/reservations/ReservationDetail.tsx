'use client'

import { useState, useEffect } from 'react'
import type { Booking, Guest } from '@/lib/types'
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
    CalendarCheck,
    UserCheck,
    XCircle,
    Users,
    Clock,
    Banknote,
    Smartphone,
    ArrowRight,
    Camera,
    CheckCircle2,
    UserSearch,
    Plus,
    Trash2,
} from 'lucide-react'
import type { AadharMatch } from '@/lib/utils/merge-aadhar'

/** Holds pending front/back blobs before stitching */
interface PendingAadhar {
    front?: Blob
    back?: Blob
}

interface ReservationDetailProps {
    booking: Booking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
    role?: string
}

interface GuestDataItem {
    id: string
    booking_id: string
    name: string
    phone: string
    aadhar_number: string
    aadhar_url_front: string
    aadhar_url_back: string
    unit_number: string
}

export function ReservationDetail({
    booking,
    open,
    onOpenChange,
    onSuccess,
    role,
}: ReservationDetailProps) {
    const [isConverting, setIsConverting] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [isAddingGuest, setIsAddingGuest] = useState(false)
    const [isRemovingGuest, setIsRemovingGuest] = useState(false)
    const [isConfirmingRes, setIsConfirmingRes] = useState(false)
    const [showPayment, setShowPayment] = useState(false)
    const [amountCash, setAmountCash] = useState('')
    const [amountDigital, setAmountDigital] = useState('')
    const [uploadingIndex, setUploadingIndex] = useState<number | null>(null)
    const [guestData, setGuestData] = useState<GuestDataItem[]>([])
    const [groupBookings, setGroupBookings] = useState<Booking[]>([])
    const [aadharBypass, setAadharBypass] = useState(false)
    const [aadharPreviews, setAadharPreviews] = useState<Record<string, string>>({})
    const [aadharMatches, setAadharMatches] = useState<Record<number, AadharMatch>>({})
    const [lookingUp, setLookingUp] = useState<number | null>(null)
    const [pendingAadhar, setPendingAadhar] = useState<Record<number, PendingAadhar>>({})

    // Fetch group siblings when booking has group_id
    useEffect(() => {
        if (open && booking?.group_id) {
            const fetchGroup = async () => {
                try {
                    const { data } = await supabase
                        .from('bookings')
                        .select('*, guests(id, name, phone, aadhar_number, aadhar_url_front, aadhar_url_back), unit:units(unit_number)')
                        .eq('group_id', booking.group_id)
                        .in('status', ['PENDING', 'CONFIRMED', 'CHECKED_IN'])
                        .order('created_at')
                    setGroupBookings(data || [])
                } catch {
                    setGroupBookings([])
                }
            }
            fetchGroup()
        } else {
            setGroupBookings([])
        }
    }, [open, booking?.group_id])

    const isGroupBooking = groupBookings.length > 1

    // Populate guest data from booking or group
    useEffect(() => {
        if (open && booking) {
            // Guard: if booking has a group_id but group data hasn't loaded yet, wait
            // If group fetch failed (empty array), fall through to single-booking path
            if (booking.group_id && groupBookings.length === 0) return

            if (isGroupBooking) {
                const allGuests: GuestDataItem[] = groupBookings.flatMap((b) =>
                    (b.guests || []).map((g: Guest) => ({
                        id: g.id,
                        booking_id: b.id,
                        name: g.name,
                        phone: g.phone,
                        aadhar_number: g.aadhar_number || '',
                        aadhar_url_front: g.aadhar_url_front || '',
                        aadhar_url_back: g.aadhar_url_back || '',
                        unit_number: (b.unit as { unit_number?: string } | undefined)?.unit_number || '',
                    }))
                )
                setGuestData(allGuests)
            } else {
                setGuestData(
                    (booking.guests || []).map((g: Guest) => ({
                        id: g.id,
                        booking_id: booking.id,
                        name: g.name,
                        phone: g.phone,
                        aadhar_number: g.aadhar_number || '',
                        aadhar_url_front: g.aadhar_url_front || '',
                        aadhar_url_back: g.aadhar_url_back || '',
                        unit_number: booking.unit?.unit_number || '',
                    }))
                )
            }
        }
    }, [open, booking, isGroupBooking, groupBookings])

    const handleGuestChange = (id: string, field: string, value: string) => {
        setGuestData((prev) =>
            prev.map((g) => (g.id === id ? { ...g, [field]: value } : g))
        )
    }

    // Save edited guest name/phone to DB (for on-arrival edits)
    const saveGuestField = async (guestId: string, updates: { name?: string; phone?: string }) => {
        try {
            const { error } = await supabase.from('guests').update(updates).eq('id', guestId)
            if (error) throw error
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to save guest')
        }
    }

    // Add a new placeholder guest to the booking
    const addGuestToBooking = async () => {
        if (!booking || isAddingGuest) return
        setIsAddingGuest(true)
        const newIndex = guestData.length + 1
        try {
            const { data, error } = await supabase
                .from('guests')
                .insert({
                    booking_id: booking.id,
                    name: `Guest ${newIndex}`,
                    phone: '0000000000',
                })
                .select('id, name, phone, aadhar_number, aadhar_url_front, aadhar_url_back')
                .single()
            if (error || !data) throw error || new Error('Failed to add guest')

            // Update booking guest_count
            await supabase.from('bookings').update({ guest_count: newIndex }).eq('id', booking.id)

            setGuestData(prev => [...prev, {
                id: data.id,
                booking_id: booking.id,
                name: data.name,
                phone: data.phone,
                aadhar_number: data.aadhar_number || '',
                aadhar_url_front: data.aadhar_url_front || '',
                aadhar_url_back: data.aadhar_url_back || '',
                unit_number: booking.unit?.unit_number || '',
            }])
            toast.success('Guest added')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to add guest')
        } finally {
            setIsAddingGuest(false)
        }
    }

    // Remove a guest (not the primary)
    const removeGuestFromBooking = async (guestId: string, index: number) => {
        if (!booking || index === 0 || isRemovingGuest) return
        if (!confirm('Remove this guest? This will reduce the guest count.')) return
        setIsRemovingGuest(true)
        try {
            const { error } = await supabase.from('guests').delete().eq('id', guestId)
            if (error) throw error

            const newCount = Math.max(1, guestData.length - 1)
            await supabase.from('bookings').update({ guest_count: newCount }).eq('id', booking.id)

            setGuestData(prev => prev.filter(g => g.id !== guestId))
            toast.success('Guest removed')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to remove guest')
        } finally {
            setIsRemovingGuest(false)
        }
    }

    const handlePhoneLookup = async (index: number, phone: string) => {
        const digits = phone.replace(/\D/g, '')
        if (digits.length !== 10) return
        const g = guestData[index]
        if (g?.aadhar_url_front && g?.aadhar_url_back) return

        setLookingUp(index)
        try {
            const { lookupAadhar } = await import('@/lib/utils/merge-aadhar')
            const match = await lookupAadhar(digits)
            if (match) {
                setAadharMatches(prev => ({ ...prev, [index]: match }))
            }
        } catch {
            // silent
        } finally {
            setLookingUp(null)
        }
    }

    const applyAadharMerge = async (index: number) => {
        const match = aadharMatches[index]
        if (!match || !guestData[index]) return

        handleGuestChange(guestData[index].id, 'aadhar_url_front', match.aadhar_url_front)
        handleGuestChange(guestData[index].id, 'aadhar_url_back', match.aadhar_url_back)

        try {
            const { getAadharPublicUrl } = await import('@/lib/utils/merge-aadhar')
            if (match.stitched) {
                setAadharPreviews(prev => ({
                    ...prev,
                    [`${index}_stitched`]: getAadharPublicUrl(match.aadhar_url_front),
                }))
            } else {
                setAadharPreviews(prev => ({
                    ...prev,
                    [`${index}_front`]: getAadharPublicUrl(match.aadhar_url_front),
                    [`${index}_back`]: getAadharPublicUrl(match.aadhar_url_back),
                }))
            }
        } catch {
            // previews are non-critical
        }

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

    // Auto-lookup Aadhar for guests when payment view opens
    useEffect(() => {
        if (showPayment && guestData.length > 0) {
            guestData.forEach((g, i) => {
                if (g.phone && !g.aadhar_url_front && !g.aadhar_url_back) {
                    handlePhoneLookup(i, g.phone)
                }
            })
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showPayment])

    if (!booking) return null

    // Combined totals for group bookings
    const grandTotal = isGroupBooking
        ? groupBookings.reduce((sum, b) => sum + Number(b.grand_total), 0)
        : Number(booking.grand_total)
    const advanceAmount = isGroupBooking
        ? groupBookings.reduce((sum, b) => sum + (Number(b.advance_amount) || 0), 0)
        : Number(booking.advance_amount) || 0
    const balanceDue = Math.max(0, grandTotal - advanceAmount)

    const cashNum = Number(amountCash) || 0
    const digitalNum = Number(amountDigital) || 0
    const totalPaid = cashNum + digitalNum
    const paymentValid = Math.abs(totalPaid - balanceDue) <= 0.01

    const checkInDate = new Date(booking.check_in).toLocaleString('en-IN', {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    })

    const checkOutDate = booking.check_out
        ? new Date(booking.check_out).toLocaleString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
        : '—'

    const statusColors: Record<string, string> = {
        PENDING: 'bg-amber-100 text-amber-700',
        CONFIRMED: 'bg-blue-100 text-blue-700',
        CHECKED_IN: 'bg-emerald-100 text-emerald-700',
        CHECKED_OUT: 'bg-slate-100 text-slate-600',
        CANCELLED: 'bg-red-100 text-red-600',
    }

    const handleConvert = async () => {
        if (!paymentValid) {
            toast.error(`Payment ₹${totalPaid} doesn't match balance ₹${balanceDue}`)
            return
        }

        const isBypassEnabled = typeof window !== 'undefined' && localStorage.getItem('fajo_bypass_credentials') === 'true'
        if (!isBypassEnabled && !aadharBypass) {
            const missingAadhar = guestData.find((g) => !g.aadhar_url_front || !g.aadhar_url_back)
            if (missingAadhar) {
                toast.error(`Both Aadhar front and back photos are required for ${missingAadhar.name || 'all guests'}`)
                return
            }
        }

        setIsConverting(true)
        try {
            const formattedGuests = guestData.map((g) => ({
                ...g,
                aadhar_url_front: g.aadhar_url_front || null,
                aadhar_url_back: g.aadhar_url_back || null,
            }))

            const res = await fetch('/api/reservations/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    amountCash: cashNum,
                    amountDigital: digitalNum,
                    guests: formattedGuests,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Failed to convert reservation')
                return
            }

            toast.success(
                isGroupBooking
                    ? `${groupBookings.length} dorm beds checked in! Payment ₹${totalPaid.toLocaleString('en-IN')} recorded`
                    : `${booking.unit?.unit_number || 'Unit'} checked in! Payment ₹${totalPaid.toLocaleString('en-IN')} recorded`
            )
            resetPayment()
            onSuccess()
        } catch {
            toast.error('Network error. Please try again.')
        } finally {
            setIsConverting(false)
        }
    }

    const handleAadharCapture = async (index: number, side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

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
                    const guestName = (guestData[index]?.name || 'Guest').replace(/[^a-zA-Z0-9]/g, '_')
                    const phone = guestData[index]?.phone || '0000000000'
                    const dateStr = new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' }).replace(/\//g, '-')
                    const roomNum = booking.unit?.unit_number || guestData[index]?.unit_number || 'Unit'
                    const guestLabel = guestData.length > 1 ? `_Guest${index + 1}of${guestData.length}` : ''
                    const stitched = await stitchAadhar(updated.front, updated.back, {
                        roomNumber: roomNum, guestName: guestData[index]?.name || 'Guest', phone, date: dateStr,
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
                    handleGuestChange(guestData[index].id, 'aadhar_url_front', fileName)
                    handleGuestChange(guestData[index].id, 'aadhar_url_back', fileName)

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

    const handleCancel = async () => {
        setIsCancelling(true)
        try {
            const res = await fetch('/api/reservations/cancel', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    action: 'cancel',
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Failed to cancel reservation')
                return
            }

            toast.success(
                data.message ||
                    (isGroupBooking
                        ? `Dorm group reservation cancelled (${groupBookings.length} beds)`
                        : `Reservation for ${booking.unit?.unit_number || 'unit'} cancelled`)
            )
            onSuccess()
        } catch {
            toast.error('Failed to cancel reservation')
        } finally {
            setIsCancelling(false)
        }
    }

    const resetPayment = () => {
        // Clean up blob preview URLs to prevent memory leaks
        Object.values(aadharPreviews).forEach(url => URL.revokeObjectURL(url))
        setAadharPreviews({})
        setAadharMatches({})
        setPendingAadhar({})
        setAmountCash('')
        setAmountDigital('')
        setShowPayment(false)
        setAadharBypass(false)
    }

    const handleOpenChange = (openState: boolean) => {
        if (!openState) resetPayment()
        onOpenChange(openState)
    }

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-md border-l border-slate-200/80 shadow-2xl overflow-y-auto p-0">
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                                <CalendarCheck className="h-5 w-5" />
                            </div>
                            <div>
                                <SheetTitle className="text-xl font-semibold tracking-tight">
                                    {isGroupBooking
                                        ? `Dorm Group — ${groupBookings.length} Beds`
                                        : `Room ${booking.unit?.unit_number || '—'}`}
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    {isGroupBooking ? 'Dorm Group Reservation' : 'Reservation Details'}
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {/* Status Badge */}
                    <div className="flex items-center justify-between">
                        <span
                            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${statusColors[booking.status] || 'bg-slate-100 text-slate-600'}`}
                        >
                            {booking.status.replace('_', ' ')}
                        </span>
                        {booking.expected_arrival && (
                            <span className="flex items-center gap-1 text-xs text-slate-500">
                                <Clock className="h-3 w-3" />
                                {booking.expected_arrival}
                            </span>
                        )}
                    </div>

                    {/* Dorm Beds List (group only) */}
                    {isGroupBooking && (
                        <div className="rounded-xl border border-violet-200 bg-violet-50/50 p-4">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-400 mb-2">
                                Assigned Beds
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                                {groupBookings.map((b) => (
                                    <span
                                        key={b.id}
                                        className="px-2.5 py-1 rounded-lg bg-violet-100 text-violet-700 text-xs font-semibold"
                                    >
                                        {(b.unit as { unit_number?: string } | undefined)?.unit_number || '—'}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Stay Dates */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                            Stay Period
                        </p>
                        <div className="flex items-center gap-3 text-sm">
                            <div className="flex-1">
                                <p className="text-xs text-slate-400">
                                    Check-in
                                </p>
                                <p className="font-semibold text-slate-800">
                                    {checkInDate}
                                </p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-slate-300" />
                            <div className="flex-1">
                                <p className="text-xs text-slate-400">
                                    Check-out
                                </p>
                                <p className="font-semibold text-slate-800">
                                    {checkOutDate}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Guests */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Guests ({guestData.length})
                                </p>
                            </div>
                            {!isGroupBooking && (
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    onClick={addGuestToBooking}
                                    disabled={isAddingGuest}
                                    className="h-6 text-[10px] gap-1 border-dashed"
                                >
                                    <Plus className="h-3 w-3" />
                                    Add Guest
                                </Button>
                            )}
                        </div>
                        {guestData.map((g, i) => (
                            <div key={g.id || `guest-${i}`} className="space-y-3 border-b border-slate-100 last:border-0 pb-3 last:pb-0">
                                <div className="flex items-start gap-3 text-sm">
                                    <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold shrink-0 mt-1">
                                        {i + 1}
                                    </div>
                                    <div className="flex-1 min-w-0 space-y-1.5">
                                        <div className="grid grid-cols-2 gap-2">
                                            <Input
                                                value={g.name}
                                                onChange={(e) => handleGuestChange(g.id, 'name', e.target.value)}
                                                onBlur={() => saveGuestField(g.id, { name: g.name })}
                                                placeholder="Name"
                                                className="h-7 text-xs bg-white"
                                            />
                                            <Input
                                                value={g.phone}
                                                onChange={(e) => handleGuestChange(g.id, 'phone', e.target.value.replace(/\D/g, ''))}
                                                onBlur={() => saveGuestField(g.id, { phone: g.phone })}
                                                placeholder="Phone"
                                                maxLength={10}
                                                className="h-7 text-xs bg-white"
                                            />
                                        </div>
                                        {isGroupBooking && g.unit_number && (
                                            <p className="text-[10px] text-violet-500 font-medium">
                                                · Bed {g.unit_number}
                                            </p>
                                        )}
                                    </div>
                                    {i > 0 && !isGroupBooking && (
                                        <button
                                            type="button"
                                            onClick={() => removeGuestFromBooking(g.id, i)}
                                            className="text-slate-400 hover:text-red-500 mt-1.5"
                                            title="Remove guest"
                                        >
                                            <Trash2 className="h-3.5 w-3.5" />
                                        </button>
                                    )}
                                </div>
                                {showPayment && (
                                    <div className="pl-9 space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-300">
                                        <Label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                                            Aadhar Photos *
                                            {lookingUp === i && (
                                                <UserSearch className="inline h-3 w-3 text-blue-400 animate-pulse ml-1" />
                                            )}
                                        </Label>
                                        {aadharMatches[i] && (
                                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 mb-1 animate-in fade-in slide-in-from-top-1 duration-300">
                                                <p className="text-[10px] font-semibold text-blue-700 mb-1">
                                                    Returning guest — Aadhar on file
                                                </p>
                                                <p className="text-[9px] text-blue-600 mb-1.5">
                                                    {aadharMatches[i].name} ({aadharMatches[i].phone})
                                                </p>
                                                <div className="flex gap-2">
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        onClick={() => applyAadharMerge(i)}
                                                        className="h-6 text-[9px] bg-blue-600 hover:bg-blue-700 text-white gap-1 px-2"
                                                    >
                                                        <CheckCircle2 className="h-2.5 w-2.5" />
                                                        Use Previous Aadhar
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        size="sm"
                                                        variant="ghost"
                                                        onClick={() => dismissAadharMatch(i)}
                                                        className="h-6 text-[9px] text-blue-600 hover:text-blue-800 px-2"
                                                    >
                                                        Upload New
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                        {/* Stitched preview or already-on-file indicator */}
                                        {(aadharPreviews[`${i}_stitched`] || (g.aadhar_url_front && g.aadhar_url_back && g.aadhar_url_front === g.aadhar_url_back)) ? (
                                            <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                {aadharPreviews[`${i}_stitched`] ? (
                                                    <img
                                                        src={aadharPreviews[`${i}_stitched`]}
                                                        alt={`Aadhar Stitched - Guest ${i + 1}`}
                                                        className="w-full h-auto max-h-48 object-contain"
                                                    />
                                                ) : (
                                                    <div className="w-full h-24 flex items-center justify-center bg-emerald-50 text-emerald-600 text-[10px] font-medium">
                                                        Stitched Aadhar on file
                                                    </div>
                                                )}
                                                <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                    <CheckCircle2 className="h-2.5 w-2.5" />
                                                    Front + Back
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        setPendingAadhar(prev => { const n = { ...prev }; delete n[i]; return n })
                                                        setAadharPreviews(prev => {
                                                            const n = { ...prev }
                                                            delete n[`${i}_front`]
                                                            delete n[`${i}_back`]
                                                            delete n[`${i}_stitched`]
                                                            return n
                                                        })
                                                        handleGuestChange(g.id, 'aadhar_url_front', '')
                                                        handleGuestChange(g.id, 'aadhar_url_back', '')
                                                    }}
                                                    className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors"
                                                >
                                                    Re-capture
                                                </button>
                                            </div>
                                        ) : (g.aadhar_url_front && g.aadhar_url_back) ? (
                                            /* Legacy separate front/back already on file */
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">Front</p>
                                                    <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                        {aadharPreviews[`${i}_front`] ? (
                                                            <img src={aadharPreviews[`${i}_front`]} alt={`Aadhar Front - Guest ${i + 1}`} className="w-full h-24 object-cover" />
                                                        ) : (
                                                            <div className="w-full h-24 flex items-center justify-center bg-emerald-50 text-emerald-600 text-[10px] font-medium">Front on file</div>
                                                        )}
                                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">Back</p>
                                                    <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                        {aadharPreviews[`${i}_back`] ? (
                                                            <img src={aadharPreviews[`${i}_back`]} alt={`Aadhar Back - Guest ${i + 1}`} className="w-full h-24 object-cover" />
                                                        ) : (
                                                            <div className="w-full h-24 flex items-center justify-center bg-emerald-50 text-emerald-600 text-[10px] font-medium">Back on file</div>
                                                        )}
                                                        <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                            <CheckCircle2 className="h-2.5 w-2.5" />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ) : (
                                            /* Capture flow: front then back, auto-stitches */
                                            <div className="grid grid-cols-2 gap-2">
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">Front</p>
                                                    {aadharPreviews[`${i}_front`] ? (
                                                        <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                            <img src={aadharPreviews[`${i}_front`]} alt={`Aadhar Front - Guest ${i + 1}`} className="w-full h-24 object-cover" />
                                                            <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                                <CheckCircle2 className="h-2.5 w-2.5" />
                                                            </div>
                                                            <label className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors">
                                                                Replace
                                                                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleAadharCapture(i, 'front', e)} />
                                                            </label>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-2 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                                            <Camera className="h-4 w-4 text-slate-400" />
                                                            <span className="text-[9px] font-semibold text-slate-500">
                                                                {uploadingIndex === i ? 'Stitching...' : 'Capture Front'}
                                                            </span>
                                                            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploadingIndex !== null} onChange={(e) => handleAadharCapture(i, 'front', e)} />
                                                        </label>
                                                    )}
                                                </div>
                                                <div className="space-y-1">
                                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 text-center">Back</p>
                                                    {aadharPreviews[`${i}_back`] ? (
                                                        <div className="relative rounded-lg border border-emerald-200 bg-emerald-50/50 overflow-hidden">
                                                            <img src={aadharPreviews[`${i}_back`]} alt={`Aadhar Back - Guest ${i + 1}`} className="w-full h-24 object-cover" />
                                                            <div className="absolute top-1 right-1 flex items-center gap-0.5 bg-emerald-600 text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                                                                <CheckCircle2 className="h-2.5 w-2.5" />
                                                            </div>
                                                            <label className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-center text-[10px] py-1 cursor-pointer hover:bg-black/60 transition-colors">
                                                                Replace
                                                                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => handleAadharCapture(i, 'back', e)} />
                                                            </label>
                                                        </div>
                                                    ) : (
                                                        <label className="flex flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-300 px-2 py-3 cursor-pointer hover:bg-slate-50 hover:border-slate-400 transition-colors">
                                                            <Camera className="h-4 w-4 text-slate-400" />
                                                            <span className="text-[9px] font-semibold text-slate-500">
                                                                {uploadingIndex === i ? 'Stitching...' : 'Capture Back'}
                                                            </span>
                                                            <input type="file" accept="image/*" capture="environment" className="sr-only" disabled={uploadingIndex !== null} onChange={(e) => handleAadharCapture(i, 'back', e)} />
                                                        </label>
                                                    )}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* Billing */}
                    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-2 text-sm">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Billing{isGroupBooking ? ' (Combined)' : ''}
                        </p>
                        <div className="flex justify-between text-slate-600">
                            <span>Grand Total</span>
                            <span className="font-semibold">
                                ₹{grandTotal.toLocaleString('en-IN')}
                            </span>
                        </div>
                        {advanceAmount > 0 && (
                            <div className="flex justify-between text-blue-600 font-medium">
                                <span className="flex items-center gap-1">
                                    {booking.advance_type === 'CASH' ? (
                                        <Banknote className="h-3 w-3" />
                                    ) : (
                                        <Smartphone className="h-3 w-3" />
                                    )}
                                    Advance ({booking.advance_type || 'CASH'})
                                </span>
                                <span>
                                    -₹{advanceAmount.toLocaleString('en-IN')}
                                </span>
                            </div>
                        )}
                        <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-slate-900">
                            <span>Balance Due</span>
                            <span className="text-emerald-600">
                                ₹{balanceDue.toLocaleString('en-IN')}
                            </span>
                        </div>
                    </div>

                    {/* Notes */}
                    {booking.notes && (
                        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-600">
                            <span className="font-semibold text-slate-400">
                                Notes:{' '}
                            </span>
                            {booking.notes}
                        </div>
                    )}

                    {/* Actions for CONFIRMED */}
                    {booking.status === 'CONFIRMED' && (
                        <div className="space-y-3">
                            {!showPayment ? (
                                <>
                                    <Button
                                        onClick={() => setShowPayment(true)}
                                        className="w-full h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 rounded-xl transition-all active:scale-[0.98]"
                                    >
                                        <span className="flex items-center gap-2">
                                            <UserCheck className="h-4 w-4" />
                                            {isGroupBooking
                                                ? `Convert ${groupBookings.length} Beds to Check-In`
                                                : 'Convert to Check-In'}
                                        </span>
                                    </Button>
                                    <Button
                                        variant="outline"
                                        onClick={handleCancel}
                                        disabled={isCancelling}
                                        className="w-full h-10 text-sm font-medium border-red-200 text-red-600 hover:bg-red-50 rounded-xl"
                                    >
                                        {isCancelling ? (
                                            <span className="flex items-center gap-2">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-400 border-t-transparent" />
                                                Cancelling...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <XCircle className="h-4 w-4" />
                                                {isGroupBooking
                                                    ? `Cancel All ${groupBookings.length} Beds`
                                                    : 'Cancel Reservation'}
                                            </span>
                                        )}
                                    </Button>
                                </>
                            ) : (
                                <>
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

                                    {/* Payment Collection */}
                                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-3">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-600">
                                            Collect Payment — ₹{balanceDue.toLocaleString('en-IN')} Due
                                        </p>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Banknote className="h-3 w-3" />
                                                    Cash (₹)
                                                </Label>
                                                <Input
                                                    type="number"
                                                    placeholder="0"
                                                    value={amountCash}
                                                    onChange={(e) => setAmountCash(e.target.value)}
                                                    className="h-10 text-sm bg-white font-semibold"
                                                />
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-xs text-slate-500 flex items-center gap-1">
                                                    <Smartphone className="h-3 w-3" />
                                                    Digital (₹)
                                                </Label>
                                                <Input
                                                    type="number"
                                                    placeholder="0"
                                                    value={amountDigital}
                                                    onChange={(e) => setAmountDigital(e.target.value)}
                                                    className="h-10 text-sm bg-white font-semibold"
                                                />
                                            </div>
                                        </div>

                                        {/* Payment status */}
                                        <div className={`flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold ${paymentValid
                                            ? 'bg-emerald-100 text-emerald-700'
                                            : 'bg-red-100 text-red-600'
                                            }`}>
                                            <span>₹{totalPaid.toLocaleString('en-IN')} / ₹{balanceDue.toLocaleString('en-IN')}</span>
                                            <span>{paymentValid ? '✓ Matched' : `₹${Math.abs(balanceDue - totalPaid).toLocaleString('en-IN')} remaining`}</span>
                                        </div>
                                    </div>

                                    <Button
                                        onClick={handleConvert}
                                        disabled={isConverting || !paymentValid}
                                        className={`w-full h-12 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] ${paymentValid
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20'
                                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            }`}
                                    >
                                        {isConverting ? (
                                            <span className="flex items-center gap-2">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                Converting...
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <UserCheck className="h-4 w-4" />
                                                {isGroupBooking
                                                    ? `Check-In ${groupBookings.length} Beds · ₹${totalPaid.toLocaleString('en-IN')}`
                                                    : `Confirm Check-In · ₹${totalPaid.toLocaleString('en-IN')}`}
                                            </span>
                                        )}
                                    </Button>

                                    <button
                                        onClick={() => { resetPayment() }}
                                        className="w-full text-xs text-slate-400 hover:text-slate-600 py-1 transition-colors"
                                    >
                                        ← Back
                                    </button>
                                </>
                            )}
                        </div>
                    )}

                    {booking.status === 'PENDING' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center mb-3">
                            <p className="text-sm text-amber-700 font-medium">This reservation is pending confirmation.</p>
                        </div>
                    )}

                    {booking.status === 'PENDING' && (
                        <Button
                            disabled={isConfirmingRes}
                            onClick={async () => {
                                if (isConfirmingRes) return
                                setIsConfirmingRes(true)
                                try {
                                    const res = await fetch('/api/reservations/cancel', {
                                        method: 'PATCH',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ bookingId: booking.id, action: 'edit', updates: { status: 'CONFIRMED' } }),
                                    })
                                    if (!res.ok) { const j = await res.json(); throw new Error(j.error) }
                                    toast.success('Reservation confirmed')
                                    onOpenChange(false)
                                } catch (err: unknown) {
                                    toast.error(err instanceof Error ? err.message : 'Failed to confirm')
                                } finally {
                                    setIsConfirmingRes(false)
                                }
                            }}
                            className="w-full h-10 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-xl mb-2"
                        >
                            Confirm Reservation
                        </Button>
                    )}

                    {booking.status === 'PENDING' && (
                        <Button
                            variant="outline"
                            onClick={handleCancel}
                            disabled={isCancelling}
                            className="w-full h-10 text-sm font-medium border-red-200 text-red-600 hover:bg-red-50 rounded-xl"
                        >
                            <span className="flex items-center gap-2">
                                <XCircle className="h-4 w-4" />
                                Cancel Reservation
                            </span>
                        </Button>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
