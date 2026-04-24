'use client'

import { useState, useMemo, useEffect } from 'react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { UnitWithBooking } from '@/lib/store/unit-store'
import { Clock, Calendar, AlertTriangle, Plus, Minus, ArrowRight } from 'lucide-react'

interface ExtendSheetProps {
    unit: UnitWithBooking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function ExtendSheet({ unit, open, onOpenChange, onSuccess }: ExtendSheetProps) {
    const [extendType, setExtendType] = useState<'HOURS' | 'DAYS'>('HOURS')
    const [amount, setAmount] = useState(1)
    const [fee, setFee] = useState('')
    const [paymentType, setPaymentType] = useState<'CASH' | 'DIGITAL'>('CASH')
    const [isSubmitting, setIsSubmitting] = useState(false)
    const [conflictError, setConflictError] = useState<string | null>(null)

    const booking = unit?.active_booking

    // Reset form when opened with a new unit
    useEffect(() => {
        if (open) {
            setExtendType('HOURS')
            setAmount(1)
            setFee('')
            setPaymentType('CASH')
            setConflictError(null)
        }
    }, [open, unit])

    // Reset amount when switching between Hours/Days
    useEffect(() => {
        setAmount(1)
    }, [extendType])

    const oldCheckOut = booking?.check_out ? new Date(booking.check_out) : null

    const newCheckOutPreview = useMemo(() => {
        if (!oldCheckOut || !unit) return null
        // Use pseudo-IST math to match the server-side calculation exactly
        const istOffsetMs = 5.5 * 60 * 60 * 1000
        const pseudoIst = new Date(oldCheckOut.getTime() + istOffsetMs)
        if (extendType === 'HOURS') {
            pseudoIst.setUTCHours(pseudoIst.getUTCHours() + amount)
        } else {
            pseudoIst.setUTCDate(pseudoIst.getUTCDate() + amount)
            // Don't reset time — preserve any previous hourly extensions (matches server)
        }
        return new Date(pseudoIst.getTime() - istOffsetMs)
    }, [oldCheckOut, extendType, amount, unit])

    const handleSubmit = async () => {
        if (!booking) return
        if (isSubmitting) return

        setIsSubmitting(true)
        setConflictError(null)

        try {
            const res = await fetch('/api/bookings/extend', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    bookingId: booking.id,
                    extendType,
                    amount,
                    fee: Number(fee) || 0,
                    paymentType: Number(fee) > 0 ? paymentType : null,
                }),
            })

            const data = await res.json()

            if (res.status === 409) {
                setConflictError(data.error || 'Conflict')
                toast.error(data.error)
                return
            }

            if (!res.ok) {
                toast.error(data.error || 'Failed to extend stay')
                return
            }

            toast.success('Stay extended successfully!')
            onSuccess()
        } catch {
            toast.error('Network error')
        } finally {
            setIsSubmitting(false)
        }
    }

    if (!unit || !booking || unit.status !== 'OCCUPIED') return null

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-md border-l border-slate-200/80 shadow-2xl p-0 overflow-y-auto">
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader>
                        <SheetTitle className="text-xl font-bold flex items-center gap-2">
                            <Clock className="h-5 w-5 text-blue-500" />
                            Extend Stay
                        </SheetTitle>
                        <SheetDescription className="text-xs">
                            Extend current booking for Room {unit.unit_number} before upcoming reservations.
                        </SheetDescription>
                    </SheetHeader>
                </div>

                <div className="px-6 py-6 space-y-6">
                    {/* Toggle Type */}
                    <div className="flex bg-slate-100 p-1 rounded-xl">
                        <button
                            onClick={() => setExtendType('HOURS')}
                            className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${extendType === 'HOURS' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Clock className="h-4 w-4" /> Hours
                        </button>
                        <button
                            onClick={() => setExtendType('DAYS')}
                            className={`flex flex-1 items-center justify-center gap-2 py-2 text-sm font-semibold rounded-lg transition-all ${extendType === 'DAYS' ? 'bg-white shadow text-blue-600' : 'text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Calendar className="h-4 w-4" /> Days
                        </button>
                    </div>

                    {/* Amount Input */}
                    <div className="space-y-3">
                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Number of {extendType.toLowerCase()} to add
                        </Label>
                        <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3">
                            <button
                                type="button"
                                onClick={() => setAmount((n) => Math.max(1, n - 1))}
                                disabled={amount <= 1}
                                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 transition-colors"
                            >
                                <Minus className="h-4 w-4 text-slate-600" />
                            </button>
                            <span className="text-lg font-bold text-slate-800 w-12 text-center">
                                {amount}
                            </span>
                            <button
                                type="button"
                                onClick={() => setAmount((n) => n + 1)}
                                className="flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors"
                            >
                                <Plus className="h-4 w-4 text-slate-600" />
                            </button>
                        </div>
                    </div>

                    {/* Date Preview Comparison */}
                    {oldCheckOut && newCheckOutPreview && (
                        <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 space-y-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-blue-400">
                                Checkout Time Change
                            </p>
                            <div className="flex items-center justify-between text-sm">
                                <div className="space-y-1">
                                    <p className="text-xs text-slate-500">Current</p>
                                    <p className="font-semibold text-slate-700 line-through opacity-70">
                                        {oldCheckOut.toLocaleString('en-IN', {
                                            timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                                <ArrowRight className="h-4 w-4 text-blue-300 mx-2" />
                                <div className="space-y-1 text-right">
                                    <p className="text-xs text-blue-500 font-medium">New</p>
                                    <p className="font-bold text-blue-700">
                                        {newCheckOutPreview.toLocaleString('en-IN', {
                                            timeZone: 'Asia/Kolkata', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
                                        })}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Fee Override */}
                    <div className="space-y-3">
                        <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                            Extension Fee (₹)
                        </Label>
                        <Input
                            type="number"
                            placeholder="Amount to add to bill (e.g. 500)"
                            value={fee}
                            onChange={(e) => setFee(e.target.value)}
                            className="h-12 text-lg bg-white border-slate-200 shadow-sm transition-colors focus:border-blue-400 focus:ring-blue-400/20"
                        />
                        <p className="text-[10px] text-slate-500">
                            This amount will be added to the booking&apos;s grand total. Leave 0 if free extension.
                        </p>
                    </div>

                    {/* Payment Type Selection */}
                    {Number(fee) > 0 && (
                        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                            <Label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                                Payment Method
                            </Label>
                            <div className="flex bg-slate-100 p-1 rounded-xl">
                                <button
                                    onClick={() => setPaymentType('CASH')}
                                    className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${paymentType === 'CASH' ? 'bg-white shadow-sm text-blue-600 border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    Cash
                                </button>
                                <button
                                    onClick={() => setPaymentType('DIGITAL')}
                                    className={`flex flex-1 items-center justify-center gap-2 py-2.5 text-sm font-semibold rounded-lg transition-all ${paymentType === 'DIGITAL' ? 'bg-white shadow-sm text-blue-600 border border-slate-200/50' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                >
                                    Digital (UPI/Card)
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Conflict Error */}
                    {conflictError && (
                        <div className="flex items-start gap-3 rounded-xl bg-red-50 border border-red-200 p-4">
                            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                            <p className="text-xs text-red-700 font-medium leading-relaxed">
                                {conflictError}
                            </p>
                        </div>
                    )}
                </div>

                <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-slate-100 p-6">
                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting}
                        className="w-full h-12 text-sm font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {isSubmitting ? 'Verifying...' : 'Confirm Extension'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
