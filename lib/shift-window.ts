// Shift window helper — computes the start and end of the *current* hotel
// operational day, which runs 07:00 IST → 07:00 IST the next morning.
//
// "Today's revenue" therefore means "revenue collected from 7 AM this morning
// through 7 AM tomorrow morning". A staff working a night shift past midnight
// continues to see today's revenue accumulating until 7 AM, when the new
// hotel-day starts.
//
// Rationale: midnight-to-midnight filters cause rollover confusion for night
// shift — their collected revenue "resets" at midnight even though guests
// are still arriving. Anchoring the window to 7 AM matches the operational
// shift handover.

export type ShiftLabel = 'DAY'

export interface ShiftWindow {
    /** ISO timestamp (with +05:30 offset) marking the start of the current 24-hour hotel day. */
    start: string
    /** ISO timestamp (with +05:30 offset) marking the end of the current 24-hour hotel day. */
    end: string
    /** Always 'DAY' — kept for backward compat with consumers still expecting a label field. */
    label: ShiftLabel
    /** Human-readable label, e.g. "Today (7 AM – 7 AM)" */
    displayLabel: string
}

/**
 * Returns the current 24-hour hotel-day window bounds in IST. Window starts
 * at 07:00 IST on the *operational* date and ends at 07:00 IST the next morning.
 *
 * Uses a fixed +05:30 offset (IST has no DST), so the output is correct
 * regardless of the server's local timezone (important: Vercel runs UTC).
 *
 * Examples:
 *   At 10:00 IST on 26-Apr → window is 26-Apr 07:00 → 27-Apr 07:00
 *   At 23:30 IST on 26-Apr → window is 26-Apr 07:00 → 27-Apr 07:00
 *   At 03:00 IST on 27-Apr → window is 26-Apr 07:00 → 27-Apr 07:00
 *   At 07:00 IST on 27-Apr → window is 27-Apr 07:00 → 28-Apr 07:00
 *
 * @param at Optional reference time; defaults to now. Useful for testing.
 */
export function getCurrentShiftWindow(at: Date = new Date()): ShiftWindow {
    const IST_OFFSET_MS = 330 * 60 * 1000 // +05:30
    const istWall = new Date(at.getTime() + IST_OFFSET_MS)
    const istHour = istWall.getUTCHours()
    const istYear = istWall.getUTCFullYear()
    const istMonth = istWall.getUTCMonth() // 0-indexed
    const istDate = istWall.getUTCDate()

    const pad = (n: number) => String(n).padStart(2, '0')
    const isoDate = (y: number, m: number, d: number) =>
        `${y}-${pad(m + 1)}-${pad(d)}`

    // The "operational date" is today's calendar date if it's already past
    // 07:00 IST, otherwise yesterday's calendar date (because the night-shift
    // staff is still working through the early hours of the previous day).
    let opYear = istYear, opMonth = istMonth, opDate = istDate
    if (istHour < 7) {
        const yesterday = new Date(istWall.getTime() - 24 * 60 * 60 * 1000)
        opYear = yesterday.getUTCFullYear()
        opMonth = yesterday.getUTCMonth()
        opDate = yesterday.getUTCDate()
    }

    const startStr = isoDate(opYear, opMonth, opDate)
    // End = start + 24h
    const startMs = new Date(`${startStr}T07:00:00+05:30`).getTime()
    const endMs = startMs + 24 * 60 * 60 * 1000
    const endIst = new Date(endMs + IST_OFFSET_MS)
    const endStr = isoDate(endIst.getUTCFullYear(), endIst.getUTCMonth(), endIst.getUTCDate())

    return {
        start: `${startStr}T07:00:00+05:30`,
        end: `${endStr}T07:00:00+05:30`,
        label: 'DAY',
        displayLabel: "Today (7 AM – 7 AM next day)",
    }
}
