// ============================================================
// Fajo ERP — Proportional Payment Distribution
// ============================================================
// Splits a combined (cash + digital) payment across multiple
// bookings proportionally to each booking's grand_total.
//
// CRITICAL: the last entry absorbs the rounding remainder so
// the sum of the splits exactly equals the input — there must
// never be a ₹0.01 mismatch between the user-collected amount
// and the sum of the rows we persist.
//
// Extracted from app/api/reservations/convert/route.ts (the
// proportional split block originally introduced for group
// dorm conversions) and shared with the new bulk check-in
// endpoint at /api/bookings/bulk so both code paths use the
// exact same rounding-safe formula.

export interface PaymentSplitInput {
    bookingId: string
    grandTotal: number
}

export interface PaymentSplitResult {
    bookingId: string
    amountCash: number
    amountDigital: number
    totalPaid: number
}

/**
 * Distribute `cashAmount` + `digitalAmount` across `bookings`
 * proportionally to each booking's `grandTotal`.
 *
 * Guarantees:
 *  - sum(result.amountCash)    === round2(cashAmount)
 *  - sum(result.amountDigital) === round2(digitalAmount)
 *  - sum(result.totalPaid)     === round2(cashAmount + digitalAmount)
 *
 * When `combinedGrandTotal === 0` the split falls back to an
 * even per-booking distribution (last bed takes the remainder).
 */
export function distributePayment(
    bookings: PaymentSplitInput[],
    cashAmount: number,
    digitalAmount: number,
): PaymentSplitResult[] {
    if (bookings.length === 0) return []

    const round2 = (n: number) => Math.round(n * 100) / 100

    const totalCash = round2(cashAmount)
    const totalDigital = round2(digitalAmount)
    const totalPaidIn = round2(totalCash + totalDigital)

    const combinedGrandTotal = bookings.reduce((sum, b) => sum + Number(b.grandTotal || 0), 0)

    let runningCash = 0
    let runningDigital = 0
    let runningTotal = 0

    return bookings.map((b, idx) => {
        const isLast = idx === bookings.length - 1

        if (isLast) {
            // Last bed absorbs the rounding remainder so totals match exactly.
            const cash = round2(totalCash - runningCash)
            const digital = round2(totalDigital - runningDigital)
            const total = round2(totalPaidIn - runningTotal)
            return {
                bookingId: b.bookingId,
                amountCash: cash,
                amountDigital: digital,
                totalPaid: total,
            }
        }

        const proportion = combinedGrandTotal > 0
            ? Number(b.grandTotal) / combinedGrandTotal
            : 1 / bookings.length

        const cash = round2(totalCash * proportion)
        const digital = round2(totalDigital * proportion)
        const total = round2(totalPaidIn * proportion)

        runningCash = round2(runningCash + cash)
        runningDigital = round2(runningDigital + digital)
        runningTotal = round2(runningTotal + total)

        return {
            bookingId: b.bookingId,
            amountCash: cash,
            amountDigital: digital,
            totalPaid: total,
        }
    })
}
