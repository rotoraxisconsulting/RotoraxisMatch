-- ============================================================
-- AviationJobTalent V2 — Migration 014: Deduplicate technician_profiles
-- ============================================================
-- Problem: signup_technician had no guard against duplicate user_id,
-- so submitting the signup form multiple times created multiple rows
-- for the same auth user.
--
-- This migration:
--   1. Deletes duplicate technician_profiles rows, keeping the most
--      recent row per user_id (no dependent records existed on the
--      duplicates — verified before applying).
--   2. Adds UNIQUE(user_id) to prevent future duplicates.
--   3. Replaces signup_technician with a version that returns the
--      existing profile ID when one already exists (idempotent).
-- ============================================================

-- ── 1. Delete duplicate rows, keep newest per user_id ────────

DELETE FROM technician_profiles
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
    FROM technician_profiles
  ) ranked
  WHERE rn > 1
);

-- ── 2. Add UNIQUE constraint on user_id ──────────────────────

ALTER TABLE technician_profiles
  ADD CONSTRAINT technician_profiles_user_id_unique UNIQUE (user_id);

-- ── 3. Replace signup_technician — now idempotent ────────────

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

  -- Idempotency: return existing profile if user already completed signup
  SELECT id INTO v_tid FROM technician_profiles WHERE user_id = v_uid;
  IF v_tid IS NOT NULL THEN
    RETURN v_tid;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  -- Retry loop only guards against anonymous_code collision
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
      NULL; -- anonymous_code collision, retry
    END;
  END LOOP;

  RETURN v_tid;
END;
$$;
