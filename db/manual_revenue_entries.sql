-- Migration: add_manual_revenue_entries
-- Apply via Supabase Dashboard → SQL Editor, or re-connect Supabase MCP and use apply_migration.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.manual_revenue_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  amount_cash numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount_cash >= 0),
  amount_digital numeric(10,2) NOT NULL DEFAULT 0 CHECK (amount_digital >= 0),
  transaction_kind text NOT NULL CHECK (transaction_kind IN ('CHECKIN','CHECKOUT','FRESHUP','EXTRAS','OTHER')),
  description text,
  transaction_at timestamptz NOT NULL,
  entered_by uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  entered_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT manual_revenue_amount_positive CHECK (amount_cash + amount_digital > 0)
);

CREATE INDEX IF NOT EXISTS idx_manual_rev_hotel_txn
  ON public.manual_revenue_entries(hotel_id, transaction_at DESC);
CREATE INDEX IF NOT EXISTS idx_manual_rev_entered_by
  ON public.manual_revenue_entries(entered_by, entered_at DESC);

ALTER TABLE public.manual_revenue_entries ENABLE ROW LEVEL SECURITY;

-- SELECT + INSERT: permissive (matches the rest of the app's permissive RLS
-- model — route-level role gates are the real enforcement).
DROP POLICY IF EXISTS "manual_rev_select" ON public.manual_revenue_entries;
CREATE POLICY "manual_rev_select" ON public.manual_revenue_entries
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "manual_rev_insert" ON public.manual_revenue_entries;
CREATE POLICY "manual_rev_insert" ON public.manual_revenue_entries
  FOR INSERT WITH CHECK (true);

-- UPDATE + DELETE: gated to Developer role only. Provides a real correction
-- path via the Developer Override Console (which goes through the cookie-auth
-- client — RLS still applies — so we need an explicit policy that allows it).
-- Front-desk / HR / etc. cannot edit or delete manual revenue rows; effectively
-- append-only for everyone except the Developer.
DROP POLICY IF EXISTS "manual_rev_update_dev" ON public.manual_revenue_entries;
CREATE POLICY "manual_rev_update_dev" ON public.manual_revenue_entries
  FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND role = 'Developer'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND role = 'Developer'));

DROP POLICY IF EXISTS "manual_rev_delete_dev" ON public.manual_revenue_entries;
CREATE POLICY "manual_rev_delete_dev" ON public.manual_revenue_entries
  FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.staff WHERE user_id = auth.uid() AND role = 'Developer'));
