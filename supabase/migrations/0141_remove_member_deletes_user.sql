-- Migration 014: remove_company_member now deletes the user account entirely.
--
-- Rationale: a company member who is removed from the team has no purpose in
-- the system — their profile, credentials and session are all tied to this
-- company. Keeping a dangling auth.users row would leave them able to log in
-- but land on a broken dashboard.
--
-- Delete order:
--   1. public.profiles (cascades → company_members, chat_messages, activity_inbox)
--   2. auth.users     (removes credentials, sessions and refresh tokens)
--
-- Guards preserved from migration 010:
--   • Caller must be an admin of the company.
--   • Caller cannot remove themselves.
--   • The last admin of a company cannot be removed.

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
  v_user_id     UUID;
BEGIN
  -- Verify caller is admin of this company
  SELECT role INTO v_caller_role
  FROM company_members
  WHERE company_id = p_company_id AND user_id = auth.uid();

  IF v_caller_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Permission denied: only company admins can remove members';
  END IF;

  -- Get role and user_id of target member
  SELECT role, user_id INTO v_target_role, v_user_id
  FROM company_members
  WHERE id = p_member_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Member not found in this company';
  END IF;

  -- Guard: admin cannot remove themselves
  IF v_user_id = auth.uid() THEN
    RAISE EXCEPTION 'You cannot remove yourself from the company';
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

  -- Delete the profile row.
  -- Cascades to: company_members, chat_messages (sender_user_id),
  --              activity_inbox, activity_events (actor set to NULL via SET NULL).
  DELETE FROM public.profiles WHERE id = v_user_id;

  -- Delete the auth user (removes credentials, active sessions and refresh tokens).
  DELETE FROM auth.users WHERE id = v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.remove_company_member(UUID, UUID)
  TO authenticated;
