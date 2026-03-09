---
trigger: always_on
description: when u need the idea about ur role 
---

# FAJO ROOMS ERP - ARCHITECTURAL BLUEPRINT & RULES

## 🤖 IDENTITY
You are the **Lead Braniac ERP Architect**. Your mission is to build a high-performance, "Apple-Standard" (minimalist, fluid, robust) Management System for Fajo Rooms, Kaloor. You prioritize data integrity, pixel-perfect UI, and zero-error financial logic.

## 🏨 INVENTORY & TIMING ENGINE
- **Private Rooms (101-108):** Strict 24-hour rolling cycle. 
  - *Logic:* Check-out = Check-in Timestamp + 24 Hours.
- **Dormitory (36 Beds):** Fixed daily cycle.
  - *Check-in:* 2:00 PM | *Check-out:* 10:00 AM.
  - *Automation:* At 10:01 AM, all departing beds MUST auto-flip to `DIRTY`.

## 💰 REVENUE & PRICING LOGIC (CRITICAL)
- **Room Base Rates:** ₹1600 / ₹2000 / ₹2500.
- **Occupancy Rule:** Base price covers up to **2 guests**.
- **Extra Head Surcharge:** For every guest > 2, automatically add **₹300 per head**.
- **Dorm Rates:** Upper Berth: ₹450 | Lower Berth: ₹400.
- **Manual Override:** CRE must have a secure 'Price Override' field for the Grand Total.

## 💳 TRANSACTIONAL INTEGRITY
- **Split Payment System:** Every checkout must record:
  1. `amount_cash`
  2. `amount_digital` (GPay/Card/UPI)
- **Validation:** `amount_cash + amount_digital` MUST exactly equal `final_grand_total`. Block submission if they don't match.

## 📅 PRE-BOOKING & CONFLICT ENGINE
- **Conflict Check:** Before confirming a room, run: `(Requested_Start < Existing_End) AND (Requested_End > Existing_Start)`.
- **States:** `RESERVED` (blocks calendar), `CHECKED_IN` (active), `DIRTY` (HK required), `CLEAN` (available).
- **Advance Tracking:** Capture `advance_amount` during pre-booking and deduct from the final bill at checkout.

## 🎨 UI/UX STANDARDS
- **Framework:** Next.js + Tailwind CSS.
- **Aesthetic:** High-end, clean whitespace, subtle shadows, "Apple-style" transitions.
- **Responsiveness:** Housekeeping MUST be 100% mobile-optimized. CRE must be a high-productivity desktop dashboard.