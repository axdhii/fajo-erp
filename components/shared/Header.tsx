"use client"
import { useState, useEffect, useCallback } from 'react'
import { BookOpen, Calendar, Clock, ClipboardList, LayoutDashboard, LogOut, Menu, MessageSquare, Sparkles, StickyNote, Users, Wrench, X } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/auth-store'
import { usePathname } from 'next/navigation'
import { NotificationBell } from './NotificationBell'
import { MessagingDrawer } from './MessagingDrawer'
import { NotepadDrawer } from './NotepadDrawer'

export function Header() {
    const { profile, signOut } = useAuthStore()
    const pathname = usePathname()
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
    const [messagingOpen, setMessagingOpen] = useState(false)
    const [notepadOpen, setNotepadOpen] = useState(false)
    const [unreadMessages, setUnreadMessages] = useState(0)

    // Live IST clock
    const [currentTime, setCurrentTime] = useState<Date | null>(null)

    useEffect(() => {
        setCurrentTime(new Date())
        const timer = setInterval(() => setCurrentTime(new Date()), 1000)
        return () => clearInterval(timer)
    }, [])

    const fetchUnreadMessages = useCallback(async () => {
        try {
            const res = await fetch('/api/messages')
            if (res.ok) {
                const json = await res.json()
                setUnreadMessages(json.unread_count || 0)
            }
        } catch {}
    }, [])

    useEffect(() => { fetchUnreadMessages() }, [fetchUnreadMessages])

    const timeStr = currentTime
        ? currentTime.toLocaleString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'short',
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true,
        })
        : ''

    if (!profile) return null

    const isAdminOrDev = profile.role === 'Admin' || profile.role === 'Developer'
    const canSeeFrontDesk = isAdminOrDev || profile.role === 'FrontDesk'
    const canSeeHousekeeping = isAdminOrDev || profile.role === 'FrontDesk'
    const canSeeAdmin = isAdminOrDev
    const canSeeHR = isAdminOrDev || profile.role === 'HR'
    const canSeeZonalOps = isAdminOrDev || profile.role === 'ZonalOps'
    const canSeeZonalHK = isAdminOrDev || profile.role === 'ZonalHK'
    const canSeeDev = profile.role === 'Developer'

    // Build nav links array to avoid duplication between desktop and mobile
    const navLinks = [
        canSeeFrontDesk && { href: '/front-desk', label: 'CRE', icon: <BookOpen className="h-4 w-4" />, activeClass: 'bg-emerald-50 text-emerald-700' },
        canSeeFrontDesk && { href: '/reservations', label: 'Reservations', icon: <Calendar className="h-4 w-4" />, activeClass: 'bg-blue-50 text-blue-700' },
        canSeeHousekeeping && { href: '/housekeeping', label: 'Housekeeping', icon: <Sparkles className="h-4 w-4" />, activeClass: 'bg-emerald-50 text-emerald-700' },
        canSeeHR && { href: '/hr', label: 'HR', icon: <Users className="h-4 w-4" />, activeClass: 'bg-violet-50 text-violet-700' },
        canSeeZonalOps && { href: '/zonal-ops', label: 'Zonal Ops', icon: <ClipboardList className="h-4 w-4" />, activeClass: 'bg-orange-50 text-orange-700' },
        canSeeZonalHK && { href: '/zonal-hk', label: 'Zonal HK', icon: <Sparkles className="h-4 w-4" />, activeClass: 'bg-teal-50 text-teal-700' },
        canSeeAdmin && { href: '/admin', label: 'Admin', icon: <LayoutDashboard className="h-4 w-4" />, activeClass: 'bg-emerald-50 text-emerald-700' },
        canSeeDev && { href: '/developer', label: 'Dev Tools', icon: <Wrench className="h-4 w-4" />, activeClass: 'bg-red-50 text-red-700' },
    ].filter(Boolean) as { href: string; label: string; icon: React.ReactNode; activeClass: string }[]

    return (
        <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-4 md:gap-6">
                    <Link href={`/${profile.role === 'Developer' ? 'developer' : profile.role === 'Admin' ? 'admin' : profile.role === 'ZonalOps' ? 'zonal-ops' : profile.role === 'ZonalHK' ? 'zonal-hk' : profile.role === 'HR' ? 'hr' : 'front-desk'}`} className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                            <span className="font-bold text-lg leading-none">F</span>
                        </div>
                        <span className="hidden font-semibold sm:inline-block tracking-tight text-slate-900">
                            FAJO Hotels
                        </span>
                    </Link>

                    {/* Mobile hamburger button */}
                    <button
                        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                        className="md:hidden p-2 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                    </button>

                    {/* Desktop nav */}
                    <nav className="hidden md:flex items-center gap-1">
                        {navLinks.map(link => (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === link.href ? link.activeClass : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
                            >
                                {link.icon}
                                <span>{link.label}</span>
                            </Link>
                        ))}
                    </nav>
                </div>

                <div className="flex items-center gap-2 sm:gap-4">
                    {timeStr && (
                        <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 select-none">
                            <Clock className="h-3.5 w-3.5" />
                            <span>{timeStr}</span>
                        </div>
                    )}
                    <div className="hidden sm:flex flex-col items-end mr-2">
                        <span className="text-sm font-semibold text-slate-700 leading-none">{profile.name || profile.role}</span>
                        <span className="text-xs text-slate-500 mt-1">{profile.name ? profile.role : 'Logged In'}</span>
                    </div>
                    {/* Show role badge on mobile only */}
                    <span className="sm:hidden text-xs font-medium text-slate-500">{profile.role}</span>
                    <NotificationBell hotelId={profile.hotel_id} role={profile.role} staffId={profile.id} />
                    {/* Messaging */}
                    <button
                        onClick={() => setMessagingOpen(true)}
                        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Messages"
                    >
                        <MessageSquare className="h-5 w-5 text-slate-600" />
                        {unreadMessages > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cyan-500 px-1 text-[10px] font-bold text-white">
                                {unreadMessages > 99 ? '99+' : unreadMessages}
                            </span>
                        )}
                    </button>
                    {/* Notepad */}
                    <button
                        onClick={() => setNotepadOpen(true)}
                        className="p-2 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Notepad"
                    >
                        <StickyNote className="h-5 w-5 text-slate-600" />
                    </button>
                    <button onClick={signOut} title="Sign Out" className="flex items-center gap-2 rounded-full border border-slate-200 p-2.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                        <LogOut className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Mobile menu drawer */}
            {mobileMenuOpen && (
                <div className="md:hidden border-t border-slate-200 bg-white px-4 py-3 space-y-1">
                    {navLinks.map(link => (
                        <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => setMobileMenuOpen(false)}
                            className={`flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                                pathname === link.href ? 'bg-slate-100 text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                            }`}
                        >
                            {link.icon}
                            {link.label}
                        </Link>
                    ))}
                </div>
            )}

            {profile && (
                <>
                    <MessagingDrawer
                        open={messagingOpen}
                        onClose={() => { setMessagingOpen(false); fetch('/api/messages', { method: 'PATCH' }).finally(() => fetchUnreadMessages()) }}
                        staffId={profile.id}
                        hotelId={profile.hotel_id}
                    />
                    <NotepadDrawer
                        open={notepadOpen}
                        onClose={() => setNotepadOpen(false)}
                        staffId={profile.id}
                        hotelId={profile.hotel_id}
                    />
                </>
            )}
        </header>
    )
}
