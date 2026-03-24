"use client"

import { useEffect, useRef, useState } from 'react'
import { Bell, CheckCheck, ExternalLink, Inbox } from 'lucide-react'
import Link from 'next/link'
import { useNotificationStore, type Notification } from '@/lib/store/notification-store'

import { timeAgo } from '@/lib/utils/time'

// ── Type-to-color mapping ─────────────────────────────────────
function typeColor(type: string): string {
    if (type.includes('EXPENSE')) return 'bg-amber-500'
    if (type.includes('MAINTENANCE')) return 'bg-red-500'
    if (type.includes('ISSUE')) return 'bg-orange-500'
    if (type.includes('RESTOCK')) return 'bg-blue-500'
    return 'bg-slate-500'
}

// ── Main component ────────────────────────────────────────────
interface NotificationBellProps {
    hotelId: string
    role: string
    staffId: string
}

export function NotificationBell({ hotelId, role, staffId }: NotificationBellProps) {
    const { notifications, unreadCount, isLoading, error, fetchNotifications, markAsRead, markAllAsRead, subscribe } = useNotificationStore()
    const [open, setOpen] = useState(false)
    const panelRef = useRef<HTMLDivElement>(null)
    const buttonRef = useRef<HTMLButtonElement>(null)

    // Fetch + subscribe on mount
    useEffect(() => {
        fetchNotifications(hotelId, role, staffId)
        const unsub = subscribe(hotelId, role, staffId)
        return unsub
    }, [hotelId, role, staffId, fetchNotifications, subscribe])

    // Close panel on outside click
    useEffect(() => {
        if (!open) return
        function handleClick(e: MouseEvent) {
            if (
                panelRef.current && !panelRef.current.contains(e.target as Node) &&
                buttonRef.current && !buttonRef.current.contains(e.target as Node)
            ) {
                setOpen(false)
            }
        }
        document.addEventListener('mousedown', handleClick)
        return () => document.removeEventListener('mousedown', handleClick)
    }, [open])

    // Close panel on Escape
    useEffect(() => {
        if (!open) return
        function handleKey(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false)
        }
        document.addEventListener('keydown', handleKey)
        return () => document.removeEventListener('keydown', handleKey)
    }, [open])

    function handleNotificationClick(n: Notification) {
        if (!n.read) markAsRead(n.id)
        if (n.link) setOpen(false)
    }

    return (
        <div className="relative">
            {/* Bell button */}
            <button
                ref={buttonRef}
                onClick={() => setOpen(prev => !prev)}
                title="Notifications"
                className="relative flex items-center justify-center rounded-full border border-slate-200 p-3 hover:bg-slate-100 transition-colors"
            >
                <Bell className="h-5 w-5 text-slate-600" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown panel */}
            {open && (
                <div
                    ref={panelRef}
                    className="absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-[60] overflow-hidden"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <h3 className="text-sm font-semibold text-slate-900">Notifications</h3>
                        {unreadCount > 0 && (
                            <button
                                onClick={() => markAllAsRead(hotelId, role, staffId)}
                                className="flex items-center gap-1 text-xs text-emerald-600 hover:text-emerald-700 font-medium transition-colors"
                            >
                                <CheckCheck className="h-3.5 w-3.5" />
                                Mark all read
                            </button>
                        )}
                    </div>

                    {/* Notification list */}
                    <div className="max-h-[24rem] overflow-y-auto overscroll-contain">
                        {isLoading && notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600" />
                                <p className="mt-2 text-xs">Loading...</p>
                            </div>
                        ) : error && notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-6 text-slate-400">
                                <p className="text-xs text-red-400">Failed to load notifications</p>
                                <button
                                    onClick={() => fetchNotifications(hotelId, role, staffId)}
                                    className="text-xs text-emerald-600 hover:text-emerald-700 mt-1 font-medium"
                                >
                                    Retry
                                </button>
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <Inbox className="h-8 w-8 mb-2" />
                                <p className="text-sm font-medium">All caught up</p>
                                <p className="text-xs mt-1">No notifications yet</p>
                            </div>
                        ) : (
                            notifications.slice(0, 15).map(n => {
                                const inner = (
                                    <>
                                        {/* Type indicator dot */}
                                        <div className="flex-shrink-0 pt-1">
                                            <div className={`h-2.5 w-2.5 rounded-full ${typeColor(n.type)}`} />
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm leading-snug ${n.read ? 'text-slate-700' : 'text-slate-900 font-medium'}`}>
                                                    {n.title}
                                                </p>
                                                <span className="flex-shrink-0 text-[10px] text-slate-400 mt-0.5">
                                                    {timeAgo(n.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>
                                            {n.link && (
                                                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 mt-1">
                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                    View
                                                </span>
                                            )}
                                        </div>

                                        {/* Unread indicator */}
                                        {!n.read && (
                                            <div className="flex-shrink-0 pt-1.5">
                                                <div className="h-2 w-2 rounded-full bg-blue-500" />
                                            </div>
                                        )}
                                    </>
                                )

                                const rowClasses = `flex gap-3 px-4 py-3 cursor-pointer border-b border-slate-50 last:border-b-0 transition-colors ${
                                    n.read
                                        ? 'bg-white hover:bg-slate-50'
                                        : 'bg-blue-50/50 hover:bg-blue-50'
                                }`

                                if (n.link) {
                                    return (
                                        <Link key={n.id} href={n.link} onClick={() => handleNotificationClick(n)} className={rowClasses}>
                                            {inner}
                                        </Link>
                                    )
                                }
                                return (
                                    <div key={n.id} onClick={() => handleNotificationClick(n)} className={rowClasses}>
                                        {inner}
                                    </div>
                                )
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
