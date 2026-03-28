'use client'

import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
    AlertTriangle,
    Trash2,
    Building2,
    Loader2,
    ShieldAlert,
    Database,
    BedDouble,
    Users,
    CreditCard,
    Calendar,
    ClipboardList,
    Wrench,
    Package,
    Shirt,
} from 'lucide-react'

import type { DevTabProps as AdminTabProps } from '@/app/(dashboard)/developer/client'

// ============================================================
// Table counts for display
// ============================================================
interface TableCounts {
    bookings: number
    guests: number
    payments: number
    reservations: number
    attendance: number
    staff_incidents: number
    payroll: number
    maintenance: number
    restock: number
    customer_issues: number
    expenses: number
    shift_reports: number
    laundry: number
}

const TABLE_META: { key: keyof TableCounts; label: string; icon: React.ReactNode; color: string }[] = [
    { key: 'bookings', label: 'Bookings', icon: <BedDouble className="h-4 w-4" />, color: 'text-blue-600' },
    { key: 'guests', label: 'Guests', icon: <Users className="h-4 w-4" />, color: 'text-emerald-600' },
    { key: 'payments', label: 'Payments', icon: <CreditCard className="h-4 w-4" />, color: 'text-amber-600' },
    { key: 'reservations', label: 'Reservations', icon: <Calendar className="h-4 w-4" />, color: 'text-violet-600' },
    { key: 'attendance', label: 'Attendance', icon: <ClipboardList className="h-4 w-4" />, color: 'text-indigo-600' },
    { key: 'staff_incidents', label: 'Incidents', icon: <ShieldAlert className="h-4 w-4" />, color: 'text-red-600' },
    { key: 'payroll', label: 'Payroll', icon: <CreditCard className="h-4 w-4" />, color: 'text-orange-600' },
    { key: 'maintenance', label: 'Maintenance', icon: <Wrench className="h-4 w-4" />, color: 'text-slate-600' },
    { key: 'restock', label: 'Restock', icon: <Package className="h-4 w-4" />, color: 'text-teal-600' },
    { key: 'customer_issues', label: 'Issues', icon: <AlertTriangle className="h-4 w-4" />, color: 'text-yellow-600' },
    { key: 'expenses', label: 'Expenses', icon: <CreditCard className="h-4 w-4" />, color: 'text-pink-600' },
    { key: 'shift_reports', label: 'Shift Reports', icon: <ClipboardList className="h-4 w-4" />, color: 'text-cyan-600' },
    { key: 'laundry', label: 'Laundry', icon: <Shirt className="h-4 w-4" />, color: 'text-purple-600' },
]

export function DangerZone({ hotels }: AdminTabProps) {
    const [counts, setCounts] = useState<TableCounts | null>(null)
    const [loadingCounts, setLoadingCounts] = useState(false)

    // Purge dialog state
    const [purgeOpen, setPurgeOpen] = useState(false)
    const [purgeTable, setPurgeTable] = useState<string>('')
    const [purgeHotel, setPurgeHotel] = useState<string>('ALL')
    const [purgeConfirm, setPurgeConfirm] = useState('')
    const [purging, setPurging] = useState(false)

    // Full wipe dialog state
    const [wipeOpen, setWipeOpen] = useState(false)
    const [wipeConfirm, setWipeConfirm] = useState('')
    const [wiping, setWiping] = useState(false)

    // ── Fetch record counts ──
    const fetchCounts = useCallback(async () => {
        setLoadingCounts(true)
        try {
            const queries = [
                supabase.from('bookings').select('id', { count: 'exact', head: true }),
                supabase.from('guests').select('id', { count: 'exact', head: true }),
                supabase.from('payments').select('id', { count: 'exact', head: true }),
                supabase.from('bookings').select('id', { count: 'exact', head: true }).in('status', ['CONFIRMED', 'PENDING']),
                supabase.from('attendance').select('id', { count: 'exact', head: true }),
                supabase.from('staff_incidents').select('id', { count: 'exact', head: true }),
                supabase.from('payroll').select('id', { count: 'exact', head: true }),
                supabase.from('maintenance').select('id', { count: 'exact', head: true }),
                supabase.from('restock_requests').select('id', { count: 'exact', head: true }),
                supabase.from('customer_issues').select('id', { count: 'exact', head: true }),
                supabase.from('expenses').select('id', { count: 'exact', head: true }),
                supabase.from('shift_reports').select('id', { count: 'exact', head: true }),
                supabase.from('laundry').select('id', { count: 'exact', head: true }),
            ]

            const results = await Promise.all(queries)
            setCounts({
                bookings: results[0].count || 0,
                guests: results[1].count || 0,
                payments: results[2].count || 0,
                reservations: results[3].count || 0,
                attendance: results[4].count || 0,
                staff_incidents: results[5].count || 0,
                payroll: results[6].count || 0,
                maintenance: results[7].count || 0,
                restock: results[8].count || 0,
                customer_issues: results[9].count || 0,
                expenses: results[10].count || 0,
                shift_reports: results[11].count || 0,
                laundry: results[12].count || 0,
            })
        } catch (err) {
            console.error('Count fetch error:', err)
            toast.error('Failed to load record counts')
        } finally {
            setLoadingCounts(false)
        }
    }, [])

    useEffect(() => {
        fetchCounts()
    }, [fetchCounts])

    // ── Purge a single table ──
    const handlePurge = async () => {
        if (purgeConfirm !== 'PURGE') {
            toast.error('Type PURGE to confirm')
            return
        }
        if (!purgeTable) {
            toast.error('Select a table to purge')
            return
        }

        setPurging(true)
        try {
            // Map display names to actual table names
            const tableMap: Record<string, string> = {
                bookings: 'bookings',
                guests: 'guests',
                payments: 'payments',
                attendance: 'attendance',
                staff_incidents: 'staff_incidents',
                payroll: 'payroll',
                maintenance: 'maintenance',
                restock: 'restock_requests',
                customer_issues: 'customer_issues',
                expenses: 'expenses',
                shift_reports: 'shift_reports',
                laundry: 'laundry',
            }

            const actualTable = tableMap[purgeTable]
            if (!actualTable) throw new Error('Invalid table')

            let query = supabase
                .from(actualTable)
                .delete()
                .neq('id', '00000000-0000-0000-0000-000000000000')

            // Filter by hotel if selected
            if (purgeHotel !== 'ALL') {
                // Tables that have hotel_id directly
                const tablesWithHotelId = ['attendance', 'staff_incidents', 'payroll', 'maintenance', 'restock_requests', 'customer_issues', 'expenses', 'shift_reports', 'laundry']
                if (tablesWithHotelId.includes(actualTable)) {
                    query = query.eq('hotel_id', purgeHotel)
                }
                // For bookings/guests/payments, we cannot easily filter by hotel without a join.
                // Delete all records for these tables regardless of hotel filter.
            }

            const { error } = await query
            if (error) throw error

            toast.success(`Purged ${purgeTable} records`)

            // If we purged bookings, also reset related units
            if (purgeTable === 'bookings') {
                await supabase
                    .from('units')
                    .update({ status: 'AVAILABLE', maintenance_reason: null })
                    .neq('id', '00000000-0000-0000-0000-000000000000')
            }

            setPurgeOpen(false)
            setPurgeConfirm('')
            setPurgeTable('')
            fetchCounts()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Purge failed')
        } finally {
            setPurging(false)
        }
    }

    // ── Full wipe (all operational data) ──
    const handleFullWipe = async () => {
        if (wipeConfirm !== 'WIPE EVERYTHING') {
            toast.error('Type WIPE EVERYTHING to confirm')
            return
        }

        setWiping(true)
        try {
            // Delete in dependency order
            const tables = [
                'payments',
                'guests',
                'shift_reports',
                'expenses',
                'customer_issues',
                'restock_requests',
                'maintenance',
                'laundry',
                'payroll',
                'staff_incidents',
                'attendance',
                'bookings',
            ]

            const errors: string[] = []
            for (const table of tables) {
                const { error } = await supabase
                    .from(table)
                    .delete()
                    .neq('id', '00000000-0000-0000-0000-000000000000')
                if (error) {
                    console.error(`Wipe error for ${table}:`, error)
                    errors.push(`${table}: ${error.message}`)
                }
            }

            // Reset all units
            await supabase
                .from('units')
                .update({ status: 'AVAILABLE', maintenance_reason: null })
                .neq('id', '00000000-0000-0000-0000-000000000000')

            if (errors.length > 0) {
                toast.error(`Wipe completed with ${errors.length} error(s)`)
            } else {
                toast.success('All operational data wiped successfully')
            }

            setWipeOpen(false)
            setWipeConfirm('')
            fetchCounts()
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Full wipe failed')
        } finally {
            setWiping(false)
        }
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold tracking-tight text-red-700 flex items-center gap-2">
                    <AlertTriangle className="h-6 w-6" />
                    Danger Zone
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                    Destructive operations. Double-check before proceeding &mdash; these actions cannot be undone.
                </p>
            </div>

            {/* Warning Banner */}
            <div className="rounded-lg bg-red-50 border-2 border-red-200 p-4">
                <div className="flex items-start gap-3">
                    <ShieldAlert className="h-6 w-6 text-red-600 mt-0.5 shrink-0" />
                    <div>
                        <p className="font-semibold text-red-800">Irreversible Operations</p>
                        <p className="text-sm text-red-700 mt-1">
                            Actions on this page permanently delete data from the database.
                            There is no undo. Make sure you have a backup or are certain before proceeding.
                        </p>
                    </div>
                </div>
            </div>

            {/* Database Overview */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div>
                            <CardTitle className="text-base flex items-center gap-2">
                                <Database className="h-5 w-5 text-slate-600" />
                                Database Overview
                            </CardTitle>
                            <CardDescription>Current record counts across all tables</CardDescription>
                        </div>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchCounts}
                            disabled={loadingCounts}
                        >
                            {loadingCounts ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    {counts ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            {TABLE_META.map(t => (
                                <div key={t.key} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2">
                                    <span className={t.color}>{t.icon}</span>
                                    <div>
                                        <p className="text-lg font-bold text-slate-800">{counts[t.key].toLocaleString('en-IN')}</p>
                                        <p className="text-xs text-slate-500">{t.label}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Action Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Purge Single Table */}
                <Card className="border-amber-200">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-amber-800">
                            <Trash2 className="h-5 w-5" />
                            Purge Table
                        </CardTitle>
                        <CardDescription>
                            Delete all records from a specific table. Optionally filter by hotel for tables that support it.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={() => {
                                setPurgeOpen(true)
                                setPurgeConfirm('')
                                setPurgeTable('')
                                setPurgeHotel('ALL')
                            }}
                            className="w-full bg-amber-600 hover:bg-amber-700 text-white"
                        >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Purge Table...
                        </Button>
                    </CardContent>
                </Card>

                {/* Full Wipe */}
                <Card className="border-red-300">
                    <CardHeader>
                        <CardTitle className="text-base flex items-center gap-2 text-red-800">
                            <AlertTriangle className="h-5 w-5" />
                            Full Data Wipe
                        </CardTitle>
                        <CardDescription>
                            Delete ALL operational data (bookings, guests, payments, attendance, payroll, etc.)
                            and reset all units to AVAILABLE. Staff accounts are preserved.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={() => {
                                setWipeOpen(true)
                                setWipeConfirm('')
                            }}
                            variant="destructive"
                            className="w-full"
                        >
                            <AlertTriangle className="h-4 w-4 mr-1" />
                            Wipe Everything...
                        </Button>
                    </CardContent>
                </Card>
            </div>

            {/* Purge Table Dialog */}
            <Dialog open={purgeOpen} onOpenChange={open => { if (!open) setPurgeOpen(false) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-amber-800">
                            <Trash2 className="h-5 w-5" />
                            Purge Table
                        </DialogTitle>
                        <DialogDescription>
                            Select a table and confirm to permanently delete all its records.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div>
                            <Label className="text-sm font-medium text-slate-700">Table</Label>
                            <Select value={purgeTable} onValueChange={setPurgeTable}>
                                <SelectTrigger className="mt-1 bg-white">
                                    <SelectValue placeholder="Select table to purge" />
                                </SelectTrigger>
                                <SelectContent>
                                    {TABLE_META.map(t => (
                                        <SelectItem key={t.key} value={t.key}>
                                            {t.label} ({counts?.[t.key]?.toLocaleString('en-IN') || '?'} records)
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-slate-700">Hotel Filter (optional)</Label>
                            <Select value={purgeHotel} onValueChange={setPurgeHotel}>
                                <SelectTrigger className="mt-1 bg-white">
                                    <Building2 className="h-4 w-4 mr-2 text-slate-400" />
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ALL">All Hotels</SelectItem>
                                    {hotels.map(h => (
                                        <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-slate-500 mt-1">
                                Hotel filter only applies to tables with hotel_id (attendance, incidents, payroll, etc.).
                                Bookings, guests, and payments are always purged across all hotels.
                            </p>
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-red-700">
                                Type <span className="font-mono bg-red-100 px-1 rounded">PURGE</span> to confirm
                            </Label>
                            <Input
                                value={purgeConfirm}
                                onChange={e => setPurgeConfirm(e.target.value)}
                                placeholder="PURGE"
                                className="mt-1 border-red-200 focus-visible:ring-red-500/50"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setPurgeOpen(false)} disabled={purging}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handlePurge}
                            disabled={purging || purgeConfirm !== 'PURGE' || !purgeTable}
                        >
                            {purging ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-1" />
                            )}
                            Purge {purgeTable ? TABLE_META.find(t => t.key === purgeTable)?.label : 'Table'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Full Wipe Dialog */}
            <Dialog open={wipeOpen} onOpenChange={open => { if (!open) setWipeOpen(false) }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-red-800">
                            <AlertTriangle className="h-5 w-5" />
                            Full Data Wipe
                        </DialogTitle>
                        <DialogDescription>
                            This will permanently delete ALL operational data across all hotels.
                            Staff accounts and hotel configurations will be preserved.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-4 py-2">
                        <div className="rounded-lg bg-red-50 border border-red-200 p-3 space-y-2">
                            <p className="text-sm font-semibold text-red-800">The following will be deleted:</p>
                            <ul className="text-xs text-red-700 grid grid-cols-2 gap-1">
                                <li>All bookings</li>
                                <li>All guest records</li>
                                <li>All payments</li>
                                <li>All attendance records</li>
                                <li>All staff incidents</li>
                                <li>All payroll records</li>
                                <li>All maintenance tickets</li>
                                <li>All restock requests</li>
                                <li>All customer issues</li>
                                <li>All expenses</li>
                                <li>All shift reports</li>
                                <li>All laundry orders</li>
                            </ul>
                            <p className="text-xs text-red-700 font-medium pt-1">
                                All units will be reset to AVAILABLE.
                            </p>
                        </div>

                        <div>
                            <Label className="text-sm font-medium text-red-700">
                                Type <span className="font-mono bg-red-100 px-1 rounded">WIPE EVERYTHING</span> to confirm
                            </Label>
                            <Input
                                value={wipeConfirm}
                                onChange={e => setWipeConfirm(e.target.value)}
                                placeholder="WIPE EVERYTHING"
                                className="mt-1 border-red-200 focus-visible:ring-red-500/50"
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setWipeOpen(false)} disabled={wiping}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleFullWipe}
                            disabled={wiping || wipeConfirm !== 'WIPE EVERYTHING'}
                        >
                            {wiping ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                            ) : (
                                <AlertTriangle className="h-4 w-4 mr-1" />
                            )}
                            Wipe All Data
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
