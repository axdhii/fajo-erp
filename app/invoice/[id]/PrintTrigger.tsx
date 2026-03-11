'use client'

import { useEffect } from 'react'
import { Printer } from 'lucide-react'

export default function PrintTrigger() {
    useEffect(() => {
        // Small delay to ensure CSS classes and fonts mount before blocking the browser thread
        const timer = setTimeout(() => {
            window.print()
        }, 800)
        return () => clearTimeout(timer)
    }, [])

    return (
        <div className="fixed bottom-8 right-8 print:hidden">
            <button
                onClick={() => window.print()}
                className="flex items-center gap-2.5 rounded-full bg-slate-900 px-6 py-3.5 text-sm font-semibold text-white shadow-2xl transition-all hover:scale-105 hover:bg-slate-800 active:scale-95"
            >
                <Printer className="h-4 w-4" />
                Print Invoice
            </button>
        </div>
    )
}
