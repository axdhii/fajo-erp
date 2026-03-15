'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    Package,
    Wrench,
    CheckCircle2,
    Clock,
    Loader2,
    ChevronDown,
    ChevronUp,
    RefreshCw,
} from 'lucide-react'

interface OpsClientProps {
    hotelId: string
    staffId: string
}

type Tab = 'restock' | 'maintenance'

import type { RestockRequest, MaintenanceTicket } from '@/lib/types'

function timeAgo(dateStr: string): string {
    const now = Date.now()
    const then = new Date(dateStr).getTime()
    const diffMs = now - then
    const diffMin = Math.floor(diffMs / 60000)
    if (diffMin < 1) return 'just now'
    if (diffMin < 60) return `${diffMin}m ago`
    const diffHr = Math.floor(diffMin / 60)
    if (diffHr < 24) return `${diffHr}h ago`
    const diffDay = Math.floor(diffHr / 24)
    return `${diffDay}d ago`
}

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

export function OpsClient({ hotelId, staffId }: OpsClientProps) {
    const [tab, setTab] = useState<Tab>('restock')
    const [loading, setLoading] = useState(false)

    // Restock state
    const [pendingRestocks, setPendingRestocks] = useState<RestockRequest[]>([])
    const [doneRestocks, setDoneRestocks] = useState<RestockRequest[]>([])
    const [showDoneRestocks, setShowDoneRestocks] = useState(false)
    const [completingRestock, setCompletingRestock] = useState<string | null>(null)

    // Maintenance state
    const [activeTickets, setActiveTickets] = useState<MaintenanceTicket[]>([])
    const [resolvedTickets, setResolvedTickets] = useState<MaintenanceTicket[]>([])
    const [showResolved, setShowResolved] = useState(false)
    const [updatingTicket, setUpdatingTicket] = useState<string | null>(null)
    const [resolutionNotes, setResolutionNotes] = useState<Record<string, string>>({})

    // Fetch pending restock requests
    const fetchPendingRestocks = useCallback(async () => {
        const { data } = await supabase
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name)')
            .eq('hotel_id', hotelId)
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })
        if (data) setPendingRestocks(data)
    }, [hotelId])

    // Fetch done restock requests (last 10)
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

    // Fetch active maintenance tickets
    const fetchActiveTickets = useCallback(async () => {
        const { data } = await supabase
            .from('maintenance_tickets')
            .select('*, unit:units(unit_number), staff:reported_by(name)')
            .eq('hotel_id', hotelId)
            .in('status', ['OPEN', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })
        // Sort by priority in-memory
        const priorityOrder: Record<string, number> = { URGENT: 1, HIGH: 2, MEDIUM: 3, LOW: 4 }
        const sorted = (data || []).sort((a: any, b: any) => {
            const pa = priorityOrder[a.priority] ?? 5
            const pb = priorityOrder[b.priority] ?? 5
            if (pa !== pb) return pa - pb
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        })
        setActiveTickets(sorted)
    }, [hotelId])

    // Fetch resolved maintenance tickets (last 10)
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

    // Fetch data on tab change
    useEffect(() => {
        setLoading(true)
        if (tab === 'restock') {
            Promise.all([fetchPendingRestocks(), fetchDoneRestocks()]).finally(() => setLoading(false))
        }
        if (tab === 'maintenance') {
            Promise.all([fetchActiveTickets(), fetchResolvedTickets()]).finally(() => setLoading(false))
        }
    }, [tab, fetchPendingRestocks, fetchDoneRestocks, fetchActiveTickets, fetchResolvedTickets])

    // Supabase Realtime: restock_requests
    useEffect(() => {
        if (tab !== 'restock') return
        const channel = supabase
            .channel(`restock_ops_${hotelId.slice(0, 8)}`)
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

    // Supabase Realtime: maintenance_tickets
    useEffect(() => {
        if (tab !== 'maintenance') return
        const channel = supabase
            .channel(`maintenance_ops_${hotelId.slice(0, 8)}`)
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

    // Mark restock as done
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

    // Update maintenance ticket status
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

    const pendingCount = pendingRestocks.length
    const openCount = activeTickets.length

    const tabs: { key: Tab; label: string; icon: React.ReactNode; badge?: number }[] = [
        { key: 'restock', label: 'Restock', icon: <Package className="h-4 w-4" />, badge: pendingCount },
        { key: 'maintenance', label: 'Maintenance', icon: <Wrench className="h-4 w-4" />, badge: openCount },
    ]

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Operations Dashboard</h1>
                    <p className="text-slate-500 mt-1 text-sm">Manage restock requests and maintenance tickets.</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                        if (tab === 'restock') {
                            fetchPendingRestocks()
                            fetchDoneRestocks()
                        } else {
                            fetchActiveTickets()
                            fetchResolvedTickets()
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
            <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit">
                {tabs.map(t => (
                    <button
                        key={t.key}
                        onClick={() => setTab(t.key)}
                        className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-all ${
                            tab === t.key
                                ? 'bg-violet-600 text-white shadow-sm'
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

            {/* Loading */}
            {loading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-violet-500" />
                </div>
            )}

            {/* ======================== RESTOCK TAB ======================== */}
            {tab === 'restock' && !loading && (
                <div className="space-y-4">
                    {pendingRestocks.length === 0 ? (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <Package className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No pending restock requests</p>
                                <p className="text-slate-400 text-sm mt-1">All caught up!</p>
                            </CardContent>
                        </Card>
                    ) : (
                        <div className="grid gap-3">
                            {pendingRestocks.map(req => (
                                <Card key={req.id} className="rounded-2xl border-l-4 border-l-amber-400">
                                    <CardContent className="py-4 px-5">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 mb-1">
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

                    {/* Recently Completed */}
                    <div className="mt-6">
                        <button
                            onClick={() => setShowDoneRestocks(!showDoneRestocks)}
                            className="flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                        >
                            {showDoneRestocks ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            Recently Completed ({doneRestocks.length})
                        </button>
                        {showDoneRestocks && (
                            <div className="grid gap-2 mt-3">
                                {doneRestocks.length === 0 ? (
                                    <p className="text-sm text-slate-400 pl-6">No completed requests yet.</p>
                                ) : (
                                    doneRestocks.map(req => (
                                        <Card key={req.id} className="rounded-2xl opacity-70">
                                            <CardContent className="py-3 px-5">
                                                <div className="flex items-center justify-between">
                                                    <div>
                                                        <span className="font-semibold text-slate-700 text-sm">
                                                            {req.unit?.unit_number || 'Hotel Supplies'}
                                                        </span>
                                                        <span className="text-slate-400 text-sm ml-2">{req.items}</span>
                                                    </div>
                                                    <div className="flex items-center gap-2 text-xs text-slate-400">
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
                                                <div className="flex items-end gap-2">
                                                    {ticket.status === 'OPEN' && (
                                                        <>
                                                            <textarea
                                                                placeholder="Notes (optional)..."
                                                                value={resolutionNotes[ticket.id] || ''}
                                                                onChange={e => setResolutionNotes(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                                                                className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-violet-300"
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
                                                                className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-violet-300"
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
        </div>
    )
}
