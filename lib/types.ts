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
    group_id: string | null
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
    amountCash?: number
    amountDigital?: number
    numberOfDays?: number
    checkOutOverride?: string | null
    payLater?: boolean
    bypassConflict?: boolean
    isBypass?: boolean
}

export interface CheckOutRequest {
    bookingId: string
}

// Reservation form types
export interface ReservationRequest {
    unitId?: string
    unitIds?: string[]     // For dorm bulk bookings
    checkIn: string        // ISO datetime
    numberOfDays?: number
    guests: GuestInput[]
    expectedArrival?: string
    advanceAmount?: number
    advancePaid?: 'CASH' | 'DIGITAL'
    grandTotalOverride?: number | null
    notes?: string
}

// ============================================================
// HR Module Types
// ============================================================

export type ShiftType = 'DAY' | 'NIGHT'
export type AttendanceStatus = 'CLOCKED_IN' | 'CLOCKED_OUT'
export type IncidentCategory = 'LATE_ARRIVAL' | 'EARLY_DEPARTURE' | 'ABSENCE' | 'UNIFORM_VIOLATION' | 'GROOMING' | 'MISCONDUCT' | 'DAMAGE' | 'OTHER'
export type PayrollStatus = 'DRAFT' | 'FINALIZED' | 'PAID'
export type ValidationStatus = 'PENDING_REVIEW' | 'APPROVED' | 'LATE'

export interface StaffMember {
    id: string
    user_id: string
    hotel_id: string
    role: string
    name: string | null
    phone: string | null
    base_salary: number
}

export interface Attendance {
    id: string
    staff_id: string
    hotel_id: string
    shift: ShiftType
    clock_in: string
    clock_out: string | null
    clock_in_photo: string | null
    status: AttendanceStatus
    validation_status: ValidationStatus
    validated_by: string | null
    validated_at: string | null
    created_at: string
    staff?: StaffMember
}

export interface StaffIncident {
    id: string
    staff_id: string
    hotel_id: string
    category: IncidentCategory
    description: string | null
    penalty_amount: number
    incident_date: string
    recorded_by: string | null
    created_at: string
    staff?: StaffMember
}

export interface Payroll {
    id: string
    staff_id: string
    hotel_id: string
    month: string
    base_salary: number
    total_penalties: number
    total_days_present: number
    total_days_absent: number
    net_salary: number
    status: PayrollStatus
    paid_at: string | null
    notes: string | null
    created_at: string
    staff?: StaffMember
}

// ============================================================
// Operations Manager Module Types
// ============================================================

// Restock
export interface RestockRequest {
    id: string
    unit_id: string
    hotel_id: string
    items: string
    status: 'PENDING' | 'DONE'
    requested_by: string | null
    completed_by: string | null
    created_at: string
    completed_at: string | null
    unit?: { unit_number: string }
    staff?: { name: string | null }
}

// Property Expenses
export interface PropertyExpense {
    id: string
    hotel_id: string
    description: string
    amount: number
    category: string | null
    status: 'PENDING' | 'APPROVED' | 'REJECTED'
    requested_by: string | null
    reviewed_by: string | null
    reviewed_at: string | null
    rejection_reason: string | null
    created_at: string
    requester?: { name: string | null }
    reviewer?: { name: string | null }
}

// Customer Issues
export interface CustomerIssue {
    id: string
    hotel_id: string
    unit_id: string | null
    description: string
    guest_name: string | null
    guest_phone: string | null
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
    reported_by: string | null
    resolved_by: string | null
    resolution_notes: string | null
    created_at: string
    resolved_at: string | null
    unit?: { unit_number: string }
    reporter?: { name: string | null }
    resolver?: { name: string | null }
}

// Maintenance
export interface MaintenanceTicket {
    id: string
    unit_id: string | null
    hotel_id: string
    description: string
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'
    status: 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
    reported_by: string | null
    resolved_by: string | null
    resolution_notes: string | null
    created_at: string
    resolved_at: string | null
    unit?: { unit_number: string }
    staff?: { name: string | null }
}

// ============================================================
// Laundry Module Types
// ============================================================

export type LaundryStatus = 'OUT' | 'RETURNED' | 'PAID'

export interface LaundryOrder {
    id: string
    hotel_id: string
    items_description: string
    item_count: number | null
    sent_at: string
    returned_at: string | null
    amount: number | null
    status: LaundryStatus
    notes: string | null
    created_by: string | null
    created_at: string
    staff?: { name: string | null }
}
