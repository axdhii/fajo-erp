// ============================================================
// Fajo ERP — Pricing Configuration & Calculator
// ============================================================

import type { UnitType } from './types'

// Configurable pricing constants
export const PRICING = {
    ROOM_BASE_PRICE: 2000,
    DORM_LOWER_PRICE: 400,  // A1-A13 (Lower Bed)
    DORM_UPPER_PRICE: 450,  // A14-A36 (Upper Bed)
    EXTRA_HEAD_SURCHARGE: 300,
    EXTRA_HEAD_THRESHOLD: 2, // Surcharge kicks in above this guest count (rooms only)
} as const

export interface PricingBreakdown {
    baseAmount: number
    extraHeads: number
    surcharge: number
    grandTotal: number
}

/**
 * Calculate booking price based on unit type, base price, and guest count.
 *
 * Rules:
 * - ROOM: If guests > max_guests (default 2), add ₹300 per extra head
 * - DORM: No surcharge (1 bed = 1 guest). Lower ₹400, Upper ₹450.
 *
 * @param maxGuests — per-unit guest limit from DB (overrides EXTRA_HEAD_THRESHOLD)
 */
export function calculateBookingPrice(
    unitType: UnitType,
    basePrice: number,
    guestCount: number,
    maxGuests?: number
): PricingBreakdown {
    const baseAmount = basePrice

    let extraHeads = 0
    let surcharge = 0

    const threshold = maxGuests ?? PRICING.EXTRA_HEAD_THRESHOLD
    if (unitType === 'ROOM' && guestCount > threshold) {
        extraHeads = guestCount - threshold
        surcharge = extraHeads * PRICING.EXTRA_HEAD_SURCHARGE
    }

    return {
        baseAmount,
        extraHeads,
        surcharge,
        grandTotal: baseAmount + surcharge,
    }
}
