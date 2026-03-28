'use client'

import { useState, useEffect, useCallback } from 'react'
import type { DevTabProps } from '@/app/(dashboard)/developer/client'
import {
    Clock,
    FastForward,
    RotateCcw,
    Trash2,
    Database,
    Zap,
    ShieldOff,
    AlertTriangle,
    Loader2,
    RefreshCw,
    CheckCircle2,
    History,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// ============================================================
// Types
// ============================================================
interface TimeState {
    isSimulated: boolean
    currentTime: string
    realTime: string
}

// ============================================================
// Component
// ============================================================

export function TimeMachine({ hotelId, hotels, staffId }: DevTabProps) {
    const [timeState, setTimeState] = useState<TimeState | null>(null)
    const [loading, setLoading] = useState<string | null>(null)
    const [log, setLog] = useState<string[]>([])
    const [customDate, setCustomDate] = useState('')
    const [customTime, setCustomTime] = useState('')
    const [bypassCredentials, setBypassCredentials] = useState(false)

    // Load bypass state from localStorage
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('fajo_bypass_credentials')
            if (saved === 'true') setBypassCredentials(true)
        }
    }, [])

    const addLog = useCallback((msg: string) => {
        const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        setLog(prev => [`${ts} -- ${msg}`, ...prev].slice(0, 50))
    }, [])

    const fetchTime = useCallback(async () => {
        try {
            const res = await fetch('/api/dev/time')
            const data = await res.json()
            setTimeState(data)
        } catch {
            // Silently fail
        }
    }, [])

    // Initial fetch + poll every 2s
    useEffect(() => {
        fetchTime()
        const interval = setInterval(fetchTime, 2000)
        return () => clearInterval(interval)
    }, [fetchTime])

    const apiCall = useCallback(async (url: string, body: Record<string, unknown>, label: string) => {
        setLoading(label)
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (data.success) {
                addLog(`${label}: ${data.message}`)
                if (data.scenarios) {
                    data.scenarios.forEach((s: string) => addLog(`   ${s}`))
                }
                if (data.details) {
                    data.details.forEach((d: string) => addLog(`   ${d}`))
                }
                window.dispatchEvent(new CustomEvent('dev-data-changed'))
            } else {
                addLog(`${label}: ${data.error}`)
            }
            await fetchTime()
            return data
        } catch {
            addLog(`${label}: Network error`)
        } finally {
            setLoading(null)
        }
    }, [addLog, fetchTime])

    const handleSetTime = useCallback(() => {
        if (!customDate) return
        const timeStr = customTime || '12:00'
        const dateTime = new Date(`${customDate}T${timeStr}:00`)
        apiCall('/api/dev/time', { action: 'set', time: dateTime.toISOString() }, 'Set Time')
    }, [customDate, customTime, apiCall])

    const toggleBypass = useCallback(() => {
        const newVal = !bypassCredentials
        setBypassCredentials(newVal)
        localStorage.setItem('fajo_bypass_credentials', String(newVal))
        window.dispatchEvent(new CustomEvent('dev-bypass-changed'))
        addLog(newVal ? 'Credential validation bypassed' : 'Strict validation enabled')
    }, [bypassCredentials, addLog])

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleString('en-IN', {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">
            {/* ── Current Time Display ──────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${timeState?.isSimulated ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                        <Clock className="h-5 w-5" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                            System Clock
                        </h3>
                        {timeState?.isSimulated && (
                            <span className="text-xs font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                                TIME SIMULATED
                            </span>
                        )}
                    </div>
                </div>

                {timeState ? (
                    <div className="space-y-2">
                        <div className={`text-3xl font-mono font-bold tracking-tight ${timeState.isSimulated ? 'text-amber-600' : 'text-emerald-600'}`}>
                            {formatTime(timeState.currentTime)}
                        </div>
                        {timeState.isSimulated && (
                            <p className="text-sm text-slate-400">
                                Real time: {formatTime(timeState.realTime)}
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-slate-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading clock...
                    </div>
                )}
            </div>

            {/* ── Quick Advance ─────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <FastForward className="h-4 w-4 text-blue-500" />
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                        Quick Advance
                    </h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                        { label: '+1 Hour', hours: 1 },
                        { label: '+6 Hours', hours: 6 },
                        { label: '+12 Hours', hours: 12 },
                        { label: '+1 Day', days: 1 },
                        { label: '+3 Days', days: 3 },
                        { label: '+1 Week', days: 7 },
                        { label: '+2 Weeks', days: 14 },
                        { label: '+1 Month', days: 30 },
                    ].map(({ label, hours, days }) => (
                        <Button
                            key={label}
                            variant="outline"
                            onClick={() =>
                                apiCall('/api/dev/time', {
                                    action: 'advance',
                                    advanceHours: hours || 0,
                                    advanceDays: days || 0,
                                }, `Advance ${label}`)
                            }
                            disabled={loading !== null}
                            className="flex items-center justify-center gap-2 h-11"
                        >
                            <FastForward className="h-3.5 w-3.5 text-blue-500" />
                            {label}
                        </Button>
                    ))}
                </div>
            </div>

            {/* ── Custom Time Set ──────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <History className="h-4 w-4 text-violet-500" />
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                        Jump to Date &amp; Time
                    </h3>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 space-y-1.5">
                        <Label className="text-xs text-slate-500">Date</Label>
                        <Input
                            type="date"
                            value={customDate}
                            onChange={e => setCustomDate(e.target.value)}
                            className="h-11"
                        />
                    </div>
                    <div className="w-full sm:w-36 space-y-1.5">
                        <Label className="text-xs text-slate-500">Time</Label>
                        <Input
                            type="time"
                            value={customTime}
                            onChange={e => setCustomTime(e.target.value)}
                            placeholder="12:00"
                            className="h-11"
                        />
                    </div>
                    <div className="flex items-end">
                        <Button
                            onClick={handleSetTime}
                            disabled={!customDate || loading !== null}
                            className="h-11 px-6 bg-violet-600 hover:bg-violet-700 text-white"
                        >
                            {loading === 'Set Time' ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                                'Set'
                            )}
                        </Button>
                    </div>
                </div>

                {/* Reset button */}
                <div className="mt-4 pt-4 border-t border-slate-100">
                    <Button
                        variant="outline"
                        onClick={() => apiCall('/api/dev/time', { action: 'reset' }, 'Reset Time')}
                        disabled={loading !== null}
                        className="gap-2"
                    >
                        <RotateCcw className="h-4 w-4" />
                        Reset to Real Time
                    </Button>
                </div>
            </div>

            {/* ── Bypass Credentials ───────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${bypassCredentials ? 'bg-violet-100 text-violet-600' : 'bg-slate-100 text-slate-500'}`}>
                            <ShieldOff className="h-5 w-5" />
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-900">Bypass Credentials</h3>
                            <p className="text-xs text-slate-400">Skip guest credential validation for 1-click check-ins</p>
                        </div>
                    </div>
                    <button
                        onClick={toggleBypass}
                        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 ${
                            bypassCredentials ? 'bg-violet-500' : 'bg-slate-300'
                        }`}
                    >
                        <span
                            className={`inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                bypassCredentials ? 'translate-x-6' : 'translate-x-1'
                            }`}
                        />
                    </button>
                </div>
            </div>

            {/* ── Data Actions ─────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <Database className="h-4 w-4 text-emerald-500" />
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                        Data Actions
                    </h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <Button
                        variant="outline"
                        onClick={() => apiCall('/api/dev/auto-checkout', {}, 'Dorm Auto-Checkout')}
                        disabled={loading !== null}
                        className="h-12 gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
                    >
                        {loading === 'Dorm Auto-Checkout' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Zap className="h-4 w-4" />
                        )}
                        Auto-Checkout Dorms
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => apiCall('/api/dev/seed', {}, 'Seed Data')}
                        disabled={loading !== null}
                        className="h-12 gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                    >
                        {loading === 'Seed Data' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Database className="h-4 w-4" />
                        )}
                        Seed Test Data
                    </Button>

                    <Button
                        variant="outline"
                        onClick={() => {
                            if (confirm('This will DELETE all bookings, guests, and payments. Continue?')) {
                                apiCall('/api/dev/reset', {}, 'Wipe All Data')
                            }
                        }}
                        disabled={loading !== null}
                        className="h-12 gap-2 border-red-200 text-red-700 hover:bg-red-50"
                    >
                        {loading === 'Wipe All Data' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <Trash2 className="h-4 w-4" />
                        )}
                        Wipe All Test Data
                    </Button>
                </div>
            </div>

            {/* ── Activity Log ──────────────────────────────── */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-slate-400" />
                        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">
                            Activity Log
                        </h3>
                        <span className="text-xs text-slate-400">({log.length} entries)</span>
                    </div>
                    {log.length > 0 && (
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setLog([])}
                            className="text-xs text-slate-400 hover:text-slate-600"
                        >
                            Clear
                        </Button>
                    )}
                </div>

                {log.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4 text-center">
                        No actions performed yet. Use the controls above to get started.
                    </p>
                ) : (
                    <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg bg-slate-50 p-3">
                        {log.map((entry, i) => (
                            <p key={i} className="text-xs font-mono text-slate-500 leading-relaxed">
                                {entry}
                            </p>
                        ))}
                    </div>
                )}
            </div>

            {/* Loading overlay */}
            {loading && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-2xl">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {loading}...
                </div>
            )}
        </div>
    )
}
