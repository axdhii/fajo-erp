'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
    FlaskConical,
    Play,
    Loader2,
    CheckCircle2,
    XCircle,
    BedDouble,
    Users,
    Clock,
    Trash2,
    FastForward,
    CalendarClock,
} from 'lucide-react'

import type { DevTabProps as AdminTabProps } from '@/app/(dashboard)/developer/client'

interface ActionResult {
    success: boolean
    message: string
    details?: string[]
}

export function TestFactory({ }: AdminTabProps) {
    const [results, setResults] = useState<{ action: string; result: ActionResult; timestamp: string }[]>([])
    const [runningAction, setRunningAction] = useState<string | null>(null)

    const isDev = process.env.NODE_ENV === 'development'

    // ── Generic action runner ──
    const runAction = async (
        action: string,
        url: string,
        method: string = 'POST',
        body?: Record<string, unknown>,
    ) => {
        setRunningAction(action)
        try {
            const res = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                ...(body ? { body: JSON.stringify(body) } : {}),
            })
            const json = await res.json()

            const result: ActionResult = {
                success: res.ok,
                message: json.message || json.error || (res.ok ? 'Success' : 'Failed'),
                details: json.scenarios || json.details || [],
            }

            setResults(prev => [
                { action, result, timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) },
                ...prev,
            ].slice(0, 20)) // Keep last 20 results

            if (res.ok) {
                toast.success(`${action}: ${result.message}`)
            } else {
                toast.error(`${action}: ${result.message}`)
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Network error'
            setResults(prev => [
                { action, result: { success: false, message }, timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) },
                ...prev,
            ].slice(0, 20))
            toast.error(`${action} failed: ${message}`)
        } finally {
            setRunningAction(null)
        }
    }

    // ── Dev time actions ──
    const fetchTimeStatus = async () => {
        setRunningAction('Check Time')
        try {
            const res = await fetch('/api/dev/time')
            const json = await res.json()
            const msg = json.isSimulated
                ? `Simulated: ${new Date(json.currentTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`
                : `Real time: ${new Date(json.currentTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`

            setResults(prev => [
                { action: 'Time Status', result: { success: true, message: msg }, timestamp: new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata' }) },
                ...prev,
            ].slice(0, 20))
            toast.success(msg)
        } catch {
            toast.error('Failed to fetch time status')
        } finally {
            setRunningAction(null)
        }
    }

    // ── Action definitions ──
    const ACTIONS = [
        {
            key: 'seed',
            label: 'Seed Test Data',
            description: 'Create dummy bookings, guests, payments across rooms and dorms',
            icon: <BedDouble className="h-5 w-5" />,
            color: 'bg-emerald-600 hover:bg-emerald-700',
            handler: () => runAction('Seed Data', '/api/dev/seed'),
        },
        {
            key: 'reset',
            label: 'Wipe Test Data',
            description: 'Delete all bookings, guests, payments and reset units to AVAILABLE',
            icon: <Trash2 className="h-5 w-5" />,
            color: 'bg-red-600 hover:bg-red-700',
            handler: () => runAction('Wipe Data', '/api/dev/reset'),
        },
        {
            key: 'auto-checkout',
            label: 'Auto Checkout Dorms',
            description: 'Trigger dorm auto-checkout for expired bookings (uses simulated time)',
            icon: <Users className="h-5 w-5" />,
            color: 'bg-blue-600 hover:bg-blue-700',
            handler: () => runAction('Auto Checkout', '/api/dev/auto-checkout'),
        },
        {
            key: 'advance-1h',
            label: 'Advance Time +1h',
            description: 'Move simulated clock forward by 1 hour',
            icon: <FastForward className="h-5 w-5" />,
            color: 'bg-violet-600 hover:bg-violet-700',
            handler: () => runAction('Advance +1h', '/api/dev/time', 'POST', { action: 'advance', advanceHours: 1 }),
        },
        {
            key: 'advance-12h',
            label: 'Advance Time +12h',
            description: 'Move simulated clock forward by 12 hours',
            icon: <FastForward className="h-5 w-5" />,
            color: 'bg-violet-600 hover:bg-violet-700',
            handler: () => runAction('Advance +12h', '/api/dev/time', 'POST', { action: 'advance', advanceHours: 12 }),
        },
        {
            key: 'advance-1d',
            label: 'Advance Time +1 Day',
            description: 'Move simulated clock forward by 24 hours',
            icon: <CalendarClock className="h-5 w-5" />,
            color: 'bg-violet-600 hover:bg-violet-700',
            handler: () => runAction('Advance +1d', '/api/dev/time', 'POST', { action: 'advance', advanceDays: 1 }),
        },
        {
            key: 'time-check',
            label: 'Check Time',
            description: 'Show current simulated or real time',
            icon: <Clock className="h-5 w-5" />,
            color: 'bg-slate-600 hover:bg-slate-700',
            handler: fetchTimeStatus,
        },
        {
            key: 'time-reset',
            label: 'Reset to Real Time',
            description: 'Stop time simulation, revert to actual system clock',
            icon: <Clock className="h-5 w-5" />,
            color: 'bg-slate-600 hover:bg-slate-700',
            handler: () => runAction('Reset Time', '/api/dev/time', 'POST', { action: 'reset' }),
        },
    ]

    if (!isDev) {
        return (
            <div className="space-y-6">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <FlaskConical className="h-6 w-6 text-emerald-600" />
                        Test Factory
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">Development-only tools for testing</p>
                </div>
                <Card className="border-amber-200 bg-amber-50/50">
                    <CardContent className="py-8 text-center">
                        <XCircle className="h-10 w-10 mx-auto mb-3 text-amber-500" />
                        <p className="text-lg font-semibold text-amber-800">Not Available in Production</p>
                        <p className="text-sm text-amber-600 mt-1">
                            Test Factory is only available in development mode (NODE_ENV=development).
                        </p>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                    <FlaskConical className="h-6 w-6 text-emerald-600" />
                    Test Factory
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                    Development tools for seeding data, simulating time, and triggering test scenarios
                </p>
            </div>

            {/* Actions Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {ACTIONS.map(a => (
                    <Card key={a.key} className="hover:shadow-md transition-shadow">
                        <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                                {a.icon}
                                {a.label}
                            </CardTitle>
                            <CardDescription className="text-xs">
                                {a.description}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="pt-0">
                            <Button
                                onClick={a.handler}
                                disabled={runningAction !== null}
                                className={`w-full text-white ${a.color}`}
                                size="sm"
                            >
                                {runningAction === a.key ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4 mr-1" />
                                )}
                                Run
                            </Button>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Results Log */}
            {results.length > 0 && (
                <Card>
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="text-base">Action Log</CardTitle>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setResults([])}
                                className="text-slate-400 hover:text-slate-600"
                            >
                                Clear
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
                            {results.map((r, i) => (
                                <div key={i} className="px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        {r.result.success ? (
                                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                                        ) : (
                                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                                        )}
                                        <span className="font-medium text-sm text-slate-800">{r.action}</span>
                                        <span className="text-xs text-slate-400 ml-auto">{r.timestamp}</span>
                                    </div>
                                    <p className="text-xs text-slate-600 mt-1 ml-6">{r.result.message}</p>
                                    {r.result.details && r.result.details.length > 0 && (
                                        <ul className="text-xs text-slate-500 mt-1 ml-6 space-y-0.5">
                                            {r.result.details.map((d, j) => (
                                                <li key={j}>{d}</li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    )
}
