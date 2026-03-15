'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    Building2,
    Users,
    DollarSign,
    BedDouble,
    BedSingle,
    AlertTriangle,
    CheckCircle2,
    Wrench,
    RefreshCw,
    Clock,
    Loader2,
    TrendingUp,
    Sparkles,
} from 'lucide-react'

interface HotelOverview {
    hotelId: string
    hotelName: string
    city: string
    status: string
    totalRooms: number
    occupiedRooms: number
    totalDorms: number
    occupiedDorms: number
    availableRooms: number
    availableDorms: number
    maintenanceUnits: number
    dirtyUnits: number
    todayRevenue: number
    cashRevenue: number
    digitalRevenue: number
    staffOnDuty: number
    totalStaff: number
    recentIncidents: number
    overdueCheckouts: {
        unitNumber: string
        guestName: string
        minutesOverdue: number
    }[]
}

interface ZonalClientProps {
    staffId: string
}

export function ZonalClient({ staffId }: ZonalClientProps) {
    const [hotels, setHotels] = useState<HotelOverview[]>([])
    const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null)
    const [loading, setLoading] = useState(true)

    const fetchData = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/zonal/overview')
            const json = await res.json()
            if (!res.ok) throw new Error(json.error || 'Failed to fetch')
            const hotelData: HotelOverview[] = json.data || []
            setHotels(hotelData)

            // Auto-select first active hotel if none selected
            setSelectedHotelId(prev => {
                if (prev) return prev
                const firstActive = hotelData.find(h => h.status !== 'MAINTENANCE')
                return firstActive?.hotelId || null
            })
        } catch (err) {
            console.error(err)
            toast.error('Failed to load zonal overview')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        fetchData()
    }, [fetchData])

    // Realtime: auto-refresh when units or bookings change (debounced to coalesce rapid changes)
    useEffect(() => {
        let debounceTimer: ReturnType<typeof setTimeout>
        const debouncedFetch = () => {
            clearTimeout(debounceTimer)
            debounceTimer = setTimeout(() => fetchData(), 2000)
        }

        const channel = supabase
            .channel('zonal_realtime')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance' }, debouncedFetch)
            .subscribe()

        return () => {
            clearTimeout(debounceTimer)
            supabase.removeChannel(channel)
        }
    }, [fetchData])

    const selectedHotel = hotels.find(h => h.hotelId === selectedHotelId)

    if (loading) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                        Zonal Dashboard
                    </h1>
                    <p className="text-slate-500 mt-1 text-sm">
                        Multi-property overview and analytics
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="icon"
                    onClick={() => fetchData()}
                    disabled={loading}
                    className="h-10 w-10 shrink-0 border-slate-200"
                    title="Refresh data"
                >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </Button>
            </div>

            {/* Hotel Cards Grid */}
            <div className="grid gap-4 md:grid-cols-2">
                {hotels.map(hotel => {
                    const isMaintenance = hotel.status === 'MAINTENANCE'
                    const isSelected = selectedHotelId === hotel.hotelId
                    const totalUnits = hotel.totalRooms + hotel.totalDorms
                    const occupiedUnits = hotel.occupiedRooms + hotel.occupiedDorms
                    const occupancyPct = totalUnits > 0 ? Math.round((occupiedUnits / totalUnits) * 100) : 0

                    return (
                        <Card
                            key={hotel.hotelId}
                            onClick={() => {
                                if (isMaintenance) {
                                    toast('This branch is under maintenance')
                                    return
                                }
                                setSelectedHotelId(hotel.hotelId)
                            }}
                            className={`cursor-pointer transition-all border shadow-sm overflow-hidden relative group ${
                                isMaintenance
                                    ? 'opacity-60 bg-slate-50 border-slate-200'
                                    : isSelected
                                        ? 'ring-2 ring-emerald-500 border-emerald-300 bg-white'
                                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'
                            }`}
                        >
                            {!isMaintenance && (
                                <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                            )}
                            <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Building2 className={`h-5 w-5 ${isMaintenance ? 'text-slate-400' : 'text-emerald-600'}`} />
                                        <div>
                                            <CardTitle className={`text-base font-bold ${isMaintenance ? 'text-slate-400' : 'text-slate-900'}`}>
                                                {hotel.hotelName}
                                            </CardTitle>
                                            <p className={`text-xs ${isMaintenance ? 'text-slate-400' : 'text-slate-500'}`}>
                                                {hotel.city}
                                            </p>
                                        </div>
                                    </div>
                                    {isMaintenance && (
                                        <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-200 text-slate-500 text-[10px] font-bold uppercase">
                                            <Wrench className="h-3 w-3" />
                                            Under Maintenance
                                        </span>
                                    )}
                                </div>
                            </CardHeader>
                            {!isMaintenance && (
                                <CardContent className="space-y-3">
                                    {/* Occupancy Bar */}
                                    <div>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="text-slate-500 font-medium">Occupancy</span>
                                            <span className="font-bold text-slate-700">{occupancyPct}%</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div
                                                className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-emerald-500 to-emerald-400"
                                                style={{ width: `${occupancyPct}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400">
                                            <span className="flex items-center gap-1">
                                                <BedDouble className="h-3 w-3" />
                                                Rooms {hotel.occupiedRooms}/{hotel.totalRooms}
                                            </span>
                                            <span className="flex items-center gap-1">
                                                <BedSingle className="h-3 w-3" />
                                                Dorms {hotel.occupiedDorms}/{hotel.totalDorms}
                                            </span>
                                        </div>
                                    </div>
                                    {/* Quick Metrics Row */}
                                    <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                            <DollarSign className="h-3.5 w-3.5 text-emerald-500" />
                                            <span className="font-bold">{'\u20B9'}{hotel.todayRevenue.toLocaleString('en-IN')}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                                            <Users className="h-3.5 w-3.5 text-violet-500" />
                                            <span className="font-medium">{hotel.staffOnDuty} on duty</span>
                                        </div>
                                    </div>
                                </CardContent>
                            )}
                        </Card>
                    )
                })}
            </div>

            {/* Selected Hotel Detail */}
            {selectedHotel && selectedHotel.status !== 'MAINTENANCE' && (
                <div className="space-y-6">
                    <div className="flex items-center gap-2">
                        <Sparkles className="h-4 w-4 text-emerald-500" />
                        <h2 className="text-lg font-bold text-slate-900">
                            {selectedHotel.hotelName} &mdash; Detailed View
                        </h2>
                    </div>

                    {/* Section 1: Stat Cards */}
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        {/* Occupancy */}
                        <Card className="border-emerald-500/10 shadow-sm bg-white overflow-hidden relative group">
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Occupancy</CardTitle>
                                <TrendingUp className="h-4 w-4 text-emerald-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-slate-900">
                                    {(selectedHotel.totalRooms + selectedHotel.totalDorms) > 0
                                        ? Math.round(
                                            ((selectedHotel.occupiedRooms + selectedHotel.occupiedDorms) /
                                                (selectedHotel.totalRooms + selectedHotel.totalDorms)) * 100
                                        )
                                        : 0}%
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <BedDouble className="h-3 w-3" />
                                        {selectedHotel.occupiedRooms}/{selectedHotel.totalRooms} rooms
                                    </p>
                                    <p className="text-[10px] text-slate-400 flex items-center gap-1">
                                        <BedSingle className="h-3 w-3" />
                                        {selectedHotel.occupiedDorms}/{selectedHotel.totalDorms} dorms
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Revenue */}
                        <Card className="shadow-sm bg-white border-slate-200 overflow-hidden relative group">
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-violet-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Revenue (Today)</CardTitle>
                                <DollarSign className="h-4 w-4 text-violet-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-slate-900">
                                    {'\u20B9'}{selectedHotel.todayRevenue.toLocaleString('en-IN')}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                    <p className="text-[10px] text-slate-400">
                                        Cash: {'\u20B9'}{selectedHotel.cashRevenue.toLocaleString('en-IN')}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        Digital: {'\u20B9'}{selectedHotel.digitalRevenue.toLocaleString('en-IN')}
                                    </p>
                                </div>
                            </CardContent>
                        </Card>

                        {/* Staff */}
                        <Card className="shadow-sm bg-white border-slate-200 overflow-hidden relative group">
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-amber-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Staff</CardTitle>
                                <Users className="h-4 w-4 text-amber-500" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-slate-900">
                                    {selectedHotel.staffOnDuty} <span className="text-lg font-normal text-slate-400">/ {selectedHotel.totalStaff}</span>
                                </div>
                                <p className="text-xs text-slate-500 mt-1">on duty</p>
                            </CardContent>
                        </Card>

                        {/* Housekeeping */}
                        <Card className="shadow-sm bg-white border-slate-200 overflow-hidden relative group">
                            <div className="absolute inset-x-0 bottom-0 h-1 bg-red-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left" />
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-slate-500">Housekeeping</CardTitle>
                                <AlertTriangle className="h-4 w-4 text-red-400" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-slate-900">{selectedHotel.dirtyUnits}</div>
                                <p className="text-xs text-slate-500 mt-1">rooms need cleaning</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Section 2: Checkout Alerts */}
                    {selectedHotel.overdueCheckouts.length > 0 ? (
                        <div className="rounded-2xl border px-5 py-4 bg-red-50 border-red-200">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                                    <AlertTriangle className="h-4 w-4" />
                                </div>
                                <div>
                                    <h3 className="text-sm font-bold text-red-800">
                                        Overdue Checkouts
                                        <span className="ml-2 px-2 py-0.5 rounded-full bg-red-200 text-red-700 text-[10px] font-bold uppercase">
                                            {selectedHotel.overdueCheckouts.length} overdue
                                        </span>
                                    </h3>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                {selectedHotel.overdueCheckouts.map((item) => (
                                    <div
                                        key={item.unitNumber}
                                        className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium bg-red-100/80 text-red-700"
                                    >
                                        <div className="flex items-center gap-2">
                                            <span className="relative flex h-2 w-2">
                                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                                                <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                                            </span>
                                            <span className="font-bold">{item.unitNumber}</span>
                                            <span className="text-[10px] opacity-70">{item.guestName}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Clock className="h-3 w-3" />
                                            <span className="font-bold">
                                                {item.minutesOverdue >= 60
                                                    ? `${Math.floor(item.minutesOverdue / 60)}h ${item.minutesOverdue % 60}m overdue`
                                                    : `${item.minutesOverdue}m overdue`}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-2xl border px-5 py-4 bg-emerald-50 border-emerald-200">
                            <div className="flex items-center gap-3">
                                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600">
                                    <CheckCircle2 className="h-4 w-4" />
                                </div>
                                <p className="text-sm font-medium text-emerald-700">No overdue checkouts</p>
                            </div>
                        </div>
                    )}

                    {/* Section 3: Quick Stats Row */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-white border border-slate-200">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-emerald-700 bg-emerald-50">
                                <BedDouble className="h-3.5 w-3.5" />
                            </div>
                            <div>
                                <p className="text-lg font-bold text-slate-900 leading-none">{selectedHotel.availableRooms}</p>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Avail. Rooms</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-white border border-slate-200">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-violet-700 bg-violet-50">
                                <BedSingle className="h-3.5 w-3.5" />
                            </div>
                            <div>
                                <p className="text-lg font-bold text-slate-900 leading-none">{selectedHotel.availableDorms}</p>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Avail. Dorms</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-white border border-slate-200">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-amber-700 bg-amber-50">
                                <Wrench className="h-3.5 w-3.5" />
                            </div>
                            <div>
                                <p className="text-lg font-bold text-slate-900 leading-none">{selectedHotel.maintenanceUnits}</p>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Maintenance</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2.5 rounded-xl px-4 py-3 bg-white border border-slate-200">
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg text-red-700 bg-red-50">
                                <AlertTriangle className="h-3.5 w-3.5" />
                            </div>
                            <div>
                                <p className="text-lg font-bold text-slate-900 leading-none">{selectedHotel.recentIncidents}</p>
                                <p className="text-[10px] font-medium text-slate-400 uppercase tracking-wider mt-0.5">Incidents (7d)</p>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
