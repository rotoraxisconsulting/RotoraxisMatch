-- ============================================================
-- AviationJobTalent V2 — Migration 044: signup_technician() records the
-- technician's declared years of experience
-- ============================================================
-- Created: 2026-08-03
--
-- NUMBERING NOTE: this was requested as "043", but 043 was already taken
-- (043_account_deletion_feedback.sql, applied 2026-08-03 as
-- 20260803060026). Numbers are never reused — this is 044.
--
-- Problem being fixed:
--   The technician signup form collects name, date of birth, technician
--   type and base airport, but never asks for years of experience, so
--   every account was created with technician_profiles.years_experience
--   IS NULL. That column is read as "not declared", which by product rule
--   NEVER penalizes: such a profile passes every minimum-experience filter
--   a company sets (applyMinYearsFilter: `is.null OR >= N`) and is never
--   blocked by the matching engine. In other words the field that exists
--   to let companies filter by experience was, in practice, empty for
--   100% of new accounts. It is now asked for at signup.
--
-- What this migration changes (additive):
--   - signup_technician() gains a 6th parameter, p_years_experience,
--     written into technician_profiles.years_experience.
--   - Nothing else. The body below is the previously deployed definition
--     copied verbatim (verified against rotoaxismatch-dev before writing
--     this file, via pg_get_functiondef) with two lines added to the
--     INSERT. The idempotency check, the anonymous_code retry loop and
--     the SECURITY DEFINER / search_path hardening are untouched.
--
-- Why DEFAULT NULL, and why the old signature is dropped:
--   Postgres treats a different argument count as a different function,
--   so this creates a second one rather than replacing the first. Two
--   overlapping definitions of the same signup is exactly the kind of
--   duplicate write path that drifts, so the superseded 5-argument
--   signature is dropped here. DEFAULT NULL is what makes that safe: an
--   app bundle already in a user's browser still calls the RPC with 5
--   named arguments, and PostgREST resolves that against this function,
--   storing NULL = "not declared" — the same thing it stored before.
--   (The default cannot coexist with the old signature: a 5-argument call
--   would then be ambiguous and error out. Create-then-drop, in this
--   order, in one transaction, has no such window.)
--
-- Why the column stays NULLABLE:
--   NOT NULL is deliberately NOT added. '' vs 0 vs NULL is a real
--   three-way distinction here — NULL is "not declared", 0 is "declared,
--   no experience" — and the whole product rule is that absence of data
--   never penalizes. A hard constraint would also turn any half-completed
--   signup (auth user created, RPC not yet run) into an account that can
--   never be repaired. The 0..70 range is already enforced by
--   chk_technician_years_experience_range (migration 032), which admits
--   NULL by design.
--
-- Existing rows are NOT touched by this migration: the profiles created
-- before today keep years_experience IS NULL and are backfilled
-- separately, deliberately, as a data decision rather than a schema one.
-- ============================================================

CREATE OR REPLACE FUNCTION public.signup_technician(
  p_first_name       text,
  p_last_name        text,
  p_birth_date       date,
  p_technician_type  text,
  p_location_city_id text,
  p_years_experience integer DEFAULT NULL
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        birth_date, technician_type, location_city_id,
        years_experience
      ) VALUES (
        v_uid, v_anon,
        p_first_name, p_last_name, v_email,
        p_birth_date, p_technician_type, p_location_city_id,
        p_years_experience
      )
      RETURNING id INTO v_tid;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- anonymous_code collision, retry
    END;
  END LOOP;

  RETURN v_tid;
END;
$function$;

-- Same grants the 5-argument version carried (verified via proacl before
-- writing this): `anon` is included because signUp() with email
-- confirmation disabled can reach the RPC before the session is fully
-- established.
GRANT EXECUTE ON FUNCTION public.signup_technician(text, text, date, text, text, integer)
  TO anon, authenticated, service_role;

-- Superseded 5-argument signature. Dropped only AFTER the replacement
-- above exists, so there is no moment where neither is callable.
DROP FUNCTION IF EXISTS public.signup_technician(text, text, date, text, text);

-- PostgREST caches the schema; without this the new argument is rejected
-- as unknown until the cache happens to refresh.
NOTIFY pgrst, 'reload schema';
