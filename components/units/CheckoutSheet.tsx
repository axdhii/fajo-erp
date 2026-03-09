'use client'

import { useState, useEffect } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import type { Booking, Guest } from '@/lib/types'
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
    User,
    AlertCircle,
    Banknote,
    Smartphone,
    IndianRupee,
} from 'lucide-react'

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
    const [payment, setPayment] = useState<any>(null)
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [isLoadingBooking, setIsLoadingBooking] = useState(false)

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

    if (!unit) return null

    const handleCheckout = async () => {
        if (!booking) {
            toast.error('No active booking found')
            return
        }

        setIsSubmitting(true)

        try {
            const res = await fetch('/api/bookings/checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
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

            setBooking(null)
            setPayment(null)
            onSuccess()
        } catch (err) {
            toast.error('Network error. Please try again.')
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) {
            setBooking(null)
            setPayment(null)
        }
        onOpenChange(openState)
    }

    const checkInTime = booking
        ? new Date(booking.check_in).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
        : ''

    const checkOutTime = booking?.check_out
        ? new Date(booking.check_out).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
        : '—'

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
                        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-2">
                            <div className="flex items-center gap-2 mb-2">
                                <Clock className="h-4 w-4 text-slate-400" />
                                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                    Stay Details
                                </p>
                            </div>
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Check-in</span>
                                <span className="font-medium">{checkInTime}</span>
                            </div>
                            <div className="flex justify-between text-sm text-slate-600">
                                <span>Expected Check-out</span>
                                <span className="font-medium">{checkOutTime}</span>
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
                                        <span>Extra Head Surcharge</span>
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

                        {/* Checkout Confirmation */}
                        <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                            <p className="text-sm text-amber-800 font-medium">
                                Are you sure you want to check out this guest?
                            </p>
                            <p className="text-xs text-amber-600 mt-1">
                                The room will be marked as Dirty for housekeeping.
                            </p>
                        </div>

                        {/* Submit */}
                        <Button
                            onClick={handleCheckout}
                            disabled={isSubmitting}
                            className="w-full h-12 text-sm font-semibold rounded-xl transition-all active:scale-[0.98] bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-600/20"
                        >
                            {isSubmitting ? (
                                <span className="flex items-center gap-2">
                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                    Processing...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <LogOut className="h-4 w-4" />
                                    Confirm Check-Out
                                </span>
                            )}
                        </Button>
                    </div>
                )}
            </SheetContent>
        </Sheet>
    )
}
