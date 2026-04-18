'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import {
    Shield,
    LayoutDashboard,
    Users,
    Eye,
    UserCog,
    DollarSign,
    Wrench,
    Briefcase,
    Calendar,
    MapPin,
    Loader2,
    Archive,
    Building2,
    ClipboardList,
} from 'lucide-react'
import { CommandCenter } from '@/components/admin/CommandCenter'
import { GuestHistory } from '@/components/admin/GuestHistory'
import { LiveOccupancy } from '@/components/admin/LiveOccupancy'
import { StaffManager } from '@/components/admin/StaffManager'
import { Financials } from '@/components/admin/Financials'
import { OpsOverview } from '@/components/admin/OpsOverview'
import { HROverview } from '@/components/admin/HROverview'
import { ReservationsOverview } from '@/components/admin/ReservationsOverview'
import { AadharArchive } from '@/components/admin/AadharArchive'
import { ReportsOverview } from '@/components/admin/ReportsOverview'

// ============================================================
// Shared props interface for all admin tab components
// ============================================================
export interface AdminTabProps {
    hotelId: string | null  // null = all hotels
    hotels: { id: string; name: string; city: string; status: string }[]
    staffId: string
}

// ============================================================
// Tab definitions
// ============================================================
type TabKey = 'command' | 'guests' | 'live' | 'staff' | 'financials' | 'ops' | 'hr' | 'reservations' | 'reports'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'command',         label: 'Command Center',   icon: <LayoutDashboard className="h-4 w-4" /> },
    { key: 'guests',          label: 'Guest History',    icon: <Users className="h-4 w-4" /> },
    { key: 'live',            label: 'Live Occupancy',   icon: <Eye className="h-4 w-4" /> },
    { key: 'staff',           label: 'Staff',            icon: <UserCog className="h-4 w-4" /> },
    { key: 'financials',      label: 'Financials',       icon: <DollarSign className="h-4 w-4" /> },
    { key: 'ops',             label: 'Operations',       icon: <Wrench className="h-4 w-4" /> },
    { key: 'hr',              label: 'HR & Payroll',     icon: <Briefcase className="h-4 w-4" /> },
    { key: 'reservations',    label: 'Reservations',     icon: <Calendar className="h-4 w-4" /> },
    { key: 'reports',          label: 'Reports',          icon: <ClipboardList className="h-4 w-4" /> },
]

// ============================================================
// Admin Shell Component
// ============================================================
interface AdminClientProps {
    hotelId: string
    staffId: string
}

export function AdminClient({ hotelId, staffId }: AdminClientProps) {
    const [tab, setTab] = useState<TabKey>('command')
    const [hotels, setHotels] = useState<{ id: string; name: string; city: string; status: string }[]>([])
    const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null) // null = all hotels
    const [loadingHotels, setLoadingHotels] = useState(true)
    const [archiveOpen, setArchiveOpen] = useState(false)

    // Fetch all hotels on mount
    useEffect(() => {
        async function fetchHotels() {
            const { data } = await supabase
                .from('hotels')
                .select('id, name, city, status')
                .order('name')
            if (data) setHotels(data)
            setLoadingHotels(false)
        }
        fetchHotels()
    }, [])

    // Resolve the hotel selector value for the Select component
    // 'all' string maps to null in our state
    const selectorValue = selectedHotelId ?? 'all'

    const handleHotelChange = (value: string) => {
        setSelectedHotelId(value === 'all' ? null : value)
    }

    // Props passed to every tab component
    const tabProps: AdminTabProps = {
        hotelId: selectedHotelId,
        hotels,
        staffId,
    }

    if (loadingHotels) {
        return (
            <div className="flex items-center justify-center py-32">
                <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
            </div>
        )
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500 max-w-7xl mx-auto">
            {/* ==================== Header ==================== */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900 text-white shadow-sm">
                        <Shield className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                            Admin &mdash; God Mode
                        </h1>
                        <p className="text-slate-500 mt-0.5 text-sm">
                            Complete system control and visibility
                        </p>
                    </div>
                </div>

                {/* Hotel Selector + Archive */}
                <div className="flex items-center gap-2 w-full sm:w-auto">
                    <div className="flex-1 sm:w-72">
                        <Select value={selectorValue} onValueChange={handleHotelChange}>
                            <SelectTrigger className="w-full bg-white border-slate-200">
                                <MapPin className="h-4 w-4 mr-2 text-slate-500" />
                                <SelectValue placeholder="Select scope" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Hotels</SelectItem>
                                {hotels.map(h => (
                                    <SelectItem key={h.id} value={h.id}>
                                        {h.name} &mdash; {h.city}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)} className="shrink-0">
                        <Archive className="h-4 w-4 mr-1" />
                        Aadhar Archive
                    </Button>
                </div>
            </div>

            {/* ==================== Tab Bar ==================== */}
            <div className="relative">
                <div className="overflow-x-auto -mx-2 px-2 pb-1 scrollbar-hide">
                    <div className="flex bg-white rounded-xl p-1 border border-slate-200 shadow-sm w-fit min-w-fit">
                        {TABS.map(t => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-lg cursor-pointer transition-all whitespace-nowrap ${
                                    tab === t.key
                                        ? 'bg-slate-900 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
                {/* Right fade indicator for mobile scroll hint */}
                <div className="absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-slate-50 to-transparent pointer-events-none md:hidden" />
            </div>

            {/* ==================== Active Tab Content ==================== */}
            <div>
                {tab === 'command'      && <CommandCenter {...tabProps} />}
                {tab === 'guests'       && <GuestHistory {...tabProps} />}
                {tab === 'live'         && <LiveOccupancy {...tabProps} />}
                {tab === 'staff'        && <StaffManager {...tabProps} />}
                {tab === 'financials'   && <Financials {...tabProps} />}
                {tab === 'ops'          && <OpsOverview {...tabProps} />}
                {tab === 'hr'           && <HROverview {...tabProps} />}
                {tab === 'reservations'    && <ReservationsOverview {...tabProps} />}
                {tab === 'reports'         && <ReportsOverview {...tabProps} />}
            </div>

            {/* Aadhar Archive Modal */}
            <AadharArchive open={archiveOpen} onClose={() => setArchiveOpen(false)} />
        </div>
    )
}
