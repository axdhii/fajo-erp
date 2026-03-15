-- ============================================================
-- FAJO ROOMS ERP — HR Module Schema
-- Attendance, Incidents, Payroll
-- ============================================================

-- 1. Add HR to staff_role enum (safe: no-op if already exists)
DO $$ BEGIN
    ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'HR';
EXCEPTION WHEN others THEN NULL;
END $$;

-- 2. Add columns to staff table
ALTER TABLE staff ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE staff ADD COLUMN IF NOT EXISTS base_salary NUMERIC(10,2) DEFAULT 0;

-- 3. New enums
DO $$ BEGIN CREATE TYPE shift_type AS ENUM ('DAY','NIGHT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE attendance_status AS ENUM ('CLOCKED_IN','CLOCKED_OUT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE incident_category AS ENUM ('LATE_ARRIVAL','EARLY_DEPARTURE','ABSENCE','UNIFORM_VIOLATION','GROOMING','MISCONDUCT','DAMAGE','OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE payroll_status AS ENUM ('DRAFT','FINALIZED','PAID'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 4. Attendance table
CREATE TABLE IF NOT EXISTS attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    shift shift_type NOT NULL,
    clock_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    clock_out TIMESTAMPTZ,
    clock_in_photo TEXT,
    status attendance_status NOT NULL DEFAULT 'CLOCKED_IN',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique: one record per staff per day per shift
CREATE UNIQUE INDEX IF NOT EXISTS idx_attendance_unique
    ON attendance (staff_id, ((clock_in AT TIME ZONE 'Asia/Kolkata')::date), shift);

CREATE INDEX IF NOT EXISTS idx_attendance_hotel ON attendance(hotel_id);
CREATE INDEX IF NOT EXISTS idx_attendance_staff ON attendance(staff_id);
CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance(status);

-- 5. Staff incidents table
CREATE TABLE IF NOT EXISTS staff_incidents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    category incident_category NOT NULL DEFAULT 'OTHER',
    description TEXT,
    penalty_amount NUMERIC(10,2) DEFAULT 0,
    incident_date DATE NOT NULL DEFAULT CURRENT_DATE,
    recorded_by UUID REFERENCES staff(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_incidents_staff ON staff_incidents(staff_id);
CREATE INDEX IF NOT EXISTS idx_incidents_hotel ON staff_incidents(hotel_id);
CREATE INDEX IF NOT EXISTS idx_incidents_date ON staff_incidents(incident_date);

-- 6. Payroll table
CREATE TABLE IF NOT EXISTS payroll (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    staff_id UUID NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
    hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
    month DATE NOT NULL,
    base_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_penalties NUMERIC(10,2) NOT NULL DEFAULT 0,
    total_days_present INTEGER NOT NULL DEFAULT 0,
    total_days_absent INTEGER NOT NULL DEFAULT 0,
    net_salary NUMERIC(10,2) NOT NULL DEFAULT 0,
    status payroll_status NOT NULL DEFAULT 'DRAFT',
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_unique ON payroll(staff_id, month);
CREATE INDEX IF NOT EXISTS idx_payroll_hotel ON payroll(hotel_id);
CREATE INDEX IF NOT EXISTS idx_payroll_month ON payroll(month);

-- 7. Attendance validation
DO $$ BEGIN CREATE TYPE validation_status AS ENUM ('PENDING_REVIEW','APPROVED','LATE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS validation_status validation_status NOT NULL DEFAULT 'PENDING_REVIEW';
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS validated_by UUID REFERENCES staff(id);
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_attendance_validation ON attendance(validation_status);

-- 8. RLS
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll ENABLE ROW LEVEL SECURITY;

-- Attendance RLS
CREATE POLICY "attendance_select" ON attendance FOR SELECT TO authenticated USING (true);
CREATE POLICY "attendance_insert" ON attendance FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "attendance_update" ON attendance FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Staff incidents RLS
CREATE POLICY "incidents_select" ON staff_incidents FOR SELECT TO authenticated USING (true);
CREATE POLICY "incidents_insert" ON staff_incidents FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "incidents_update" ON staff_incidents FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- Payroll RLS
CREATE POLICY "payroll_select" ON payroll FOR SELECT TO authenticated USING (true);
CREATE POLICY "payroll_insert" ON payroll FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "payroll_update" ON payroll FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
