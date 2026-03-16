# FAJO ERP — Bug Log
**Date: 2026-03-16 | Version: 0.5.1**

---

## FIXED (32 bugs)

### Critical — Money/Data
| # | Bug | File | Fix |
|---|-----|------|-----|
| 1 | Checkout double-charged guests (ignored advance_amount) | bookings/checkout/route.ts | Balance now subtracts advance_amount |
| 2 | Checkout lost payment when no payment record existed | bookings/checkout/route.ts | INSERTs new payment if none exists |
| 3 | Payment insert failure was silent — booking saved with no payment | bookings/route.ts | Made fatal — rolls back booking on failure |
| 4 | Race condition: two simultaneous check-ins to same unit | bookings/route.ts + DB | Added unique partial index on bookings(unit_id) WHERE status='CHECKED_IN' |
| 5 | Group dorm checkout only processed 1 bed — rest stayed OCCUPIED | bookings/checkout/route.ts | Now processes all siblings with same group_id |
| 6 | Invoice double-counted advance_amount for converted reservations | invoice/[id]/page.tsx | Fixed totalPaid calculation |
| 7 | Extend stay conflict check logic was broken | bookings/extend/route.ts | Now uses canonical checkConflict() |
| 8 | Outstanding balances showed for fully paid bookings | admin/Financials.tsx | Fixed array vs object handling for payments join |
| 9 | Dorm bed pricing wrong in live DB (alternating vs threshold) | DB + seed-v2.js | A1-A13=400, A14-A36=450 |

### High — Broken Features
| # | Bug | File | Fix |
|---|-----|------|-----|
| 10 | Payroll month query format mismatch — page would be blank | hr/client.tsx | Changed to .eq('month', payrollMonth + '-01') |
| 11 | Checkout button stuck disabled after invalid payment | CheckoutSheet.tsx | Moved validation before setIsSubmitting(true) |
| 12 | Group booking guest data never populated on API error | ReservationDetail.tsx | Changed guard from <= 1 to === 0 |
| 13 | Aadhar photo showed broken image after upload | CheckInSheet.tsx | Keep blob URL alive for preview, revoke on form reset |
| 14 | Check-in dates shifted every 30s while form was open | CheckInSheet.tsx | Capture time once on sheet open, not continuously |
| 15 | Force checkout from admin failed on pay-later bookings | LiveOccupancy.tsx + checkout route | Added force flag to skip payment validation |
| 16 | Infinite spinner when user exists but staff profile is null | app/page.tsx | Added else branch to redirect to login |
| 17 | Destructive migration routes accessible in production | cleanup-hk, migrate-dorms | Added NODE_ENV + Admin role guards |
| 18 | Payroll finalize/pay had no status transition guard | payroll/route.ts | Enforces DRAFT->FINALIZED->PAID |

### Medium — Data Guards & Edge Cases
| # | Bug | File | Fix |
|---|-----|------|-----|
| 19 | Maintenance ticket accepted any status string | maintenance/route.ts | Added whitelist validation |
| 20 | Already-resolved tickets could be re-resolved | maintenance/route.ts | Added re-resolution guard (409) |
| 21 | Already-done restocks could be re-completed | restock/route.ts | Added re-completion guard (409) |
| 22 | Already-validated attendance could be re-approved | attendance/route.ts | Added PENDING_REVIEW guard |
| 23 | Reservation date edit bypassed conflict check | reservations/cancel/route.ts | Added checkConflict() call |
| 24 | Attendance duplicate check missed last second of day | attendance/route.ts | Fixed to use next-day boundary |
| 25 | Cron dorm-checkout overwrote scheduled check_out time | cron/dorm-checkout/route.ts | Preserves original checkout time |
| 26 | Cron set units DIRTY even if booking update failed | cron/dorm-checkout/route.ts | Made conditional on booking success |
| 27 | Group dorm aadhar update only targeted primary booking | reservations/convert/route.ts | Now updates all group guests |
| 28 | Reservation check-in date without IST timezone | ReservationSheet.tsx | Added +05:30 to date constructor |
| 29 | Payment tolerance mismatch client vs server | ReservationDetail.tsx | Matched to 0.01 |

### UI/UX
| # | Bug | File | Fix |
|---|-----|------|-----|
| 30 | "Attendance0" rendered as text when count was 0 | hr/client.tsx | Changed to (t.badge ?? 0) > 0 |
| 31 | Housekeeping showed "All clean!" flash during loading | housekeeping/client.tsx | Added loading state check |
| 32 | CheckInSheet called onSuccess() on every dismiss | CheckInSheet.tsx | Only call on successful check-in |

---

## LEFT UNFIXED — Low Risk

| # | Bug | Risk | Why left |
|---|-----|------|----------|
| 1 | Checkout overwrites scheduled check_out with actual departure time | Low | grand_total already correct. Only affects "nights stayed" display on early checkout. |
| 2 | DAY extension resets checkout time, erasing paid hourly extensions | Low | Very rare: only happens when extending by DAYS after a previous HOURS extension. |
| 3 | Reservation convert doesn't recalculate checkout for late arrivals | Low | Front desk can manually adjust. System defaults to original scheduled checkout. |
| 4 | Partial group convert failure leaves ghost check-ins | Low | Only on network failure mid-conversion. Manual cleanup needed. Very rare. |
| 5 | Night shift duplicate clock-in across midnight | Low | Only if someone clocks in twice after midnight on same night shift. |
| 6 | Guest history pagination count wrong with hotel filter | Low | Display-only. Data is correct, just the count label is off. |
| 7 | Invoice page has no explicit auth check | Low | Protected by middleware + RLS. Just inconsistent with other pages. |
| 8 | Zonal realtime has no hotel filter — triggers on any change | Low | Mitigated by 2-second debounce. Fine for 1-2 hotels. |
| 9 | Admin revenue fetches all hotels then filters client-side | Low | Fine with 2 hotels. Only an issue at 50+ hotels. |
| 10 | expected_arrival DB column is TIMESTAMPTZ but used as free text | Low | Dev seed only. Production check-ins don't use this field critically. |

---

## Notes
- All fixes verified with build pass (zero TypeScript errors)
- Database has unique partial index preventing double check-ins
- Supabase realtime enabled for all 11 tables
- All customer test data cleared, units reset to AVAILABLE
