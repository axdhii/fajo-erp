// ============================================================
// Fajo ERP — Dev Time Simulation
// Only active in development. In production, always returns real time.
// ============================================================

// In-memory simulated time (server-side only)
let simulatedTime: Date | null = null

/**
 * Get the current "now" — returns simulated time in dev, real time in prod.
 * Use this EVERYWHERE instead of `new Date()` in server-side code.
 */
export function getDevNow(): Date {
    if (process.env.NODE_ENV !== 'development') {
        return new Date()
    }
    return simulatedTime ? new Date(simulatedTime.getTime()) : new Date()
}

/**
 * Set the simulated time. Pass null to reset to real time.
 */
export function setDevTime(time: Date | null): void {
    if (process.env.NODE_ENV !== 'development') return
    simulatedTime = time ? new Date(time.getTime()) : null
}

/**
 * Get the current simulated time value (or null if using real time).
 */
export function getDevTimeValue(): Date | null {
    if (process.env.NODE_ENV !== 'development') return null
    return simulatedTime ? new Date(simulatedTime.getTime()) : null
}

/**
 * Advance simulated time by a given number of milliseconds.
 * If no simulated time is set, starts from real time.
 */
export function advanceDevTime(ms: number): Date {
    if (process.env.NODE_ENV !== 'development') return new Date()
    const current = simulatedTime || new Date()
    simulatedTime = new Date(current.getTime() + ms)
    return new Date(simulatedTime.getTime())
}

/**
 * Check if time simulation is active.
 */
export function isDevTimeActive(): boolean {
    return process.env.NODE_ENV === 'development' && simulatedTime !== null
}
