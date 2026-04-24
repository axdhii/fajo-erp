// Shift window helper — computes the start and end of the *current* operational
// shift window (not the calendar day).
//
// FAJO hotels run two 12-hour shifts:
//   - DAY   shift: 07:00 IST → 19:00 IST
//   - NIGHT shift: 19:00 IST → 07:00 IST (next day)
//
// This matches the attendance-safety cron which rotates shifts at 7:15 AM and
// 7:15 PM IST. "Today's revenue" therefore means "revenue collected during the
// shift currently on duty", not "revenue since midnight".
//
// Rationale: midnight-to-midnight filters cause rollover confusion for staff
// working a night shift — their collected revenue "resets" at midnight even
// though they're still on duty. Shift-windowed revenue tracks the on-duty
// team's actual performance.

export type ShiftLabel = 'DAY' | 'NIGHT'

export interface ShiftWindow {
    /** ISO timestamp (with +05:30 offset) marking the start of the current shift. */
    start: string
    /** ISO timestamp (with +05:30 offset) marking the end of the current shift. */
    end: string
    /** DAY = 07:00-19:00 IST, NIGHT = 19:00-07:00 IST */
    label: ShiftLabel
    /** Human-readable label, e.g. "Day shift (7 AM - 7 PM)" */
    displayLabel: string
}

/**
 * Returns the current shift window bounds in IST.
 *
 * Uses a fixed +05:30 offset (IST has no DST), so the output is correct
 * regardless of the server's local timezone (important: Vercel runs UTC).
 *
 * @param at Optional reference time; defaults to now. Useful for testing.
 */
export function getCurrentShiftWindow(at: Date = new Date()): ShiftWindow {
    // Compute the IST wall-clock time as a separate Date object so we can
    // safely call .getUTCHours/.getUTCDate on it to read IST components.
    const IST_OFFSET_MS = 330 * 60 * 1000 // +05:30
    const istWall = new Date(at.getTime() + IST_OFFSET_MS)
    const istHour = istWall.getUTCHours()
    const istYear = istWall.getUTCFullYear()
    const istMonth = istWall.getUTCMonth() // 0-indexed
    const istDate = istWall.getUTCDate()

    const pad = (n: number) => String(n).padStart(2, '0')
    const isoDate = (y: number, m: number, d: number) =>
        `${y}-${pad(m + 1)}-${pad(d)}`

    if (istHour >= 7 && istHour < 19) {
        // DAY shift — today 07:00 IST through today 19:00 IST
        const today = isoDate(istYear, istMonth, istDate)
        return {
            start: `${today}T07:00:00+05:30`,
            end: `${today}T19:00:00+05:30`,
            label: 'DAY',
            displayLabel: 'Day shift (7 AM - 7 PM)',
        }
    }

    // NIGHT shift — 19:00 IST yesterday/today through 07:00 IST today/tomorrow
    if (istHour >= 19) {
        // Evening: start = today 19:00, end = tomorrow 07:00
        const today = isoDate(istYear, istMonth, istDate)
        const tomorrow = new Date(istWall.getTime() + 24 * 60 * 60 * 1000)
        const tomorrowStr = isoDate(
            tomorrow.getUTCFullYear(),
            tomorrow.getUTCMonth(),
            tomorrow.getUTCDate(),
        )
        return {
            start: `${today}T19:00:00+05:30`,
            end: `${tomorrowStr}T07:00:00+05:30`,
            label: 'NIGHT',
            displayLabel: 'Night shift (7 PM - 7 AM)',
        }
    }

    // Early morning (00:00-06:59 IST): start = yesterday 19:00, end = today 07:00
    const yesterday = new Date(istWall.getTime() - 24 * 60 * 60 * 1000)
    const yesterdayStr = isoDate(
        yesterday.getUTCFullYear(),
        yesterday.getUTCMonth(),
        yesterday.getUTCDate(),
    )
    const today = isoDate(istYear, istMonth, istDate)
    return {
        start: `${yesterdayStr}T19:00:00+05:30`,
        end: `${today}T07:00:00+05:30`,
        label: 'NIGHT',
        displayLabel: 'Night shift (7 PM - 7 AM)',
    }
}
