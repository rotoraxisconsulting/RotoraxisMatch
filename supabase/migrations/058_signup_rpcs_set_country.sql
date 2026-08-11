-- ============================================================
-- AviationJobTalent V2 — Migración 058: los RPC de alta rellenan
-- el país nuevo
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F2b — docs/MISSION_PART66.md)
--
-- ⚠ ESTA MIGRACIÓN REPARA UN FALLO QUE INTRODUJO LA 057, Y HAY QUE
-- APLICARLA INMEDIATAMENTE DESPUÉS. Entre una y otra, EL ALTA ESTÁ ROTA:
-- `signup_technician` y `signup_company` insertan sin `location_country_code`,
-- que la 057 dejó NOT NULL, así que cualquier registro nuevo falla con
-- null value in column "location_country_code" violates not-null constraint.
--
-- ── Cómo se coló ───────────────────────────────────────────
-- La 057 buscó los LECTORES de las columnas (los 27 ficheros que apuntan a
-- location_airports) y se olvidó de los ESCRITORES. Y los escritores que
-- importaban no estaban en el código: son dos funciones SECURITY DEFINER que
-- viven sólo en Postgres, así que ningún grep sobre src/ o app/ las enseña.
--
-- La lección, para la próxima vez que una columna pase a NOT NULL: antes de
-- ponerlo, listar TODO lo que inserta en la tabla, y buscarlo en pg_proc, no
-- en el repositorio. Es la hermana de la regla que ya teníamos para los DROP
-- (consultar por confrelid antes de borrar): mirar la dirección de la que
-- vienen las escrituras, no sólo la de las lecturas.
--
-- ── Qué hace ───────────────────────────────────────────────
-- Las dos funciones derivan país y ciudad del aeropuerto que ya reciben,
-- usando el MISMO camino que el backfill de la 057: location_airports ->
-- location_country_aliases. Una sola correspondencia para toda la base.
--
-- Sin coordenadas, por el mismo motivo que la 057: las del aeropuerto no son
-- las de la ciudad, y un pin preciso y falso es peor que ninguno.
--
-- Las firmas NO cambian: mismos parámetros, mismo tipo de retorno. Las
-- pantallas de alta siguen llamándolas igual y no hace falta tocar código.
-- ============================================================


-- ── 1. Precondición ────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='technician_profiles'
      AND column_name='location_country_code'
  ) THEN
    RAISE EXCEPTION 'Falta technician_profiles.location_country_code. Aplica antes la migración 057.';
  END IF;
END $$;


-- ── 2. signup_technician ───────────────────────────────────
--
-- Copia VERBATIM de la desplegada (pg_get_functiondef), con dos cambios:
-- la resolución del país antes del bucle, y las dos columnas nuevas en el
-- INSERT. El resto —el bucle de código anónimo, el reintento ante
-- unique_violation, la idempotencia por user_id, los tipos— queda intacto.
CREATE OR REPLACE FUNCTION public.signup_technician(
  p_first_name       TEXT,
  p_last_name        TEXT,
  p_birth_date       DATE,
  p_technician_type  TEXT,
  p_location_city_id TEXT,
  p_years_experience INTEGER DEFAULT NULL::INTEGER,
  p_technician_types TEXT[] DEFAULT NULL::TEXT[]
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID := auth.uid();
  v_email        TEXT;
  v_anon         TEXT;
  v_tid          UUID;
  v_types        TEXT[];
  v_country_code TEXT;
  v_city_name    TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT array_agg(DISTINCT t) INTO v_types
  FROM unnest(COALESCE(NULLIF(p_technician_types, '{}'), ARRAY[p_technician_type])) AS t
  WHERE t IS NOT NULL AND t <> '';

  IF v_types IS NULL OR array_length(v_types, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one technician type is required';
  END IF;

  SELECT id INTO v_tid FROM technician_profiles WHERE user_id = v_uid;
  IF v_tid IS NOT NULL THEN
    RETURN v_tid;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  -- Fase 7 F2b: el país sale del aeropuerto por el mismo camino que el
  -- backfill de la 057. Se resuelve ANTES del bucle: dentro se repetiría en
  -- cada reintento de código anónimo sin ganar nada.
  SELECT a.country_code, la.city
    INTO v_country_code, v_city_name
  FROM location_airports la
  JOIN location_country_aliases a ON a.country_name = la.country_name
  WHERE la.id = p_location_city_id;

  -- Mensaje explícito en vez de dejar que reviente el NOT NULL: si algún día
  -- entra un aeropuerto de un país sin código ISO, esto dice cuál y por qué.
  IF v_country_code IS NULL THEN
    RAISE EXCEPTION 'Location "%" has no ISO country code. Check location_country_aliases.', p_location_city_id;
  END IF;

  LOOP
    v_anon := 'T' || upper(left(replace(gen_random_uuid()::text, '-', ''), 9));
    BEGIN
      INSERT INTO technician_profiles (
        user_id, anonymous_code,
        first_name, last_name, email,
        birth_date, technician_type, location_city_id,
        location_country_code, location_city_name,
        years_experience
      ) VALUES (
        v_uid, v_anon,
        p_first_name, p_last_name, v_email,
        p_birth_date, v_types[1], p_location_city_id,
        v_country_code, v_city_name,
        p_years_experience
      )
      RETURNING id INTO v_tid;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  END LOOP;

  INSERT INTO technician_profile_types (technician_id, type_code)
  SELECT v_tid, t FROM unnest(v_types) AS t;

  RETURN v_tid;
END;
$function$;


-- ── 3. signup_company ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.signup_company(
  p_company_name     TEXT,
  p_company_type     TEXT,
  p_location_city_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid          UUID := auth.uid();
  v_email        TEXT;
  v_cid          UUID;
  v_country_code TEXT;
  v_city_name    TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  SELECT a.country_code, la.city
    INTO v_country_code, v_city_name
  FROM location_airports la
  JOIN location_country_aliases a ON a.country_name = la.country_name
  WHERE la.id = p_location_city_id;

  IF v_country_code IS NULL THEN
    RAISE EXCEPTION 'Location "%" has no ISO country code. Check location_country_aliases.', p_location_city_id;
  END IF;

  INSERT INTO companies (name, company_type, location_city_id, email,
                         location_country_code, location_city_name)
  VALUES (p_company_name, p_company_type, p_location_city_id, v_email,
          v_country_code, v_city_name)
  RETURNING id INTO v_cid;

  -- Register the creator as company admin
  INSERT INTO company_members (company_id, user_id, role)
  VALUES (v_cid, v_uid, 'admin');

  RETURN v_cid;
END;
$function$;


-- ── Post-condiciones ───────────────────────────────────────
DO $$
DECLARE
  v_def TEXT;
BEGIN
  -- Las dos funciones tienen que nombrar la columna nueva. Si no, el alta
  -- sigue rota y esta migración no ha servido de nada.
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('signup_technician','signup_company')
  LOOP
    IF v_def NOT LIKE '%location_country_code%' THEN
      RAISE EXCEPTION 'Una de las funciones de alta sigue sin escribir location_country_code.';
    END IF;
    -- Y seguir siendo SECURITY DEFINER: sin eso, un usuario recién
    -- registrado no tiene permiso para insertar su propio perfil.
    IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
      RAISE EXCEPTION 'Una de las funciones de alta perdió SECURITY DEFINER.';
    END IF;
  END LOOP;

  RAISE NOTICE 'signup_technician y signup_company escriben ya el país; alta reparada.';
END $$;
