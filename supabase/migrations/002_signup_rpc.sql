-- ============================================================
-- RotoraxisMatch V2 — Migration 002: Signup RPCs
-- ============================================================
-- Applied: 2026-06-03 (version 20260603112059 in supabase_migrations)
--
-- Creates two SECURITY DEFINER RPCs called from the client
-- after supabase.auth.signUp() succeeds and a session exists.
--
-- signup_technician:
--   Creates a technician_profiles row for the authenticated user.
--   Called from app/auth/signup/technician.tsx.
--
-- signup_company:
--   Creates a companies row + a company_members row (role=admin)
--   for the authenticated user.
--   Called from app/auth/signup/company.tsx.
--
-- Both RPCs require auth.uid() to be non-null (session must exist).
-- If Supabase email confirmation is enabled, data.session is null
-- after signUp() and the RPC call is skipped — the company/technician
-- rows are NOT created until the user confirms and signs in.
-- ============================================================


-- ── signup_technician ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.signup_technician(
  p_first_name       TEXT,
  p_last_name        TEXT,
  p_birth_date       DATE,
  p_technician_type  TEXT,
  p_location_city_id TEXT
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_anon  TEXT;
  v_tid   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  LOOP
    v_anon := 'T' || upper(left(replace(gen_random_uuid()::text, '-', ''), 9));
    BEGIN
      INSERT INTO technician_profiles (
        user_id, anonymous_code,
        first_name, last_name, email,
        birth_date, technician_type, location_city_id
      ) VALUES (
        v_uid, v_anon,
        p_first_name, p_last_name, v_email,
        p_birth_date, p_technician_type, p_location_city_id
      )
      RETURNING id INTO v_tid;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  RETURN v_tid;
END;
$$;


-- ── signup_company ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.signup_company(
  p_company_name     TEXT,
  p_company_type     TEXT,
  p_location_city_id TEXT
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_cid   UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  INSERT INTO companies (name, company_type, location_city_id, email)
  VALUES (p_company_name, p_company_type, p_location_city_id, v_email)
  RETURNING id INTO v_cid;

  INSERT INTO company_members (company_id, user_id, role)
  VALUES (v_cid, v_uid, 'admin');

  RETURN v_cid;
END;
$$;
