'use client'

import { useState, useEffect } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import { Booking, Guest, Payment } from '@/lib/types'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'
import {
    LogOut,
    Users,
    Clock,
    AlertCircle,
    Banknote,
    Smartphone,
    IndianRupee,
    Printer,
    CheckCircle2,
    ArrowRight,
} from 'lucide-react'
import { useCurrentTime } from '@/lib/hooks/use-current-time'

interface CheckoutSheetProps {
    unit: UnitWithBooking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function CheckoutSheet({
    unit,
    open,
    onOpenChange,
    onSuccess,
}: CheckoutSheetProps) {
    const [booking, setBooking] = useState<Booking | null>(null)
    const [payment, setPayment] = useState<Payment | null>(null)
    const [amountCash, setAmountCash] = useState('')
    const [amountDigital, setAmountDigital] = useState('')
    const [successBookingId, setSuccessBookingId] = useState<string | null>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoadingBooking, setIsLoadingBooking] = useState(false)
    const now = useCurrentTime(60000)

    // Fetch the active booking with guests and payment when sheet opens
    useEffect(() => {
        if (open && unit?.status === 'OCCUPIED') {
            setIsLoadingBooking(true)
            const fetchBooking = async () => {
                const { data, error } = await supabase
                    .from('bookings')
                    .select('*, guests(*)')
                    .eq('unit_id', unit.id)
                    .eq('status', 'CHECKED_IN')
                    .order('created_at', { ascending: false })
                    .limit(1)
                    .single()

                if (error) {
                    console.error('Failed to fetch booking:', error)
                    toast.error('Could not load booking details')
                } else {
                    setBooking(data as Booking)

                    // Fetch payment
                    const { data: paymentData } = await supabase
                        .from('payments')
                        .select('*')
                        .eq('booking_id', data.id)
                        .limit(1)
                        .single()

                    if (paymentData) setPayment(paymentData)
                }
                setIsLoadingBooking(false)
            }
            fetchBooking()
        }
    }, [open, unit])

// No bypass logically needed here anymore

    if (!unit) return null

    const handleCheckout = async () => {
        if (!booking) {
            toast.error('No active booking found')
            return
        }

        if (!isPaymentValid) {
            toast.error(`Please collect exactly ₹${balanceDue} before checking out.`)
            return
        }

        setIsSubmitting(true)

        try {

            const res = await fetch('/api/bookings/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    amountCash: cashInput,
                    amountDigital: digitalInput,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Checkout failed')
                return
            }

            toast.success(
                `Checked out ${unit.unit_number} successfully`
            )

            setSuccessBookingId(booking.id)
        } catch {
            toast.error('Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) {
            setBooking(null)
            setPayment(null)
            setAmountCash('')
            setAmountDigital('')
            if (successBookingId) onSuccess()
            setSuccessBookingId(null)
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
                            <h2 className="text-2xl font-black text-slate-900 tracking-tight">Check-Out Complete!</h2>
                            <p className="text-slate-500 mt-2 text-sm">Room {unit.unit_number} has been checked out successfully.</p>
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
                                onClick={() => resetAndClose(false)}
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

    const checkInTime = booking
        ? new Date(booking.check_in).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
        : ''

    const expectedCheckout = booking?.check_out
        ? new Date(booking.check_out).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
        : '—'

    const actualCheckoutTime = now.toLocaleString('en-IN', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
    })

    const grandTotal = booking ? Number(booking.grand_total) : 0
    const advanceAmount = booking ? (Number(booking.advance_amount) || 0) : 0
    const totalPaid = payment ? Number(payment.total_paid) : 0
    const balanceDue = Math.max(0, grandTotal - advanceAmount - totalPaid)

    const cashInput = Number(amountCash) || 0
    const digitalInput = Number(amountDigital) || 0
    const checkoutTotal = cashInput + digitalInput

    // Valid if balance is 0, OR if total collected matches balance due
    const isPaymentValid = balanceDue === 0 || Math.abs(checkoutTotal - balanceDue) < 1

    // Disable if submitting or payment invalid
    const checkoutDisabled = isSubmitting || !isPaymentValid

    return (
        <Sheet open={open} onOpenChange={resetAndClose}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-lg border-l border-slate-200/80 shadow-2xl overflow-y-auto p-0">
                {/* Header */}
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                                <LogOut className="h-5 w-5" />
                            </div>
                            <div>
                                <SheetTitle className="text-xl font-semibold tracking-tight">
                                    Check-Out · {unit.unit_number}
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    {checkInTime
                                        ? `Checked in ${checkInTime}`
                                        : 'Processing checkout'}
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                {isLoadingBooking ? (
                    <div className="flex items-center justify-center py-20">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                    </div>
                ) : !booking ? (
                    <div className="px-6 py-12 text-center text-slate-400">
                        <AlertCircle className="h-10 w-10 mx-auto mb-3 text-slate-300" />
                        <p className="text-sm font-medium">
                            No active booking found
                        </p>
                    </div>
                ) : (
                    <div className="px-6 py-5 space-y-5">
                        {/* Guest Summary */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <Users className="h-4 w-4 text-slate-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Guests ({booking.guests?.length || 0})
                                </p>
                            </div>
                            <div className="space-y-2">
                                {booking.guests?.map(
                                    (guest: Guest, i: number) => (
                                        <div
                                            key={guest.id}
                                            className="flex items-center gap-3 text-sm"
                                        >
                                            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-bold">
                                                {i + 1}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-medium text-slate-800 truncate">
                                                    {guest.name}
                                                </p>
                                                <p className="text-xs text-slate-400">
                                                    {guest.phone}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        </div>

                        {/* Stay Details */}
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                            <div className="flex items-center gap-2 mb-1">
                                <Clock className="h-4 w-4 text-slate-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Stay Details
                                </p>
                            </div>
                            <div className="flex items-center gap-3 text-sm">
                                <div className="flex-1">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Check-in</p>
                                    <p className="font-semibold text-slate-800">{checkInTime}</p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-slate-300 shrink-0" />
                                <div className="flex-1 text-right">
                                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Expected</p>
                                    <p className="font-semibold text-slate-800">{expectedCheckout}</p>
                                </div>
                            </div>
                            <div className="border-t border-slate-200 pt-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">Checkout Time</span>
                                    <span className="text-sm font-bold text-emerald-700">{actualCheckoutTime}</span>
                                </div>
                            </div>
                        </div>

                        {/* Payment Summary (already collected) */}
                        <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50 to-white p-4 space-y-3">
                            <div className="flex items-center gap-2">
                                <IndianRupee className="h-4 w-4 text-slate-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Payment (Collected at Check-in)
                                </p>
                            </div>

                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between text-slate-600">
                                    <span>Base Amount</span>
                                    <span>
                                        ₹{Number(booking.base_amount).toLocaleString('en-IN')}
                                    </span>
                                </div>

                                {Number(booking.surcharge) > 0 && (
                                    <div className="flex justify-between text-amber-600 font-medium">
                                        <span>Additional Charges</span>
                                        <span>
                                            +₹{Number(booking.surcharge).toLocaleString('en-IN')}
                                        </span>
                                    </div>
                                )}

                                <div className="border-t border-slate-200 pt-2 flex justify-between font-bold text-lg text-slate-900">
                                    <span>Grand Total</span>
                                    <span className="text-emerald-600">
                                        ₹{Number(booking.grand_total).toLocaleString('en-IN')}
                                    </span>
                                </div>

                                {payment && (
                                    <div className="border-t border-dashed border-slate-200 pt-2 space-y-1">
                                        <div className="flex justify-between text-slate-500">
                                            <span className="flex items-center gap-1.5">
                                                <Banknote className="h-3 w-3 text-green-600" />
                                                Cash
                                            </span>
                                            <span>₹{Number(payment.amount_cash).toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span className="flex items-center gap-1.5">
                                                <Smartphone className="h-3 w-3 text-blue-600" />
                                                Digital
                                            </span>
                                            <span>₹{Number(payment.amount_digital).toLocaleString('en-IN')}</span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Balance Collection (Pay Later) */}
                        {balanceDue > 0 && (
                            <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 space-y-4">
                                <div className="flex items-center gap-2">
                                    <AlertCircle className="h-4 w-4 text-rose-500" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-rose-500">
                                        Pending Balance Due
                                    </p>
                                </div>
                                <div className="flex justify-between items-center bg-white p-3 rounded-lg border border-rose-100 shadow-sm">
                                    <span className="text-sm font-semibold text-slate-700">Amount to Collect</span>
                                    <span className="text-lg font-bold text-rose-600">₹{balanceDue.toLocaleString('en-IN')}</span>
                                </div>
                                <div className="space-y-3">
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-600">Cash Received (₹)</label>
                                        <div className="relative">
                                            <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full pl-9 h-10 rounded-lg border border-slate-200 bg-white text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20 transition-all font-medium"
                                                placeholder="0"
                                                value={amountCash}
                                                onChange={(e) => setAmountCash(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-xs font-semibold text-slate-600">Digital Received (₹)</label>
                                        <div className="relative">
                                            <Smartphone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-600" />
                                            <input
                                                type="number"
                                                min="0"
                                                className="w-full pl-9 h-10 rounded-lg border border-slate-200 bg-white text-sm focus:border-rose-400 focus:outline-none focus:ring-2 focus:ring-rose-400/20 transition-all font-medium"
                                                placeholder="0"
                                                value={amountDigital}
                                                onChange={(e) => setAmountDigital(e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Submit */}
                        <Button
                            onClick={handleCheckout}
                            disabled={checkoutDisabled}
                            className={`w-full h-12 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] disabled:bg-slate-300 disabled:text-slate-500 shadow-xl disabled:shadow-none bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20`}
                        >
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Processing...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <LogOut className="h-4 w-4" />
                                    {'Confirm Check-Out' + (balanceDue > 0 ? ` & Collect ₹${checkoutTotal.toLocaleString('en-IN')}` : '')}
                                </span>
                            )}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
