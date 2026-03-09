// ============================================================
// Fajo ERP — Shared TypeScript Types
// ============================================================

export type UnitType = 'ROOM' | 'DORM'
export type UnitStatus = 'AVAILABLE' | 'OCCUPIED' | 'DIRTY' | 'IN_PROGRESS' | 'MAINTENANCE'
export type BookingStatus = 'PENDING' | 'CONFIRMED' | 'CHECKED_IN' | 'CHECKED_OUT' | 'CANCELLED'

export interface Unit {
    id: string
    hotel_id: string
    unit_number: string
    type: UnitType
    status: UnitStatus
    base_price: number
    maintenance_reason: string | null
    created_at: string
    updated_at: string
}

export interface Booking {
    id: string
    unit_id: string
    check_in: string
    check_out: string | null
    guest_count: number
    base_amount: number
    surcharge: number
    grand_total: number
    status: BookingStatus
    notes: string | null
    // Reservation fields
    expected_arrival: string | null
    advance_amount: number
    advance_type: 'CASH' | 'DIGITAL' | null
    created_at: string
    updated_at: string
    // Joined data
    guests?: Guest[]
    payments?: Payment[]
    unit?: Unit
}

export interface Guest {
    id: string
    booking_id: string
    name: string
    phone: string
    aadhar_number: string | null
    aadhar_url: string | null
    created_at: string
}

export interface Payment {
    id: string
    booking_id: string
    amount_cash: number
    amount_digital: number
    total_paid: number
    created_at: string
}

// Form types for check-in
export interface GuestInput {
    name: string
    phone: string
    aadhar_number: string
    aadhar_url: string
}

export interface CheckInRequest {
    unitId: string
    guests: GuestInput[]
    grandTotalOverride?: number | null
}

export interface CheckOutRequest {
    bookingId: string
}

// Reservation form types
export interface ReservationRequest {
    unitId: string
    checkIn: string        // ISO datetime
    checkOut: string       // ISO datetime
    guests: GuestInput[]
    expectedArrival?: string
    advanceAmount?: number
    advancePaid?: 'CASH' | 'DIGITAL'
    grandTotalOverride?: number | null
    notes?: string
}
