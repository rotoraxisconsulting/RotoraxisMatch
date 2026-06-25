-- ============================================================
-- AviationJobTalent V2 — Migration 008: Restrict profiles UPDATE
-- ============================================================
-- Created: 2026-06-06
--
-- Problem: profiles_update_own (migration 001) allowed any
-- authenticated user to UPDATE their own profiles row without
-- column-level restrictions. This permitted:
--   1. Privilege escalation: SET role = 'admin'
--   2. Self-activation:      SET status = 'active'
--
-- Fix (two layers):
--   1. Drop profiles_update_own — there is no legitimate client
--      use case for direct UPDATE on profiles:
--        - role    is set at registration and never changed by users
--        - status  is admin-only (changed via SECURITY DEFINER RPCs)
--        - email   is sourced from auth.users, not edited via profiles
--        - created_at is immutable
--   2. Add a BEFORE UPDATE trigger as defence-in-depth: even if a
--      future migration re-adds an UPDATE policy, role and status
--      remain write-protected for non-admin callers.
--
-- What is NOT changed:
--   - profiles_update_admin stays intact (admin keeps full UPDATE)
--   - admin_update_company_verification RPC is SECURITY DEFINER
--     and bypasses RLS entirely — unaffected
--   - handle_new_user trigger writes INSERT only — unaffected
-- ============================================================


-- ── 1. Drop the unsafe policy ─────────────────────────────

DROP POLICY IF EXISTS profiles_update_own ON profiles;


-- ── 2. Trigger: block role/status writes for non-admins ───
--
-- SECURITY DEFINER so is_admin() can query profiles without
-- triggering another policy evaluation cycle.
-- SET search_path = public prevents search_path injection.

CREATE OR REPLACE FUNCTION public.prevent_profile_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND NOT is_admin() THEN
    RAISE EXCEPTION 'Updating profiles.role is not permitted';
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status AND NOT is_admin() THEN
    RAISE EXCEPTION 'Updating profiles.status is not permitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_profiles_protected_fields
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_protected_fields();
