'use client'

import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/auth-store'
import { BookOpen, Calendar, LayoutDashboard, Users, ClipboardList, Sparkles } from 'lucide-react'

export function BottomNav() {
    const { profile } = useAuthStore()
    const pathname = usePathname()

    if (!profile) return null

    const role = profile.role
    const isAdminOrDev = role === 'Admin' || role === 'Developer'

    // Build nav items based on role — max 4-5 items for bottom nav
    const items: { href: string; label: string; icon: React.ReactNode }[] = []

    if (isAdminOrDev) {
        items.push(
            { href: '/admin', label: 'Admin', icon: <LayoutDashboard className="h-5 w-5" /> },
            { href: '/front-desk', label: 'CRE', icon: <BookOpen className="h-5 w-5" /> },
            { href: '/reservations', label: 'Bookings', icon: <Calendar className="h-5 w-5" /> },
            { href: '/zonal-ops', label: 'Ops', icon: <ClipboardList className="h-5 w-5" /> },
        )
    } else if (role === 'FrontDesk') {
        items.push(
            { href: '/front-desk', label: 'Dashboard', icon: <BookOpen className="h-5 w-5" /> },
            { href: '/reservations', label: 'Bookings', icon: <Calendar className="h-5 w-5" /> },
            { href: '/housekeeping', label: 'HK', icon: <Sparkles className="h-5 w-5" /> },
        )
    } else if (role === 'ZonalOps') {
        items.push(
            { href: '/zonal-ops', label: 'Dashboard', icon: <ClipboardList className="h-5 w-5" /> },
        )
    } else if (role === 'ZonalHK') {
        items.push(
            { href: '/zonal-hk', label: 'Dashboard', icon: <Sparkles className="h-5 w-5" /> },
        )
    } else if (role === 'HR') {
        items.push(
            { href: '/hr', label: 'Dashboard', icon: <Users className="h-5 w-5" /> },
        )
    }

    // Don't show bottom nav if only 1 item
    if (items.length <= 1) return null

    return (
        <nav className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-white border-t border-slate-200 pb-safe">
            <div className="flex items-center justify-around h-16">
                {items.map(item => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`relative flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg min-w-[64px] transition-colors ${
                                isActive
                                    ? 'text-emerald-600'
                                    : 'text-slate-400 active:text-slate-600'
                            }`}
                        >
                            {item.icon}
                            <span className={`text-[10px] font-medium ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {item.label}
                            </span>
                            {isActive && (
                                <div className="absolute bottom-1 w-1 h-1 rounded-full bg-emerald-500" />
                            )}
                        </Link>
                    )
                })}
            </div>
        </nav>
    )
}
