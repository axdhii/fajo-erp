'use client'

import { useState, useEffect, useCallback } from 'react'
import {
    Clock,
    FastForward,
    RotateCcw,
    Trash2,
    Database,
    Zap,
    ChevronDown,
    ChevronUp,
    Wrench,
    X,
    ShieldOff,
} from 'lucide-react'

interface TimeState {
    isSimulated: boolean
    currentTime: string
    realTime: string
}

export function DevToolbar() {
    const [isOpen, setIsOpen] = useState(false)
    const [timeState, setTimeState] = useState<TimeState | null>(null)
    const [loading, setLoading] = useState<string | null>(null)
    const [log, setLog] = useState<string[]>([])
    const [customDate, setCustomDate] = useState('')
    const [customTime, setCustomTime] = useState('')
    const [bypassCredentials, setBypassCredentials] = useState(false)

    // Load initial bypass state from localStorage (client-side only)
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('fajo_bypass_credentials')
            if (saved === 'true') setBypassCredentials(true)
        }
    }, [])

    const toggleBypass = () => {
        const newVal = !bypassCredentials
        setBypassCredentials(newVal)
        localStorage.setItem('fajo_bypass_credentials', String(newVal))
        window.dispatchEvent(new CustomEvent('dev-bypass-changed'))
        addLog(newVal ? '🔓 Credential validation bypassed' : '🔒 Strict validation enabled')
    }

    // Only render in development
    if (process.env.NODE_ENV !== 'development') return null

    const addLog = (msg: string) => {
        const ts = new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        setLog(prev => [`${ts} — ${msg}`, ...prev].slice(0, 20))
    }

    const fetchTime = async () => {
        try {
            const res = await fetch('/api/dev/time')
            const data = await res.json()
            setTimeState(data)
        } catch {
            // Silently fail
        }
    }

    // Poll time every 2s when open
    useEffect(() => {
        fetchTime()
        if (!isOpen) return
        const interval = setInterval(fetchTime, 2000)
        return () => clearInterval(interval)
    }, [isOpen])

    const apiCall = async (url: string, body: any, label: string) => {
        setLoading(label)
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            })
            const data = await res.json()
            if (data.success) {
                addLog(`✅ ${label}: ${data.message}`)
                if (data.scenarios) {
                    data.scenarios.forEach((s: string) => addLog(`   ${s}`))
                }
                if (data.details) {
                    data.details.forEach((d: string) => addLog(`   ${d}`))
                }
                // Signal other components to refresh their data
                window.dispatchEvent(new CustomEvent('dev-data-changed'))
            } else {
                addLog(`❌ ${label}: ${data.error}`)
            }
            await fetchTime()
            return data
        } catch (err) {
            addLog(`❌ ${label}: Network error`)
        } finally {
            setLoading(null)
        }
    }

    const handleSetTime = () => {
        if (!customDate) return
        const timeStr = customTime || '12:00'
        const dateTime = new Date(`${customDate}T${timeStr}:00`)
        apiCall('/api/dev/time', { action: 'set', time: dateTime.toISOString() }, 'Set Time')
    }

    const formatTime = (iso: string) => {
        return new Date(iso).toLocaleString('en-IN', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
        })
    }

    if (!isOpen) {
        return (
            <button
                onClick={() => setIsOpen(true)}
                className="fixed bottom-4 right-4 z-[9999] flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-900 text-white text-xs font-bold shadow-2xl hover:bg-slate-800 transition-all hover:scale-105 active:scale-95"
            >
                <Wrench className="h-3.5 w-3.5" />
                DEV
                {timeState?.isSimulated && (
                    <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-[9px] font-bold animate-pulse">
                        ⏱ SIM
                    </span>
                )}
            </button>
        )
    }

    return (
        <div className="fixed bottom-4 right-4 z-[9999] w-[380px] bg-slate-950 text-white rounded-2xl shadow-2xl border border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                    <Wrench className="h-4 w-4 text-amber-400" />
                    <span className="text-sm font-bold">Dev Toolbar</span>
                    {timeState?.isSimulated && (
                        <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[9px] font-bold">
                            TIME SIMULATED
                        </span>
                    )}
                </div>
                <button
                    onClick={() => setIsOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-800 transition-colors"
                >
                    <X className="h-4 w-4 text-slate-400" />
                </button>
            </div>

            <div className="max-h-[70vh] overflow-y-auto">
                {/* Time Display */}
                <div className="px-4 py-3 border-b border-slate-800/50">
                    <div className="flex items-center gap-2 mb-2">
                        <Clock className="h-3.5 w-3.5 text-blue-400" />
                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                            System Time
                        </span>
                    </div>
                    {timeState && (
                        <div className="space-y-1">
                            <p className={`text-sm font-mono font-bold ${timeState.isSimulated ? 'text-amber-400' : 'text-emerald-400'}`}>
                                {formatTime(timeState.currentTime)}
                            </p>
                            {timeState.isSimulated && (
                                <p className="text-[10px] text-slate-500">
                                    Real: {formatTime(timeState.realTime)}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                {/* Bypass Switch */}
                <div className="px-4 py-3 border-b border-slate-800/50 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-2">
                        <ShieldOff className="h-4 w-4 text-violet-400" />
                        <div>
                            <span className="text-xs font-bold text-slate-300 block">Bypass Credentials</span>
                            <span className="text-[9px] text-slate-500 block">Auto-fill 1-click checkins</span>
                        </div>
                    </div>
                    <button
                        onClick={toggleBypass}
                        className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-slate-900 transition-colors duration-200 ease-in-out ${bypassCredentials ? 'bg-violet-500' : 'bg-slate-700'
                            }`}
                    >
                        <span
                            className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${bypassCredentials ? 'translate-x-2' : '-translate-x-2'
                                }`}
                        />
                    </button>
                </div>

                {/* Time Controls */}
                <div className="px-4 py-3 border-b border-slate-800/50 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Time Travel
                    </span>

                    {/* Quick Advance Buttons */}
                    <div className="grid grid-cols-4 gap-1.5">
                        {[
                            { label: '+1h', hours: 1 },
                            { label: '+6h', hours: 6 },
                            { label: '+12h', hours: 12 },
                            { label: '+1d', days: 1 },
                        ].map(({ label, hours, days }) => (
                            <button
                                key={label}
                                onClick={() =>
                                    apiCall('/api/dev/time', {
                                        action: 'advance',
                                        advanceHours: hours || 0,
                                        advanceDays: days || 0,
                                    }, `Advance ${label}`)
                                }
                                disabled={loading !== null}
                                className="flex items-center justify-center gap-1 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
                            >
                                <FastForward className="h-3 w-3 text-blue-400" />
                                {label}
                            </button>
                        ))}
                    </div>

                    {/* Custom Time Set */}
                    <div className="flex gap-1.5">
                        <input
                            type="date"
                            value={customDate}
                            onChange={e => setCustomDate(e.target.value)}
                            className="flex-1 h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                        <input
                            type="time"
                            value={customTime}
                            onChange={e => setCustomTime(e.target.value)}
                            className="w-24 h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                        <button
                            onClick={handleSetTime}
                            disabled={!customDate || loading !== null}
                            className="h-8 px-3 rounded-lg bg-blue-600 hover:bg-blue-500 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            Set
                        </button>
                    </div>

                    {/* Reset */}
                    <button
                        onClick={() => apiCall('/api/dev/time', { action: 'reset' }, 'Reset Time')}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 transition-colors disabled:opacity-50"
                    >
                        <RotateCcw className="h-3 w-3" />
                        Reset to Real Time
                    </button>
                </div>

                {/* Actions */}
                <div className="px-4 py-3 border-b border-slate-800/50 space-y-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                        Actions
                    </span>
                    <div className="grid grid-cols-2 gap-1.5">
                        <button
                            onClick={() => apiCall('/api/dev/auto-checkout', {}, 'Dorm Auto-Checkout')}
                            disabled={loading !== null}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            <Zap className="h-3 w-3" />
                            Auto-Checkout
                        </button>
                        <button
                            onClick={() => apiCall('/api/dev/seed', {}, 'Seed Data')}
                            disabled={loading !== null}
                            className="flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50"
                        >
                            <Database className="h-3 w-3" />
                            Seed Data
                        </button>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm('⚠️ This will DELETE all bookings, guests, and payments. Continue?')) {
                                apiCall('/api/dev/reset', {}, 'Wipe All Data')
                            }
                        }}
                        disabled={loading !== null}
                        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs font-semibold transition-colors disabled:opacity-50"
                    >
                        <Trash2 className="h-3 w-3" />
                        Wipe All Test Data
                    </button>
                </div>

                {/* Loading indicator */}
                {loading && (
                    <div className="px-4 py-2 border-b border-slate-800/50 flex items-center gap-2">
                        <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
                        <span className="text-xs text-blue-400">{loading}...</span>
                    </div>
                )}

                {/* Event Log */}
                {log.length > 0 && (
                    <div className="px-4 py-3 space-y-1">
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                                Log
                            </span>
                            <button
                                onClick={() => setLog([])}
                                className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                            >
                                Clear
                            </button>
                        </div>
                        <div className="max-h-32 overflow-y-auto space-y-0.5">
                            {log.map((entry, i) => (
                                <p key={i} className="text-[10px] font-mono text-slate-400 leading-relaxed">
                                    {entry}
                                </p>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    )
}
