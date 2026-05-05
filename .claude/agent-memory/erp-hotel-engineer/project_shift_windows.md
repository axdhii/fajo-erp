---
name: Shift window semantics
description: As of 2026-04-26 commit 96423a8, "Today's Revenue" KPIs use a single 24-hour hotel-day window (07:00 IST -> 07:00 IST next day). Replaces the prior 12-hour DAY/NIGHT split. Card label is now stale.
type: project
---

FAJO hotels operate on a 12-hour shift rotation:
- **DAY shift**: 07:00 IST -> 19:00 IST
- **NIGHT shift**: 19:00 IST -> 07:00 IST (next day)

The attendance-safety cron rotates shifts at 7:15 AM and 7:15 PM IST (cron schedule `45 1 * * *` and `45 13 * * *` in UTC).

**Revenue display window (since 2026-04-26 commit `96423a8`):** `lib/shift-window.ts:getCurrentShiftWindow()` now returns a **single 24-hour hotel-day** window (07:00 IST -> 07:00 IST next day), with `displayLabel: "Today (7 AM – 7 AM next day)"`. Used by `components/admin/Financials.tsx`, `components/admin/CommandCenter.tsx`, `app/api/zonal/overview/route.ts`. The DAY/NIGHT split for revenue display is gone.

**Known stale UI labels (as of 2026-05-04):** Both `Financials.tsx:717` and `CommandCenter.tsx:416` still title their KPI card "Current Shift Revenue" while now showing the 24h total. The owner read this as "shift = 7-7-7 single window has wrong number" — actually a labelling mismatch + missing per-shift breakdown, not bad math. DAY + NIGHT == 24H total exactly when checked across 7 days x 2 hotels (verified 2026-05-04, every diff ₹0.00).

**Boundary inclusivity bug (latent):** Helper-bound consumers use `.gte(start).lte(end)` (both inclusive). A payment exactly at 07:00:00.000 IST would land in two windows. Currently zero such payments exist; fix is `.lt(end)` (exclusive upper bound).

**Why:** Night-shift staff used to see revenue "reset" at midnight on the prior 12-hour split. The 12-hour split was introduced 2026-04-24 in commit `1d43f9b`, then collapsed to a 24-hour single window on 2026-04-26 in commit `96423a8` after the user reframed the requirement as "today = 7 to 7 to 7" (single hotel-day). Owner now wants both: a single 24h total *and* per-shift visibility — so per-shift will need to come back as a secondary breakdown rather than as the primary card semantic.

**How to apply:**
- For Admin/Zonal KPI cards labeled "Today's Revenue", `getCurrentShiftWindow()` returns `{ start, end, label, displayLabel }` — `label` is always `'DAY'` (kept for backward compat). Window is 24h, not 12h.
- For user-selectable date ranges, calendar date pickers, HR date filters, payroll months, ledger exports — keep calendar-day semantics.
- CRE (FrontDesk) dashboard's own session-counter is scoped to `attendance.clock_in`, separate concern.
- `shift_reports` are still per-CRE-shift (clock_in -> clock_out); they can under-account for revenue when a hotel-day has no CRE clocked in for part of the window. Verified gap: 2026-05-03 Aluva had ₹9,800 of payments not reflected in any shift_report.
- Cron that rotates shifts at 07:15/19:15 IST lives at `app/api/cron/attendance-safety/route.ts` — unchanged by the revenue-window refactor.
