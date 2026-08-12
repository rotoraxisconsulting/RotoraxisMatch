-- ============================================================
-- AviationJobTalent V2 — Migración 060: escritura directa de
-- país + ciudad, y el aeropuerto deja de ser obligatorio
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F2c — docs/MISSION_PART66.md)
--
-- ⚠ VA JUNTO AL CÓDIGO DE F2c, no antes ni después por su cuenta. Cambia la
-- FIRMA de los dos RPC de alta, así que las pantallas viejas dejan de poder
-- llamarlos en cuanto se aplica, y las nuevas no funcionan sin ella.
--
-- ── 1. location_city_id deja de ser obligatorio ────────────
--
-- Esto NO estaba en el encargo, y es inevitable. Los formularios de F2c
-- eligen país y ciudad; ya no preguntan por un aeropuerto. Con
-- `location_city_id` NOT NULL, NINGUNA fila nueva podría crearse: ni un alta
-- de técnico, ni una de empresa, ni una oferta.
--
-- Se relaja la restricción, NO se dropea la columna. La columna y su FK a
-- `location_airports` siguen intactas, con sus 11 filas existentes apuntando
-- a su aeropuerto. Su DROP —y el de `location_airports`— va en su propia
-- migración, después de desplegar esto, cuando no queden lectores. Misma
-- regla que la 045, la 049, la 052, la 054 y la 059.
--
-- ── 2. Los RPC de alta ─────────────────────────────────────
--
-- Cambian de firma: donde recibían `p_location_city_id` ahora reciben el
-- país y, opcionalmente, la ciudad con sus coordenadas.
--
-- ⚠ SE DROPEAN Y SE RECREAN, no `CREATE OR REPLACE`. Cambiar la lista de
-- parámetros no reemplaza la función: crea una SOBRECARGA. Con las dos vivas,
-- PostgREST no sabe cuál llamar y responde 300 Multiple Choices — un fallo
-- que no se parece en nada a su causa. Por eso el DROP es explícito.
--
-- Las coordenadas SÓLO llegan si la ciudad vino del directorio. El CHECK
-- `chk_*_city_coords` de la 057 lo impone igualmente; aquí se respeta en vez
-- de rellenar huecos, que es lo mismo que hace el cliente.
-- ============================================================


-- ── 0. Precondiciones ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='technician_profiles'
      AND column_name='location_country_code'
  ) THEN
    RAISE EXCEPTION 'Falta location_country_code. Aplica antes la migración 057.';
  END IF;
END $$;


-- ── 1. El aeropuerto pasa a opcional ───────────────────────
ALTER TABLE public.technician_profiles ALTER COLUMN location_city_id DROP NOT NULL;
ALTER TABLE public.companies           ALTER COLUMN location_city_id DROP NOT NULL;
ALTER TABLE public.offers              ALTER COLUMN location_city_id DROP NOT NULL;


-- ── 2. signup_technician ───────────────────────────────────
--
-- Se dropea la firma vieja por su lista de tipos exacta: si mañana alguien
-- añade otra sobrecarga, este DROP seguirá apuntando a la que toca.
DROP FUNCTION IF EXISTS public.signup_technician(TEXT, TEXT, DATE, TEXT, TEXT, INTEGER, TEXT[]);

CREATE FUNCTION public.signup_technician(
  p_first_name               TEXT,
  p_last_name                TEXT,
  p_birth_date               DATE,
  p_technician_type          TEXT,
  p_location_country_code    TEXT,
  p_location_city_name       TEXT             DEFAULT NULL,
  p_location_city_lat        DOUBLE PRECISION DEFAULT NULL,
  p_location_city_lng        DOUBLE PRECISION DEFAULT NULL,
  p_location_city_geoname_id BIGINT           DEFAULT NULL,
  p_years_experience         INTEGER          DEFAULT NULL,
  p_technician_types         TEXT[]           DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_anon  TEXT;
  v_tid   UUID;
  v_types TEXT[];
  v_city  TEXT := NULLIF(btrim(COALESCE(p_location_city_name, '')), '');
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

  -- El país es obligatorio y tiene que existir y estar activo. Comprobarlo
  -- aquí da un mensaje que se entiende; dejarlo a la FK da uno que no.
  IF NOT EXISTS (
    SELECT 1 FROM location_countries
    WHERE code = p_location_country_code AND is_active
  ) THEN
    RAISE EXCEPTION 'Unknown or inactive country "%".', p_location_country_code;
  END IF;

  SELECT id INTO v_tid FROM technician_profiles WHERE user_id = v_uid;
  IF v_tid IS NOT NULL THEN
    RETURN v_tid;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  LOOP
    v_anon := 'T' || upper(left(replace(gen_random_uuid()::text, '-', ''), 9));
    BEGIN
      INSERT INTO technician_profiles (
        user_id, anonymous_code,
        first_name, last_name, email,
        birth_date, technician_type,
        location_country_code, location_city_name,
        location_city_lat, location_city_lng, location_city_geoname_id,
        years_experience
      ) VALUES (
        v_uid, v_anon,
        p_first_name, p_last_name, v_email,
        p_birth_date, v_types[1],
        p_location_country_code, v_city,
        -- Sin nombre de ciudad no puede haber punto: el CHECK lo rechazaría,
        -- y con razón — un pin que la UI no sabe etiquetar.
        CASE WHEN v_city IS NULL THEN NULL ELSE p_location_city_lat END,
        CASE WHEN v_city IS NULL THEN NULL ELSE p_location_city_lng END,
        CASE WHEN v_city IS NULL OR p_location_city_lat IS NULL THEN NULL ELSE p_location_city_geoname_id END,
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
DROP FUNCTION IF EXISTS public.signup_company(TEXT, TEXT, TEXT);

CREATE FUNCTION public.signup_company(
  p_company_name             TEXT,
  p_company_type             TEXT,
  p_location_country_code    TEXT,
  p_location_city_name       TEXT             DEFAULT NULL,
  p_location_city_lat        DOUBLE PRECISION DEFAULT NULL,
  p_location_city_lng        DOUBLE PRECISION DEFAULT NULL,
  p_location_city_geoname_id BIGINT           DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid   UUID := auth.uid();
  v_email TEXT;
  v_cid   UUID;
  v_city  TEXT := NULLIF(btrim(COALESCE(p_location_city_name, '')), '');
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM location_countries
    WHERE code = p_location_country_code AND is_active
  ) THEN
    RAISE EXCEPTION 'Unknown or inactive country "%".', p_location_country_code;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  INSERT INTO companies (
    name, company_type, email,
    location_country_code, location_city_name,
    location_city_lat, location_city_lng, location_city_geoname_id
  )
  VALUES (
    p_company_name, p_company_type, v_email,
    p_location_country_code, v_city,
    CASE WHEN v_city IS NULL THEN NULL ELSE p_location_city_lat END,
    CASE WHEN v_city IS NULL THEN NULL ELSE p_location_city_lng END,
    CASE WHEN v_city IS NULL OR p_location_city_lat IS NULL THEN NULL ELSE p_location_city_geoname_id END
  )
  RETURNING id INTO v_cid;

  INSERT INTO company_members (company_id, user_id, role)
  VALUES (v_cid, v_uid, 'admin');

  RETURN v_cid;
END;
$function$;


-- ── Post-condiciones ───────────────────────────────────────
DO $$
DECLARE
  v_count INT;
  v_def   TEXT;
BEGIN
  -- Una sola versión de cada función. Dos sobrecargas = 300 Multiple Choices
  -- en PostgREST, que es justo el fallo que el DROP explícito evita.
  FOR v_def IN SELECT unnest(ARRAY['signup_technician','signup_company']) LOOP
    SELECT count(*) INTO v_count
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname = v_def;
    IF v_count <> 1 THEN
      RAISE EXCEPTION '% tiene % versiones, debe tener exactamente 1.', v_def, v_count;
    END IF;
  END LOOP;

  -- Y siguen siendo SECURITY DEFINER: sin eso, un usuario recién registrado
  -- no tiene permiso para insertar su propio perfil.
  FOR v_def IN
    SELECT pg_get_functiondef(p.oid)
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname='public' AND p.proname IN ('signup_technician','signup_company')
  LOOP
    IF v_def NOT LIKE '%SECURITY DEFINER%' THEN
      RAISE EXCEPTION 'Una de las funciones de alta perdió SECURITY DEFINER.';
    END IF;
    IF v_def LIKE '%p_location_city_id%' THEN
      RAISE EXCEPTION 'Una de las funciones de alta sigue pidiendo el aeropuerto.';
    END IF;
  END LOOP;

  -- El aeropuerto es opcional ya, PERO la columna y su FK siguen ahí: su
  -- retirada es una migración posterior, no ésta.
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND column_name='location_city_id'
    AND table_name IN ('technician_profiles','companies','offers')
    AND is_nullable='YES';
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Sólo % de las 3 columnas location_city_id son nullable.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND column_name='location_city_id'
    AND table_name IN ('technician_profiles','companies','offers');
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'Se ha perdido alguna columna location_city_id. Su DROP no es de esta migración.';
  END IF;

  -- Y los 11 registros migrados conservan su aeropuerto y su país.
  SELECT count(*) INTO v_count
  FROM public.technician_profiles WHERE location_city_id IS NULL OR location_country_code IS NULL;
  IF v_count > 0 THEN
    RAISE EXCEPTION '% técnicos existentes han perdido localización.', v_count;
  END IF;

  RAISE NOTICE 'F2c: aeropuerto opcional, RPC de alta por país+ciudad, columnas y FK intactas.';
END $$;
