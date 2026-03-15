"use client"
import { BookOpen, Calendar, ClipboardList, Globe, LayoutDashboard, LogOut, Sparkles, Users } from 'lucide-react'
import Link from 'next/link'
import { useAuthStore } from '@/lib/store/auth-store'
import { usePathname } from 'next/navigation'

export function Header() {
    const { profile, signOut } = useAuthStore()
    const pathname = usePathname()

    if (!profile) return null

    const canSeeFrontDesk = profile.role === 'Admin' || profile.role === 'FrontDesk'
    const canSeeHousekeeping = profile.role === 'Admin' || profile.role === 'Housekeeping'
    const canSeeAdmin = profile.role === 'Admin'
    const canSeeHR = profile.role === 'Admin' || profile.role === 'HR'
    const canSeeOps = profile.role === 'Admin' || profile.role === 'OpsManager'
    const canSeeZonal = profile.role === 'Admin' || profile.role === 'ZonalManager'

    return (
        <header className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/80 backdrop-blur-xl dark:border-slate-800 dark:bg-slate-950/80">
            <div className="container mx-auto flex h-16 items-center justify-between px-4">
                <div className="flex items-center gap-6">
                    <Link href={`/${profile.role === 'Admin' ? 'admin' : profile.role === 'OpsManager' ? 'ops' : profile.role === 'ZonalManager' ? 'zonal' : profile.role === 'HR' ? 'hr' : profile.role === 'Housekeeping' ? 'housekeeping' : 'front-desk'}`} className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white shadow-sm">
                            <span className="font-bold text-lg leading-none">F</span>
                        </div>
                        <span className="hidden font-semibold sm:inline-block tracking-tight text-slate-900">
                            FAJO Hotels
                        </span>
                    </Link>

                    <nav className="flex items-center gap-1">
                        {canSeeFrontDesk && (
                            <Link href="/front-desk" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/front-desk' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <BookOpen className="h-4 w-4" />
                                <span>Front Desk</span>
                            </Link>
                        )}
                        {canSeeFrontDesk && (
                            <Link href="/reservations" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/reservations' ? 'bg-blue-50 text-blue-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <Calendar className="h-4 w-4" />
                                <span>Reservations</span>
                            </Link>
                        )}
                        {canSeeHousekeeping && (
                            <Link href="/housekeeping" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/housekeeping' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <Sparkles className="h-4 w-4" />
                                <span>Housekeeping</span>
                            </Link>
                        )}
                        {canSeeHR && (
                            <Link href="/hr" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/hr' ? 'bg-violet-50 text-violet-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <Users className="h-4 w-4" />
                                <span>HR</span>
                            </Link>
                        )}
                        {canSeeOps && (
                            <Link href="/ops" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/ops' ? 'bg-orange-50 text-orange-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <ClipboardList className="h-4 w-4" />
                                <span>Operations</span>
                            </Link>
                        )}
                        {canSeeZonal && (
                            <Link href="/zonal" className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/zonal' ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <Globe className="h-4 w-4" />
                                <span>Zonal</span>
                            </Link>
                        )}
                        {canSeeAdmin && (
                            <Link href="/admin" className={`hidden md:flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors ${pathname === '/admin' ? 'bg-emerald-50 text-emerald-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}>
                                <LayoutDashboard className="h-4 w-4" />
                                <span>Admin</span>
                            </Link>
                        )}
                    </nav>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end mr-2 hidden sm:flex">
                        <span className="text-sm font-semibold text-slate-700 leading-none">{profile.name || profile.role}</span>
                        <span className="text-xs text-slate-500 mt-1">{profile.name ? profile.role : 'Logged In'}</span>
                    </div>
                    <button onClick={signOut} title="Sign Out" className="flex items-center gap-2 rounded-full border border-slate-200 p-1.5 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors">
                        <LogOut className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </header>
    )
}
