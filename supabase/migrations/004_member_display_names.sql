-- ============================================================
-- AviationJobTalent V2 — Migration 004: Member display names
-- ============================================================
-- Created: 2026-06-04
--
-- Changes:
--   1. Adds display_name TEXT to company_members.
--      Nullable — existing members have no name yet.
--      Admin-editable via the existing cm_update_admin RLS policy
--      (no new policy needed for UPDATE).
--
--   2. Adds profiles_select_same_company policy on profiles.
--      Allows company_users to SELECT the profiles row of any
--      co-member in the same company.
--      Required so getMembers() can JOIN profiles to fetch email.
--      Security: my_company_id() is SECURITY DEFINER; the EXISTS
--      subquery ensures only members of *your* company are exposed.
-- ============================================================


-- 1. display_name column ──────────────────────────────────────

ALTER TABLE company_members ADD COLUMN display_name TEXT;


-- 2. Cross-member profile visibility ─────────────────────────

CREATE POLICY profiles_select_same_company ON profiles
  FOR SELECT USING (
    auth_role() = 'company_user'
    AND is_active_user()
    AND EXISTS (
      SELECT 1 FROM company_members
      WHERE user_id    = profiles.id
        AND company_id = my_company_id()
    )
  );
