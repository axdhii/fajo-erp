'use client'

import { useState, useEffect, useCallback } from 'react'

/**
 * Client-side hook that returns the current "now" — 
 * respects dev time simulation by polling the server.
 * In production, just returns new Date().
 * Updates every `intervalMs` (default 30s).
 */
export function useCurrentTime(intervalMs = 30000) {
    const [now, setNow] = useState<Date>(new Date())

    const fetchTime = useCallback(async () => {
        if (process.env.NODE_ENV !== 'development') {
            setNow(new Date())
            return
        }
        try {
            const res = await fetch('/api/dev/time')
            const data = await res.json()
            if (data.currentTime) {
                setNow(new Date(data.currentTime))
            }
        } catch {
            setNow(new Date())
        }
    }, [])

    useEffect(() => {
        fetchTime()
        const interval = setInterval(fetchTime, intervalMs)
        return () => clearInterval(interval)
    }, [fetchTime, intervalMs])

    return now
}

/**
 * Given a checkout time and current time, returns the alert status.
 */
export type CheckoutAlertLevel = 'none' | 'upcoming' | 'warning' | 'critical'

export interface CheckoutAlert {
    level: CheckoutAlertLevel
    label: string
    minutesRemaining: number
}

export function getCheckoutAlert(checkOut: string | null, now: Date): CheckoutAlert {
    if (!checkOut) return { level: 'none', label: '', minutesRemaining: Infinity }

    const checkOutTime = new Date(checkOut)
    const diffMs = checkOutTime.getTime() - now.getTime()
    const diffMinutes = Math.round(diffMs / (60 * 1000))

    if (diffMinutes <= 0) {
        // OVERDUE
        const overdueMinutes = Math.abs(diffMinutes)
        const hours = Math.floor(overdueMinutes / 60)
        const mins = overdueMinutes % 60
        const label = hours > 0
            ? `Overdue ${hours}h ${mins}m`
            : `Overdue ${mins}m`
        return { level: 'critical', label, minutesRemaining: diffMinutes }
    }

    if (diffMinutes <= 120) {
        // WARNING: within 2 hours
        const hours = Math.floor(diffMinutes / 60)
        const mins = diffMinutes % 60
        const label = hours > 0
            ? `Checkout in ${hours}h ${mins}m`
            : `Checkout in ${mins}m`
        return { level: 'warning', label, minutesRemaining: diffMinutes }
    }

    if (diffMinutes <= 360) {
        // UPCOMING: within 6 hours
        const hours = Math.floor(diffMinutes / 60)
        const mins = diffMinutes % 60
        const label = `Checkout in ${hours}h ${mins}m`
        return { level: 'upcoming', label, minutesRemaining: diffMinutes }
    }

    return { level: 'none', label: '', minutesRemaining: diffMinutes }
}
