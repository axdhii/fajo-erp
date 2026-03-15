-- ============================================================
-- FAJO ERP — RLS Lockdown Migration
-- Replaces overly-permissive "full access" policies with
-- granular per-operation policies for authenticated role only.
-- ============================================================

BEGIN;

-- ============================================================
-- 1. DROP EXISTING PERMISSIVE POLICIES
-- ============================================================

-- schema-v2.sql policies (units, bookings, guests, payments)
DROP POLICY IF EXISTS "Authenticated full access on units" ON units;
DROP POLICY IF EXISTS "Authenticated full access on bookings" ON bookings;
DROP POLICY IF EXISTS "Authenticated full access on guests" ON guests;
DROP POLICY IF EXISTS "Authenticated full access on payments" ON payments;

-- schema.sql policies (hotels, staff, rooms — from v1)
DROP POLICY IF EXISTS "Allow all authenticated users full access to hotels" ON hotels;
DROP POLICY IF EXISTS "Allow all authenticated users full access to staff" ON staff;
DROP POLICY IF EXISTS "Allow all authenticated users full access to rooms" ON rooms;
DROP POLICY IF EXISTS "Allow all authenticated users full access to bookings" ON bookings;

-- Dashboard-created public-role policies
DROP POLICY IF EXISTS "Allow public access to hotels" ON hotels;
DROP POLICY IF EXISTS "Allow public access to rooms" ON rooms;
DROP POLICY IF EXISTS "Allow public access to staff" ON staff;

-- ============================================================
-- 2. ENABLE RLS ON ALL TABLES (idempotent)
-- ============================================================

ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE units ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- 3. GRANULAR POLICIES — staff (SELECT only)
-- ============================================================

CREATE POLICY "staff_select" ON staff
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 4. GRANULAR POLICIES — hotels (SELECT only)
-- ============================================================

CREATE POLICY "hotels_select" ON hotels
    FOR SELECT TO authenticated USING (true);

-- ============================================================
-- 5. GRANULAR POLICIES — units (SELECT + UPDATE)
-- ============================================================

CREATE POLICY "units_select" ON units
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "units_update" ON units
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 6. GRANULAR POLICIES — bookings (SELECT + INSERT + UPDATE)
-- ============================================================

CREATE POLICY "bookings_select" ON bookings
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "bookings_insert" ON bookings
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "bookings_update" ON bookings
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 7. GRANULAR POLICIES — guests (SELECT + INSERT + UPDATE)
-- ============================================================

CREATE POLICY "guests_select" ON guests
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "guests_insert" ON guests
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "guests_update" ON guests
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 8. GRANULAR POLICIES — payments (SELECT + INSERT + UPDATE)
-- ============================================================

CREATE POLICY "payments_select" ON payments
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "payments_insert" ON payments
    FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "payments_update" ON payments
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

-- ============================================================
-- 9. STORAGE — Make aadhars bucket private
-- ============================================================

UPDATE storage.buckets SET public = false WHERE id = 'aadhars';

-- ============================================================
-- 10. STORAGE POLICIES — aadhars bucket (authenticated only)
-- ============================================================

-- Drop any existing permissive storage policies for aadhars
DROP POLICY IF EXISTS "Allow authenticated uploads to aadhars" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads from aadhars" ON storage.objects;
DROP POLICY IF EXISTS "Allow public reads from aadhars" ON storage.objects;
DROP POLICY IF EXISTS "aadhars_select" ON storage.objects;
DROP POLICY IF EXISTS "aadhars_insert" ON storage.objects;

-- Authenticated users can read from aadhars bucket
CREATE POLICY "aadhars_select" ON storage.objects
    FOR SELECT TO authenticated
    USING (bucket_id = 'aadhars');

-- Authenticated users can upload to aadhars bucket
CREATE POLICY "aadhars_insert" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'aadhars');

COMMIT;
