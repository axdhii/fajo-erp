---
name: manual_revenue_entries table not applied to prod
description: Code references the table heavily but the migration in db/manual_revenue_entries.sql was never applied to Supabase — silent zeros in Financials and likely broken POST endpoint
type: project
---

The `manual_revenue_entries` table referenced throughout the codebase (Financials.tsx revenue cards, report download, `/api/manual-revenue` POST endpoint) does **not** exist in the live Supabase database (project `pxpkwnyylynhqkbnpstc`).

The migration file lives at `db/manual_revenue_entries.sql` and was authored alongside commits `52216bb` (feat: manual revenue entry) and `6396893` (fix: manual revenue — close 2 verification bugs), but no entry was ever inserted into `supabase_migrations.schema_migrations` for it.

**Why:** The repo holds idempotent SQL files under `db/*.sql` that have to be applied manually via Supabase Dashboard SQL Editor (or `mcp__plugin_supabase_supabase__apply_migration`). On 2026-05-04 this one was not applied, so every Supabase JS query against the table returns `{ data: null, error: <relation "manual_revenue_entries" does not exist> }`. Because `Financials.tsx` swallows the error with `data || []`, manual revenue silently sums to ₹0 in every KPI and report — and any POSTs to the manual-entry route presumably 500.

**How to apply:**
- If users complain about missing register-reconciliation money in Financials, check whether this migration is still unapplied.
- When seeing similar "code references a table the DB doesn't have" patterns, search `db/*.sql` first — the codebase uses idempotent script files rather than the Supabase migrations folder.
- Generally: when a Supabase fetch could fail, do `if (error) toast.error(...)` instead of `data || []`. The current Financials pattern hides DB errors.
