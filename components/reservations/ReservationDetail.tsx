'use client'

import { useState, useMemo } from 'react'
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
import {
    CalendarCheck,
    UserCheck,
    XCircle,
    Users,
    Clock,
    IndianRupee,
    Banknote,
    Smartphone,
    ArrowRight,
} from 'lucide-react'

interface ReservationDetailProps {
    booking: Booking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function ReservationDetail({
    booking,
    open,
    onOpenChange,
    onSuccess,
}: ReservationDetailProps) {
    const [isConverting, setIsConverting] = useState(false)
    const [isCancelling, setIsCancelling] = useState(false)
    const [showPayment, setShowPayment] = useState(false)
    const [amountCash, setAmountCash] = useState('')
    const [amountDigital, setAmountDigital] = useState('')

    if (!booking) return null

    const unitNumber = (booking as any).unit?.unit_number || '—'
    const guests = (booking as any).guests || []
    const advanceAmount = Number(booking.advance_amount) || 0
    const grandTotal = Number(booking.grand_total)
    const balanceDue = Math.max(0, grandTotal - advanceAmount)

    const cashNum = Number(amountCash) || 0
    const digitalNum = Number(amountDigital) || 0
    const totalPaid = cashNum + digitalNum
    const paymentValid = Math.abs(totalPaid - balanceDue) < 1

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

        setIsConverting(true)
        try {
            const res = await fetch('/api/reservations/convert', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    amountCash: cashNum,
                    amountDigital: digitalNum,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Failed to convert reservation')
                return
            }

            toast.success(
                `${unitNumber} checked in! Payment ₹${totalPaid.toLocaleString('en-IN')} recorded`
            )
            resetPayment()
            onSuccess()
        } catch (err) {
            toast.error('Network error. Please try again.')
        } finally {
            setIsConverting(false)
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

            toast.success(data.message || `Reservation for ${unitNumber} cancelled`)
            onSuccess()
        } catch (err) {
            toast.error('Failed to cancel reservation')
        } finally {
            setIsCancelling(false)
        }
    }

    const resetPayment = () => {
        setAmountCash('')
        setAmountDigital('')
        setShowPayment(false)
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
                                    Room {unitNumber}
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    Reservation Details
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
                        <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-slate-400" />
                            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                Guests ({guests.length})
                            </p>
                        </div>
                        {guests.map((g: Guest, i: number) => (
                            <div key={i} className="flex items-center gap-3 text-sm">
                                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-[10px] font-bold">
                                    {i + 1}
                                </div>
                                <div>
                                    <p className="font-medium text-slate-800">
                                        {g.name}
                                    </p>
                                    <p className="text-xs text-slate-400">
                                        {g.phone}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Billing */}
                    <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-2 text-sm">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            Billing
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
                                    Advance ({booking.advance_type})
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
                                            Convert to Check-In
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
                                                Cancel Reservation
                                            </span>
                                        )}
                                    </Button>
                                </>
                            ) : (
                                <>
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
                                                Confirm Check-In · ₹{totalPaid.toLocaleString('en-IN')}
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
