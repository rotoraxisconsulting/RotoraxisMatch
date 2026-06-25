-- ============================================================
-- AviationJobTalent V2 — Migration 009: Restrict server-owned fields
-- ============================================================
-- Created: 2026-06-06
--
-- Fixes three vulnerabilities where clients could directly write
-- fields that must be controlled exclusively by server-side logic:
--
--   A. technician_profiles.verification_status
--      tp_update_own allowed any technician to self-verify.
--      Fix: BEFORE UPDATE trigger rejects non-admin writes.
--
--   B. companies.verification_status
--      companies_update_own allowed any company admin to self-verify.
--      Fix: BEFORE UPDATE trigger rejects non-admin writes.
--
--   C. offer_requests / offer_applications:
--        identity_revealed, documents_unlocked
--      handle_offer_relation_status_transition returned early when
--      OLD.status = NEW.status, letting client-supplied values
--      through unchanged.
--      Fix: restore OLD values for these fields when there is no
--      status transition, so they remain immutable from the client.
--
-- What is NOT changed:
--   - tp_update_own / companies_update_own stay intact so users can
--     still edit their legitimate profile fields.
--   - admin_update_company_verification RPC is SECURITY DEFINER and
--     bypasses RLS — unaffected.
--   - Status-transition logic in the offer trigger is unchanged.
-- ============================================================


-- ── A. Protect technician_profiles.verification_status ────

CREATE OR REPLACE FUNCTION public.prevent_technician_profile_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT is_admin() THEN
    RAISE EXCEPTION 'Updating technician_profiles.verification_status is not permitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_technician_profile_protected_fields
  BEFORE UPDATE ON technician_profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_technician_profile_protected_fields();


-- ── B. Protect companies.verification_status ──────────────

CREATE OR REPLACE FUNCTION public.prevent_company_protected_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.verification_status IS DISTINCT FROM OLD.verification_status
     AND NOT is_admin() THEN
    RAISE EXCEPTION 'Updating companies.verification_status is not permitted';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_company_protected_fields
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION public.prevent_company_protected_fields();


-- ── C. Protect identity_revealed / documents_unlocked ─────
--
-- Replace the existing transition function.
-- Key change: when OLD.status = NEW.status (no real transition),
-- restore identity_revealed and documents_unlocked to their current
-- DB values instead of returning NEW unmodified, which previously
-- allowed clients to inject arbitrary values for these fields.

CREATE OR REPLACE FUNCTION public.handle_offer_relation_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- No status change: protect server-owned fields and exit.
  IF OLD.status = NEW.status THEN
    NEW.identity_revealed  := OLD.identity_revealed;
    NEW.documents_unlocked := OLD.documents_unlocked;
    RETURN NEW;
  END IF;

  -- Validate the transition is legal.
  PERFORM assert_offer_relation_transition(OLD.status, NEW.status);

  -- Apply side effects based on the new status.
  IF NEW.status = 'accepted' THEN
    NEW.identity_revealed  := true;
    NEW.documents_unlocked := true;

    IF TG_TABLE_NAME = 'offer_requests' THEN
      INSERT INTO chat_rooms (offer_request_id, technician_id, company_id)
      VALUES (NEW.id, NEW.technician_id, NEW.company_id)
      ON CONFLICT DO NOTHING;
    ELSE
      INSERT INTO chat_rooms (offer_application_id, technician_id, company_id)
      VALUES (NEW.id, NEW.technician_id, NEW.company_id)
      ON CONFLICT DO NOTHING;
    END IF;

  ELSE
    -- rejected / expired / withdrawn
    NEW.identity_revealed  := false;
    NEW.documents_unlocked := false;
  END IF;

  RETURN NEW;
END;
$$;
