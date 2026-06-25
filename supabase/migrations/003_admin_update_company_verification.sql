-- ============================================================
-- AviationJobTalent V2 — Migration 003: Admin company verification RPC
-- ============================================================
-- Created: 2026-06-03
--
-- admin_update_company_verification(p_company_id, p_status):
--   Atomically updates companies.verification_status AND
--   profiles.status for every company_members row with role='admin'
--   belonging to that company.
--
-- Status mapping (verification_status → user_status):
--   verified  → active
--   pending   → pending_verification
--   rejected  → suspended
--
-- Only callable by users whose profiles.role = 'admin'.
-- SECURITY DEFINER so it can bypass RLS on profiles.
-- ============================================================

CREATE OR REPLACE FUNCTION public.admin_update_company_verification(
  p_company_id UUID,
  p_status     verification_status
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_caller_role TEXT;
  v_profile_status user_status;
BEGIN
  -- Verify caller is an admin
  SELECT role INTO v_caller_role
  FROM profiles
  WHERE id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only admins can update company verification';
  END IF;

  -- Map verification_status → user_status
  CASE p_status
    WHEN 'verified' THEN v_profile_status := 'active';
    WHEN 'pending'  THEN v_profile_status := 'pending_verification';
    WHEN 'rejected' THEN v_profile_status := 'suspended';
  END CASE;

  -- Update the company (single row, no RLS bypass needed for admins but DEFINER ensures it)
  UPDATE companies
  SET verification_status = p_status,
      updated_at = now()
  WHERE id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Company % not found', p_company_id;
  END IF;

  -- Sync profiles.status for all admin members of this company
  UPDATE profiles
  SET status = v_profile_status
  WHERE id IN (
    SELECT user_id
    FROM company_members
    WHERE company_id = p_company_id
      AND role = 'admin'
  );
END;
$$;

-- Grant execute to authenticated users (RLS inside guards non-admins)
GRANT EXECUTE ON FUNCTION public.admin_update_company_verification(UUID, verification_status)
  TO authenticated;
