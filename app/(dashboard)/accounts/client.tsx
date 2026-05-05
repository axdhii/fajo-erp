'use client'

// ============================================================
// FAJO ERP - Accounts Manager Dashboard
// ============================================================
// Two tabs only:
//   1. Financials  - reuses components/admin/Financials.tsx
//                    as-is (it has no write controls, just a
//                    PNG export today, plus a CSV export added
//                    via the existing report download flow).
//   2. Property Expenses - read-only viewer with filters and
//                    CSV export.  No approve/reject buttons.
//
// Hotel switcher mirrors the Admin dashboard: defaults to
// "All Hotels", lets the manager flip between consolidated and
// per-property views.
//
// IMPORTANT: this dashboard is reachable by Admin and Developer
// for preview, but the page itself is the role's home, so the
// shell is identical for everyone.

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { useAuthStore } from '@/lib/store/auth-store'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    DollarSign,
    Receipt,
    MapPin,
    Loader2,
    Calculator,
} from 'lucide-react'
import { Financials } from '@/components/admin/Financials'
import { ExpensesViewer } from '@/components/accounts/ExpensesViewer'
import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

type TabKey = 'financials' | 'expenses'

const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
    { key: 'financials', label: 'Financials',         icon: <DollarSign className="h-4 w-4" /> },
    { key: 'expenses',   label: 'Property Expenses',  icon: <Receipt className="h-4 w-4" /> },
]

interface AccountsClientProps {
    /** The signed-in staff member's home hotel.  Not used directly today
     *  (the user flips between "All Hotels" and any specific hotel via the
     *  selector), but kept in the contract so the page-level server entry
     *  can pass it through symmetrically with /admin. */
    hotelId: string
    staffId: string
}

export function AccountsClient({ staffId }: AccountsClientProps) {
    const { activeHotelId, setActiveHotelId } = useAuthStore()
    const [tab, setTab] = useState<TabKey>('financials')
    const [hotels, setHotels] = useState<{ id: string; name: string; city: string; status: string }[]>([])
    // Default to the manager's home hotel if the global switcher is empty;
    // null = all hotels.  We start at null so the first view is consolidated,
    // matching the plan ("defaulting to All Hotels").
    const [selectedHotelId, setSelectedHotelId] = useState<string | null>(activeHotelId || null)
    const [loadingHotels, setLoadingHotels] = useState(true)

    // Mirror the global header switcher.  When the header changes the
    // activeHotelId, sync ours so the tabs re-fetch.
    useEffect(() => {
        if (activeHotelId) setSelectedHotelId(activeHotelId)
    }, [activeHotelId])

    // Fetch all hotels once.
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

    // 'all' string maps to null in our state (Select can't take null).
    const selectorValue = selectedHotelId ?? 'all'

    const handleHotelChange = (value: string) => {
        const next = value === 'all' ? null : value
        setSelectedHotelId(next)
        // Keep the global switcher in lockstep when a concrete hotel is chosen.
        if (next) setActiveHotelId(next)
    }

    // Props passed to the Financials tab — identical contract to Admin.
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
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white shadow-sm">
                        <Calculator className="h-5 w-5" />
                    </div>
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
                            Accounts
                        </h1>
                        <p className="text-slate-500 mt-0.5 text-sm">
                            Money in, money out &mdash; read-only books
                        </p>
                    </div>
                </div>

                {/* Hotel selector - full-width on mobile, inline-right on desktop */}
                <div className="w-full sm:w-72">
                    <Select value={selectorValue} onValueChange={handleHotelChange}>
                        <SelectTrigger className="w-full bg-white border-slate-200 h-11">
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
            </div>

            {/* ==================== Active Tab Content ==================== */}
            <div>
                {tab === 'financials' && <Financials {...tabProps} />}
                {tab === 'expenses'   && <ExpensesViewer hotelId={selectedHotelId} hotels={hotels} />}
            </div>
        </div>
    )
}
