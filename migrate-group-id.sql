-- Migration: Add group_id column for dorm bulk bookings
-- Run this in Supabase SQL Editor

ALTER TABLE bookings ADD COLUMN IF NOT EXISTS group_id UUID;
CREATE INDEX IF NOT EXISTS idx_bookings_group ON bookings(group_id);
