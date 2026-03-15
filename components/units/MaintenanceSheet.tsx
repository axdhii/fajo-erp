'use client'

import { useState } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import { useUnitStore } from '@/lib/store/unit-store'
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
    Wrench,
    CheckCircle2,
    AlertTriangle,
} from 'lucide-react'

interface MaintenanceSheetProps {
    unit: UnitWithBooking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    onSuccess: () => void
}

export function MaintenanceSheet({
    unit,
    open,
    onOpenChange,
    onSuccess,
}: MaintenanceSheetProps) {
    const [reason, setReason] = useState('')
    const [isProcessing, setIsProcessing] = useState(false)
    const { updateUnitStatus } = useUnitStore()

    if (!unit) return null

    const isInMaintenance = unit.status === 'MAINTENANCE'

    const handleSetMaintenance = async () => {
        if (!reason.trim()) {
            toast.error('Please provide a reason for maintenance')
            return
        }

        setIsProcessing(true)
        try {
            const res = await fetch('/api/overrides/force-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId: unit.id, newStatus: 'MAINTENANCE', reason: reason.trim() }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            await updateUnitStatus(unit.id, 'MAINTENANCE')
            toast.success(`${unit.unit_number} is now under maintenance`)
            setReason('')
            onSuccess()
        } catch {
            toast.error('Failed to set maintenance mode')
        } finally {
            setIsProcessing(false)
        }
    }

    const handleClearMaintenance = async () => {
        setIsProcessing(true)
        try {
            const res = await fetch('/api/overrides/force-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId: unit.id, newStatus: 'AVAILABLE' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            await updateUnitStatus(unit.id, 'AVAILABLE')
            toast.success(`${unit.unit_number} is back to Available`)
            setReason('')
            onSuccess()
        } catch {
            toast.error('Failed to clear maintenance')
        } finally {
            setIsProcessing(false)
        }
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) setReason('')
        onOpenChange(openState)
    }

    return (
        <Sheet open={open} onOpenChange={resetAndClose}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-md border-l border-slate-200/80 shadow-2xl overflow-y-auto p-0">
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isInMaintenance ? 'bg-purple-100 text-purple-600' : 'bg-amber-100 text-amber-600'}`}>
                                <Wrench className="h-5 w-5" />
                            </div>
                            <div>
                                <SheetTitle className="text-xl font-semibold tracking-tight">
                                    {isInMaintenance ? 'Under Maintenance' : 'Set Maintenance'} · {unit.unit_number}
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    {isInMaintenance
                                        ? 'This unit is currently under maintenance'
                                        : 'Mark this unit as under maintenance'}
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                <div className="px-6 py-5 space-y-5">
                    {isInMaintenance ? (
                        <>
                            {/* Current maintenance info */}
                            <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 space-y-2">
                                <div className="flex items-center gap-2">
                                    <AlertTriangle className="h-4 w-4 text-purple-500" />
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500">
                                        Maintenance Reason
                                    </p>
                                </div>
                                <p className="text-sm font-medium text-purple-800">
                                    {unit.maintenance_reason || 'No reason provided'}
                                </p>
                            </div>

                            <Button
                                onClick={handleClearMaintenance}
                                disabled={isProcessing}
                                className="w-full h-12 text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xl shadow-emerald-600/20 rounded-xl transition-all active:scale-[0.98]"
                            >
                                {isProcessing ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <CheckCircle2 className="h-4 w-4" />
                                        Clear Maintenance · Mark Available
                                    </span>
                                )}
                            </Button>
                        </>
                    ) : (
                        <>
                            {/* Set maintenance */}
                            <div className="space-y-2">
                                <Label className="text-xs text-slate-600">
                                    Reason for Maintenance *
                                </Label>
                                <Input
                                    placeholder="e.g. AC repair, plumbing issue, electrical work..."
                                    value={reason}
                                    onChange={(e) => setReason(e.target.value)}
                                    className="h-10 text-sm bg-white"
                                />
                            </div>

                            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3">
                                <p className="text-xs text-amber-700 font-medium">
                                    ⚠️ This unit will be unavailable for bookings until maintenance is cleared by the front desk.
                                </p>
                            </div>

                            <Button
                                onClick={handleSetMaintenance}
                                disabled={isProcessing || !reason.trim()}
                                className="w-full h-12 text-sm font-semibold bg-purple-600 hover:bg-purple-700 text-white shadow-xl shadow-purple-600/20 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                            >
                                {isProcessing ? (
                                    <span className="flex items-center gap-2">
                                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                        Processing...
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-2">
                                        <Wrench className="h-4 w-4" />
                                        Confirm Maintenance
                                    </span>
                                )}
                            </Button>
                        </>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    )
}
