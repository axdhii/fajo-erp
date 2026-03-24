'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
    Wrench,
    Package,
    AlertTriangle,
    Clock,
    CheckCircle2,
    Play,
} from 'lucide-react'
import type { MaintenanceTicket, RestockRequest } from '@/lib/types'
import { timeAgo } from '@/lib/utils/time'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

// Extended types with cross-hotel joined data
interface TicketWithHotel extends MaintenanceTicket {
    hotel?: { name: string } | null
}

interface RestockWithHotel extends RestockRequest {
    hotel?: { name: string } | null
}

const PRIORITY_STYLES: Record<string, { bg: string; text: string }> = {
    URGENT: { bg: 'bg-red-100', text: 'text-red-700' },
    HIGH: { bg: 'bg-amber-100', text: 'text-amber-700' },
    MEDIUM: { bg: 'bg-slate-100', text: 'text-slate-700' },
    LOW: { bg: 'bg-gray-100', text: 'text-gray-500' },
}

export function OpsOverview({ hotelId, hotels, staffId }: AdminTabProps) {
    const [tickets, setTickets] = useState<TicketWithHotel[]>([])
    const [restocks, setRestocks] = useState<RestockWithHotel[]>([])
    const [updatingTicket, setUpdatingTicket] = useState<string | null>(null)
    const [completingRestock, setCompletingRestock] = useState<string | null>(null)
    const [resolvingId, setResolvingId] = useState<string | null>(null)
    const [resolveNotes, setResolveNotes] = useState('')
    const [maintenanceUnits, setMaintenanceUnits] = useState(0)

    // Fetch maintenance tickets
    const fetchTickets = useCallback(async () => {
        let query = supabase
            .from('maintenance_tickets')
            .select('*, unit:units(unit_number, hotel_id), staff:reported_by(name), hotel:hotel_id(name)')
            .in('status', ['OPEN', 'IN_PROGRESS'])
            .order('created_at', { ascending: false })

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { data } = await query
        if (data) setTickets(data as TicketWithHotel[])
    }, [hotelId])

    // Fetch restock requests
    const fetchRestocks = useCallback(async () => {
        let query = supabase
            .from('restock_requests')
            .select('*, unit:units(unit_number), staff:requested_by(name), hotel:hotel_id(name)')
            .eq('status', 'PENDING')
            .order('created_at', { ascending: false })

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { data } = await query
        if (data) setRestocks(data as RestockWithHotel[])
    }, [hotelId])

    // Count units in MAINTENANCE status
    const fetchMaintenanceUnits = useCallback(async () => {
        let query = supabase
            .from('units')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'MAINTENANCE')

        if (hotelId) {
            query = query.eq('hotel_id', hotelId)
        }

        const { count } = await query
        setMaintenanceUnits(count ?? 0)
    }, [hotelId])

    useEffect(() => {
        fetchTickets()
        fetchRestocks()
        fetchMaintenanceUnits()
    }, [fetchTickets, fetchRestocks, fetchMaintenanceUnits])

    // Realtime: maintenance_tickets
    useEffect(() => {
        const pgFilter = hotelId ? `hotel_id=eq.${hotelId}` : undefined

        const channel = supabase
            .channel(`admin_maint_${hotelId ?? 'all'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'maintenance_tickets',
                ...(pgFilter ? { filter: pgFilter } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any, () => {
                fetchTickets()
                fetchMaintenanceUnits()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [hotelId, fetchTickets, fetchMaintenanceUnits])

    // Realtime: restock_requests
    useEffect(() => {
        const restockFilter = hotelId ? `hotel_id=eq.${hotelId}` : undefined

        const channel = supabase
            .channel(`admin_restock_${hotelId ?? 'all'}`)
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'restock_requests',
                ...(restockFilter ? { filter: restockFilter } : {}),
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any, () => {
                fetchRestocks()
            })
            .subscribe()

        return () => { supabase.removeChannel(channel) }
    }, [hotelId, fetchRestocks])

    // Hotel name helper
    const getHotelName = (ticket: TicketWithHotel | RestockWithHotel): string => {
        if (ticket.hotel && typeof ticket.hotel === 'object' && 'name' in ticket.hotel) {
            return (ticket.hotel as { name: string }).name
        }
        const found = hotels.find(h => h.id === ticket.hotel_id)
        return found?.name ?? 'Unknown'
    }

    // Start ticket (OPEN -> IN_PROGRESS)
    const handleStart = async (ticketId: string) => {
        setUpdatingTicket(ticketId)
        try {
            const res = await fetch('/api/maintenance', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id: ticketId, status: 'IN_PROGRESS' }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Ticket started')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to start ticket')
        } finally {
            setUpdatingTicket(null)
        }
    }

    // Resolve ticket
    const handleResolve = async (ticketId: string) => {
        setUpdatingTicket(ticketId)
        try {
            const res = await fetch('/api/maintenance', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ticket_id: ticketId,
                    status: 'RESOLVED',
                    resolution_notes: resolveNotes || null,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)
            toast.success('Ticket resolved')
            setResolvingId(null)
            setResolveNotes('')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to resolve ticket')
        } finally {
            setUpdatingTicket(null)
        }
    }

    // Mark restock done
    const handleRestockDone = async (requestId: string) => {
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
            toast.error(err instanceof Error ? err.message : 'Failed to update restock')
        } finally {
            setCompletingRestock(null)
        }
    }

    const openCount = tickets.filter(t => t.status === 'OPEN').length
    const inProgressCount = tickets.filter(t => t.status === 'IN_PROGRESS').length

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Card className="border-red-100 bg-white">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Open Tickets</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{openCount + inProgressCount}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {openCount} open, {inProgressCount} in progress
                                </p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center">
                                <Wrench className="h-6 w-6 text-red-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-amber-100 bg-white">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pending Restocks</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{restocks.length}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">awaiting completion</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-amber-50 flex items-center justify-center">
                                <Package className="h-6 w-6 text-amber-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-violet-100 bg-white">
                    <CardContent className="py-4 px-5">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Units in Maintenance</p>
                                <p className="text-3xl font-bold text-slate-900 mt-1">{maintenanceUnits}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">currently offline</p>
                            </div>
                            <div className="h-12 w-12 rounded-xl bg-violet-50 flex items-center justify-center">
                                <AlertTriangle className="h-6 w-6 text-violet-500" />
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Maintenance Tickets */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Wrench className="h-5 w-5 text-red-600" />
                        Maintenance Tickets ({tickets.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {tickets.length === 0 ? (
                        <div className="py-10 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">No open maintenance tickets.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {tickets.map(t => (
                                <div key={t.id} className="bg-slate-50 rounded-xl border border-slate-100 px-4 py-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                {t.unit && typeof t.unit === 'object' && 'unit_number' in t.unit && (
                                                    <span className="text-sm font-bold text-slate-800">
                                                        Unit {(t.unit as { unit_number: string }).unit_number}
                                                    </span>
                                                )}
                                                {!hotelId && (
                                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                        {getHotelName(t)}
                                                    </span>
                                                )}
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${PRIORITY_STYLES[t.priority]?.bg ?? 'bg-gray-100'} ${PRIORITY_STYLES[t.priority]?.text ?? 'text-gray-500'}`}>
                                                    {t.priority}
                                                </span>
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                    t.status === 'IN_PROGRESS'
                                                        ? 'bg-cyan-100 text-cyan-700'
                                                        : 'bg-slate-200 text-slate-600'
                                                }`}>
                                                    {t.status === 'IN_PROGRESS' ? 'In Progress' : 'Open'}
                                                </span>
                                            </div>
                                            <p className="text-sm text-slate-600 mt-1">{t.description}</p>
                                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-400">
                                                {t.staff && typeof t.staff === 'object' && 'name' in t.staff && (
                                                    <span>Reported by: {(t.staff as { name: string | null }).name ?? 'Unknown'}</span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <Clock className="h-3 w-3" />
                                                    {timeAgo(t.created_at)}
                                                </span>
                                            </div>
                                        </div>

                                        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                                            {t.status === 'OPEN' && (
                                                <Button
                                                    size="sm"
                                                    onClick={() => handleStart(t.id)}
                                                    disabled={updatingTicket === t.id}
                                                    className="h-7 text-xs bg-cyan-600 hover:bg-cyan-700"
                                                >
                                                    <Play className="h-3 w-3 mr-1" /> Start
                                                </Button>
                                            )}
                                            {resolvingId === t.id ? (
                                                <div className="flex flex-col gap-1.5 w-48">
                                                    <Input
                                                        value={resolveNotes}
                                                        onChange={e => setResolveNotes(e.target.value)}
                                                        placeholder="Resolution notes..."
                                                        className="h-7 text-xs"
                                                    />
                                                    <div className="flex gap-1">
                                                        <Button
                                                            size="sm"
                                                            onClick={() => handleResolve(t.id)}
                                                            disabled={updatingTicket === t.id}
                                                            className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 flex-1"
                                                        >
                                                            <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            variant="ghost"
                                                            onClick={() => { setResolvingId(null); setResolveNotes('') }}
                                                            className="h-7 text-xs"
                                                        >
                                                            Cancel
                                                        </Button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => setResolvingId(t.id)}
                                                    className="h-7 text-xs text-emerald-700 border-emerald-200 hover:bg-emerald-50"
                                                >
                                                    <CheckCircle2 className="h-3 w-3 mr-1" /> Resolve
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Restock Requests */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                        <Package className="h-5 w-5 text-amber-600" />
                        Pending Restocks ({restocks.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {restocks.length === 0 ? (
                        <div className="py-10 text-center">
                            <CheckCircle2 className="h-8 w-8 text-emerald-300 mx-auto mb-2" />
                            <p className="text-sm text-slate-400">No pending restock requests.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {restocks.map(r => (
                                <div key={r.id} className="flex items-center justify-between bg-amber-50/50 rounded-xl border border-amber-100 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            {!hotelId && (
                                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700">
                                                    {getHotelName(r)}
                                                </span>
                                            )}
                                            {r.unit && typeof r.unit === 'object' && 'unit_number' in r.unit && (
                                                <span className="text-xs text-slate-500">
                                                    Unit {(r.unit as { unit_number: string }).unit_number}
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-sm text-slate-700 mt-1 font-medium">{r.items}</p>
                                        <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                                            {r.staff && typeof r.staff === 'object' && 'name' in r.staff && (
                                                <span>By: {(r.staff as { name: string | null }).name ?? 'Unknown'}</span>
                                            )}
                                            <span className="flex items-center gap-1">
                                                <Clock className="h-3 w-3" />
                                                {timeAgo(r.created_at)}
                                            </span>
                                        </div>
                                    </div>
                                    <Button
                                        size="sm"
                                        onClick={() => handleRestockDone(r.id)}
                                        disabled={completingRestock === r.id}
                                        className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 flex-shrink-0"
                                    >
                                        <CheckCircle2 className="h-3 w-3 mr-1" /> Done
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
