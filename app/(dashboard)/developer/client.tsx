'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import {
    Wrench,
    Activity,
    Clock,
    Database,
    Zap,
    Trash2,
    Loader2,
    MapPin,
} from 'lucide-react'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { SystemHealth } from '@/components/developer/SystemHealth'
import { TimeMachine } from '@/components/developer/TimeMachine'

// ============================================================
// Tab definitions
// ============================================================
type TabKey = 'health' | 'time'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'health', label: 'System Health', icon: <Activity className="h-4 w-4" /> },
    { key: 'time',   label: 'Time Machine',  icon: <Clock className="h-4 w-4" /> },
]

// ============================================================
// Shared props for dev tab components
// ============================================================
export interface DevTabProps {
    hotelId: string | null  // null = all hotels
    hotels: { id: string; name: string; city: string; status: string }[]
    staffId: string
}

// ============================================================
// Dev Shell Component
// ============================================================
interface DevClientProps {
    hotelId: string
    staffId: string
}

export function DevClient({ hotelId, staffId }: DevClientProps) {
    const [tab, setTab] = useState<TabKey>('health')
    const [hotels, setHotels] = useState<{ id: string; name: string; city: string; status: string }[]>([])
    const [selectedHotelId, setSelectedHotelId] = useState<string | null>(null)
    const [loadingHotels, setLoadingHotels] = useState(true)

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

    const selectorValue = selectedHotelId ?? 'all'

    const handleHotelChange = (value: string) => {
        setSelectedHotelId(value === 'all' ? null : value)
    }

    const tabProps: DevTabProps = {
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
                        <Wrench className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                            Dev Tools
                        </h1>
                        <p className="text-slate-500 mt-0.5 text-sm">
                            System health, time simulation &amp; debugging
                        </p>
                    </div>
                </div>

                {/* Hotel Selector */}
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
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50'
                                }`}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ==================== Active Tab Content ==================== */}
            <div>
                {tab === 'health' && <SystemHealth {...tabProps} />}
                {tab === 'time'   && <TimeMachine {...tabProps} />}
            </div>
        </div>
    )
}
