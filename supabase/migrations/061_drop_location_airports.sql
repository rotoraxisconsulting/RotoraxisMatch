-- ============================================================
-- AviationJobTalent V2 — Migración 061: retirar los aeropuertos
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F2d — docs/MISSION_PART66.md)
--
-- ⚠ NO APLICAR HASTA QUE EL CÓDIGO DE F2d ESTÉ DESPLEGADO. Es la
-- CONTRACCIÓN final de la Fase 7 y va DESPUÉS del código — misma regla y
-- mismo precedente que la 045, la 049, la 052, la 054 y la 059.
--
-- Retira, en este orden:
--   1. `location_city_id` de technician_profiles, companies y offers, con sus
--      3 FK. Son las ÚNICAS dependencias entrantes a `location_airports`
--      (verificado por confrelid contra la base viva, no supuesto).
--   2. `location_country_aliases`, el puente de la 055. Su ciclo de vida es
--      el de los aeropuertos: existía para traducir el texto libre de
--      `location_airports.country_name` a ISO, y sin esa tabla no traduce
--      nada.
--   3. `location_airports`, con sus 255 filas.
--
-- ── LA VISTA ES EL PUNTO DELICADO ──────────────────────────
-- `technician_public_view` es el ÚNICO objeto que depende de
-- `location_airports` (comprobado vía pg_depend/pg_rewrite). Sin recrearla,
-- el DROP de la tabla falla — o peor, con CASCADE se llevaría la vista
-- entera por delante, y con ella el gate de identidad del producto.
--
-- ⚠ Y RECREARLA SE LLEVA LOS GRANT. Ya mordió en la 040 y en la 049. Se
-- reponen explícitamente y las post-condiciones verifican los 3 grantees, los
-- 5 gates de identidad y el filtro de cuentas activas de la 024.
--
-- ⚠ NO se añade `security_invoker`: la desplegada tiene reloptions NULL, y su
-- gate no es RLS sino `is_active_user()` / `my_company_id()` más la cláusula
-- de la 024. Cambiarlo de paso sería mover la seguridad a escondidas.
--
-- Las 5 columnas derivadas del aeropuerto cambian de origen, no de nombre:
--   country      -> lc.name, por JOIN a `location_countries`. Sigue siendo el
--                   NOMBRE, como antes: cinco pantallas lo pintan tal cual
--                   («Valencia, Spain»), y devolver el código las dejaría
--                   diciendo «Valencia, ES». El JOIN mantiene el nombre AL DÍA
--                   —la 056 renombró 32 países— sin congelarlo en la fila.
--   city         -> tp.location_city_name
--   latitude     -> tp.location_city_lat       (NULL si la ciudad no vino del
--   longitude    -> tp.location_city_lng        directorio: el pin cae al país)
--   base_airport -> DESAPARECE. No tiene equivalente y no lo necesita.
--
-- ── LO QUE ESTA MIGRACIÓN NO TOCA ──────────────────────────
-- `offers.location_country` (el NOMBRE del país, TEXT NOT NULL) sobrevive:
-- sigue teniendo lectores en las pantallas de oferta. Es candidata de la
-- siguiente limpieza, no de ésta.
-- ============================================================


-- ── 0. Precondiciones ──────────────────────────────────────
DO $$
DECLARE
  v_missing INT;
  v_deps    TEXT;
BEGIN
  -- El modelo nuevo tiene que estar completo: sin esto, dropear el viejo deja
  -- a los 11 registros sin ninguna localización.
  SELECT
    (SELECT count(*) FROM public.technician_profiles WHERE location_country_code IS NULL)
  + (SELECT count(*) FROM public.companies           WHERE location_country_code IS NULL)
  + (SELECT count(*) FROM public.offers              WHERE location_country_code IS NULL)
  INTO v_missing;
  IF v_missing > 0 THEN
    RAISE EXCEPTION '% filas sin país. No se puede retirar el aeropuerto todavía.', v_missing;
  END IF;

  -- Y NADIE más puede estar apuntando a location_airports. Si apareciera una
  -- FK nueva, hay que enterarse aquí y no por un DROP que falla a medias.
  SELECT string_agg(c.conrelid::regclass || '.' || c.conname, ', ') INTO v_deps
  FROM pg_constraint c
  WHERE c.confrelid = 'public.location_airports'::regclass
    AND c.conrelid NOT IN (
      'public.technician_profiles'::regclass,
      'public.companies'::regclass,
      'public.offers'::regclass
    );
  IF v_deps IS NOT NULL THEN
    RAISE EXCEPTION 'Dependencias inesperadas hacia location_airports: %', v_deps;
  END IF;
END $$;


-- ── 1. La vista, sin el JOIN a aeropuertos ─────────────────
--
-- Se recrea ANTES de dropear la tabla: mientras la vista la nombre, el DROP
-- no puede ocurrir sin CASCADE, y CASCADE aquí se llevaría el gate de
-- identidad.
DROP VIEW IF EXISTS public.technician_public_view;

CREATE VIEW public.technician_public_view AS
  SELECT tp.id,
    tp.anonymous_code,
    tp.technician_type,
    -- Fase 7 F2d: mismos nombres de columna, otro origen. `base_airport` ya no
    -- está: el modelo nuevo no habla de aeropuertos.
    lc.name                  AS country,
    tp.location_city_name    AS city,
    tp.location_city_lat     AS latitude,
    tp.location_city_lng     AS longitude,
    tp.location_country_code,
    tp.location_city_name,
    tp.location_city_lat,
    tp.location_city_lng,
    tp.location_city_geoname_id,
    tp.availability,
    tp.verification_status,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.first_name
            ELSE NULL::text
        END AS first_name,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.last_name
            ELSE NULL::text
        END AS last_name,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.email
            ELSE NULL::text
        END AS email,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.phone
            ELSE NULL::text
        END AS phone,
        CASE
            WHEN offer_accepted_between(my_company_id(), tp.id) THEN tp.social_links
            ELSE NULL::jsonb
        END AS social_links,
    tp.years_experience
   FROM technician_profiles tp
     JOIN location_countries lc ON lc.code = tp.location_country_code
     JOIN profiles p ON p.id = tp.user_id
  WHERE is_active_user() AND (p.status = ANY (ARRAY['active'::user_status, 'pending_verification'::user_status]));

-- GRANTs recreados EXPLÍCITAMENTE (el DROP se los llevó), igual que en la
-- 040, la 049 y la 057.
GRANT ALL ON public.technician_public_view TO anon;
GRANT ALL ON public.technician_public_view TO authenticated;
GRANT ALL ON public.technician_public_view TO service_role;


-- ── 2. Las tres columnas, con sus FK ───────────────────────
--
-- SIN CASCADE, misma filosofía RESTRICT que la 030/031/045/052/054/059: si
-- algo más dependiera, que Postgres aborte y lo averigüemos.
ALTER TABLE public.technician_profiles DROP COLUMN IF EXISTS location_city_id;
ALTER TABLE public.companies           DROP COLUMN IF EXISTS location_city_id;
ALTER TABLE public.offers              DROP COLUMN IF EXISTS location_city_id;


-- ── 3. El puente de la 055 ─────────────────────────────────
--
-- Existía sólo para traducir `location_airports.country_name` a ISO durante
-- el backfill de la 057. Sin aeropuertos no traduce nada, y dejarlo vivo
-- sugeriría que sigue siendo una fuente de verdad sobre países — que no lo
-- es: ésa es `location_countries`.
DROP TABLE IF EXISTS public.location_country_aliases;


-- ── 4. El catálogo de aeropuertos ──────────────────────────
DROP TABLE IF EXISTS public.location_airports;


-- ── Post-condiciones ───────────────────────────────────────
DO $$
DECLARE
  v_count  INT;
  v_def    TEXT;
  v_gates  INT;
  v_grants INT;
BEGIN
  -- (1) Las tres tablas y sus dos compañeras, fuera.
  SELECT count(*) INTO v_count
  FROM information_schema.columns
  WHERE table_schema='public' AND column_name='location_city_id'
    AND table_name IN ('technician_profiles','companies','offers');
  IF v_count > 0 THEN
    RAISE EXCEPTION '% columnas location_city_id siguen existiendo.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM information_schema.tables
  WHERE table_schema='public' AND table_name IN ('location_airports','location_country_aliases');
  IF v_count > 0 THEN
    RAISE EXCEPTION '% de las dos tablas de aeropuertos siguen existiendo.', v_count;
  END IF;

  -- (2) Y lo que NO se puede haber llevado por delante: el catálogo de países
  -- y las 3 FK que lo referencian son el modelo nuevo entero.
  SELECT count(*) INTO v_count FROM public.location_countries;
  IF v_count <> 250 THEN
    RAISE EXCEPTION 'location_countries tiene % filas, se esperaban 250.', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM pg_constraint WHERE confrelid = 'public.location_countries'::regclass;
  IF v_count <> 3 THEN
    RAISE EXCEPTION
      'Quedan % FK hacia location_countries, se esperaban 3 (técnicos, empresas, ofertas).', v_count;
  END IF;

  -- (3) La vista: los 5 gates de identidad.
  v_def := pg_get_viewdef('public.technician_public_view'::regclass, true);

  SELECT count(*) INTO v_gates FROM regexp_matches(v_def, 'offer_accepted_between', 'g');
  IF v_gates <> 5 THEN
    RAISE EXCEPTION 'La vista tiene % gates de identidad, se esperaban 5.', v_gates;
  END IF;

  -- (4) El filtro de cuentas activas de la 024.
  IF v_def NOT LIKE '%is_active_user()%' OR v_def NOT LIKE '%pending_verification%' THEN
    RAISE EXCEPTION 'La vista perdió el filtro de cuentas activas de la migración 024.';
  END IF;

  -- (5) Y que de verdad no nombre ya los aeropuertos.
  IF v_def LIKE '%location_airports%' THEN
    RAISE EXCEPTION 'La vista sigue nombrando location_airports.';
  END IF;

  -- (6) Los GRANT, que es lo que el DROP se lleva por delante. 
  SELECT count(DISTINCT grantee) INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='technician_public_view'
    AND grantee IN ('anon','authenticated','service_role')
    AND privilege_type = 'SELECT';
  IF v_grants <> 3 THEN
    RAISE EXCEPTION
      'Sólo % de los 3 grantees tienen SELECT sobre la vista. El DROP se los llevó.', v_grants;
  END IF;

  -- (7) Y los 11 registros siguen teniendo localización.
  SELECT
    (SELECT count(*) FROM public.technician_profiles WHERE location_country_code IS NULL)
  + (SELECT count(*) FROM public.companies           WHERE location_country_code IS NULL)
  INTO v_count;
  IF v_count > 0 THEN
    RAISE EXCEPTION '% perfiles han perdido su país.', v_count;
  END IF;

  RAISE NOTICE 'Aeropuertos retirados. La localización es país + ciudad, y sólo eso.';
END $$;
