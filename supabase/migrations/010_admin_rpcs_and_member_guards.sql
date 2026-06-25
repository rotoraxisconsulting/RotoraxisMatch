-- ============================================================
-- AviationJobTalent V2 — Migration 010: Admin RPCs + member guards
-- ============================================================
-- Created: 2026-06-06
--
-- Moves sensitive admin/company actions from direct client writes
-- to SECURITY DEFINER RPCs with explicit permission checks.
--
-- New RPCs:
--   1. admin_update_technician_verification  — admin only
--   2. admin_update_document_status          — admin only
--   3. update_company_member_role            — company admin, last-admin guard
--   4. remove_company_member                 — company admin, last-admin guard
--
-- Additional server-side defence:
--   5. Trigger: force documents.status = 'pending' on INSERT
--      (prevents technicians from self-verifying their documents)
-- ============================================================


-- ── 1. admin_update_technician_verification ───────────────

CREATE OR REPLACE FUNCTION public.admin_update_technician_verification(
  p_technician_id UUID,
  p_status        verification_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id        UUID;
  v_profile_status user_status;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can update technician verification';
  END IF;

  CASE p_status
    WHEN 'verified' THEN v_profile_status := 'active';
    WHEN 'pending'  THEN v_profile_status := 'pending_verification';
    WHEN 'rejected' THEN v_profile_status := 'suspended';
  END CASE;

  UPDATE technician_profiles
  SET verification_status = p_status
  WHERE id = p_technician_id
  RETURNING user_id INTO v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Technician % not found', p_technician_id;
  END IF;

  UPDATE profiles
  SET status = v_profile_status
  WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_technician_verification(UUID, verification_status)
  TO authenticated;


-- ── 2. admin_update_document_status ──────────────────────

CREATE OR REPLACE FUNCTION public.admin_update_document_status(
  p_document_id      UUID,
  p_status           document_status,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Permission denied: only admins can update document status';
  END IF;

  UPDATE documents
  SET
    status           = p_status,
    reviewed_at      = CASE WHEN p_status = 'pending' THEN NULL ELSE now() END,
    rejection_reason = CASE WHEN p_status = 'rejected'
                            THEN COALESCE(p_rejection_reason, 'Document rejected')
                            ELSE NULL END
  WHERE id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document % not found', p_document_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_document_status(UUID, document_status, TEXT)
  TO authenticated;


-- ── 3. update_company_member_role ─────────────────────────

CREATE OR REPLACE FUNCTION public.update_company_member_role(
  p_company_id UUID,
  p_member_id  UUID,
  p_new_role   company_member_role
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role company_member_role;
  v_target_role company_member_role;
  v_admin_count INT;
BEGIN
  -- Verify caller is admin of this company
  SELECT role INTO v_caller_role
  FROM company_members
  WHERE company_id = p_company_id AND user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only company admins can change member roles';
  END IF;

  -- Get current role of target member
  SELECT role INTO v_target_role
  FROM company_members
  WHERE id = p_member_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in this company';
  END IF;

  -- Guard: downgrading an admin requires at least one other admin to remain
  IF v_target_role = 'admin' AND p_new_role <> 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM company_members
    WHERE company_id = p_company_id AND role = 'admin' AND id <> p_member_id;

    IF v_admin_count = 0 THEN
      RAISE EXCEPTION 'Cannot downgrade the last admin of a company';
    END IF;
  END IF;

  UPDATE company_members
  SET role = p_new_role
  WHERE id = p_member_id AND company_id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_company_member_role(UUID, UUID, company_member_role)
  TO authenticated;


-- ── 4. remove_company_member ──────────────────────────────

CREATE OR REPLACE FUNCTION public.remove_company_member(
  p_company_id UUID,
  p_member_id  UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role company_member_role;
  v_target_role company_member_role;
  v_admin_count INT;
BEGIN
  -- Verify caller is admin of this company
  SELECT role INTO v_caller_role
  FROM company_members
  WHERE company_id = p_company_id AND user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only company admins can remove members';
  END IF;

  -- Get role of target member
  SELECT role INTO v_target_role
  FROM company_members
  WHERE id = p_member_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in this company';
  END IF;

  -- Guard: cannot remove the last admin
  IF v_target_role = 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM company_members
    WHERE company_id = p_company_id AND role = 'admin';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove the last admin of a company';
    END IF;
  END IF;

  DELETE FROM company_members
  WHERE id = p_member_id AND company_id = p_company_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_company_member(UUID, UUID)
  TO authenticated;


-- ── 5. Force documents.status = 'pending' on INSERT ───────
--
-- Prevents technicians from self-verifying documents by
-- supplying status='verified' in the INSERT payload.

CREATE OR REPLACE FUNCTION public.force_document_pending_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.status           := 'pending';
  NEW.reviewed_at      := NULL;
  NEW.rejection_reason := NULL;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_document_status_on_insert
  BEFORE INSERT ON documents
  FOR EACH ROW EXECUTE FUNCTION public.force_document_pending_on_insert();
