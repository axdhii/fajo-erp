---
name: FAJO ERP Architecture Overview
description: Complete architecture map of the FAJO hotel ERP system — database tables, API routes, dashboards, roles, and module relationships
type: project
---

FAJO ERP is a Next.js hotel management system deployed on Vercel with Supabase backend.

**Hotels:** Two properties — FAJO Rooms Kochi (active), FAJO Rooms Aluva (maintenance). Hotels table has id, name, city, status columns.

**Roles:** Admin, FrontDesk, Housekeeping, HR, ZonalManager, ZonalOps, ZonalHK. Staff table has user_id (nullable — null means trackable-only staff for attendance/payroll, non-null means login-capable operator).

**Core Tables:** hotels, staff, units (rooms+dorm beds), bookings, guests, payments, attendance, staff_incidents, payroll, restock_requests, maintenance_tickets, property_expenses, customer_issues, laundry_orders, shift_reports.

**Unit Types:** ROOM (101-108, base price 1600-2500) and DORM (A1-A36, lower beds 400, upper beds 450). Statuses: AVAILABLE, OCCUPIED, DIRTY, IN_PROGRESS, MAINTENANCE.

**Booking Flow:** PENDING -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT (or CANCELLED). Group bookings via group_id for dorm bulk bookings. Payments are 1:1 with bookings. Surcharges for extra guests (rooms only, >2 heads = Rs 300/extra).

**Key architectural decisions:**
- Middleware injects staff context headers (x-staff-id, x-staff-hotel-id, x-staff-role) so server pages avoid re-querying auth
- `getDevNow()` used in server code for time simulation in dev; production uses real time
- `calculateCheckOut()` in lib/conflict.ts handles IST via manual UTC offset (not setHours)
- Aadhar photos: front+back stitched into single image, stored in Supabase `aadhars` bucket under YYYY-MM/ folders
- Booking lifecycle: PENDING -> CONFIRMED -> CHECKED_IN -> CHECKED_OUT (or CANCELLED)
- Group bookings (dorm bulk) linked by group_id, advance stored on first booking only

**Dashboards:** /front-desk (unit grid, check-in/out, extend, restock, issues, expenses), /reservations (timeline), /housekeeping (clean rooms), /hr (attendance, incidents, payroll, shift reports), /zonal-ops (restock, payments, expenses, issues, shift reports), /zonal-hk (maintenance, laundry), /admin (God Mode — 8-tab shell with command center, guest history, live occupancy, staff manager, financials, operations, HR overview, reservations overview + Aadhar archive).

**API Routes:** /api/bookings (check-in), /api/bookings/checkout, /api/bookings/extend, /api/reservations (CRUD), /api/reservations/cancel, /api/reservations/convert, /api/housekeeping, /api/staff, /api/attendance, /api/attendance/clock-out, /api/staff-incidents, /api/payroll, /api/maintenance, /api/restock, /api/laundry, /api/expenses, /api/customer-issues, /api/zonal/overview, /api/admin/staff, /api/admin/aadhar-archive, /api/overrides/force-status, /api/overrides/emergency-vacate, /api/dev/*.

**Known issues from 2026-03-22 full audit (6 bugs):**
1. shift-report.ts revenue ignores advance_amount (MEDIUM)
2. Financials.tsx downloadable report calcRev ignores advance_amount (HIGH)
3. ZonalOps payments tab has N+1 query — 2 extra DB calls per payment row in for-loop (HIGH)
4. html2canvas statically imported in zonal-ops and hr client pages instead of dynamic import (MEDIUM)
5. CheckInSheet checkout preview uses browser local setHours, not IST (MEDIUM)
6. clock-out route uses new Date() instead of getDevNow() (LOW, dev-only)

**Why:** Understanding this architecture is essential for designing cross-module features and debugging data flow between dashboards.

**How to apply:** Reference when building any cross-module feature or when understanding data flow between dashboards. When touching financial reports or shift reports, always verify advance_amount is included. When adding html2canvas to new pages, always use dynamic import.
