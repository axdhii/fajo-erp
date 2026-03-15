'use client'

import { useState } from 'react'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from '@/components/ui/sheet'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { AlertTriangle } from 'lucide-react'

interface ReportIssueSheetProps {
    unit: UnitWithBooking | null
    open: boolean
    onOpenChange: (open: boolean) => void
    hotelId: string
    staffId: string
}

export function ReportIssueSheet({
    unit,
    open,
    onOpenChange,
    hotelId,
    staffId,
}: ReportIssueSheetProps) {
    const [description, setDescription] = useState('')
    const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM')
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!unit) return null

    const handleSubmit = async () => {
        if (!description.trim()) {
            toast.error('Please describe the issue')
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/maintenance', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unit_id: unit.id,
                    hotel_id: hotelId,
                    description: description.trim(),
                    priority,
                    reported_by: staffId,
                }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Failed to report issue')
                return
            }

            toast.success('Issue reported')
            setDescription('')
            setPriority('MEDIUM')
            onOpenChange(false)
        } catch {
            toast.error('Network error')
        } finally {
            setIsSubmitting(false)
        }
    }

    const resetAndClose = (openState: boolean) => {
        if (!openState) {
            setDescription('')
            setPriority('MEDIUM')
        }
        onOpenChange(openState)
    }

    const priorityColors: Record<string, string> = {
        LOW: 'text-slate-600',
        MEDIUM: 'text-amber-600',
        HIGH: 'text-orange-600',
        URGENT: 'text-red-600',
    }

    return (
        <Sheet open={open} onOpenChange={resetAndClose}>
            <SheetContent className="bg-white/98 backdrop-blur-2xl sm:max-w-md border-l border-slate-200/80 shadow-2xl overflow-y-auto p-0">
                <div className="sticky top-0 z-10 bg-white/95 backdrop-blur-xl border-b border-slate-100 px-6 pt-6 pb-4">
                    <SheetHeader className="space-y-1">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-600">
                                <AlertTriangle className="h-5 w-5" />
                            </div>
                            <div>
                                <SheetTitle className="text-xl font-semibold tracking-tight">
                                    Report Issue &middot; {unit.unit_number}
                                </SheetTitle>
                                <SheetDescription className="text-xs mt-0.5">
                                    Report a maintenance issue for this unit
                                </SheetDescription>
                            </div>
                        </div>
                    </SheetHeader>
                </div>

                <div className="px-6 py-5 space-y-5">
                    <div className="space-y-2">
                        <Label className="text-xs text-slate-600">
                            Description *
                        </Label>
                        <textarea
                            placeholder="Describe the issue..."
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            rows={4}
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xs transition-colors outline-none focus:border-red-400 focus:ring-2 focus:ring-red-400/20 resize-none placeholder:text-slate-400"
                        />
                    </div>

                    <div className="space-y-2">
                        <Label className="text-xs text-slate-600">
                            Priority
                        </Label>
                        <Select value={priority} onValueChange={(v) => setPriority(v as typeof priority)}>
                            <SelectTrigger className="w-full h-10 rounded-xl">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="LOW">
                                    <span className={priorityColors.LOW}>Low</span>
                                </SelectItem>
                                <SelectItem value="MEDIUM">
                                    <span className={priorityColors.MEDIUM}>Medium</span>
                                </SelectItem>
                                <SelectItem value="HIGH">
                                    <span className={priorityColors.HIGH}>High</span>
                                </SelectItem>
                                <SelectItem value="URGENT">
                                    <span className={priorityColors.URGENT}>Urgent</span>
                                </SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        onClick={handleSubmit}
                        disabled={isSubmitting || !description.trim()}
                        className="w-full h-12 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white shadow-xl shadow-red-600/20 rounded-xl transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <span className="flex items-center gap-2">
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                Reporting...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4" />
                                Report Issue
                            </span>
                        )}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    )
}
