'use client'

import { useEffect, useState } from 'react'
import { useUnitStore, UnitWithBooking } from '@/lib/store/unit-store'
import { useAuthStore } from '@/lib/store/auth-store'
import { UnitCard } from './UnitCard'
import { CheckInSheet } from './CheckInSheet'
import { CheckoutSheet } from './CheckoutSheet'
import { MaintenanceSheet } from './MaintenanceSheet'
import { ExtendSheet } from './ExtendSheet'

import { ReportIssueSheet } from './ReportIssueSheet'
import { toast } from 'sonner'
import type { UnitType, UnitStatus } from '@/lib/types'

interface UnitGridProps {
    hotelId: string
    typeFilter?: UnitType | 'ALL'
    statusFilter?: UnitStatus | 'ALL'
    now?: Date
}

export function UnitGrid({
    hotelId,
    typeFilter = 'ALL',
    statusFilter = 'ALL',
    now,
}: UnitGridProps) {
    const { units, fetchUnitsWithBookings, subscribeToUnits, isLoading } =
        useUnitStore()
    const { profile } = useAuthStore()
    const staffId = profile?.id || ''
    const [selectedUnit, setSelectedUnit] = useState<UnitWithBooking | null>(
        null
    )
    const [checkInOpen, setCheckInOpen] = useState(false)
    const [checkoutOpen, setCheckoutOpen] = useState(false)
    const [maintenanceOpen, setMaintenanceOpen] = useState(false)
    const [extendOpen, setExtendOpen] = useState(false)
    const [reportIssueOpen, setReportIssueOpen] = useState(false)
    const [actionMenuOpen, setActionMenuOpen] = useState(false)

    useEffect(() => {
        fetchUnitsWithBookings(hotelId)

        // Real-time subscription (instant updates via Supabase WebSocket)
        const unsubscribeRT = subscribeToUnits(hotelId, true)

        // Dev toolbar event listener (instant refresh on seed/reset/etc.)
        const handleDevChange = () => fetchUnitsWithBookings(hotelId)
        window.addEventListener('dev-data-changed', handleDevChange)

        return () => {
            unsubscribeRT()
            window.removeEventListener('dev-data-changed', handleDevChange)
        }
    }, [hotelId, fetchUnitsWithBookings, subscribeToUnits])

    const handleUnitClick = (unit: UnitWithBooking) => {
        setSelectedUnit(unit)
        // All statuses go through the action menu
        setActionMenuOpen(true)
    }

    const filteredUnits = units.filter((unit) => {
        if (typeFilter !== 'ALL' && unit.type !== typeFilter) return false
        if (statusFilter !== 'ALL' && unit.status !== statusFilter) return false
        return true
    })

    const [isForcing, setIsForcing] = useState(false)

    const handleForceStatus = async (newStatus: string, reason?: string) => {
        if (!selectedUnit) return
        setIsForcing(true)
        try {
            const res = await fetch('/api/overrides/force-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitId: selectedUnit.id,
                    newStatus,
                    reason: reason || `Force set to ${newStatus} by CRE`,
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(data.error || 'Force status failed')
                return
            }
            toast.success(data.message)
            handleDone()
        } catch {
            toast.error('Network error')
        } finally {
            setIsForcing(false)
        }
    }

    const handleEmergencyVacate = async () => {
        if (!selectedUnit) return
        const reason = prompt('Reason for emergency vacate:')
        if (reason === null) return // cancelled
        setIsForcing(true)
        try {
            const res = await fetch('/api/overrides/emergency-vacate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unitId: selectedUnit.id,
                    reason: reason || 'Emergency vacate',
                }),
            })
            const data = await res.json()
            if (!res.ok) {
                toast.error(data.error || 'Emergency vacate failed')
                return
            }
            toast.success(data.message)
            handleDone()
        } catch {
            toast.error('Network error')
        } finally {
            setIsForcing(false)
        }
    }

    const handleDone = () => {
        setCheckInOpen(false)
        setCheckoutOpen(false)
        setMaintenanceOpen(false)
        setExtendOpen(false)
        setReportIssueOpen(false)
        setActionMenuOpen(false)
        setSelectedUnit(null)
        fetchUnitsWithBookings(hotelId)
    }

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            </div>
        )
    }

    return (
        <>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 py-4">
                {filteredUnits.map((unit) => (
                    <UnitCard
                        key={unit.id}
                        unit={unit}
                        onClick={handleUnitClick}
                        now={now}
                    />
                ))}
                {filteredUnits.length === 0 && (
                    <div className="col-span-full flex h-48 items-center justify-center text-slate-400 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50">
                        <div className="text-center">
                            <p className="text-sm font-medium">
                                No units found
                            </p>
                            <p className="text-xs mt-1">
                                Try changing your filters
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <CheckInSheet
                unit={selectedUnit}
                open={checkInOpen}
                onOpenChange={setCheckInOpen}
                onSuccess={handleDone}
            />

            <CheckoutSheet
                unit={selectedUnit}
                open={checkoutOpen}
                onOpenChange={setCheckoutOpen}
                onSuccess={handleDone}
            />

            <MaintenanceSheet
                unit={selectedUnit}
                open={maintenanceOpen}
                onOpenChange={setMaintenanceOpen}
                onSuccess={handleDone}
            />

            <ExtendSheet
                unit={selectedUnit}
                open={extendOpen}
                onOpenChange={setExtendOpen}
                onSuccess={handleDone}
            />

            <ReportIssueSheet
                unit={selectedUnit}
                open={reportIssueOpen}
                onOpenChange={setReportIssueOpen}
                hotelId={hotelId}
                staffId={staffId}
            />

            {/* Action Menu for all clickable statuses */}
            {actionMenuOpen && selectedUnit && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
                        onClick={() => { setActionMenuOpen(false); setSelectedUnit(null) }}
                    />
                    <div className="relative z-10 w-full max-w-sm mx-4 mb-4 sm:mb-0 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-300">
                        <div className="px-5 pt-5 pb-3">
                            <h3 className="text-lg font-bold text-slate-900">
                                {selectedUnit.unit_number}
                            </h3>
                            <p className="text-xs text-slate-500">
                                Status: <span className="font-semibold">{selectedUnit.status.replace('_', ' ')}</span>
                            </p>
                        </div>
                        <div className="px-3 pb-2 space-y-1">
                            {/* CHECK-IN (only for AVAILABLE) */}
                            {selectedUnit.status === 'AVAILABLE' && (
                                <button
                                    onClick={() => { setActionMenuOpen(false); setCheckInOpen(true) }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-emerald-50 transition-colors group"
                                >
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 group-hover:bg-emerald-200 transition-colors">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M5 13l4 4L19 7" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">Check-In Guest</p>
                                        <p className="text-[10px] text-slate-400">Walk-in or scheduled arrival</p>
                                    </div>
                                </button>
                            )}

                            {/* CHECKOUT (only for OCCUPIED) */}
                            {selectedUnit.status === 'OCCUPIED' && (
                                <>
                                    <button
                                        onClick={() => { setActionMenuOpen(false); setExtendOpen(true) }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-blue-50 transition-colors group"
                                    >
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-600 group-hover:bg-blue-200 transition-colors">
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">Extend Stay</p>
                                            <p className="text-[10px] text-slate-400">Add hours/days to checkout</p>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => { setActionMenuOpen(false); setCheckoutOpen(true) }}
                                        className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-red-50 transition-colors group"
                                    >
                                        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600 group-hover:bg-red-200 transition-colors">
                                            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-800">Check-Out</p>
                                            <p className="text-[10px] text-slate-400">Normal checkout flow</p>
                                        </div>
                                    </button>
                                </>
                            )}

                            {/* MAINTENANCE (not for OCCUPIED — use Emergency Vacate instead) */}
                            {selectedUnit.status !== 'OCCUPIED' && (
                                <button
                                    onClick={() => { setActionMenuOpen(false); setMaintenanceOpen(true) }}
                                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-purple-50 transition-colors group"
                                >
                                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-purple-100 text-purple-600 group-hover:bg-purple-200 transition-colors">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><circle cx="12" cy="12" r="3" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-sm font-semibold text-slate-800">
                                            {selectedUnit.status === 'MAINTENANCE' ? 'View Maintenance' : 'Set Maintenance'}
                                        </p>
                                        <p className="text-[10px] text-slate-400">Mark as under repair</p>
                                    </div>
                                </button>
                            )}

                            {/* REPORT ISSUE (all statuses) */}
                            <button
                                onClick={() => { setActionMenuOpen(false); setReportIssueOpen(true) }}
                                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left hover:bg-red-50 transition-colors group"
                            >
                                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-100 text-red-600 group-hover:bg-red-200 transition-colors">
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">Report Issue</p>
                                    <p className="text-[10px] text-slate-400">Log a maintenance problem</p>
                                </div>
                            </button>
                        </div>

                        {/* Emergency Override Section */}
                        <div className="mx-3 border-t border-dashed border-slate-200 pt-2 pb-2">
                            <p className="px-4 text-[9px] font-bold uppercase tracking-widest text-red-400 mb-1">
                                ⚠ Emergency Overrides
                            </p>

                            {/* EMERGENCY VACATE (only for OCCUPIED) */}
                            {selectedUnit.status === 'OCCUPIED' && (
                                <button
                                    onClick={handleEmergencyVacate}
                                    disabled={isForcing}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-red-50 transition-colors group"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-red-700">Emergency Vacate</p>
                                        <p className="text-[9px] text-red-400">Force checkout → Maintenance</p>
                                    </div>
                                </button>
                            )}

                            {/* FORCE TO AVAILABLE (for DIRTY / IN_PROGRESS / OCCUPIED) */}
                            {selectedUnit.status !== 'AVAILABLE' && (
                                <button
                                    onClick={() => handleForceStatus('AVAILABLE')}
                                    disabled={isForcing}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-amber-50 transition-colors group"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-amber-700">Force Available</p>
                                        <p className="text-[9px] text-amber-500">Skip cleaning / release unit</p>
                                    </div>
                                </button>
                            )}

                            {/* FORCE TO DIRTY (for AVAILABLE / IN_PROGRESS) */}
                            {selectedUnit.status !== 'DIRTY' && selectedUnit.status !== 'OCCUPIED' && (
                                <button
                                    onClick={() => handleForceStatus('DIRTY')}
                                    disabled={isForcing}
                                    className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left hover:bg-slate-50 transition-colors group"
                                >
                                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-200 text-slate-600">
                                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    </div>
                                    <div>
                                        <p className="text-xs font-semibold text-slate-700">Force Dirty</p>
                                        <p className="text-[9px] text-slate-400">Send back to housekeeping</p>
                                    </div>
                                </button>
                            )}
                        </div>

                        <div className="px-3 pb-3">
                            <button
                                onClick={() => { setActionMenuOpen(false); setSelectedUnit(null) }}
                                className="w-full py-2.5 text-sm font-medium text-slate-400 hover:text-slate-600 transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

