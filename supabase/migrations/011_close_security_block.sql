-- ============================================================
-- RotoraxisMatch V2 — Migration 011: Close security block
-- ============================================================
-- Created: 2026-06-06
--
-- Closes three remaining gaps not covered by migrations 008-010:
--
-- A. Direct offer duplicates
--    No unique constraint prevented a company from creating
--    multiple simultaneous pending offer_requests to the same
--    technician for the same offer.
--    Fix: partial unique index on (company_id, technician_id,
--    COALESCE(offer_id, uuid_nil)) WHERE status = 'pending'.
--    Allows historical records (non-pending rows are unrestricted).
--
-- B. Last-admin bypass via direct RLS writes
--    Migrations 010 added RPC guards, but RLS policies
--    cm_update_admin and cm_delete_admin still allowed direct
--    UPDATE/DELETE on company_members, bypassing the RPCs.
--    Fix: BEFORE UPDATE OR DELETE trigger that enforces the
--    last-admin invariant at the DB level for non-platform-admins.
--
-- C. INSERT gaps on server-owned fields
--    INSERT triggers (or DB defaults) exist for documents (010),
--    but three tables were still unprotected on INSERT:
--      - technician_profiles.verification_status
--        (tp_insert_own allowed supplying 'verified' directly)
--      - offer_requests: status, identity_revealed, documents_unlocked
--        (or_insert_company allowed non-pending initial state)
--      - offer_applications: same three fields
--    Fix: BEFORE INSERT triggers that force safe defaults,
--    identical to the DB column defaults, so normal flows are
--    unaffected.
-- ============================================================


-- ── A. Partial unique index: one pending offer_request per
--       (company, technician, offer) ────────────────────────
--
-- COALESCE(offer_id, uuid_nil) treats NULL offer_id as a
-- concrete sentinel so two NULL rows are considered equal.
-- This blocks duplicate pending general direct contacts too.
--
-- Allowed:  same pair once resolved (non-pending status)
-- Blocked:  second pending request for the same combo

CREATE UNIQUE INDEX uq_offer_requests_one_pending
  ON offer_requests (
    company_id,
    technician_id,
    COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status = 'pending';


-- ── B. Last-admin guard at DB level ───────────────────────
--
-- Fires on direct UPDATE/DELETE on company_members, closing
-- the bypass that existed alongside the RPC guards from 010.
-- Platform admins (is_admin() = true) are exempt — they can
-- manage company teams freely.

CREATE OR REPLACE FUNCTION public.guard_company_last_admin()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_admin_count INT;
BEGIN
  -- Platform admins bypass this guard
  IF is_admin() THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.role = 'admin' THEN
      SELECT COUNT(*) INTO v_admin_count
      FROM company_members
      WHERE company_id = OLD.company_id
        AND role = 'admin'
        AND id <> OLD.id;
      IF v_admin_count = 0 THEN
        RAISE EXCEPTION 'Cannot remove the last admin of a company';
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE: downgrading admin → non-admin
  IF OLD.role = 'admin' AND NEW.role <> 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM company_members
    WHERE company_id = OLD.company_id
      AND role = 'admin'
      AND id <> OLD.id;
    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot downgrade the last admin of a company';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_company_member_last_admin
  BEFORE UPDATE OR DELETE ON company_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_company_last_admin();


-- ── C-1. Force safe defaults on offer_requests INSERT ─────

CREATE OR REPLACE FUNCTION public.force_offer_relation_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.status             := 'pending';
  NEW.identity_revealed  := false;
  NEW.documents_unlocked := false;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_offer_request_on_insert
  BEFORE INSERT ON offer_requests
  FOR EACH ROW EXECUTE FUNCTION public.force_offer_relation_defaults();

CREATE TRIGGER guard_offer_application_on_insert
  BEFORE INSERT ON offer_applications
  FOR EACH ROW EXECUTE FUNCTION public.force_offer_relation_defaults();


-- ── C-2. Force verification_status = 'pending' on
--         technician_profiles INSERT ──────────────────────
--
-- tp_insert_own allowed any value for verification_status.
-- This trigger resets it to 'pending' regardless of what
-- the client sends, matching the column default.

CREATE OR REPLACE FUNCTION public.force_technician_profile_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.verification_status := 'pending';
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_technician_profile_on_insert
  BEFORE INSERT ON technician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.force_technician_profile_defaults();
