"use client"
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/lib/store/auth-store'

export default function Home() {
  const router = useRouter()
  const { user, profile, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isLoading) {
      if (!user) {
        router.push('/login')
      } else if (profile) {
        if (profile.role === 'Admin') router.push('/admin')
        else if (profile.role === 'Housekeeping') router.push('/housekeeping')
        else router.push('/front-desk')
      }
    }
  }, [user, profile, isLoading, router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent"></div>
    </div>
  )
}
