// Shift window helpers — compute time bounds for the current hotel day and its
// two operational sub-shifts.
//
// The hotel operational day runs 07:00 IST → 07:00 IST the next morning.
// Inside that day, staff work two 12-hour shifts:
//   - DAY shift   : 07:00 IST → 19:00 IST  (same calendar date)
//   - NIGHT shift : 19:00 IST → 07:00 IST  (next calendar date)
//
// `getCurrentShiftWindow()` returns the full 24-hour bounds (used as
// "today's revenue" — the combined card). `getDayShiftWindow()` and
// `getNightShiftWindow()` return the two halves so the Financials KPI
// can show DAY / NIGHT / TOTAL stacked.
//
// All three helpers anchor to the *operational date* — the calendar date
// the 07:00-anchored window starts on. Calling at 03:00 IST on Apr-27
// returns the operational date Apr-26 (because the night shift is still
// running through early morning of the next calendar day).

export type ShiftLabel = 'DAY' | 'NIGHT' | 'TOTAL'

export interface ShiftWindow {
    /** ISO timestamp (with +05:30 offset) marking the start of the window. */
    start: string
    /** ISO timestamp (with +05:30 offset) marking the end of the window. */
    end: string
    label: ShiftLabel
    /** Human-readable label, e.g. "Today (7 AM – 7 AM)" */
    displayLabel: string
}

const IST_OFFSET_MS = 330 * 60 * 1000 // +05:30
const pad = (n: number) => String(n).padStart(2, '0')
const isoDate = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`

/** The operational date for the current hotel-day window. */
function operationalDate(at: Date = new Date()): { year: number; month: number; date: number } {
    const istWall = new Date(at.getTime() + IST_OFFSET_MS)
    const istHour = istWall.getUTCHours()
    let y = istWall.getUTCFullYear(), m = istWall.getUTCMonth(), d = istWall.getUTCDate()
    if (istHour < 7) {
        const yesterday = new Date(istWall.getTime() - 24 * 60 * 60 * 1000)
        y = yesterday.getUTCFullYear()
        m = yesterday.getUTCMonth()
        d = yesterday.getUTCDate()
    }
    return { year: y, month: m, date: d }
}

/**
 * Returns the current 24-hour hotel-day window bounds in IST.
 * 07:00 IST on the operational date → 07:00 IST the next morning.
 */
export function getCurrentShiftWindow(at: Date = new Date()): ShiftWindow {
    const { year, month, date } = operationalDate(at)
    const startStr = isoDate(year, month, date)
    const startMs = new Date(`${startStr}T07:00:00+05:30`).getTime()
    const endMs = startMs + 24 * 60 * 60 * 1000
    const endIst = new Date(endMs + IST_OFFSET_MS)
    const endStr = isoDate(endIst.getUTCFullYear(), endIst.getUTCMonth(), endIst.getUTCDate())
    return {
        start: `${startStr}T07:00:00+05:30`,
        end: `${endStr}T07:00:00+05:30`,
        label: 'TOTAL',
        displayLabel: 'Today (7 AM – 7 AM next day)',
    }
}

/** DAY shift bounds for the current hotel day: 07:00 IST → 19:00 IST same date. */
export function getDayShiftWindow(at: Date = new Date()): ShiftWindow {
    const { year, month, date } = operationalDate(at)
    const ds = isoDate(year, month, date)
    return {
        start: `${ds}T07:00:00+05:30`,
        end: `${ds}T19:00:00+05:30`,
        label: 'DAY',
        displayLabel: 'Day shift (7 AM – 7 PM)',
    }
}

/** NIGHT shift bounds for the current hotel day: 19:00 IST → 07:00 IST next date. */
export function getNightShiftWindow(at: Date = new Date()): ShiftWindow {
    const { year, month, date } = operationalDate(at)
    const startStr = isoDate(year, month, date)
    const startMs = new Date(`${startStr}T19:00:00+05:30`).getTime()
    const endMs = startMs + 12 * 60 * 60 * 1000
    const endIst = new Date(endMs + IST_OFFSET_MS)
    const endStr = isoDate(endIst.getUTCFullYear(), endIst.getUTCMonth(), endIst.getUTCDate())
    return {
        start: `${startStr}T19:00:00+05:30`,
        end: `${endStr}T07:00:00+05:30`,
        label: 'NIGHT',
        displayLabel: 'Night shift (7 PM – 7 AM)',
    }
}
