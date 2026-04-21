"use client"

import { useState } from 'react'
import { useAuthStore } from '@/lib/store/auth-store'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
    Clock,
    LogIn,
    LogOut,
    CalendarPlus,
    Banknote,
    CreditCard,
    IndianRupee,
    Package,
    AlertTriangle,
    Receipt,
    Loader2,
} from 'lucide-react'

function fmt(n: number): string {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0,
    }).format(n)
}

function formatDuration(start: string, end: string): string {
    const ms = new Date(end).getTime() - new Date(start).getTime()
    const totalMinutes = Math.round(ms / 60000)
    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    if (hours === 0) return `${minutes}m`
    return `${hours}h ${minutes}m`
}

function formatTime(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    })
}

export function ShiftReportModal() {
    const { shiftReport, completeSignOut } = useAuthStore()
    const [signingOut, setSigningOut] = useState(false)

    if (!shiftReport) return null

    const r = shiftReport

    const handleSignOut = async () => {
        setSigningOut(true)
        try {
            await completeSignOut()
        } catch {
            setSigningOut(false)
        }
    }

    return (
        <Dialog open={true} onOpenChange={() => { /* prevent dismiss — must sign out */ }}>
            <DialogContent
                showCloseButton={false}
                className="sm:max-w-md max-h-[90vh] overflow-y-auto"
                onPointerDownOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-lg">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                            <Clock className="h-4 w-4" />
                        </div>
                        Shift Summary
                    </DialogTitle>
                    <DialogDescription>
                        {formatTime(r.shift_start)} &mdash; {formatTime(r.shift_end)} &middot; {formatDuration(r.shift_start, r.shift_end)}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                    {/* Activity Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <StatCard
                            icon={<LogIn className="h-4 w-4 text-emerald-600" />}
                            label="Check-Ins"
                            value={r.total_check_ins}
                        />
                        <StatCard
                            icon={<LogOut className="h-4 w-4 text-blue-600" />}
                            label="Check-Outs"
                            value={r.total_check_outs}
                        />
                        <StatCard
                            icon={<CalendarPlus className="h-4 w-4 text-violet-600" />}
                            label="Reservations"
                            value={r.total_reservations_created}
                        />
                    </div>

                    {/* Unit Lists */}
                    {r.check_in_units.length > 0 && (
                        <UnitList
                            title="Checked-In Units"
                            items={r.check_in_units}
                            color="emerald"
                        />
                    )}

                    {r.check_out_units.length > 0 && (
                        <UnitList
                            title="Checked-Out Units"
                            items={r.check_out_units}
                            color="blue"
                        />
                    )}

                    {/* Revenue */}
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Revenue</h4>
                        <div className="grid grid-cols-3 gap-3">
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
                                    <Banknote className="h-3.5 w-3.5" />
                                    <span className="text-xs">Cash</span>
                                </div>
                                <p className="text-sm font-bold text-slate-800">{fmt(r.revenue_cash)}</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-slate-500 mb-1">
                                    <CreditCard className="h-3.5 w-3.5" />
                                    <span className="text-xs">Digital</span>
                                </div>
                                <p className="text-sm font-bold text-slate-800">{fmt(r.revenue_digital)}</p>
                            </div>
                            <div className="text-center">
                                <div className="flex items-center justify-center gap-1 text-emerald-600 mb-1">
                                    <IndianRupee className="h-3.5 w-3.5" />
                                    <span className="text-xs font-medium">Total</span>
                                </div>
                                <p className="text-sm font-bold text-emerald-700">{fmt(r.revenue_total)}</p>
                            </div>
                        </div>
                        {((r.advance_cash ?? 0) > 0 || (r.advance_digital ?? 0) > 0) && (
                            <p className="text-[10px] text-slate-500 mt-1 text-center">
                                Includes Advances: Cash {fmt(r.advance_cash ?? 0)} / Digital {fmt(r.advance_digital ?? 0)}
                            </p>
                        )}
                        {(r.extras_count ?? 0) > 0 && (
                            <p className="text-[10px] text-slate-500 text-center">
                                Includes Extras ({r.extras_count}): Cash {fmt(r.extras_revenue_cash ?? 0)} / Digital {fmt(r.extras_revenue_digital ?? 0)}
                            </p>
                        )}
                    </div>

                    {/* Other Counts */}
                    {(r.restock_requests_count > 0 || r.customer_issues_count > 0 || r.expense_requests_count > 0 || (r.extras_count ?? 0) > 0) && (
                        <div className="flex flex-wrap gap-2">
                            {r.restock_requests_count > 0 && (
                                <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
                                    <Package className="h-3 w-3" />
                                    {r.restock_requests_count} Restock
                                </Badge>
                            )}
                            {r.customer_issues_count > 0 && (
                                <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
                                    <AlertTriangle className="h-3 w-3" />
                                    {r.customer_issues_count} Issue{r.customer_issues_count !== 1 ? 's' : ''}
                                </Badge>
                            )}
                            {(r.extras_count ?? 0) > 0 && (
                                <Badge variant="secondary" className="gap-1.5 py-1 px-2.5 bg-emerald-100 text-emerald-700">
                                    <Package className="h-3 w-3" />
                                    {r.extras_count} Extra{(r.extras_count ?? 0) !== 1 ? 's' : ''}
                                </Badge>
                            )}
                            {r.expense_requests_count > 0 && (
                                <Badge variant="secondary" className="gap-1.5 py-1 px-2.5">
                                    <Receipt className="h-3 w-3" />
                                    {r.expense_requests_count} Expense{r.expense_requests_count !== 1 ? 's' : ''}
                                </Badge>
                            )}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <button
                        onClick={handleSignOut}
                        disabled={signingOut}
                        className="w-full flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-red-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                        {signingOut ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                            <LogOut className="h-4 w-4" />
                        )}
                        {signingOut ? 'Signing Out...' : 'Sign Out'}
                    </button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-2.5 text-center">
            <div className="flex items-center justify-center mb-1">{icon}</div>
            <p className="text-lg font-bold text-slate-800">{value}</p>
            <p className="text-xs text-slate-500">{label}</p>
        </div>
    )
}

function UnitList({
    title,
    items,
    color,
}: {
    title: string
    items: { unit_number: string; booking_id: string; guest_names: string }[]
    color: 'emerald' | 'blue'
}) {
    const dotColor = color === 'emerald' ? 'bg-emerald-500' : 'bg-blue-500'
    return (
        <div className="rounded-lg border border-slate-200 p-3">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{title}</h4>
            <div className="space-y-1.5">
                {items.map((item, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm">
                        <span className={`h-1.5 w-1.5 rounded-full ${dotColor} shrink-0`} />
                        <span className="font-medium text-slate-700">{item.unit_number}</span>
                        <span className="text-slate-400">&mdash;</span>
                        <span className="text-slate-600 truncate">{item.guest_names}</span>
                    </div>
                ))}
            </div>
        </div>
    )
}
