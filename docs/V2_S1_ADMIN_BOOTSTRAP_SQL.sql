-- ============================================================
-- RotoraxisMatch V2-S1 — Admin Bootstrap SQL
-- ============================================================
-- Run this AFTER SUPABASE_SCHEMA_V2.sql and AFTER creating
-- the admin user manually in Supabase Auth Dashboard.
--
-- Steps:
--   1. Go to Supabase Dashboard → Authentication → Users
--   2. Create a new user with the admin email and a strong password
--   3. Copy the UUID from the "UID" column
--   4. Replace <AUTH_USER_UUID_HERE> and <ADMIN_EMAIL_HERE> below
--   5. Run this script in Supabase SQL Editor
--
-- This inserts the admin profile row that links the auth user to
-- the 'admin' role. profiles.id MUST equal auth.users.id.
-- ============================================================

-- Insert admin profile (profiles.id = auth.users.id)
INSERT INTO public.profiles (id, role, status, created_at)
VALUES (
  '<AUTH_USER_UUID_HERE>',   -- paste the UUID from Supabase Auth
  'admin',
  'active',
  now()
);

-- ============================================================
-- Verification
-- ============================================================
-- After running, verify with:
--   SELECT id, role, status FROM public.profiles WHERE role = 'admin';
--
-- The returned row should show:
--   id     = the UUID you pasted above
--   role   = admin
--   status = active
-- ============================================================

-- ============================================================
-- Notes
-- ============================================================
-- • Do NOT add a profiles row for admin that includes email —
--   email is owned by auth.users and not replicated to profiles.
-- • For company users: create the auth user first, then insert
--   into profiles (role = 'company_user'), then insert into
--   company_members linking the profile to a company row.
-- • For technicians: they self-register via the app sign-up flow.
--   The auth trigger creates their profiles row automatically.
-- ============================================================
