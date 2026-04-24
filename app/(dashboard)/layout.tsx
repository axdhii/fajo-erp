"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { BottomNav } from '@/components/shared/BottomNav'
import { ShiftReportModal } from '@/components/shared/ShiftReportModal'
import { Toaster } from '@/components/ui/sonner'
import { SelfieRequestBanner } from '@/components/shared/SelfieRequestBanner'
import { useAuthStore } from '@/lib/store/auth-store'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, profile, checkAuth, isLoading } = useAuthStore()
    const router = useRouter()

    useEffect(() => {
        checkAuth()
    }, [checkAuth])

    useEffect(() => {
        if (!isLoading && !user) {
            router.push('/login')
        }
    }, [user, isLoading, router])

    // Non-blocking: render children immediately, redirect will kick in if unauthenticated
    // Show selfie banner for non-admin roles only
    const showSelfieBanner = profile && !['Admin', 'Developer'].includes(profile.role)

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans selection:bg-emerald-500/30">
            <Header />
            {showSelfieBanner && (
                <SelfieRequestBanner staffId={profile.id} hotelId={profile.hotel_id} />
            )}
            <main className="container mx-auto px-4 py-6 pb-24 md:pb-8">
                {children}
            </main>
            <ShiftReportModal />
            <Toaster position="bottom-center" richColors />
            <BottomNav />
        </div>
    )
}
