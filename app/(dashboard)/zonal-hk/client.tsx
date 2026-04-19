'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Wrench,
    CheckCircle2,
    Clock,
    Loader2,
    ChevronDown,
    ChevronUp,
    RefreshCw,
    Shirt,
    Send,
    ArrowDownLeft,
    IndianRupee,
    Package,
    Camera,
    FileText,
} from 'lucide-react'

import type { MaintenanceTicket, LaundryOrder, RestockRequest, PropertyReport } from '@/lib/types'
import { timeAgo } from '@/lib/utils/time'

// ============================================================
// Props & tab type
// ============================================================

interface ZonalHKClientProps {
    hotelId: string
    staffId: string
}

type Tab = 'maintenance' | 'laundry' | 'restock' | 'reports'

// ============================================================
// Helpers
// ============================================================

function formatIST(dateStr: string): string {
    return new Date(dateStr).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    })
}

function durationStr(start: string, end: string): string {
    const diffMs = new Date(end).getTime() - new Date(start).getTime()
    const hours = Math.floor(diffMs / 3600000)
    const mins = Math.floor((diffMs % 3600000) / 60000)
    if (hours === 0) return `${mins}m`
    return `${hours}h ${mins}m`
}

// ============================================================
// Style constants
// ============================================================

const PRIORITY_STYLES: Record<string, { badge: string; border: string }> = {
    URGENT: { badge: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
    HIGH: { badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-500' },
    MEDIUM: { badge: 'bg-slate-100 text-slate-700', border: 'border-l-slate-400' },
    LOW: { badge: 'bg-gray-100 text-gray-500', border: 'border-l-gray-300' },
}

const STATUS_STYLES: Record<string, string> = {
    OPEN: 'bg-red-100 text-red-700',
    IN_PROGRESS: 'bg-amber-100 text-amber-700',
    RESOLVED: 'bg-green-100 text-green-700',
}

// ============================================================
// Component
// ============================================================

export function ZonalHKClient({ hotelId, staffId }: ZonalHKClientProps) {
    const [tab, setTab] = useState<Tab>('maintenance')
    const [loading, setLoading] = useState(false)

    // ---- Maintenance state ----
    const [activeTickets, setActiveTickets] = useState<MaintenanceTicket[]>([])
    const [resolvedTickets, setResolvedTickets] = useState<MaintenanceTicket[]>([])
    const [showResolved, setShowResolved] = useState(false)
    const [updatingTicket, setUpdatingTicket] = useState<string | null>(null)
    const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({})

    // ---- Laundry state ----
    const [outOrders, setOutOrders] = useState<LaundryOrder[]>([])
    const [returnedOrders, setReturnedOrders] = useState<LaundryOrder[]>([])
    const [paidOrders, setPaidOrders] = useState<LaundryOrder[]>([])
    const [showPaid, setShowPaid] = useState(false)
    const [updatingOrder, setUpdatingOrder] = useState<string | null>(null)
    const [paymentAmounts, setPaymentAmounts] = useState<Record<string, string>>({})

    // ---- Restock state ----
    const [pendingRestocks, setPendingRestocks] = useState<RestockRequest[]>([])
    const [doneRestocks, setDoneRestocks] = useState<RestockRequest[]>([])
    const [showDoneRestocks, setShowDoneRestocks] = useState(false)
    const [completingRestock, setCompletingRestock] = useState<string | null>(null)

    // ---- Property Reports state ----
    const [reports, setReports] = useState<PropertyReport[]>([])
    const [reportDescription, setReportDescription] = useState('')
    const [reportCategory, setReportCategory] = useState('OTHER')
    const [reportType, setReportType] = useState<'REPORT' | 'ISSUE'>('REPORT')
    const [reportPhotoUrl, setReportPhotoUrl] = useState('')
    const [reportSubmitting, setReportSubmitting] = useState(false)
    const [reportUploading, setReportUploading] = useState(false)

    // Send laundry form
    const [sendItems, setSendItems] = useState('')
    const [sendCount, setSendCount] = useState('')
    const [sendNotes, setSendNotes] = useState('')
    const [sending, setSending] = useState(false)

    // ============================================================
    // Maintenance fetchers
    // ============================================================

    const fetchActiveTickets = useCallback(async () => {
        const { data } = await supabase
            .from('maintenance_tickets')
            .select('*, unit:units(unit_number), staff:reported_by(name)')
            .eq('hotel_id', hotelId)
            .in('status', ['OPEN', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })
        const priorityOrder: Record<string, number> = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }
        const sorted = (data || []).sort((a: any, b: any) => {
            const pa = priorityOrder[a.priority] ?? 5
            const pb = priorityOrder[b.priority] ?? 5
            if (pa !== pb) return pa - pb
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        setActiveTickets(sorted)
    }, [hotelId])

    const fetchResolvedTickets = useCallback(async () => {
        const { data } = await supabase
            .from('maintenance_tickets')
            .select('*, unit:units(unit_number), staff:reported_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'RESOLVED')
            .order('resolved_at', { ascending: false })
            .limit(10)
        if (data) setResolvedTickets(data)
    }, [hotelId])

    // ============================================================
    // Laundry fetchers
    // ============================================================

    const fetchOutOrders = useCallback(async () => {
        const { data } = await supabase
            .from('laundry_orders')
            .select('*, staff:created_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'OUT')
            .order('sent_at', { ascending: false })
        if (data) setOutOrders(data)
    }, [hotelId])

    const fetchReturnedOrders = useCallback(async () => {
        const { data } = await supabase
            .from('laundry_orders')
            .select('*, staff:created_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'RETURNED')
            .order('returned_at', { ascending: false })
        if (data) setReturnedOrders(data)
    }, [hotelId])

    const fetchPaidOrders = useCallback(async () => {
        const { data } = await supabase
            .from('laundry_orders')
            .select('*, staff:created_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'PAID')
            .order('created_at', { ascending: false })
            .limit(20)
        if (data) setPaidOrders(data)
    }, [hotelId])

    // ============================================================
    // Restock fetchers
    // ============================================================

    const fetchPendingRestocks = useCallback(async () => {
        const { data } = await supabase
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
        if (data) setPendingRestocks(data)
    }, [hotelId])

    const fetchDoneRestocks = useCallback(async () => {
        const { data } = await supabase
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'DONE')
            .order('completed_at', { ascending: false })
            .limit(10)
        if (data) setDoneRestocks(data)
    }, [hotelId])

    // ============================================================
    // Property Reports fetchers & handlers
    // ============================================================

    const fetchReports = useCallback(async () => {
        try {
            const res = await fetch(`/api/property-reports?hotel_id=${hotelId}&limit=30`)
            if (res.ok) {
                const json = await res.json()
                setReports(json.data || [])
            }
        } catch {}
    }, [hotelId])

    const handleSubmitReport = async () => {
        if (!reportDescription.trim()) { toast.error('Please describe the report'); return }
        setReportSubmitting(true)
        try {
            const res = await fetch('/api/property-reports', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: reportType,
                    category: reportCategory,
                    description: reportDescription.trim(),
                    photo_url: reportPhotoUrl || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(reportType === 'ISSUE' ? 'Issue reported to Admin' : 'Report submitted to Admin')
            setReportDescription('')
            setReportCategory('OTHER')
            setReportType('REPORT')
            setReportPhotoUrl('')
            fetchReports()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit report')
        } finally {
            setReportSubmitting(false)
        }
    }

    const handleReportPhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setReportUploading(true)
        try {
            const { compressImage } = await import('@/lib/utils/compress-image')
            const compressed = await compressImage(file)
            const dateStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
            const timeStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).replace(':', '-')
            const fileName = `${dateStr.slice(0, 7)}/report_${dateStr}_${timeStr}_${Date.now()}.jpg`
            const { error: uploadErr } = await supabase.storage
                .from('reports')
                .upload(fileName, compressed, { contentType: 'image/jpeg', upsert: true })
            if (uploadErr) { toast.error('Failed to upload photo'); return }
            const { data: urlData } = supabase.storage.from('reports').getPublicUrl(fileName)
            setReportPhotoUrl(urlData.publicUrl)
            toast.success('Photo uploaded')
        } catch {
            toast.error('Failed to process photo')
        } finally {
            setReportUploading(false)
        }
    }

    // ============================================================
    // Initial data load on tab change
    // ============================================================

    useEffect(() => {
        setLoading(true)
        if (tab === 'maintenance') {
            Promise.all([fetchActiveTickets(), fetchResolvedTickets()]).finally(() => setLoading(false))
        }
        if (tab === 'laundry') {
            Promise.all([fetchOutOrders(), fetchReturnedOrders(), fetchPaidOrders()]).finally(() => setLoading(false))
        }
        if (tab === 'restock') {
            Promise.all([fetchPendingRestocks(), fetchDoneRestocks()]).finally(() => setLoading(false))
        }
        if (tab === 'reports') {
            fetchReports().finally(() => setLoading(false))
        }
    }, [tab, fetchActiveTickets, fetchResolvedTickets, fetchOutOrders, fetchReturnedOrders, fetchPaidOrders, fetchPendingRestocks, fetchDoneRestocks, fetchReports])

    // ============================================================
    // Realtime subscriptions
    // ============================================================

    // Maintenance realtime
    useEffect(() => {
        if (tab !== 'maintenance') return
        const channel = supabase
            .channel(`maint_zonalhk_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'maintenance_tickets',
                filter: `hotel_id=eq.${hotelId}`,
            }, () => {
                fetchActiveTickets()
                fetchResolvedTickets()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchActiveTickets, fetchResolvedTickets])

    // Laundry realtime
    useEffect(() => {
        if (tab !== 'laundry') return
        const channel = supabase
            .channel(`laundry_zonalhk_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'laundry_orders',
                filter: `hotel_id=eq.${hotelId}`,
            }, () => {
                fetchOutOrders()
                fetchReturnedOrders()
                fetchPaidOrders()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchOutOrders, fetchReturnedOrders, fetchPaidOrders])

    // Restock realtime
    useEffect(() => {
        if (tab !== 'restock') return
        const channel = supabase
            .channel(`restock_zonalhk_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'restock_requests',
                filter: `hotel_id=eq.${hotelId}`,
            }, () => {
                fetchPendingRestocks()
                fetchDoneRestocks()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchPendingRestocks, fetchDoneRestocks])

    // Property reports realtime
    useEffect(() => {
        if (tab !== 'reports') return
        const channel = supabase
            .channel(`reports_zonalhk_${hotelId.slice(0, 8)}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'property_reports', filter: `hotel_id=eq.${hotelId}` }, () => { fetchReports() })
            .subscribe()
        return () => { supabase.removeChannel(channel) }
    }, [tab, hotelId, fetchReports])

    // ============================================================
    // Maintenance actions
    // ============================================================

    const handleUpdateTicket = async (ticketId: string, status: string) => {
        setUpdatingTicket(ticketId)
        try {
            const body: Record<string, unknown> = {
                ticket_id: ticketId,
                status,
            }
            if (status === 'RESOLVED') {
                body.resolution_notes = resolutionNotes[ticketId] || ''
            }
            const res = await fetch('/api/maintenance', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success(status === 'IN_PROGRESS' ? 'Ticket started' : 'Ticket resolved')
            setResolutionNotes(prev => {
                const next = { ...prev }
                delete next[ticketId]
                return next
            })
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to update ticket')
        } finally {
            setUpdatingTicket(null)
        }
    }

    // ============================================================
    // Laundry actions
    // ============================================================

    const handleSendLaundry = async () => {
        if (!sendItems.trim()) {
            toast.error('Please describe the items being sent')
            return
        }
        setSending(true)
        try {
            const res = await fetch('/api/laundry', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hotel_id: hotelId,
                    items_description: sendItems.trim(),
                    item_count: sendCount ? Number(sendCount) : null,
                    notes: sendNotes.trim() || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Laundry sent')
            setSendItems('')
            setSendCount('')
            setSendNotes('')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to send laundry')
        } finally {
            setSending(false)
        }
    }

    const handleMarkReturned = async (orderId: string) => {
        setUpdatingOrder(orderId)
        try {
            const res = await fetch('/api/laundry', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, status: 'RETURNED' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Marked as returned')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to mark returned')
        } finally {
            setUpdatingOrder(null)
        }
    }

    const handleRecordPayment = async (orderId: string) => {
        const amt = Number(paymentAmounts[orderId])
        if (!amt || amt <= 0) {
            toast.error('Enter a valid payment amount')
            return
        }
        setUpdatingOrder(orderId)
        try {
            const res = await fetch('/api/laundry', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, status: 'PAID', amount: amt }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Payment recorded')
            setPaymentAmounts(prev => {
                const next = { ...prev }
                delete next[orderId]
                return next
            })
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to record payment')
        } finally {
            setUpdatingOrder(null)
        }
    }

    // ============================================================
    // Restock actions
    // ============================================================

    const handleCompleteRestock = async (requestId: string) => {
        setCompletingRestock(requestId)
        try {
            const res = await fetch('/api/restock', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ request_id: requestId }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Restock completed')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to complete restock')
        } finally {
            setCompletingRestock(null)
        }
    }

    // ============================================================
    // Badge counts
    // ============================================================

    const openCount = activeTickets.length
    const outCount = outOrders.length + returnedOrders.length
    const restockCount = pendingRestocks.length

    const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'maintenance', label: 'Maintenance', icon: <Wrench className="h-4 w-4" />, badge: openCount },
        { key: 'laundry', label: 'Laundry', icon: <Shirt className="h-4 w-4" />, badge: outCount },
        { key: 'restock', label: 'Restock', icon: <Package className="h-4 w-4" />, badge: restockCount },
        { key: 'reports', label: 'Reports', icon: <FileText className="h-4 w-4" />, badge: reports.filter(r => r.status === 'OPEN').length || undefined },
    ]

    // ============================================================
    // Render
    // ============================================================

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Zonal HK Dashboard</h1>
                    <p className="text-slate-500 mt-1 text-sm">Maintenance tickets and laundry management.</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        if (tab === 'maintenance') {
                            fetchActiveTickets()
                            fetchResolvedTickets()
                        } else if (tab === 'laundry') {
                            fetchOutOrders()
                            fetchReturnedOrders()
                            fetchPaidOrders()
                        } else if (tab === 'restock') {
                            fetchPendingRestocks()
                            fetchDoneRestocks()
                        } else if (tab === 'reports') {
                            fetchReports()
                        }
                        toast.success('Refreshed')
                    }}
                    className="gap-2"
                >
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                </Button>
            </div>

            {/* Tabs */}
            <div className="relative">
                <div className="overflow-x-auto scrollbar-hide -mx-2 px-2 pb-1">
                    <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit min-w-fit">
                        {tabs.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-all whitespace-nowrap ${
                                    tab === t.key
                                        ? 'bg-teal-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                            >
                                {t.icon}
                                {t.label}
                                {(t.badge ?? 0) > 0 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                        tab === t.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'
                                    }`}>
                                        {t.badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none md:hidden" />
            </div>

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-teal-500" />
                </div>
            )}

            {/* ======================== MAINTENANCE TAB ======================== */}
            {tab === 'maintenance' && !loading && (
                <div className="space-y-4">
                    {activeTickets.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <CheckCircle2 className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No open maintenance tickets</p>
                                <p className="text-slate-400 text-sm mt-1">Everything is running smoothly.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3">
                            {activeTickets.map(ticket => {
                                const pStyle = PRIORITY_STYLES[ticket.priority] || PRIORITY_STYLES.MEDIUM
                                const sStyle = STATUS_STYLES[ticket.status] || STATUS_STYLES.OPEN
                                return (
                                    <Card key={ticket.id} className={`rounded-2xl border-l-4 ${pStyle.border}`}>
                                        <CardContent className="py-4 px-5">
                                            <div className="space-y-3">
                                                {/* Header row */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                            {ticket.unit?.unit_number && (
                                                                <span className="font-bold text-slate-900">
                                                                    {ticket.unit.unit_number}
                                                                </span>
                                                            )}
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${pStyle.badge}`}>
                                                                {ticket.priority}
                                                            </span>
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${sStyle}`}>
                                                                {ticket.status.replace('_', ' ')}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-slate-700">{ticket.description}</p>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                            {ticket.staff?.name && (
                                                                <span>Reported by {ticket.staff.name}</span>
                                                            )}
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {timeAgo(ticket.created_at)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Actions */}
                                                <div className="flex items-end gap-2 flex-wrap">
                                                    {ticket.status === 'OPEN' && (
                                                        <>
                                                            <textarea
                                                                placeholder="Notes (optional)..."
                                                                value={resolutionNotes[ticket.id] || ''}
                                                                onChange={e => setResolutionNotes(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                                                className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-teal-300"
                                                                rows={1}
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateTicket(ticket.id, 'IN_PROGRESS')}
                                                                disabled={updatingTicket === ticket.id}
                                                                className="bg-slate-700 hover:bg-slate-800 text-white shrink-0"
                                                            >
                                                                {updatingTicket === ticket.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    'Start'
                                                                )}
                                                            </Button>
                                                        </>
                                                    )}
                                                    {ticket.status === 'IN_PROGRESS' && (
                                                        <>
                                                            <textarea
                                                                placeholder="Resolution notes..."
                                                                value={resolutionNotes[ticket.id] || ''}
                                                                onChange={e => setResolutionNotes(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                                                className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-teal-300"
                                                                rows={1}
                                                            />
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleUpdateTicket(ticket.id, 'RESOLVED')}
                                                                disabled={updatingTicket === ticket.id}
                                                                className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                                                            >
                                                                {updatingTicket === ticket.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    'Resolve'
                                                                )}
                                                            </Button>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}

                    {/* Resolved Tickets */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowResolved(!showResolved)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showResolved ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Resolved ({resolvedTickets.length})
                        </button>
                        {showResolved && (
                            <div className="grid gap-2 mt-3">
                                {resolvedTickets.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No resolved tickets yet.</p>
                                ) : (
                                    resolvedTickets.map(ticket => (
                                        <Card key={ticket.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            {ticket.unit?.unit_number && (
                                                                <span className="font-semibold text-slate-700 text-sm">
                                                                    {ticket.unit.unit_number}
                                                                </span>
                                                            )}
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${PRIORITY_STYLES[ticket.priority]?.badge || ''}`}>
                                                                {ticket.priority}
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate">{ticket.description}</p>
                                                        {ticket.resolution_notes && (
                                                            <p className="text-xs text-green-600 mt-0.5 italic">{ticket.resolution_notes}</p>
                                                        )}
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                        {ticket.resolved_at ? timeAgo(ticket.resolved_at) : timeAgo(ticket.created_at)}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== LAUNDRY TAB ======================== */}
            {tab === 'laundry' && !loading && (
                <div className="space-y-6">
                    {/* ---- Send Laundry Form ---- */}
                    <Card className="rounded-2xl border-teal-200 bg-teal-50/40">
                        <CardContent className="py-5 px-5 space-y-3">
                            <h3 className="text-sm font-bold text-teal-800 flex items-center gap-2">
                                <Send className="h-4 w-4" />
                                Send Laundry
                            </h3>
                            <textarea
                                placeholder="Items description (e.g., 50 bedsheets, 100 towels)..."
                                value={sendItems}
                                onChange={e => setSendItems(e.target.value)}
                                className="w-full text-sm border border-teal-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                                rows={2}
                            />
                            <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                                <input
                                    type="number"
                                    placeholder="Item count"
                                    value={sendCount}
                                    onChange={e => setSendCount(e.target.value)}
                                    min={1}
                                    className="text-sm border border-teal-200 rounded-lg p-2.5 w-full sm:w-36 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                                />
                                <input
                                    type="text"
                                    placeholder="Notes (optional)"
                                    value={sendNotes}
                                    onChange={e => setSendNotes(e.target.value)}
                                    className="flex-1 min-w-0 text-sm border border-teal-200 rounded-lg p-2.5 focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                                />
                                <Button
                                    size="sm"
                                    onClick={handleSendLaundry}
                                    disabled={sending || !sendItems.trim()}
                                    className="bg-teal-600 hover:bg-teal-700 text-white shrink-0 h-10 w-full sm:w-auto"
                                >
                                    {sending ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <>
                                            <Send className="h-4 w-4 mr-1" />
                                            Send
                                        </>
                                    )}
                                </Button>
                            </div>
                        </CardContent>
                    </Card>

                    {/* ---- Active Orders (OUT) ---- */}
                    <div>
                        <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                            <Shirt className="h-4 w-4 text-amber-500" />
                            Active Orders ({outOrders.length})
                        </h3>
                        {outOrders.length === 0 ? (
                            <Card className="rounded-2xl">
                                <CardContent className="flex flex-col items-center justify-center py-10 text-center">
                                    <Shirt className="h-10 w-10 text-slate-300 mb-3" />
                                    <p className="text-slate-400 text-sm">No laundry currently out</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-3">
                                {outOrders.map(order => (
                                    <Card key={order.id} className="rounded-2xl border-l-4 border-l-amber-400">
                                        <CardContent className="py-4 px-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-amber-100 text-amber-700">
                                                            OUT
                                                        </span>
                                                        {order.item_count && (
                                                            <span className="text-xs text-slate-500 font-medium">
                                                                {order.item_count} items
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-700">{order.items_description}</p>
                                                    {order.notes && (
                                                        <p className="text-xs text-slate-400 mt-0.5 italic">{order.notes}</p>
                                                    )}
                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1">
                                                        <span>Sent {formatIST(order.sent_at)}</span>
                                                        <span className="flex items-center gap-1 text-amber-500 font-medium">
                                                            <Clock className="h-3 w-3" />
                                                            {timeAgo(order.sent_at)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleMarkReturned(order.id)}
                                                    disabled={updatingOrder === order.id}
                                                    className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                                                >
                                                    {updatingOrder === order.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                    ) : (
                                                        <>
                                                            <ArrowDownLeft className="h-4 w-4 mr-1" />
                                                            Mark Returned
                                                        </>
                                                    )}
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* ---- Returned Orders ---- */}
                    {returnedOrders.length > 0 && (
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 mb-3 flex items-center gap-2">
                                <ArrowDownLeft className="h-4 w-4 text-blue-500" />
                                Returned -- Awaiting Payment ({returnedOrders.length})
                            </h3>
                            <div className="grid gap-3">
                                {returnedOrders.map(order => (
                                    <Card key={order.id} className="rounded-2xl border-l-4 border-l-blue-400">
                                        <CardContent className="py-4 px-5">
                                            <div className="space-y-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-blue-100 text-blue-700">
                                                            RETURNED
                                                        </span>
                                                        {order.item_count && (
                                                            <span className="text-xs text-slate-500 font-medium">
                                                                {order.item_count} items
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-sm text-slate-700">{order.items_description}</p>
                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                                        <span>Sent {formatIST(order.sent_at)}</span>
                                                        {order.returned_at && (
                                                            <>
                                                                <span>Returned {formatIST(order.returned_at)}</span>
                                                                <span className="text-blue-500 font-medium">
                                                                    Duration: {durationStr(order.sent_at, order.returned_at)}
                                                                </span>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                                {/* Payment form */}
                                                <div className="flex items-end gap-2 flex-wrap">
                                                    <div className="relative flex-1 min-w-[140px] max-w-[200px]">
                                                        <IndianRupee className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                                                        <input
                                                            type="number"
                                                            placeholder="Amount"
                                                            value={paymentAmounts[order.id] || ''}
                                                            onChange={e => setPaymentAmounts(prev => ({ ...prev, [order.id]: e.target.value }))}
                                                            min={1}
                                                            className="w-full text-sm border border-slate-200 rounded-lg p-2 pl-8 focus:outline-none focus:ring-2 focus:ring-teal-300"
                                                        />
                                                    </div>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleRecordPayment(order.id)}
                                                        disabled={updatingOrder === order.id || !paymentAmounts[order.id]}
                                                        className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                                                    >
                                                        {updatingOrder === order.id ? (
                                                            <Loader2 className="h-4 w-4 animate-spin" />
                                                        ) : (
                                                            'Record Payment'
                                                        )}
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* ---- Completed (Paid) - Collapsible ---- */}
                    <div className="mt-2">
                        <button
                            onClick={() => setShowPaid(!showPaid)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showPaid ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Completed ({paidOrders.length})
                        </button>
                        {showPaid && (
                            <div className="grid gap-2 mt-3">
                                {paidOrders.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No completed orders yet.</p>
                                ) : (
                                    paidOrders.map(order => (
                                        <Card key={order.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-green-100 text-green-700">
                                                                PAID
                                                            </span>
                                                            {order.item_count && (
                                                                <span className="text-xs text-slate-500">
                                                                    {order.item_count} items
                                                                </span>
                                                            )}
                                                        </div>
                                                        <p className="text-xs text-slate-500">{order.items_description}</p>
                                                        <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 flex-wrap">
                                                            <span>Sent {formatIST(order.sent_at)}</span>
                                                            {order.returned_at && (
                                                                <span>Returned {formatIST(order.returned_at)}</span>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-1 text-sm font-bold text-green-700 shrink-0">
                                                        <IndianRupee className="h-3.5 w-3.5" />
                                                        {Number(order.amount || 0).toLocaleString('en-IN')}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== RESTOCK TAB ======================== */}
            {tab === 'restock' && !loading && (
                <div className="space-y-4">
                    {/* Pending Restocks */}
                    {pendingRestocks.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <CheckCircle2 className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No pending restock requests</p>
                                <p className="text-slate-400 text-sm mt-1">All supplies are restocked.</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3">
                            {pendingRestocks.map(req => (
                                <Card key={req.id} className="rounded-2xl border-l-4 border-l-orange-400">
                                    <CardContent className="py-4 px-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                    <span className="font-bold text-slate-900">
                                                        {req.unit?.unit_number || 'Hotel Supplies'}
                                                    </span>
                                                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full font-medium">
                                                        PENDING
                                                    </span>
                                                </div>
                                                <p className="text-sm text-slate-700 mb-2">{req.items}</p>
                                                <div className="flex items-center gap-3 text-xs text-slate-400">
                                                    {req.staff?.name && (
                                                        <span>Requested by {req.staff.name}</span>
                                                    )}
                                                    <span className="flex items-center gap-1">
                                                        <Clock className="h-3 w-3" />
                                                        {timeAgo(req.created_at)}
                                                    </span>
                                                </div>
                                            </div>
                                            <Button
                                                size="sm"
                                                onClick={() => handleCompleteRestock(req.id)}
                                                disabled={completingRestock === req.id}
                                                className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"
                                            >
                                                {completingRestock === req.id ? (
                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                ) : (
                                                    <>
                                                        <CheckCircle2 className="h-4 w-4 mr-1" />
                                                        Mark Done
                                                    </>
                                                )}
                                            </Button>
                                        </div>
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                    )}

                    {/* Done Restocks — Collapsible */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowDoneRestocks(!showDoneRestocks)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showDoneRestocks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Completed ({doneRestocks.length})
                        </button>
                        {showDoneRestocks && (
                            <div className="grid gap-2 mt-3">
                                {doneRestocks.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No completed restocks yet.</p>
                                ) : (
                                    doneRestocks.map(req => (
                                        <Card key={req.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 mb-0.5">
                                                            <span className="font-semibold text-slate-700 text-sm">
                                                                {req.unit?.unit_number || 'Hotel Supplies'}
                                                            </span>
                                                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-green-100 text-green-700">
                                                                DONE
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-slate-500 truncate">{req.items}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-400 shrink-0">
                                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                                        {req.completed_at ? timeAgo(req.completed_at) : timeAgo(req.created_at)}
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ======================== REPORTS TAB ======================== */}
            {tab === 'reports' && !loading && (
                <div className="space-y-4">
                    {/* Submit Report/Issue Form */}
                    <Card className="rounded-2xl border-teal-200 bg-teal-50/40">
                        <CardContent className="py-5 px-5 space-y-4">
                            <h3 className="text-sm font-bold text-teal-800 flex items-center gap-2">
                                <FileText className="h-4 w-4" />
                                Submit Report / Issue
                            </h3>

                            {/* Type toggle */}
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setReportType('REPORT')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                                        reportType === 'REPORT'
                                            ? 'bg-teal-600 text-white'
                                            : 'bg-white border border-teal-200 text-teal-700 hover:bg-teal-50'
                                    }`}
                                >
                                    Report
                                </button>
                                <button
                                    onClick={() => setReportType('ISSUE')}
                                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
                                        reportType === 'ISSUE'
                                            ? 'bg-red-600 text-white'
                                            : 'bg-white border border-red-200 text-red-700 hover:bg-red-50'
                                    }`}
                                >
                                    Issue
                                </button>
                            </div>

                            {/* Category */}
                            <select
                                value={reportCategory}
                                onChange={e => setReportCategory(e.target.value)}
                                className="w-full text-sm border border-teal-200 rounded-lg p-2.5 bg-white focus:outline-none focus:ring-2 focus:ring-teal-300"
                            >
                                <option value="OBSERVATION">Observation</option>
                                <option value="DAMAGE">Damage</option>
                                <option value="SAFETY">Safety</option>
                                <option value="MAINTENANCE">Maintenance</option>
                                <option value="GUEST_COMPLAINT">Guest Complaint</option>
                                <option value="OTHER">Other</option>
                            </select>

                            {/* Description */}
                            <textarea
                                placeholder="Describe the report or issue in detail..."
                                value={reportDescription}
                                onChange={e => setReportDescription(e.target.value)}
                                className="w-full text-sm border border-teal-200 rounded-lg p-2.5 resize-none focus:outline-none focus:ring-2 focus:ring-teal-300 bg-white"
                                rows={3}
                            />

                            {/* Photo capture */}
                            <div className="flex items-center gap-3">
                                <label className={`flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg cursor-pointer transition-colors ${
                                    reportUploading ? 'bg-slate-100 text-slate-400' : 'bg-white border border-teal-200 text-teal-700 hover:bg-teal-50'
                                }`}>
                                    {reportUploading ? (
                                        <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <Camera className="h-4 w-4" />
                                    )}
                                    {reportUploading ? 'Uploading...' : 'Attach Photo'}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        capture="environment"
                                        onChange={handleReportPhotoCapture}
                                        disabled={reportUploading}
                                        className="hidden"
                                    />
                                </label>
                                {reportPhotoUrl && (
                                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                                        <CheckCircle2 className="h-3.5 w-3.5" />
                                        Photo attached
                                    </span>
                                )}
                            </div>

                            {/* Submit */}
                            <Button
                                onClick={handleSubmitReport}
                                disabled={reportSubmitting || !reportDescription.trim()}
                                className="w-full bg-teal-600 hover:bg-teal-700 text-white"
                            >
                                {reportSubmitting ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                    <>
                                        <FileText className="h-4 w-4 mr-2" />
                                        Submit {reportType === 'ISSUE' ? 'Issue' : 'Report'}
                                    </>
                                )}
                            </Button>
                        </CardContent>
                    </Card>

                    {/* My Reports List */}
                    <div>
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                            Recent Reports ({reports.length})
                        </h3>
                        {reports.length === 0 ? (
                            <Card className="rounded-2xl">
                                <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                    <FileText className="h-12 w-12 text-slate-300 mb-4" />
                                    <p className="text-slate-500 font-medium">No reports submitted yet</p>
                                    <p className="text-slate-400 text-sm mt-1">Use the form above to submit a report or issue.</p>
                                </CardContent>
                            </Card>
                        ) : (
                            <div className="grid gap-3">
                                {reports.map(r => (
                                    <Card key={r.id} className={`rounded-2xl border-l-4 ${
                                        r.type === 'ISSUE' ? 'border-l-red-400' : 'border-l-teal-400'
                                    }`}>
                                        <CardContent className="py-4 px-5">
                                            <div className="flex items-start justify-between gap-4">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                            r.type === 'ISSUE' ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'
                                                        }`}>
                                                            {r.type}
                                                        </span>
                                                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-slate-100 text-slate-600">
                                                            {r.category.replace('_', ' ')}
                                                        </span>
                                                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                                                            r.status === 'OPEN' ? 'bg-amber-100 text-amber-700'
                                                            : r.status === 'ACKNOWLEDGED' ? 'bg-blue-100 text-blue-700'
                                                            : r.status === 'RESOLVED' ? 'bg-green-100 text-green-700'
                                                            : 'bg-slate-100 text-slate-600'
                                                        }`}>
                                                            {r.status}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-700">{r.description}</p>
                                                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-1 flex-wrap">
                                                        {r.reporter?.name && (
                                                            <span>By {r.reporter.name}</span>
                                                        )}
                                                        <span className="flex items-center gap-1">
                                                            <Clock className="h-3 w-3" />
                                                            {timeAgo(r.created_at)}
                                                        </span>
                                                    </div>
                                                    {r.review_notes && (
                                                        <p className="text-xs text-blue-600 mt-1 italic">Admin: {r.review_notes}</p>
                                                    )}
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
