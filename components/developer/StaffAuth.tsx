'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import {
    KeyRound,
    Lock,
    Unlock,
    RotateCcw,
    Shield,
    Building2,
    Loader2,
    CheckCircle2,
    AlertTriangle,
    Users,
} from 'lucide-react'

import type { DevTabProps as AdminTabProps } from '@/app/(dashboard)/developer/client'

interface StaffRow {
    id: string
    user_id: string | null
    hotel_id: string
    role: string
    name: string | null
    phone: string | null
    base_salary: number
}

const ROLE_COLORS: Record<string, string> = {
    Admin: 'bg-red-100 text-red-700 border-red-200',
    FrontDesk: 'bg-blue-100 text-blue-700 border-blue-200',
    Housekeeping: 'bg-amber-100 text-amber-700 border-amber-200',
    HR: 'bg-violet-100 text-violet-700 border-violet-200',
    ZonalManager: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    ZonalOps: 'bg-orange-100 text-orange-700 border-orange-200',
    ZonalHK: 'bg-teal-100 text-teal-700 border-teal-200',
}

const ROLE_LABELS: Record<string, string> = {
    Admin: 'Admin',
    FrontDesk: 'CRE',
    Housekeeping: 'Housekeeping',
    HR: 'HR',
    ZonalManager: 'Zonal Manager',
    ZonalOps: 'Zonal Ops',
    ZonalHK: 'Zonal HK',
}

export function StaffAuth({ hotelId, hotels }: AdminTabProps) {
    const [staff, setStaff] = useState<StaffRow[]>([])
    const [loading, setLoading] = useState(false)
    const [filterHotel, setFilterHotel] = useState<string>(hotelId || 'ALL')

    // Single password reset
    const [resetTarget, setResetTarget] = useState<StaffRow | null>(null)
    const [newPassword, setNewPassword] = useState('')
    const [resetting, setResetting] = useState(false)

    // Bulk reset
    const [bulkOpen, setBulkOpen] = useState(false)
    const [bulkHotel, setBulkHotel] = useState<string>(hotelId || (hotels.length > 0 ? hotels[0].id : ''))
    const [bulkRole, setBulkRole] = useState<string>('ALL')
    const [bulkPassword, setBulkPassword] = useState('')
    const [bulkRunning, setBulkRunning] = useState(false)
    const [bulkResult, setBulkResult] = useState<{ updated: number; failed: number; errors: string[] } | null>(null)

    // ── Fetch staff ──
    const fetchStaff = useCallback(async () => {
        setLoading(true)
        let query = supabase
            .from('staff')
            .select('id, user_id, hotel_id, role, name, phone, base_salary')
            .not('user_id', 'is', null) // Only staff with auth accounts
            .order('name', { ascending: true })

        if (filterHotel !== 'ALL') {
            query = query.eq('hotel_id', filterHotel)
        }

        const { data, error } = await query
        if (error) {
            console.error('Staff fetch error:', error)
            toast.error('Failed to load staff')
        }
        setStaff(data || [])
        setLoading(false)
    }, [filterHotel])

    useEffect(() => {
        fetchStaff()
    }, [fetchStaff])

    // Update filter when hotelId prop changes
    useEffect(() => {
        if (hotelId) setFilterHotel(hotelId)
    }, [hotelId])

    // ── Single password reset ──
    const handleResetPassword = async () => {
        if (!resetTarget) return
        const pw = newPassword.trim()
        if (pw.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }

        setResetting(true)
        try {
            const res = await fetch('/api/admin/staff', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    staff_id: resetTarget.id,
                    password: pw,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            toast.success(`Password reset for ${resetTarget.name || resetTarget.phone}`)
            setResetTarget(null)
            setNewPassword('')
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Password reset failed')
        } finally {
            setResetting(false)
        }
    }

    // ── Bulk password reset ──
    const handleBulkReset = async () => {
        const pw = bulkPassword.trim()
        if (pw.length < 6) {
            toast.error('Password must be at least 6 characters')
            return
        }

        setBulkRunning(true)
        setBulkResult(null)
        try {
            const res = await fetch('/api/admin/bulk-password-reset', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    hotel_id: bulkHotel || undefined,
                    role: bulkRole !== 'ALL' ? bulkRole : undefined,
                    password: pw,
                }),
            })
            const json = await res.json()
            if (!res.ok) throw new Error(json.error)

            setBulkResult({
                updated: json.updated || 0,
                failed: json.failed || 0,
                errors: json.errors || [],
            })

            if (json.updated > 0) {
                toast.success(`Reset passwords for ${json.updated} staff member(s)`)
            }
            if (json.failed > 0) {
                toast.error(`${json.failed} password reset(s) failed`)
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Bulk reset failed')
        } finally {
            setBulkRunning(false)
        }
    }

    const getHotelName = (hid: string) => hotels.find(h => h.id === hid)?.name || 'Unknown'

    // Group staff by role for the overview
    const roleCounts = staff.reduce<Record<string, number>>((acc, s) => {
        acc[s.role] = (acc[s.role] || 0) + 1
        return acc
    }, {})

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <KeyRound className="h-6 w-6 text-amber-600" />
                        Staff Authentication
                    </h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Manage login credentials for {staff.length} staff member(s) with auth accounts
                    </p>
                </div>
                <Button
                    onClick={() => {
                        setBulkOpen(true)
                        setBulkResult(null)
                        setBulkPassword('')
                    }}
                    className="bg-amber-600 hover:bg-amber-700"
                >
                    <RotateCcw className="h-4 w-4 mr-1" />
                    Bulk Password Reset
                </Button>
            </div>

            {/* Role Overview Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                {Object.entries(ROLE_LABELS).map(([role, label]) => (
                    <Card key={role} className="py-3">
                        <CardContent className="px-3 py-0 text-center">
                            <p className="text-2xl font-bold text-slate-800">{roleCounts[role] || 0}</p>
                            <p className="text-xs text-slate-500 mt-0.5">{label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filter */}
            <div className="flex items-center gap-3">
                <div className="w-56">
                    <Select value={filterHotel} onValueChange={setFilterHotel}>
                        <SelectTrigger className="bg-white border-slate-200">
                            <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                            <SelectValue placeholder="Filter by hotel" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="ALL">All Hotels</SelectItem>
                            {hotels.map(h => (
                                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {loading && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            </div>

            {/* Staff Auth List */}
            <Card>
                <CardContent className="p-0">
                    {staff.length === 0 ? (
                        <div className="p-8 text-center text-slate-400">
                            <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                            <p>No staff with login accounts found.</p>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {staff.map(s => (
                                <div
                                    key={s.id}
                                    className="px-4 py-3 hover:bg-slate-50/50 transition-colors flex items-center justify-between gap-4"
                                >
                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 shrink-0">
                                            {s.user_id ? (
                                                <Unlock className="h-4 w-4 text-emerald-600" />
                                            ) : (
                                                <Lock className="h-4 w-4 text-slate-400" />
                                            )}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="font-semibold text-slate-800 truncate">
                                                    {s.name || '(Unnamed)'}
                                                </span>
                                                <Badge
                                                    variant="outline"
                                                    className={`text-[10px] px-1.5 py-0 ${ROLE_COLORS[s.role] || 'bg-slate-100 text-slate-600'}`}
                                                >
                                                    {ROLE_LABELS[s.role] || s.role}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-500">
                                                {s.phone && (
                                                    <span>Login: {s.phone}@fajo.local</span>
                                                )}
                                                <span className="flex items-center gap-1">
                                                    <Building2 className="h-3 w-3" />
                                                    {getHotelName(s.hotel_id)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => {
                                            setResetTarget(s)
                                            setNewPassword('')
                                        }}
                                        className="shrink-0 text-amber-700 border-amber-200 hover:bg-amber-50"
                                    >
                                        <KeyRound className="h-3.5 w-3.5 mr-1" />
                                        Reset Password
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Single Password Reset Dialog */}
            <Dialog open={!!resetTarget} onOpenChange={open => { if (!open) setResetTarget(null) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <KeyRound className="h-5 w-5 text-amber-600" />
                            Reset Password
                        </DialogTitle>
                        <DialogDescription>
                            Set a new password for <strong>{resetTarget?.name || resetTarget?.phone || '(Staff)'}</strong>.
                            They will need to use this password on their next login.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-sm font-medium text-slate-700">New Password</Label>
                            <Input
                                type="password"
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Minimum 6 characters"
                                className="mt-1"
                                autoFocus
                            />
                        </div>
                        <p className="text-xs text-slate-500">
                            The staff member&apos;s login email remains {resetTarget?.phone}@fajo.local
                        </p>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setResetTarget(null)} disabled={resetting}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleResetPassword}
                            disabled={resetting || newPassword.trim().length < 6}
                            className="bg-amber-600 hover:bg-amber-700"
                        >
                            {resetting ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <KeyRound className="h-4 w-4 mr-1" />
                            )}
                            Reset Password
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Password Reset Dialog */}
            <Dialog open={bulkOpen} onOpenChange={open => { if (!open) setBulkOpen(false) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <RotateCcw className="h-5 w-5 text-amber-600" />
                            Bulk Password Reset
                        </DialogTitle>
                        <DialogDescription>
                            Reset passwords for multiple staff members at once. Filter by hotel and/or role.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Hotel</Label>
                                <Select value={bulkHotel} onValueChange={setBulkHotel}>
                                    <SelectTrigger className="mt-1 bg-white">
                                        <SelectValue placeholder="Select hotel" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {hotels.map(h => (
                                            <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div>
                                <Label className="text-sm font-medium text-slate-700">Role</Label>
                                <Select value={bulkRole} onValueChange={setBulkRole}>
                                    <SelectTrigger className="mt-1 bg-white">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="ALL">All Roles</SelectItem>
                                        {Object.entries(ROLE_LABELS).map(([value, label]) => (
                                            <SelectItem key={value} value={value}>{label}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-slate-700">New Password (for all matched staff)</Label>
                            <Input
                                type="password"
                                value={bulkPassword}
                                onChange={e => setBulkPassword(e.target.value)}
                                placeholder="Minimum 6 characters"
                                className="mt-1"
                            />
                        </div>

                        <div className="rounded-lg bg-amber-50 border border-amber-200 p-3">
                            <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                                <p className="text-xs text-amber-800">
                                    This will immediately change the password for all matching staff members.
                                    They will need the new password on their next login.
                                </p>
                            </div>
                        </div>

                        {/* Bulk result */}
                        {bulkResult && (
                            <div className={`rounded-lg border p-3 ${
                                bulkResult.failed > 0
                                    ? 'bg-red-50 border-red-200'
                                    : 'bg-emerald-50 border-emerald-200'
                            }`}>
                                <div className="flex items-center gap-2 mb-1">
                                    {bulkResult.failed > 0 ? (
                                        <AlertTriangle className="h-4 w-4 text-red-600" />
                                    ) : (
                                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                                    )}
                                    <span className="text-sm font-medium">
                                        {bulkResult.updated} updated, {bulkResult.failed} failed
                                    </span>
                                </div>
                                {bulkResult.errors.length > 0 && (
                                    <ul className="text-xs text-red-700 mt-1 space-y-0.5">
                                        {bulkResult.errors.map((e, i) => (
                                            <li key={i}>{e}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        )}
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkOpen(false)} disabled={bulkRunning}>
                            {bulkResult ? 'Close' : 'Cancel'}
                        </Button>
                        {!bulkResult && (
                            <Button
                                onClick={handleBulkReset}
                                disabled={bulkRunning || bulkPassword.trim().length < 6 || !bulkHotel}
                                className="bg-amber-600 hover:bg-amber-700"
                            >
                                {bulkRunning ? (
                                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                ) : (
                                    <RotateCcw className="h-4 w-4 mr-1" />
                                )}
                                Reset All Passwords
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
