-- ============================================================
-- Fajo ERP — Bulk Dorm Check-In (Atomic Postgres Function)
-- ============================================================
--
-- Performs an atomic bulk dorm check-in: inserts bookings,
-- guests, and payments and flips unit statuses to OCCUPIED in
-- a single transaction. If ANY step fails, Postgres rolls back
-- the entire operation — no half-checked-in groups.
--
-- The function leans on existing DB invariants:
--   * idx_one_checkin_per_unit (UNIQUE partial index) — prevents
--     a second CHECKED_IN booking for the same unit and surfaces
--     simultaneous CRE check-ins as 23505 / 'unit_conflict'.
--   * payments_booking_id_key (UNIQUE) — one payment per booking.
--
-- Input payload (JSONB):
-- {
--   "hotel_id":        "<uuid>",
--   "staff_id":        "<uuid>",          -- staff.id (nullable)
--   "check_in":        "<iso timestamp>", -- shared check-in
--   "check_out":       "<iso timestamp>", -- shared check-out
--   "pay_later":       false,
--   "beds": [
--     {
--       "unit_id":      "<uuid>",
--       "grand_total":  450,
--       "guest_name":   "Rahul",
--       "guest_phone":  "9876543210",
--       "aadhar_number":      null,
--       "aadhar_url_front":   "...",
--       "aadhar_url_back":    "...",
--       "amount_cash":        300,
--       "amount_digital":     150,
--       "total_paid":         450,
--       "notes":              null      -- e.g. '[BYPASS by Alice at ...]: reason'
--     },
--     ...
--   ]
-- }
--
-- Returns JSONB:
-- {
--   "success": true,
--   "group_id": "<uuid>",
--   "booking_ids": ["<uuid>", ...],
--   "total_paid": 6750
-- }
--
-- On failure raises an exception with SQLSTATE so the API can
-- map it back to a clean HTTP error response. Specifically:
--   23505 (unique_violation) → another CRE just checked someone
--                              into one of the selected beds.
-- ============================================================

CREATE OR REPLACE FUNCTION public.fn_bulk_dorm_checkin(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hotel_id    UUID := (payload->>'hotel_id')::UUID;
    v_staff_id    UUID := NULLIF(payload->>'staff_id', '')::UUID;
    v_check_in    TIMESTAMPTZ := (payload->>'check_in')::TIMESTAMPTZ;
    v_check_out   TIMESTAMPTZ := (payload->>'check_out')::TIMESTAMPTZ;
    v_pay_later   BOOLEAN := COALESCE((payload->>'pay_later')::BOOLEAN, false);
    v_group_id    UUID := gen_random_uuid();
    v_beds        JSONB := payload->'beds';
    v_bed         JSONB;
    v_unit_row    public.units%ROWTYPE;
    v_booking_id  UUID;
    v_booking_ids UUID[] := ARRAY[]::UUID[];
    v_unit_ids    UUID[] := ARRAY[]::UUID[];
    v_total_paid  NUMERIC := 0;
BEGIN
    IF v_hotel_id IS NULL THEN
        RAISE EXCEPTION 'hotel_id is required' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(v_beds) IS NULL OR jsonb_array_length(v_beds) < 1 THEN
        RAISE EXCEPTION 'beds array is required' USING ERRCODE = '22023';
    END IF;

    -- Iterate each bed and create booking + guest + payment.
    FOR v_bed IN SELECT * FROM jsonb_array_elements(v_beds)
    LOOP
        -- Lock and validate the unit row. SELECT FOR UPDATE blocks any
        -- concurrent status update on the same row until this txn commits.
        SELECT * INTO v_unit_row
        FROM public.units
        WHERE id = (v_bed->>'unit_id')::UUID
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'unit_not_found:%', v_bed->>'unit_id' USING ERRCODE = 'P0002';
        END IF;
        IF v_unit_row.hotel_id <> v_hotel_id THEN
            RAISE EXCEPTION 'unit_wrong_hotel:%', v_unit_row.unit_number USING ERRCODE = '22023';
        END IF;
        IF v_unit_row.type <> 'DORM' THEN
            RAISE EXCEPTION 'unit_not_dorm:%', v_unit_row.unit_number USING ERRCODE = '22023';
        END IF;
        IF v_unit_row.status <> 'AVAILABLE' THEN
            RAISE EXCEPTION 'unit_unavailable:%:%', v_unit_row.unit_number, v_unit_row.status
                USING ERRCODE = '55000';
        END IF;

        -- Insert the booking. The idx_one_checkin_per_unit partial unique
        -- index guarantees a second concurrent CHECKED_IN booking for the
        -- same unit will fail with 23505 — atomic protection beyond app code.
        INSERT INTO public.bookings (
            unit_id, check_in, check_out, guest_count,
            base_amount, surcharge, grand_total,
            status, notes, created_by, group_id
        ) VALUES (
            v_unit_row.id,
            v_check_in,
            v_check_out,
            1,
            COALESCE((v_bed->>'grand_total')::NUMERIC, 0),
            0,
            COALESCE((v_bed->>'grand_total')::NUMERIC, 0),
            'CHECKED_IN'::booking_status,
            NULLIF(v_bed->>'notes', ''),
            v_staff_id,
            v_group_id
        )
        RETURNING id INTO v_booking_id;

        v_booking_ids := array_append(v_booking_ids, v_booking_id);
        v_unit_ids    := array_append(v_unit_ids, v_unit_row.id);

        -- Insert the guest row (single guest per bed for dorm bulk).
        INSERT INTO public.guests (
            booking_id, name, phone, aadhar_number,
            aadhar_url_front, aadhar_url_back
        ) VALUES (
            v_booking_id,
            v_bed->>'guest_name',
            v_bed->>'guest_phone',
            NULLIF(v_bed->>'aadhar_number', ''),
            NULLIF(v_bed->>'aadhar_url_front', ''),
            NULLIF(v_bed->>'aadhar_url_back', '')
        );

        -- Insert the payment row (one per booking via payments_booking_id_key).
        -- Even Pay Later records a ₹0 row so downstream readers always see a
        -- payment object (matches the behaviour of /api/bookings).
        INSERT INTO public.payments (
            booking_id, amount_cash, amount_digital, total_paid
        ) VALUES (
            v_booking_id,
            CASE WHEN v_pay_later THEN 0 ELSE COALESCE((v_bed->>'amount_cash')::NUMERIC, 0) END,
            CASE WHEN v_pay_later THEN 0 ELSE COALESCE((v_bed->>'amount_digital')::NUMERIC, 0) END,
            CASE WHEN v_pay_later THEN 0 ELSE COALESCE((v_bed->>'total_paid')::NUMERIC, 0) END
        );

        v_total_paid := v_total_paid + CASE
            WHEN v_pay_later THEN 0
            ELSE COALESCE((v_bed->>'total_paid')::NUMERIC, 0)
        END;
    END LOOP;

    -- Flip unit status AFTER all bookings inserted (Rule 9 from the brief —
    -- if booking insert fails, units stay AVAILABLE; never the reverse).
    UPDATE public.units
       SET status = 'OCCUPIED'
     WHERE id = ANY(v_unit_ids);

    RETURN jsonb_build_object(
        'success', true,
        'group_id', v_group_id,
        'booking_ids', to_jsonb(v_booking_ids),
        'total_paid', v_total_paid
    );
END;
$$;

COMMENT ON FUNCTION public.fn_bulk_dorm_checkin(JSONB) IS
'Atomic bulk dorm check-in for Kaloor walk-in groups. Inserts bookings/guests/payments and flips unit status in a single transaction. Called by POST /api/bookings/bulk.';

-- Grant execute to the authenticated role (matches how Supabase RPC reaches it).
GRANT EXECUTE ON FUNCTION public.fn_bulk_dorm_checkin(JSONB) TO authenticated;
