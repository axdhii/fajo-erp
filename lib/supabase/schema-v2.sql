-- ============================================================
-- FAJO ROOMS ERP — Schema V2 (Updated)
-- Supports: Rooms (101-108), Dorm Beds (A1-A36),
--           Multi-guest bookings, Dynamic pricing, Split payments,
--           Housekeeping workflow (DIRTY → IN_PROGRESS → AVAILABLE),
--           Pre-booking (PENDING → CONFIRMED → CHECKED_IN),
--           Maintenance mode for rooms
-- ============================================================

-- Drop old tables if migrating
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS guests CASCADE;
DROP TABLE IF EXISTS bookings CASCADE;
DROP TABLE IF EXISTS units CASCADE;

-- Drop old enums
DROP TYPE IF EXISTS unit_type CASCADE;
DROP TYPE IF EXISTS unit_status CASCADE;
DROP TYPE IF EXISTS booking_status CASCADE;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE unit_type AS ENUM ('ROOM', 'DORM');
CREATE TYPE unit_status AS ENUM ('AVAILABLE', 'OCCUPIED', 'DIRTY', 'IN_PROGRESS', 'MAINTENANCE');
CREATE TYPE booking_status AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- ============================================================
-- UNITS TABLE (Rooms + Dorm Beds)
-- ============================================================

CREATE TABLE units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    hotel_id UUID REFERENCES hotels(id) ON DELETE CASCADE,
    unit_number TEXT NOT NULL,
    type unit_type NOT NULL DEFAULT 'ROOM',
    status unit_status NOT NULL DEFAULT 'AVAILABLE',
    base_price NUMERIC(10, 2) NOT NULL DEFAULT 2000.00,
    maintenance_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(hotel_id, unit_number)
);

-- ============================================================
-- BOOKINGS TABLE
-- ============================================================

CREATE TABLE bookings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    unit_id UUID NOT NULL REFERENCES units(id) ON DELETE CASCADE,
    check_in TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    check_out TIMESTAMPTZ,
    guest_count INTEGER NOT NULL DEFAULT 1,
    base_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    surcharge NUMERIC(10, 2) NOT NULL DEFAULT 0,
    grand_total NUMERIC(10, 2) NOT NULL DEFAULT 0,
    status booking_status NOT NULL DEFAULT 'PENDING',
    notes TEXT,
    -- Reservation fields
    expected_arrival TIMESTAMPTZ,
    advance_amount NUMERIC(10, 2) DEFAULT 0,
    advance_type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- GUESTS TABLE (Many-to-one on Booking)
-- ============================================================

CREATE TABLE guests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    aadhar_number TEXT,
    aadhar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- PAYMENTS TABLE (One-to-one on Booking)
-- ============================================================

CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE UNIQUE,
    amount_cash NUMERIC(10, 2) NOT NULL DEFAULT 0,
    amount_digital NUMERIC(10, 2) NOT NULL DEFAULT 0,
    total_paid NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================

CREATE INDEX idx_units_hotel_status ON units(hotel_id, status);
CREATE INDEX idx_units_type ON units(type);
CREATE INDEX idx_bookings_unit ON bookings(unit_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_dates ON bookings(check_in, check_out);
CREATE INDEX idx_guests_booking ON guests(booking_id);
CREATE INDEX idx_payments_booking ON payments(booking_id);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER units_updated_at
    BEFORE UPDATE ON units
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bookings_updated_at
    BEFORE UPDATE ON bookings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated full access on units" ON units FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on bookings" ON bookings FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on guests" ON guests FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated full access on payments" ON payments FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- DORM AUTO-CHECKOUT FUNCTION (called by pg_cron or API)
-- At 10:00 AM IST, all occupied DORM beds with CHECKED_IN bookings
-- transition to DIRTY and bookings become CHECKED_OUT.
-- ============================================================

CREATE OR REPLACE FUNCTION auto_dirty_dorm_checkouts()
RETURNS void AS $$
BEGIN
    -- Mark bookings as checked out
    UPDATE bookings
    SET status = 'CHECKED_OUT',
        check_out = NOW(),
        updated_at = NOW()
    WHERE status = 'CHECKED_IN'
      AND unit_id IN (
          SELECT id FROM units WHERE type = 'DORM'
      )
      AND check_out <= NOW();

    -- Mark those dorm units as dirty
    UPDATE units
    SET status = 'DIRTY',
        updated_at = NOW()
    WHERE type = 'DORM'
      AND status = 'OCCUPIED'
      AND id IN (
          SELECT unit_id FROM bookings
          WHERE status = 'CHECKED_OUT'
            AND check_out >= NOW() - INTERVAL '1 minute'
      );
END;
$$ LANGUAGE plpgsql;

-- To enable with pg_cron (requires Supabase Pro):
-- SELECT cron.schedule('dorm-auto-checkout', '30 4 * * *', 'SELECT auto_dirty_dorm_checkouts()');
-- (4:30 UTC = 10:00 AM IST)

-- ============================================================
-- SEED: Insert rooms 101-108 and dorm beds A1-A36
-- Replace '<YOUR_HOTEL_ID>' with actual hotel UUID
-- ============================================================

-- Example seed (uncomment and replace hotel_id):
-- INSERT INTO units (hotel_id, unit_number, type, base_price) VALUES
--   ('<HOTEL_ID>', '101', 'ROOM', 2000),
--   ('<HOTEL_ID>', '102', 'ROOM', 2000),
--   ('<HOTEL_ID>', '103', 'ROOM', 2000),
--   ('<HOTEL_ID>', '104', 'ROOM', 2000),
--   ('<HOTEL_ID>', '105', 'ROOM', 2000),
--   ('<HOTEL_ID>', '106', 'ROOM', 2500),
--   ('<HOTEL_ID>', '107', 'ROOM', 2500),
--   ('<HOTEL_ID>', '108', 'ROOM', 2500);
--
-- Lower Beds (A1-A13): ₹400
-- INSERT INTO units (hotel_id, unit_number, type, base_price)
-- SELECT '<HOTEL_ID>', 'A' || i, 'DORM', 400
-- FROM generate_series(1, 13) AS i;
--
-- Upper Beds (A14-A36): ₹450
-- INSERT INTO units (hotel_id, unit_number, type, base_price)
-- SELECT '<HOTEL_ID>', 'A' || i, 'DORM', 450
-- FROM generate_series(14, 36) AS i;
