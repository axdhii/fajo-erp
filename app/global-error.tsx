'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error('[Global Error]', error)
    }, [error])

    return (
        <html>
            <body>
                <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                    <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
                        <div className="flex items-center justify-center w-16 h-16 mx-auto mb-6 rounded-full bg-red-50">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                        </div>
                        <h1 className="text-2xl font-semibold text-slate-900 mb-2">Something went wrong</h1>
                        <p className="text-sm text-slate-500 mb-6">
                            An unexpected error occurred. Please try again, or contact your system administrator if the problem persists.
                        </p>
                        {error.digest && (
                            <p className="text-xs text-slate-400 font-mono mb-6 bg-slate-50 rounded p-2">
                                Error ID: {error.digest}
                            </p>
                        )}
                        <div className="flex gap-3 justify-center">
                            <Button variant="outline" onClick={() => window.location.href = '/front-desk'}>
                                Go to Dashboard
                            </Button>
                            <Button onClick={() => reset()} className="bg-slate-900 hover:bg-slate-800 text-white">
                                Try again
                            </Button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    )
}
