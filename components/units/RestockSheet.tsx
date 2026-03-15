'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { Package } from 'lucide-react'

interface RestockSheetProps {
    open: boolean
    onClose: () => void
    hotelId: string
    staffId: string
}

export function RestockSheet({ open, onClose, hotelId, staffId }: RestockSheetProps) {
    const [items, setItems] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    if (!open) return null

    const handleSubmit = async () => {
        if (!items.trim()) {
            toast.error('Please list the items needed')
            return
        }

        setIsSubmitting(true)
        try {
            const res = await fetch('/api/restock', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hotel_id: hotelId,
                    items: items.trim(),
                    requested_by: staffId,
                }),
            })

            const data = await res.json()
            if (!res.ok) {
                toast.error(data.error || 'Failed to send restock request')
                return
            }

            toast.success('Restock request sent to Operations')
            setItems('')
            onClose()
        } catch {
            toast.error('Network error')
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <div className="bg-white rounded-xl border border-orange-100 p-4 space-y-3">
            <h3 className="text-sm font-bold text-slate-700 flex items-center gap-2">
                <Package className="h-4 w-4 text-orange-600" />
                Request Restock
            </h3>
            <div className="space-y-2">
                <Label className="text-xs text-slate-600">Items Needed *</Label>
                <textarea
                    placeholder="e.g. 10 towels, 20 soaps, 5 shampoo bottles, dustbin liners..."
                    value={items}
                    onChange={(e) => setItems(e.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-400/20 resize-none placeholder:text-slate-400"
                />
            </div>
            <Button
                onClick={handleSubmit}
                disabled={isSubmitting || !items.trim()}
                size="sm"
                className="bg-orange-600 hover:bg-orange-700 h-8 text-xs"
            >
                {isSubmitting ? (
                    <span className="flex items-center gap-2">
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        Sending...
                    </span>
                ) : (
                    <span className="flex items-center gap-2">
                        <Package className="h-3.5 w-3.5" />
                        Send to Operations
                    </span>
                )}
            </Button>
        </div>
    )
}
