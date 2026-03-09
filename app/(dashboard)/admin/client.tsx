"use client"
import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { supabase } from '@/lib/supabase/client'
import { BarChart3, TrendingUp, Users, Building2, MapPin } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function AdminClient() {
    const [hotels, setHotels] = useState<any[]>([])
    const [selectedHotelId, setSelectedHotelId] = useState<string>('')
    const [stats, setStats] = useState({
        totalRooms: 0,
        occupiedRooms: 0,
        occupancyRate: 0,
        activeStaff: 0
    })

    // 1. Fetch available hotels
    useEffect(() => {
        async function fetchHotels() {
            const { data } = await supabase.from('hotels').select('*').order('name')
            if (data) {
                setHotels(data)
                if (data.length > 0) setSelectedHotelId(data[0].id)
            }
        }
        fetchHotels()
    }, [])

    // 2. Fetch stats when hotel changes
    useEffect(() => {
        if (!selectedHotelId) return

        async function fetchStats() {
            const { data: rooms } = await supabase.from('rooms').select('status').eq('hotel_id', selectedHotelId)
            const { data: staff } = await supabase.from('staff').select('id').eq('hotel_id', selectedHotelId).eq('is_idle', false)

            if (rooms) {
                const occupied = rooms.filter(r => r.status === 'Occupied').length
                const total = rooms.length
                setStats({
                    totalRooms: total,
                    occupiedRooms: occupied,
                    occupancyRate: total > 0 ? Math.round((occupied / total) * 100) : 0,
                    activeStaff: staff?.length || 0
                })
            }
        }
        fetchStats()
    }, [selectedHotelId])

    return (
        <div className="space-y-8 animate-in fade-in duration-500 max-w-6xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight text-slate-900">Admin Dashboard</h1>
                    <p className="text-slate-500 mt-1">High-level overview of hotel operations and occupancy.</p>
                </div>

                <div className="w-full sm:w-64">
                    <Select value={selectedHotelId} onValueChange={setSelectedHotelId}>
                        <SelectTrigger className="w-full bg-white border-slate-200">
                            <MapPin className="h-4 w-4 mr-2 text-emerald-600" />
                            <SelectValue placeholder="Select a hotel" />
                        </SelectTrigger>
                        <SelectContent>
                            {hotels.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-emerald-500/10 shadow-sm bg-white overflow-hidden relative group">
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-emerald-500 transform scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Total Occupancy</CardTitle>
                        <TrendingUp className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{stats.occupancyRate}%</div>
                        <p className="text-xs text-slate-500 mt-1">For selected property</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm bg-white border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Rooms Occupied</CardTitle>
                        <Building2 className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{stats.occupiedRooms} <span className="text-lg font-normal text-slate-400">/ {stats.totalRooms}</span></div>
                        <p className="text-xs text-slate-500 mt-1">Currently booked</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm bg-white border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Active Staff</CardTitle>
                        <Users className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">{stats.activeStaff}</div>
                        <p className="text-xs text-slate-500 mt-1">On shift right now</p>
                    </CardContent>
                </Card>

                <Card className="shadow-sm bg-white border-slate-200">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium text-slate-500">Revenue (Today)</CardTitle>
                        <BarChart3 className="h-4 w-4 text-slate-400" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-bold text-slate-900">₹45,200</div>
                        <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                            <TrendingUp className="h-3 w-3" /> +12% from yesterday
                        </p>
                    </CardContent>
                </Card>
            </div>

            <Card className="col-span-4 border-slate-200 shadow-sm mt-8">
                <CardHeader>
                    <CardTitle className="text-lg font-medium">Property Overview</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center border-t border-dashed bg-slate-50/50 m-4 rounded-xl">
                    <div className="text-center text-slate-400">
                        <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-20" />
                        Chart visualization will appear here
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
