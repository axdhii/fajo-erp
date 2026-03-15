---
name: FAJO ERP Architecture Overview
description: Complete architecture map of the FAJO hotel ERP system — database tables, API routes, dashboards, roles, and module relationships
type: project
---

FAJO ERP is a Next.js hotel management system deployed on Vercel with Supabase backend.

**Hotels:** Two properties — FAJO Rooms Kochi (active), FAJO Rooms Aluva (maintenance). Hotels table has id, name, city, status columns.

**Roles:** Admin, FrontDesk, Housekeeping, HR, ZonalManager, OpsManager. Staff table has user_id (nullable — null means trackable-only staff for attendance/payroll, non-null means login-capable operator).

**Core Tables:** hotels, staff, units (rooms+dorm beds), bookings, guests, payments, attendance, staff_incidents, payroll, restock_requests, maintenance_tickets.

**Unit Types:** ROOM (101-108, base price 1600-2500) and DORM (A1-A36, lower beds 400, upper beds 450). Statuses: AVAILABLE, OCCUPIED, DIRTY, IN_PROGRESS, MAINTENANCE.

**Booking Flow:** PENDING -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT (or CANCELLED). Group bookings via group_id for dorm bulk bookings. Payments are 1:1 with bookings. Surcharges for extra guests (rooms only).

**Dashboards:** /front-desk (unit grid, check-in/out, extend, attendance), /reservations (timeline), /housekeeping (clean rooms), /hr (attendance, incidents, payroll), /ops (restock, maintenance), /zonal (multi-property overview), /admin (God Mode — 8-tab shell with command center, guest history, live occupancy, staff manager, financials, operations, HR overview, reservations overview).

**Admin God Mode Architecture (built 2026-03-16):**
- Shell: `app/(dashboard)/admin/client.tsx` — exports `AdminClient` component and `AdminTabProps` interface. Hotel selector (all/specific), 8 tabs with slate-900 accent.
- Props flow: `page.tsx` passes `hotelId` + `staffId` from server auth -> `AdminClient` -> each tab gets `AdminTabProps { hotelId: string | null, hotels, staffId }`.
- Tab components in `components/admin/`: CommandCenter, GuestHistory, LiveOccupancy, StaffManager, Financials, OpsOverview, HROverview, ReservationsOverview.
- CommandCenter: KPI cards (occupancy/revenue/staff/alerts), alert feed (overdue checkouts + urgent tickets + pending restocks), hotel cards grid. Realtime subscriptions on units/bookings/attendance debounced 2s.
- All tab components import `AdminTabProps` from `@/app/(dashboard)/admin/client`.

**API Routes:** /api/bookings (check-in), /api/bookings/checkout, /api/bookings/extend, /api/reservations (CRUD), /api/reservations/cancel, /api/reservations/convert, /api/housekeeping, /api/staff, /api/attendance, /api/attendance/clock-out, /api/staff-incidents, /api/payroll, /api/maintenance, /api/restock, /api/zonal/overview, /api/admin/staff, /api/overrides/force-status, /api/overrides/emergency-vacate, /api/dev/*.

**Why:** Understanding this architecture is essential for designing cross-module features and the Admin God Mode dashboard that surfaces all modules.

**How to apply:** Reference when building any cross-module feature or when understanding data flow between dashboards.
