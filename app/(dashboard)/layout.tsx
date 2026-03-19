"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Header } from '@/components/shared/Header'
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

    if (isLoading || !user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-slate-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
            </div>
        )
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 font-sans selection:bg-emerald-500/30">
            <Header />
            <main className="container mx-auto px-4 py-8">
                {children}
            </main>
            <Toaster position="bottom-center" richColors />
        </div>
    )
}
