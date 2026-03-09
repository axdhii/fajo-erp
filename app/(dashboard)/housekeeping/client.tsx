'use client'

import { useEffect, useState } from 'react'
import { useUnitStore } from '@/lib/store/unit-store'
import type { UnitStatus } from '@/lib/types'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
    Sparkles,
    Play,
    CheckCircle2,
    AlertTriangle,
    Loader2,
    BedDouble,
    BedSingle,
    ShowerHead,
    PackageCheck,
    SprayCan,
} from 'lucide-react'

interface HousekeepingClientProps {
    hotelId: string
    staffId: string
}

interface CleaningChecklist {
    cleanRoom: boolean
    cleanWashroom: boolean
    newAmenities: boolean
}

const emptyChecklist = (): CleaningChecklist => ({
    cleanRoom: false,
    cleanWashroom: false,
    newAmenities: false,
})

export function HousekeepingClient({
    hotelId,
    staffId,
}: HousekeepingClientProps) {
    const { units, fetchUnits, subscribeToUnits, startPolling, updateUnitStatus } =
        useUnitStore()
    const [processingIds, setProcessingIds] = useState<Set<string>>(new Set())
    const [checklists, setChecklists] = useState<
        Record<string, CleaningChecklist>
    >({})

    useEffect(() => {
        fetchUnits(hotelId)

        // Real-time subscription (instant updates if Supabase RT is enabled)
        const unsubscribeRT = subscribeToUnits(hotelId)

        // Polling fallback (guaranteed updates every 10s)
        const stopPolling = startPolling(hotelId, false, 10000)

        // Dev toolbar event listener
        const handleDevChange = () => fetchUnits(hotelId)
        window.addEventListener('dev-data-changed', handleDevChange)

        return () => {
            unsubscribeRT()
            stopPolling()
            window.removeEventListener('dev-data-changed', handleDevChange)
        }
    }, [hotelId, fetchUnits, subscribeToUnits, startPolling])

    // Show only DIRTY and IN_PROGRESS units
    const actionableUnits = units.filter(
        (u) => u.status === 'DIRTY' || u.status === 'IN_PROGRESS'
    )

    const dirtyCount = actionableUnits.filter(
        (u) => u.status === 'DIRTY'
    ).length
    const inProgressCount = actionableUnits.filter(
        (u) => u.status === 'IN_PROGRESS'
    ).length

    const getChecklist = (unitId: string): CleaningChecklist => {
        return checklists[unitId] || emptyChecklist()
    }

    const toggleChecklistItem = (
        unitId: string,
        item: keyof CleaningChecklist
    ) => {
        setChecklists((prev) => ({
            ...prev,
            [unitId]: {
                ...(prev[unitId] || emptyChecklist()),
                [item]: !(prev[unitId] || emptyChecklist())[item],
            },
        }))
    }

    const isChecklistComplete = (unitId: string): boolean => {
        const cl = getChecklist(unitId)
        return cl.cleanRoom && cl.cleanWashroom && cl.newAmenities
    }

    const handleStatusChange = async (
        unitId: string,
        unitNumber: string,
        newStatus: UnitStatus
    ) => {
        // For Mark as Ready from IN_PROGRESS, validate checklist
        // Quick Clean (DIRTY→AVAILABLE) skips the checklist
        const currentUnit = units.find(u => u.id === unitId)
        if (newStatus === 'AVAILABLE' && currentUnit?.status === 'IN_PROGRESS' && !isChecklistComplete(unitId)) {
            toast.error('Complete the cleaning checklist first!')
            return
        }

        setProcessingIds((prev) => new Set(prev).add(unitId))

        try {
            const res = await fetch('/api/housekeeping', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ unitId, newStatus }),
            })

            const data = await res.json()

            if (!res.ok) {
                toast.error(data.error || 'Failed to update status')
                return
            }

            await updateUnitStatus(unitId, newStatus)

            if (newStatus === 'IN_PROGRESS') {
                toast.success(`Started cleaning ${unitNumber}`)
            } else if (newStatus === 'AVAILABLE') {
                toast.success(`${unitNumber} is now Available ✨`)
                // Clear checklist
                setChecklists((prev) => {
                    const next = { ...prev }
                    delete next[unitId]
                    return next
                })
            }
        } catch (err) {
            toast.error('Network error. Please try again.')
        } finally {
            setProcessingIds((prev) => {
                const next = new Set(prev)
                next.delete(unitId)
                return next
            })
        }
    }

    const checklistItems: {
        key: keyof CleaningChecklist
        label: string
        icon: React.ReactNode
        color: string
    }[] = [
            {
                key: 'cleanRoom',
                label: 'Clean the Room',
                icon: <SprayCan className="h-4 w-4" />,
                color: 'text-emerald-500',
            },
            {
                key: 'cleanWashroom',
                label: 'Clean the Washroom',
                icon: <ShowerHead className="h-4 w-4" />,
                color: 'text-blue-500',
            },
            {
                key: 'newAmenities',
                label: 'Set New Amenities',
                icon: <PackageCheck className="h-4 w-4" />,
                color: 'text-amber-500',
            },
        ]

    return (
        <div className="space-y-6 max-w-lg mx-auto pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                    Housekeeping
                </h1>
                <p className="text-sm text-slate-500 mt-1">
                    Units that need your attention
                </p>
            </div>

            {/* Summary Pills */}
            <div className="flex gap-3">
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <div>
                        <p className="text-lg font-bold text-amber-700 leading-none">
                            {dirtyCount}
                        </p>
                        <p className="text-[9px] font-semibold text-amber-500 uppercase tracking-widest mt-0.5">
                            Dirty
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2 bg-sky-50 border border-sky-200 rounded-xl px-4 py-2.5">
                    <Loader2 className="h-4 w-4 text-sky-500 animate-spin" />
                    <div>
                        <p className="text-lg font-bold text-sky-700 leading-none">
                            {inProgressCount}
                        </p>
                        <p className="text-[9px] font-semibold text-sky-500 uppercase tracking-widest mt-0.5">
                            In Progress
                        </p>
                    </div>
                </div>
            </div>

            {/* Unit Cards */}
            <div className="space-y-3">
                {actionableUnits.map((unit) => {
                    const isDirty = unit.status === 'DIRTY'
                    const isProcessing = processingIds.has(unit.id)
                    const isDorm = unit.type === 'DORM'
                    const checklist = getChecklist(unit.id)
                    const allChecked = isChecklistComplete(unit.id)

                    return (
                        <Card
                            key={unit.id}
                            className={`overflow-hidden transition-all ${isDirty
                                ? 'border-amber-200 bg-amber-50/30'
                                : 'border-sky-200 bg-sky-50/30'
                                }`}
                        >
                            {/* Card Header Bar */}
                            <div
                                className={`px-4 py-3 border-b flex items-center justify-between ${isDirty
                                    ? 'bg-amber-500/10 border-amber-200'
                                    : 'bg-sky-500/10 border-sky-200'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    {isDorm ? (
                                        <BedSingle className="h-4 w-4 text-slate-400" />
                                    ) : (
                                        <BedDouble className="h-4 w-4 text-slate-400" />
                                    )}
                                    <span className="font-bold text-lg text-slate-800">
                                        {unit.unit_number}
                                    </span>
                                    <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-widest bg-white/80 px-2 py-0.5 rounded-full">
                                        {isDorm ? 'Dorm' : 'Room'}
                                    </span>
                                </div>
                                <span
                                    className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${isDirty
                                        ? 'bg-amber-100 text-amber-700'
                                        : 'bg-sky-100 text-sky-700'
                                        }`}
                                >
                                    {isDirty ? (
                                        <span className="flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3" />
                                            Dirty
                                        </span>
                                    ) : (
                                        <span className="flex items-center gap-1">
                                            <Loader2 className="h-3 w-3 animate-spin" />
                                            Cleaning
                                        </span>
                                    )}
                                </span>
                            </div>

                            {/* Checklist (only for IN_PROGRESS) */}
                            {!isDirty && (
                                <CardContent className="px-4 pt-4 pb-2 space-y-2">
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                                        Cleaning Checklist
                                    </p>
                                    {checklistItems.map((item) => (
                                        <label
                                            key={item.key}
                                            className={`flex items-center gap-3 p-2.5 rounded-xl cursor-pointer transition-all border ${checklist[item.key]
                                                ? 'bg-emerald-50/50 border-emerald-200'
                                                : 'bg-white border-slate-200 hover:border-slate-300'
                                                }`}
                                        >
                                            <input
                                                type="checkbox"
                                                checked={checklist[item.key]}
                                                onChange={() =>
                                                    toggleChecklistItem(
                                                        unit.id,
                                                        item.key
                                                    )
                                                }
                                                className="w-5 h-5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                                            />
                                            <span
                                                className={`${checklist[item.key] ? 'text-slate-400' : item.color}`}
                                            >
                                                {item.icon}
                                            </span>
                                            <span
                                                className={`text-sm font-medium flex-1 ${checklist[item.key]
                                                    ? 'line-through text-slate-400'
                                                    : 'text-slate-700'
                                                    }`}
                                            >
                                                {item.label}
                                            </span>
                                            {checklist[item.key] && (
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                            )}
                                        </label>
                                    ))}
                                </CardContent>
                            )}

                            {/* Action Button */}
                            <CardFooter className="p-3">
                                {isDirty ? (
                                    <div className="w-full space-y-2">
                                        <Button
                                            onClick={() =>
                                                handleStatusChange(
                                                    unit.id,
                                                    unit.unit_number,
                                                    'IN_PROGRESS'
                                                )
                                            }
                                            disabled={isProcessing}
                                            className="w-full h-11 bg-amber-500 hover:bg-amber-600 text-white font-semibold shadow-lg shadow-amber-500/20 rounded-xl transition-all active:scale-[0.98]"
                                        >
                                            {isProcessing ? (
                                                <span className="flex items-center gap-2">
                                                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                    Starting...
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2">
                                                    <Play className="h-4 w-4" />
                                                    Start Cleaning
                                                </span>
                                            )}
                                        </Button>
                                        <button
                                            onClick={() => {
                                                // Quick Clean: skip checklist and IN_PROGRESS, go straight to AVAILABLE
                                                handleStatusChange(
                                                    unit.id,
                                                    unit.unit_number,
                                                    'AVAILABLE'
                                                )
                                            }}
                                            disabled={isProcessing}
                                            className="w-full py-2 text-[10px] font-semibold text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded-lg transition-colors"
                                        >
                                            ⚡ Quick Clean — Mark Available Instantly
                                        </button>
                                    </div>
                                ) : (
                                    <Button
                                        onClick={() =>
                                            handleStatusChange(
                                                unit.id,
                                                unit.unit_number,
                                                'AVAILABLE'
                                            )
                                        }
                                        disabled={isProcessing || !allChecked}
                                        className={`w-full h-11 font-semibold rounded-xl transition-all active:scale-[0.98] ${allChecked
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/20'
                                            : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                            }`}
                                    >
                                        {isProcessing ? (
                                            <span className="flex items-center gap-2">
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                                Finishing...
                                            </span>
                                        ) : allChecked ? (
                                            <span className="flex items-center gap-2">
                                                <CheckCircle2 className="h-4 w-4" />
                                                Mark as Ready
                                            </span>
                                        ) : (
                                            <span className="flex items-center gap-2">
                                                <AlertTriangle className="h-4 w-4" />
                                                Complete checklist first
                                            </span>
                                        )}
                                    </Button>
                                )}
                            </CardFooter>
                        </Card>
                    )
                })}

                {/* Empty State */}
                {actionableUnits.length === 0 && (
                    <div className="text-center py-16 px-6 rounded-2xl border-2 border-dashed border-emerald-200 bg-emerald-50/50">
                        <Sparkles className="h-14 w-14 mx-auto mb-4 text-emerald-400 opacity-50" />
                        <h3 className="text-lg font-bold text-emerald-800">
                            All clean! 🎉
                        </h3>
                        <p className="text-sm text-emerald-600 mt-1 opacity-80">
                            No rooms or beds need attention right now. Take a
                            break!
                        </p>
                    </div>
                )}
            </div>
        </div>
    )
}
