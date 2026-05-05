-- Migration: add_accounts_role
-- Adds the 'Accounts' value to the staff_role enum so we can issue logins
-- to the new Accounts Manager role (read-only Financials + Expenses).
--
-- Idempotent — safe to re-run.
-- Apply via Supabase Dashboard -> SQL Editor, or via the Supabase MCP
-- apply_migration tool.

DO $$ BEGIN
    ALTER TYPE staff_role ADD VALUE IF NOT EXISTS 'Accounts';
EXCEPTION WHEN others THEN NULL;
END $$;
