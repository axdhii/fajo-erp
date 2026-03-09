'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertCircle } from 'lucide-react'

export default function DashboardError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[Dashboard Error]', error)
    }, [error])

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
            <div className="flex items-center justify-center w-14 h-14 mb-6 rounded-full bg-red-50 border border-red-100">
                <AlertCircle className="w-7 h-7 text-red-500" />
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Failed to load this section</h2>
            <p className="text-sm text-slate-500 max-w-sm mb-6">
                There was a problem loading this page. This might be a temporary network issue. Try refreshing.
            </p>
            <Button
                onClick={() => reset()}
                className="bg-slate-900 hover:bg-slate-800 text-white"
            >
                Retry
            </Button>
        </div>
    )
}
