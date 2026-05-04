// Freshup helpers — duration constant + lock-window utilities.
//
// At Aluva (ROOM mode) the CRE picks a unit when recording a freshup. The
// unit is then "locked" for FRESHUP_DURATION_HOURS hours from the freshup's
// created_at:
//   - The unit grid shows it as OCCUPIED with sublabel "Freshup until HH:MM"
//   - Check-in to that unit is blocked
//   - Another freshup on the same unit is blocked
//
// After the lock window expires the unit auto-clears in the UI (no cron
// needed — the grid query just stops including expired freshups). Housekeeping
// transitions the unit back to AVAILABLE through the existing flow.

export const FRESHUP_DURATION_HOURS = 3
export const FRESHUP_DURATION_MS = FRESHUP_DURATION_HOURS * 60 * 60 * 1000

/** True if the freshup row's lock is still active relative to `at`. */
export function isFreshupActive(
    freshup: { created_at: string },
    at: Date = new Date(),
): boolean {
    return at.getTime() - new Date(freshup.created_at).getTime() < FRESHUP_DURATION_MS
}

/** End time of the lock for a given freshup row. */
export function freshupEndsAt(freshup: { created_at: string }): Date {
    return new Date(new Date(freshup.created_at).getTime() + FRESHUP_DURATION_MS)
}

/** ISO timestamp marking the start of the active-lock window (now − duration). */
export function freshupLockWindowStart(at: Date = new Date()): string {
    return new Date(at.getTime() - FRESHUP_DURATION_MS).toISOString()
}
