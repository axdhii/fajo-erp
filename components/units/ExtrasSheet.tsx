'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Package, Banknote, Smartphone, Plus } from 'lucide-react'
import type { BookingExtra, ExtraCatalogItem } from '@/lib/types'

interface ExtrasSheetProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    bookingId: string | null
    unitNumber: string
    hotelId: string
    onSuccess?: () => void
}

export function ExtrasSheet({ open, onOpenChange, bookingId, unitNumber, hotelId, onSuccess }: ExtrasSheetProps) {
    const [catalog, setCatalog] = useState<ExtraCatalogItem[]>([])
    const [existingExtras, setExistingExtras] = useState<BookingExtra[]>([])
    const [loading, setLoading] = useState(false)

    // Form state
    const [selectedItem, setSelectedItem] = useState<string>('')
    const [customDesc, setCustomDesc] = useState('')
    const [customAmount, setCustomAmount] = useState('')
    const [itemAmount, setItemAmount] = useState('')
    const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'DIGITAL'>('CASH')
    const [submitting, setSubmitting] = useState(false)
    const [isCustom, setIsCustom] = useState(false)

    // Fetch catalog + existing extras on open
    const fetchData = useCallback(async () => {
        if (!open || !bookingId) return
        setLoading(true)

        // Fetch hotel catalog
        const { data: hotel } = await supabase
            .from('hotels')
            .select('extras_catalog')
            .eq('id', hotelId)
            .single()
        if (hotel?.extras_catalog) {
            setCatalog(Array.isArray(hotel.extras_catalog) ? hotel.extras_catalog : [])
        }

        // Fetch existing extras
        try {
            const res = await fetch(`/api/booking-extras?booking_id=${bookingId}`)
            if (res.ok) {
                const json = await res.json()
                setExistingExtras(Array.isArray(json.data) ? json.data : [])
            }
        } catch {}

        setLoading(false)
    }, [open, bookingId, hotelId])

    useEffect(() => {
        if (open) {
            fetchData()
            // Reset form
            setSelectedItem('')
            setCustomDesc('')
            setCustomAmount('')
            setItemAmount('')
            setIsCustom(false)
            setPaymentMethod('CASH')
        }
    }, [open, fetchData])

    const selectCatalogItem = (item: ExtraCatalogItem) => {
        setIsCustom(false)
        setSelectedItem(item.name)
        setItemAmount(String(item.price))
    }

    const selectCustom = () => {
        setIsCustom(true)
        setSelectedItem('')
        setItemAmount('')
    }

    const handleSubmit = async () => {
        const desc = isCustom ? customDesc.trim() : selectedItem
        const amt = isCustom ? Number(customAmount) : Number(itemAmount)

        if (!desc) { toast.error('Please select an item or enter a description'); return }
        if (!amt || amt <= 0) { toast.error('Amount must be greater than 0'); return }

        setSubmitting(true)
        try {
            const res = await fetch('/api/booking-extras', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    booking_id: bookingId,
                    description: desc,
                    amount: amt,
                    payment_method: paymentMethod,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            toast.success(`${desc} — ₹${amt} ${paymentMethod} recorded`)
            // Reset form
            setSelectedItem('')
            setCustomDesc('')
            setCustomAmount('')
            setItemAmount('')
            setIsCustom(false)
            // Refresh list
            fetchData()
            onSuccess?.()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to add extra')
        } finally {
            setSubmitting(false)
        }
    }

    const formatCurrency = (n: number) =>
        new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n)

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent side="right" className="w-full sm:max-w-[400px] flex flex-col p-0">
                <SheetHeader className="border-b border-slate-100 px-5 py-4">
                    <SheetTitle className="flex items-center gap-2 text-base">
                        <Package className="h-5 w-5 text-emerald-600" />
                        Room {unitNumber} — Extras
                    </SheetTitle>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                    {loading ? (
                        <div className="text-center py-8 text-slate-400 text-sm">Loading...</div>
                    ) : (
                        <>
                            {/* Catalog Items */}
                            <div className="space-y-2">
                                <Label className="text-xs text-slate-500 uppercase tracking-wider font-bold">Quick Select</Label>
                                <div className="grid grid-cols-2 gap-2">
                                    {catalog.map(item => (
                                        <button
                                            key={item.name}
                                            type="button"
                                            onClick={() => selectCatalogItem(item)}
                                            className={`text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                                                selectedItem === item.name && !isCustom
                                                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                            }`}
                                        >
                                            <span className="block font-semibold">{item.name}</span>
                                            <span className="text-[10px] text-slate-400">₹{item.price}</span>
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={selectCustom}
                                        className={`text-left px-3 py-2.5 rounded-lg border text-xs font-medium transition-all ${
                                            isCustom
                                                ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                        }`}
                                    >
                                        <span className="block font-semibold flex items-center gap-1"><Plus className="h-3 w-3" /> Other</span>
                                        <span className="text-[10px] text-slate-400">Custom item</span>
                                    </button>
                                </div>
                            </div>

                            {/* Custom item inputs */}
                            {isCustom && (
                                <div className="space-y-2">
                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-600">Description *</Label>
                                        <Input
                                            value={customDesc}
                                            onChange={e => setCustomDesc(e.target.value)}
                                            placeholder="e.g. Extra blanket"
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                    <div className="space-y-1">
                                        <Label className="text-xs text-slate-600">Amount (₹) *</Label>
                                        <Input
                                            type="number"
                                            value={customAmount}
                                            onChange={e => setCustomAmount(e.target.value)}
                                            placeholder="100"
                                            min={1}
                                            className="h-9 text-sm"
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Amount override for catalog items */}
                            {!isCustom && selectedItem && (
                                <div className="space-y-1">
                                    <Label className="text-xs text-slate-600">Amount (₹)</Label>
                                    <Input
                                        type="number"
                                        value={itemAmount}
                                        onChange={e => setItemAmount(e.target.value)}
                                        min={1}
                                        className="h-9 text-sm"
                                    />
                                </div>
                            )}

                            {/* Payment method */}
                            {(selectedItem || isCustom) && (
                                <div className="flex items-center gap-3">
                                    <Label className="text-xs text-slate-600">Payment</Label>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setPaymentMethod('CASH')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                                paymentMethod === 'CASH'
                                                    ? 'bg-emerald-100 border-emerald-300 text-emerald-700'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                        >
                                            <Banknote className="h-3 w-3" />
                                            Cash
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPaymentMethod('DIGITAL')}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                                                paymentMethod === 'DIGITAL'
                                                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                                                    : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                                            }`}
                                        >
                                            <Smartphone className="h-3 w-3" />
                                            Digital
                                        </button>
                                    </div>
                                </div>
                            )}

                            {/* Submit */}
                            {(selectedItem || isCustom) && (
                                <Button
                                    onClick={handleSubmit}
                                    disabled={submitting}
                                    className="w-full bg-emerald-600 hover:bg-emerald-700 h-10"
                                >
                                    {submitting ? 'Adding...' : `Add Extra — ${formatCurrency(isCustom ? Number(customAmount) || 0 : Number(itemAmount) || 0)} ${paymentMethod}`}
                                </Button>
                            )}

                            {/* Existing extras list */}
                            {existingExtras.length > 0 && (
                                <div className="space-y-2 pt-2 border-t border-slate-100">
                                    <Label className="text-xs text-slate-500 uppercase tracking-wider font-bold">Added Extras</Label>
                                    {existingExtras.map(e => (
                                        <div key={e.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 border border-slate-100">
                                            <div>
                                                <span className="text-xs font-medium text-slate-700">{e.description}</span>
                                                <span className={`ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                                    e.payment_method === 'CASH' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'
                                                }`}>
                                                    {e.payment_method}
                                                </span>
                                            </div>
                                            <span className="text-xs font-bold text-slate-800">{formatCurrency(e.amount)}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
