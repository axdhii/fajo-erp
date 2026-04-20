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
    max_guests: number
    bed_position?: 'UPPER' | 'LOWER' | null
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
    aadhar_url_front: string | null
    aadhar_url_back: string | null
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
    aadhar_url_front: string
    aadhar_url_back: string
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
// Shift Report Types
// ============================================================

export interface ShiftReport {
    id: string
    staff_id: string
    hotel_id: string
    attendance_id: string
    shift_start: string
    shift_end: string
    total_check_ins: number
    total_check_outs: number
    total_reservations_created: number
    total_guests_handled: number
    check_in_units: { unit_number: string; booking_id: string; guest_names: string }[]
    check_out_units: { unit_number: string; booking_id: string; guest_names: string }[]
    reservations_list: { unit_number: string; booking_id: string; guest_names: string; check_in: string }[]
    restock_requests_count: number
    customer_issues_count: number
    expense_requests_count: number
    revenue_cash: number
    revenue_digital: number
    revenue_total: number
    created_at: string
    staff?: { name: string | null; role: string }
}

// ============================================================
// Laundry Module Types
// ============================================================

// ============================================================
// Freshup Module Types
// ============================================================

export interface FreshupRecord {
    id: string
    hotel_id: string
    guest_name: string
    guest_phone: string
    guest_count: number
    amount: number
    payment_method: 'CASH' | 'DIGITAL'
    aadhar_url: string | null
    aadhar_url_front: string | null
    aadhar_url_back: string | null
    created_by: string | null
    created_at: string
    staff?: { name: string | null }
}

// ============================================================
// Messaging Module Types
// ============================================================

export interface Message {
    id: string
    hotel_id: string
    sender_id: string
    recipient_id: string | null
    body: string
    read: boolean
    created_at: string
    sender?: { name: string | null; role: string | null }
}

// ============================================================
// Staff Notepad Types
// ============================================================

export interface StaffNote {
    id: string
    staff_id: string
    hotel_id: string
    content: string
    updated_at: string
    created_at: string
}

// ============================================================
// Property Reports Types
// ============================================================

export type ReportType = 'REPORT' | 'ISSUE'
export type ReportCategory = 'OBSERVATION' | 'DAMAGE' | 'SAFETY' | 'MAINTENANCE' | 'GUEST_COMPLAINT' | 'OTHER'
export type ReportStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED'

export interface PropertyReport {
    id: string
    hotel_id: string
    reported_by: string
    type: ReportType
    category: ReportCategory
    description: string
    photo_url: string | null
    status: ReportStatus
    reviewed_by: string | null
    review_notes: string | null
    created_at: string
    resolved_at: string | null
    reporter?: { name: string | null; role: string | null }
    reviewer?: { name: string | null }
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

// ============================================================
// Selfie Request Types
// ============================================================

export type SelfieRequestStatus = 'PENDING' | 'COMPLETED' | 'EXPIRED'

export interface SelfieRequest {
    id: string
    hotel_id: string
    requested_by: string
    target_staff_id: string
    reason: string | null
    status: SelfieRequestStatus
    photo_url: string | null
    created_at: string
    completed_at: string | null
    requester?: { name: string | null; role: string | null }
    target?: { name: string | null; role: string | null }
}
