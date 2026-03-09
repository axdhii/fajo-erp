'use client'

import type { UnitStatus, UnitType } from '@/lib/types'
import type { UnitWithBooking } from '@/lib/store/unit-store'
import { getCheckoutAlert, type CheckoutAlert } from '@/lib/hooks/use-current-time'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
    User,
    Sparkles,
    AlertTriangle,
    Loader2,
    BedDouble,
    BedSingle,
    Wrench,
    Clock,
} from 'lucide-react'

interface UnitCardProps {
    unit: UnitWithBooking
    onClick: (unit: UnitWithBooking) => void
    now?: Date
}

const statusConfig: Record<
    UnitStatus,
    { bg: string; text: string; border: string; label: string; sublabel: string }
> = {
    AVAILABLE: {
        bg: 'bg-emerald-500/8',
        text: 'text-emerald-600',
        border: 'border-emerald-500/20 hover:border-emerald-500/40',
        label: 'Available',
        sublabel: 'Ready for check-in',
    },
    OCCUPIED: {
        bg: 'bg-red-500/8',
        text: 'text-red-600',
        border: 'border-red-500/20 hover:border-red-500/40',
        label: 'Occupied',
        sublabel: 'Guest in unit',
    },
    DIRTY: {
        bg: 'bg-amber-500/8',
        text: 'text-amber-600',
        border: 'border-amber-500/20 hover:border-amber-500/40',
        label: 'Dirty',
        sublabel: 'Needs cleaning',
    },
    IN_PROGRESS: {
        bg: 'bg-sky-500/8',
        text: 'text-sky-600',
        border: 'border-sky-500/20 hover:border-sky-500/40',
        label: 'Cleaning',
        sublabel: 'Housekeeping active',
    },
    MAINTENANCE: {
        bg: 'bg-purple-500/8',
        text: 'text-purple-600',
        border: 'border-purple-500/20 hover:border-purple-500/40',
        label: 'Maintenance',
        sublabel: 'Under maintenance',
    },
}

const StatusIcon = ({ status }: { status: UnitStatus }) => {
    const iconClass = `h-3.5 w-3.5`
    switch (status) {
        case 'AVAILABLE':
            return <Sparkles className={iconClass} />
        case 'OCCUPIED':
            return <User className={iconClass} />
        case 'DIRTY':
            return <AlertTriangle className={iconClass} />
        case 'IN_PROGRESS':
            return <Loader2 className={`${iconClass} animate-spin`} />
        case 'MAINTENANCE':
            return <Wrench className={iconClass} />
    }
}

function getDormBedLabel(unitNumber: string): string {
    const match = unitNumber.match(/A(\d+)/)
    if (!match) return 'Dorm Bed'
    const num = parseInt(match[1])
    return num <= 13 ? 'Lower Bed' : 'Upper Bed'
}

const alertStyles: Record<string, { bg: string; text: string; border: string; pulse: boolean }> = {
    critical: {
        bg: 'bg-red-500/15',
        text: 'text-red-600',
        border: 'border-red-500/40 hover:border-red-500/60',
        pulse: true,
    },
    warning: {
        bg: 'bg-amber-500/12',
        text: 'text-amber-600',
        border: 'border-amber-500/40 hover:border-amber-500/60',
        pulse: false,
    },
    upcoming: {
        bg: 'bg-blue-500/8',
        text: 'text-blue-500',
        border: 'border-blue-500/30',
        pulse: false,
    },
}

export function UnitCard({ unit, onClick, now }: UnitCardProps) {
    const config = statusConfig[unit.status]
    const isDorm = unit.type === 'DORM'
    const guestName = unit.active_booking?.guests?.[0]?.name
    const dormLabel = isDorm ? getDormBedLabel(unit.unit_number) : null

    // Calculate checkout alert for occupied units
    const checkoutAlert: CheckoutAlert | null =
        unit.status === 'OCCUPIED' && unit.active_booking?.check_out && now
            ? getCheckoutAlert(unit.active_booking.check_out, now)
            : null

    const hasAlert = checkoutAlert && checkoutAlert.level !== 'none'
    const alert = hasAlert ? alertStyles[checkoutAlert.level] : null

    // Override card styling if there's an alert
    const cardBg = alert ? alert.bg : config.bg
    const cardBorder = alert ? alert.border : config.border

    return (
        <Card
            onClick={() => onClick(unit)}
            className={`cursor-pointer group transition-all duration-300 hover:scale-[1.02] hover:shadow-lg border ${cardBorder} ${cardBg} backdrop-blur-sm relative`}
        >
            {/* Checkout alert pulse ring for critical */}
            {checkoutAlert?.level === 'critical' && (
                <div className="absolute -top-1 -right-1 h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
                </div>
            )}

            <CardHeader className="flex flex-row items-center justify-between pb-1 space-y-0 px-4 pt-4">
                <div className="flex items-center gap-2">
                    {isDorm ? (
                        <BedSingle className="h-4 w-4 text-slate-400" />
                    ) : (
                        <BedDouble className="h-4 w-4 text-slate-400" />
                    )}
                    <CardTitle className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                        {unit.unit_number}
                    </CardTitle>
                </div>
                <Badge
                    variant="outline"
                    className={`flex w-fit items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 ${config.text} border-current/20`}
                >
                    <StatusIcon status={unit.status} />
                    {config.label}
                </Badge>
            </CardHeader>
            <CardContent className="px-4 pb-4 pt-1">
                <p className="text-[11px] text-muted-foreground font-medium">
                    {unit.status === 'OCCUPIED' && guestName
                        ? guestName
                        : unit.status === 'MAINTENANCE' && unit.maintenance_reason
                            ? unit.maintenance_reason
                            : config.sublabel}
                </p>

                {/* Checkout Alert Badge */}
                {hasAlert && checkoutAlert && (
                    <div className={`mt-2 flex items-center gap-1.5 px-2 py-1 rounded-lg ${checkoutAlert.level === 'critical'
                        ? 'bg-red-100 border border-red-200'
                        : checkoutAlert.level === 'warning'
                            ? 'bg-amber-100 border border-amber-200'
                            : 'bg-blue-50 border border-blue-200'
                        }`}>
                        <Clock className={`h-3 w-3 ${alert?.text}`} />
                        <span className={`text-[10px] font-bold ${alert?.text}`}>
                            {checkoutAlert.label}
                        </span>
                    </div>
                )}

                <div className={`flex items-center justify-between ${hasAlert ? 'mt-1.5' : 'mt-2'}`}>
                    <span className="text-[10px] font-medium text-slate-400 uppercase tracking-widest">
                        {isDorm ? dormLabel : 'Private Room'}
                    </span>
                    <span className="text-xs font-semibold text-slate-500">
                        ₹{Number(unit.base_price).toLocaleString('en-IN')}
                    </span>
                </div>
            </CardContent>
        </Card>
    )
}
