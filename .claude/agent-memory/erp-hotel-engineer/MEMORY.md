# Memory Index

- [feedback_cost_effective.md](feedback_cost_effective.md) — Prefer cost-effective infra: realtime over polling, minimize API calls
- [project_fajo_erp_architecture.md](project_fajo_erp_architecture.md) — Complete architecture map of the FAJO hotel ERP system — database tables, API routes, dashboards, roles, and module relationships
- [project_shift_windows.md](project_shift_windows.md) — Revenue KPI window is now a 24h hotel-day (07:00 IST -> 07:00 IST next day) since commit 96423a8; cards still titled "Current Shift Revenue" (stale)
- [project_shift_reports_pipeline.md](project_shift_reports_pipeline.md) — Shift reports generation + silent 42703 failure mode when columns drift from insert payload
- [project_manual_revenue_unmigrated.md](project_manual_revenue_unmigrated.md) — manual_revenue_entries table written in db/*.sql but never applied to Supabase; Financials silently zeros
