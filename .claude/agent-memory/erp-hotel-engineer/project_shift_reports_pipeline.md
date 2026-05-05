---
name: Shift reports generation pipeline
description: How shift_reports rows are produced, where they come from, and how to recover from a silent INSERT failure.
type: project
---

`shift_reports` rows are produced by `lib/shift-report.ts:generateShiftReport()`. The function is called from three places:

1. `app/api/attendance/clock-out/route.ts` — when FrontDesk/HR staff clock out interactively.
2. `app/api/cron/attendance-safety/route.ts` — safety net that runs at 7:15 AM and 7:15 PM IST to close any CLOCKED_IN records and generate their reports.
3. `app/api/dev/backfill-shift-reports/route.ts` — Developer-only one-shot backfill that finds missing reports and produces them. Idempotent via a unique constraint on `attendance_id` (error code 23505 handled as "already exists, return it").

**Silent failure mode to watch for:** if the `shift_reports` table is missing a column that `generateShiftReport()` writes, every INSERT fails with Postgres 42703 and the user only sees a generic "Shift report could not be saved" toast. Always verify the live schema matches the columns in `lib/shift-report.ts:147-188` before shipping changes to that helper.

**Why:** On 2026-04-24 a commit added `advance_*`, `extras_*`, `freshup_*` columns to the insert payload without running the corresponding migration. 7 FrontDesk shifts went unreported until the `add_shift_report_breakdown_columns` migration was applied and the backfill route recovered the stuck rows.

**How to apply:**
- When changing `generateShiftReport()`, run `SELECT column_name FROM information_schema.columns WHERE table_name = 'shift_reports'` (or use `mcp__plugin_supabase_supabase__list_tables` with `verbose: true`) to verify every field in the insert object exists as a column.
- When shift reports appear "broken", check Vercel logs for `Shift report insert error` — the handler now logs `code`, `message`, `details`, `hint` (see `app/api/attendance/clock-out/route.ts`).
- `shift_reports` has a 7-day retention cron at `app/api/cron/shift-reports-cleanup/route.ts`, so the table stays small.
