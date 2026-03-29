"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/shared/Header'
import { ShiftReportModal } from '@/components/shared/ShiftReportModal'
import { Toaster } from '@/components/ui/sonner'
import { useAuthStore } from '@/lib/store/auth-store'

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const { user, checkAuth, isLoading } = useAuthStore()
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
    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans selection:bg-emerald-500/30">
            <Header />
            <main className="container mx-auto px-4 py-8">
                {children}
            </main>
            <ShiftReportModal />
            <Toaster position="bottom-center" richColors />
        </div>
    )
}
