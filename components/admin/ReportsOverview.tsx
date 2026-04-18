'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase/client'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
    ClipboardList,
    Camera,
    CheckCircle2,
    Eye,
    AlertTriangle,
    MessageSquare,
    Loader2,
    Clock,
    X,
} from 'lucide-react'
import { timeAgo } from '@/lib/utils/time'

import type { AdminTabProps } from '@/app/(dashboard)/admin/client'

// ── Types ────────────────────────────────────────────────────
interface PropertyReport {
    id: string
    hotel_id: string
    reporter_id: string
    reporter_name?: string
    reporter_role?: string
    reporter?: { name: string; role: string } | null
    type: 'REPORT' | 'ISSUE'
    category: string
    description: string
    photo_url: string | null
    status: 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'
    review_notes: string | null
    acknowledged_by: string | null
    resolved_by: string | null
    created_at: string
    updated_at: string
}

type FilterType = 'ALL' | 'REPORT' | 'ISSUE'
type FilterStatus = 'ALL' | 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

// ── Style helpers ────────────────────────────────────────────
function roleBadgeStyle(role: string): string {
    switch (role) {
        case 'ZonalOps':  return 'bg-orange-100 text-orange-700'
        case 'ZonalHK':   return 'bg-teal-100 text-teal-700'
        case 'Admin':     return 'bg-purple-100 text-purple-700'
        case 'Developer': return 'bg-indigo-100 text-indigo-700'
        case 'FrontDesk': return 'bg-emerald-100 text-emerald-700'
        case 'HR':        return 'bg-blue-100 text-blue-700'
        default:          return 'bg-slate-100 text-slate-700'
    }
}

function categoryBadgeStyle(category: string): string {
    const cat = category?.toLowerCase() ?? ''
    if (cat.includes('plumb') || cat.includes('water')) return 'bg-blue-100 text-blue-700'
    if (cat.includes('electric') || cat.includes('power')) return 'bg-yellow-100 text-yellow-700'
    if (cat.includes('clean') || cat.includes('hygiene')) return 'bg-green-100 text-green-700'
    if (cat.includes('safety') || cat.includes('security')) return 'bg-red-100 text-red-700'
    if (cat.includes('furniture') || cat.includes('fixture')) return 'bg-amber-100 text-amber-700'
    return 'bg-slate-100 text-slate-600'
}

const STATUS_STYLES: Record<string, string> = {
    OPEN: 'bg-yellow-100 text-yellow-700',
    ACKNOWLEDGED: 'bg-blue-100 text-blue-700',
    RESOLVED: 'bg-green-100 text-green-700',
}

const TYPE_STYLES: Record<string, string> = {
    REPORT: 'bg-blue-100 text-blue-700',
    ISSUE: 'bg-red-100 text-red-700',
}

// ── Main Component ───────────────────────────────────────────
export function ReportsOverview({ hotelId, hotels, staffId }: AdminTabProps) {
    const [reports, setReports] = useState<PropertyReport[]>([])
    const [loading, setLoading] = useState(false)
    const [filterType, setFilterType] = useState<FilterType>('ALL')
    const [filterStatus, setFilterStatus] = useState<FilterStatus>('ALL')
    const [updatingId, setUpdatingId] = useState<string | null>(null)
    const [resolveNotesMap, setResolveNotesMap] = useState<Record<string, string>>({})
    const [resolvingId, setResolvingId] = useState<string | null>(null)
    const [expandedPhoto, setExpandedPhoto] = useState<string | null>(null)

    // Determine effective hotel ID
    const effectiveHotelId = hotelId ?? (hotels.length > 0 ? hotels[0].id : null)

    // ── Fetch reports ────────────────────────────────────────
    const fetchReports = useCallback(async () => {
        if (!effectiveHotelId) return
        setLoading(true)
        try {
            const res = await fetch(`/api/property-reports?hotel_id=${effectiveHotelId}`)
            if (!res.ok) throw new Error('Failed to fetch reports')
            const json = await res.json()
            setReports(Array.isArray(json.data) ? json.data : [])
        } catch {
            toast.error('Failed to load property reports')
            setReports([])
        }
        setLoading(false)
    }, [effectiveHotelId])

    // ── Acknowledge report ───────────────────────────────────
    const handleAcknowledge = async (reportId: string) => {
        if (updatingId) return
        setUpdatingId(reportId)
        try {
            const res = await fetch('/api/property-reports', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: reportId, action: 'ACKNOWLEDGED' }),
            })
            if (!res.ok) throw new Error('Failed to acknowledge')
            toast.success('Report acknowledged')
            fetchReports()
        } catch {
            toast.error('Failed to acknowledge report')
        }
        setUpdatingId(null)
    }

    // ── Resolve report ───────────────────────────────────────
    const handleResolve = async (reportId: string) => {
        if (updatingId) return
        setUpdatingId(reportId)
        try {
            const res = await fetch('/api/property-reports', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: reportId,
                    action: 'RESOLVED',
                    review_notes: resolveNotesMap[reportId] || '',
                }),
            })
            if (!res.ok) throw new Error('Failed to resolve')
            toast.success('Report resolved')
            setResolvingId(null)
            setResolveNotesMap(prev => {
                const updated = { ...prev }
                delete updated[reportId]
                return updated
            })
            fetchReports()
        } catch {
            toast.error('Failed to resolve report')
        }
        setUpdatingId(null)
    }

    // ── Load reports on mount + hotel change ─────────────────
    useEffect(() => {
        fetchReports()
    }, [fetchReports])

    // ── Realtime subscription ────────────────────────────────
    useEffect(() => {
        if (!effectiveHotelId) return

        const channel = supabase
            .channel('reports-realtime')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'property_reports',
                    filter: `hotel_id=eq.${effectiveHotelId}`,
                },
                () => {
                    fetchReports()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [effectiveHotelId, fetchReports])

    // ── Filtered reports ─────────────────────────────────────
    const filteredReports = reports.filter(r => {
        if (filterType !== 'ALL' && r.type !== filterType) return false
        if (filterStatus !== 'ALL' && r.status !== filterStatus) return false
        return true
    })

    // ── Counts for filter badges ─────────────────────────────
    const openCount = reports.filter(r => r.status === 'OPEN').length
    const issueCount = reports.filter(r => r.type === 'ISSUE').length

    // ── Format timestamp in IST ──────────────────────────────
    const formatIST = (dateStr: string) => {
        return new Date(dateStr).toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        })
    }

    // ── Get reporter info ────────────────────────────────────
    const getReporterName = (r: PropertyReport) => r.reporter?.name || r.reporter_name || 'Unknown'
    const getReporterRole = (r: PropertyReport) => r.reporter?.role || r.reporter_role || 'Staff'

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <ClipboardList className="h-5 w-5 text-slate-600" />
                    Property Reports
                    {!hotelId && effectiveHotelId && (
                        <span className="text-sm font-normal text-slate-400 ml-1">
                            ({hotels.find(h => h.id === effectiveHotelId)?.name || 'All Hotels'})
                        </span>
                    )}
                </h2>
            </div>

            {/* No hotel available */}
            {!effectiveHotelId && (
                <Card className="rounded-2xl">
                    <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                        <AlertTriangle className="h-12 w-12 text-slate-300 mb-4" />
                        <p className="text-slate-500 font-medium">No hotel selected</p>
                        <p className="text-slate-400 text-sm mt-1">Select a hotel to view property reports.</p>
                    </CardContent>
                </Card>
            )}

            {effectiveHotelId && (
                <>
                    {/* Type filter tabs */}
                    <div className="flex flex-wrap gap-2">
                        {(['ALL', 'REPORT', 'ISSUE'] as FilterType[]).map(ft => (
                            <button
                                key={ft}
                                onClick={() => setFilterType(ft)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                    filterType === ft
                                        ? 'bg-slate-800 text-white'
                                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                }`}
                            >
                                {ft === 'ALL' ? 'All' : ft === 'REPORT' ? 'Reports' : 'Issues'}
                                {ft === 'ISSUE' && issueCount > 0 && (
                                    <span className="ml-1.5 bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                        {issueCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Status filter */}
                    <div className="flex flex-wrap gap-2">
                        {(['ALL', 'OPEN', 'ACKNOWLEDGED', 'RESOLVED'] as FilterStatus[]).map(fs => (
                            <button
                                key={fs}
                                onClick={() => setFilterStatus(fs)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                    filterStatus === fs
                                        ? 'bg-slate-700 text-white'
                                        : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                                }`}
                            >
                                {fs === 'ALL' ? 'All Status' : fs.charAt(0) + fs.slice(1).toLowerCase()}
                                {fs === 'OPEN' && openCount > 0 && (
                                    <span className="ml-1.5 bg-yellow-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                                        {openCount}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>

                    {/* Loading */}
                    {loading && (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <Loader2 className="h-8 w-8 text-slate-300 animate-spin mb-4" />
                                <p className="text-slate-400 text-sm">Loading reports...</p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Empty state */}
                    {!loading && filteredReports.length === 0 && (
                        <Card className="rounded-2xl">
                            <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                                <CheckCircle2 className="h-12 w-12 text-slate-300 mb-4" />
                                <p className="text-slate-500 font-medium">No reports found</p>
                                <p className="text-slate-400 text-sm mt-1">
                                    {filterType !== 'ALL' || filterStatus !== 'ALL'
                                        ? 'Try adjusting your filters.'
                                        : 'No property reports have been submitted yet.'}
                                </p>
                            </CardContent>
                        </Card>
                    )}

                    {/* Report cards */}
                    {!loading && filteredReports.length > 0 && (
                        <div className="grid gap-3">
                            {filteredReports.map(report => {
                                const reporterName = getReporterName(report)
                                const reporterRole = getReporterRole(report)

                                return (
                                    <Card
                                        key={report.id}
                                        className={`rounded-2xl border-l-4 ${
                                            report.type === 'ISSUE' ? 'border-l-red-400' : 'border-l-blue-400'
                                        }`}
                                    >
                                        <CardContent className="py-4 px-5">
                                            <div className="space-y-3">
                                                {/* Header row */}
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        {/* Badges row */}
                                                        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                                                            {/* Type badge */}
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_STYLES[report.type] || 'bg-slate-100 text-slate-600'}`}>
                                                                {report.type}
                                                            </span>
                                                            {/* Category badge */}
                                                            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${categoryBadgeStyle(report.category)}`}>
                                                                {report.category}
                                                            </span>
                                                            {/* Status badge */}
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${STATUS_STYLES[report.status] || 'bg-slate-100 text-slate-600'}`}>
                                                                {report.status}
                                                            </span>
                                                        </div>

                                                        {/* Description */}
                                                        <p className="text-sm text-slate-700">{report.description}</p>

                                                        {/* Reporter + time */}
                                                        <div className="flex items-center gap-2 text-xs text-slate-400 mt-2 flex-wrap">
                                                            <span className="flex items-center gap-1">
                                                                <span className="font-medium text-slate-600">{reporterName}</span>
                                                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${roleBadgeStyle(reporterRole)}`}>
                                                                    {reporterRole}
                                                                </span>
                                                            </span>
                                                            <span className="flex items-center gap-1">
                                                                <Clock className="h-3 w-3" />
                                                                {formatIST(report.created_at)}
                                                            </span>
                                                        </div>

                                                        {/* Review notes (if resolved) */}
                                                        {report.review_notes && (
                                                            <div className="mt-2 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                                                                <p className="text-xs text-green-700 flex items-start gap-1.5">
                                                                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                                    {report.review_notes}
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Photo thumbnail */}
                                                    {report.photo_url && (
                                                        <button
                                                            onClick={() => setExpandedPhoto(report.photo_url)}
                                                            className="flex-shrink-0 relative group"
                                                        >
                                                            <img
                                                                src={report.photo_url}
                                                                alt="Report photo"
                                                                className="h-16 w-16 rounded-lg object-cover border border-slate-200"
                                                            />
                                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 rounded-lg transition-colors flex items-center justify-center">
                                                                <Eye className="h-4 w-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                                                            </div>
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Actions */}
                                                {report.status !== 'RESOLVED' && (
                                                    <div className="flex items-end gap-2 pt-1">
                                                        {report.status === 'OPEN' && (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => handleAcknowledge(report.id)}
                                                                disabled={updatingId === report.id}
                                                                className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                                                            >
                                                                {updatingId === report.id ? (
                                                                    <Loader2 className="h-4 w-4 animate-spin" />
                                                                ) : (
                                                                    <>
                                                                        <Eye className="h-3.5 w-3.5 mr-1" />
                                                                        Acknowledge
                                                                    </>
                                                                )}
                                                            </Button>
                                                        )}

                                                        {/* Resolve section */}
                                                        {resolvingId === report.id ? (
                                                            <div className="flex-1 flex items-end gap-2">
                                                                <textarea
                                                                    placeholder="Review notes (optional)..."
                                                                    value={resolveNotesMap[report.id] || ''}
                                                                    onChange={e => setResolveNotesMap(prev => ({ ...prev, [report.id]: e.target.value }))}
                                                                    className="flex-1 text-sm border border-slate-200 rounded-lg p-2 resize-none h-9 min-h-[36px] focus:outline-none focus:ring-2 focus:ring-green-300"
                                                                    rows={1}
                                                                />
                                                                <Button
                                                                    size="sm"
                                                                    onClick={() => handleResolve(report.id)}
                                                                    disabled={updatingId === report.id}
                                                                    className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                                                                >
                                                                    {updatingId === report.id ? (
                                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                                    ) : (
                                                                        <>
                                                                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                                                            Confirm
                                                                        </>
                                                                    )}
                                                                </Button>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    onClick={() => setResolvingId(null)}
                                                                    className="shrink-0 text-slate-500"
                                                                >
                                                                    <X className="h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                size="sm"
                                                                onClick={() => setResolvingId(report.id)}
                                                                className="bg-green-600 hover:bg-green-700 text-white shrink-0"
                                                            >
                                                                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                                                                Resolve
                                                            </Button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </CardContent>
                                    </Card>
                                )
                            })}
                        </div>
                    )}
                </>
            )}

            {/* Photo lightbox */}
            {expandedPhoto && (
                <div
                    className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-4"
                    onClick={() => setExpandedPhoto(null)}
                >
                    <div className="relative max-w-2xl max-h-[80vh]">
                        <button
                            onClick={() => setExpandedPhoto(null)}
                            className="absolute -top-3 -right-3 h-8 w-8 rounded-full bg-white shadow-lg flex items-center justify-center hover:bg-slate-100 transition-colors z-10"
                        >
                            <X className="h-4 w-4 text-slate-700" />
                        </button>
                        <img
                            src={expandedPhoto}
                            alt="Report photo full view"
                            className="max-w-full max-h-[80vh] rounded-xl object-contain"
                            onClick={e => e.stopPropagation()}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
