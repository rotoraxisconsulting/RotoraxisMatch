-- ============================================================
-- AviationJobTalent V2 — Migración 057: país + ciudad en
-- offers, technician_profiles y companies
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F2b — docs/MISSION_PART66.md)
--
-- Mitad de EXPANSIÓN del expand-contract. Sólo AÑADE y rellena: no borra
-- ninguna columna y no rompe ningún lector. Se aplica ANTES del código.
--
-- ⚠ LA RETIRADA DE offers.location_city Y offers.location_base_airport NO
-- ESTÁ AQUÍ, ESTÁ EN LA 058. El encargo las pedía en esta misma migración,
-- pero las dos son NOT NULL y HOY las lee `OFFER_COLUMNS` en
-- offerRepository.ts: dropearlas antes de desplegar el código no degrada
-- nada, tumba TODAS las consultas de ofertas — un SELECT que nombra una
-- columna inexistente falla entero. Es la regla de siempre del proyecto y su
-- propio precedente: 045, 049, 052 y 054 son todas contracciones separadas,
-- aplicadas después del código. Orden: 057 → código → 058.
--
-- ── El modelo nuevo ────────────────────────────────────────
--   location_country_code    -> location_countries, NOT NULL. Lo ÚNICO que
--                               puntuará (F2c).
--   location_city_name       -> texto, NULLABLE. La ciudad es OPCIONAL.
--   location_city_lat/lng    -> NULLABLE. Sólo si vino del directorio.
--   location_city_geoname_id -> NULLABLE, para trazar el origen.
--
-- La distinción de F2a se conserva aquí abajo: una ciudad elegida del
-- directorio trae coordenadas, una escrita a mano no. El CHECK la hace
-- imposible de romper — ver el bloque 3.
--
-- ── Los migrados van SIN coordenadas, y es deliberado ──────
-- El nombre de ciudad del backfill viene del AEROPUERTO, y las coordenadas
-- del aeropuerto NO son las de la ciudad: Barajas está a 12 km del centro de
-- Madrid, y Ciampino a 15 de Roma. Copiarlas daría un pin preciso y falso.
-- Se dejan a NULL: mientras el usuario no reelija su ciudad del directorio,
-- F2c encuadra el país. Un pin menos preciso es mejor que uno preciso y
-- mentiroso.
--
-- ── location_city_id NO SE TOCA ────────────────────────────
-- Las tres columnas siguen ahí, NOT NULL y con su FK. Su DROP y el de
-- location_airports van después del código de F2c. Hoy hay 27 ficheros
-- apuntando ahí, incluido el scorer.
-- ============================================================


-- ── 0. Precondiciones ──────────────────────────────────────
--
-- El puente de la 055 tiene que estar y tiene que cubrir. Sin él el backfill
-- no puede resolver ni un país, y prefiero enterarme aquí que a media
-- migración.
DO $$
DECLARE
  v_missing TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='location_country_aliases'
  ) THEN
    RAISE EXCEPTION 'Falta location_country_aliases. Aplica antes la migración 055.';
  END IF;

  SELECT string_agg(DISTINCT la.country_name, ', ') INTO v_missing
  FROM public.location_airports la
  LEFT JOIN public.location_country_aliases a ON a.country_name = la.country_name
  WHERE a.country_code IS NULL;

  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Estos países de location_airports no tienen código ISO: %', v_missing;
  END IF;
END $$;


-- ── 1. Las columnas, nullable de momento ───────────────────
--
-- Nullable primero y NOT NULL al final, después del backfill: al revés
-- Postgres rechaza el ALTER en cuanto hay una sola fila.
ALTER TABLE public.technician_profiles
  ADD COLUMN IF NOT EXISTS location_country_code    TEXT,
  ADD COLUMN IF NOT EXISTS location_city_name       TEXT,
  ADD COLUMN IF NOT EXISTS location_city_lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city_lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city_geoname_id BIGINT;

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS location_country_code    TEXT,
  ADD COLUMN IF NOT EXISTS location_city_name       TEXT,
  ADD COLUMN IF NOT EXISTS location_city_lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city_lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city_geoname_id BIGINT;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS location_country_code    TEXT,
  ADD COLUMN IF NOT EXISTS location_city_name       TEXT,
  ADD COLUMN IF NOT EXISTS location_city_lat        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city_lng        DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS location_city_geoname_id BIGINT;


-- ── 2. Backfill desde el aeropuerto, vía el puente ─────────
--
-- `WHERE location_country_code IS NULL` hace la migración re-aplicable sin
-- pisar una ciudad que el usuario ya haya reelegido del directorio.
-- Las coordenadas se dejan a NULL a propósito (ver cabecera).
UPDATE public.technician_profiles tp
SET location_country_code = a.country_code,
    location_city_name    = la.city
FROM public.location_airports la
JOIN public.location_country_aliases a ON a.country_name = la.country_name
WHERE la.id = tp.location_city_id
  AND tp.location_country_code IS NULL;

UPDATE public.companies co
SET location_country_code = a.country_code,
    location_city_name    = la.city
FROM public.location_airports la
JOIN public.location_country_aliases a ON a.country_name = la.country_name
WHERE la.id = co.location_city_id
  AND co.location_country_code IS NULL;

UPDATE public.offers o
SET location_country_code = a.country_code,
    location_city_name    = la.city
FROM public.location_airports la
JOIN public.location_country_aliases a ON a.country_name = la.country_name
WHERE la.id = o.location_city_id
  AND o.location_country_code IS NULL;


-- El guardián. Si una sola fila se quedó sin país, se aborta: poner NOT NULL
-- encima fallaría igual, pero con un mensaje de Postgres que no dice CUÁL.
DO $$
DECLARE
  v_t INT; v_c INT; v_o INT;
BEGIN
  SELECT count(*) INTO v_t FROM public.technician_profiles WHERE location_country_code IS NULL;
  SELECT count(*) INTO v_c FROM public.companies           WHERE location_country_code IS NULL;
  SELECT count(*) INTO v_o FROM public.offers              WHERE location_country_code IS NULL;

  IF v_t + v_c + v_o > 0 THEN
    RAISE EXCEPTION
      'Sin país tras el backfill: % técnicos, % empresas, % ofertas. Revisa location_country_aliases antes de seguir.',
      v_t, v_c, v_o;
  END IF;
END $$;


-- ── 3. Las reglas del modelo ───────────────────────────────
--
-- El país pasa a obligatorio y referenciado. La ciudad sigue opcional.
ALTER TABLE public.technician_profiles ALTER COLUMN location_country_code SET NOT NULL;
ALTER TABLE public.companies           ALTER COLUMN location_country_code SET NOT NULL;
ALTER TABLE public.offers              ALTER COLUMN location_country_code SET NOT NULL;

ALTER TABLE public.technician_profiles
  DROP CONSTRAINT IF EXISTS technician_profiles_location_country_code_fkey,
  ADD  CONSTRAINT technician_profiles_location_country_code_fkey
       FOREIGN KEY (location_country_code) REFERENCES public.location_countries(code);

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_location_country_code_fkey,
  ADD  CONSTRAINT companies_location_country_code_fkey
       FOREIGN KEY (location_country_code) REFERENCES public.location_countries(code);

ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS offers_location_country_code_fkey,
  ADD  CONSTRAINT offers_location_country_code_fkey
       FOREIGN KEY (location_country_code) REFERENCES public.location_countries(code);


-- El CHECK que hace imposible la fila incoherente. Cuatro invariantes, y
-- ninguna es decorativa:
--
--   a) lat y lng van juntas o no van. Media coordenada no ubica nada.
--   b) coordenadas EXIGEN nombre de ciudad. Un punto sin ciudad es un pin
--      que la UI no sabe etiquetar. Es lo que pedía el encargo.
--   c) geoname_id exige coordenadas. Ese id sólo existe si la ciudad vino
--      del directorio, y del directorio no sale nada sin coordenadas — el
--      envoltorio de F2a descarta esas filas. Una fila "trazada al
--      directorio" pero sin punto sería mentira sobre su propio origen.
--   d) rangos. Una latitud de 999 entra en un DOUBLE PRECISION sin rechistar
--      y sale como un pin en ninguna parte.
--
-- Juntas dejan exactamente dos formas válidas de tener ciudad, que son las
-- dos de `CitySelection` en F2a: del directorio (nombre + coordenadas
-- [+ geoname_id]) o a mano (sólo nombre).
DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['technician_profiles', 'companies', 'offers'] LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT IF EXISTS chk_%s_city_coords', t, t);
    EXECUTE format($f$
      ALTER TABLE public.%I ADD CONSTRAINT chk_%s_city_coords CHECK (
             (location_city_lat IS NULL) = (location_city_lng IS NULL)
        AND (location_city_lat        IS NULL OR location_city_name IS NOT NULL)
        AND (location_city_geoname_id IS NULL OR location_city_lat  IS NOT NULL)
        AND (location_city_lat IS NULL OR location_city_lat BETWEEN  -90 AND  90)
        AND (location_city_lng IS NULL OR location_city_lng BETWEEN -180 AND 180)
      )
    $f$, t, t);
  END LOOP;
END $$;


-- ── 4. Índices ─────────────────────────────────────────────
--
-- Sólo donde se va a buscar por país en F2c: el listado de técnicos y el de
-- ofertas. `companies` no se filtra por localización en ninguna pantalla.
CREATE INDEX IF NOT EXISTS idx_technician_profiles_location_country
  ON public.technician_profiles(location_country_code);
CREATE INDEX IF NOT EXISTS idx_offers_location_country
  ON public.offers(location_country_code);


-- ── 5. La vista pública ────────────────────────────────────
--
-- ⚠ EL DROP SE LLEVA LOS GRANT POR DELANTE. Ya mordió en la 040 y en la 049.
-- Se recrean explícitamente abajo, y las post-condiciones los verifican.
--
-- ⚠ Y NO SE AÑADE `security_invoker`. La desplegada tiene reloptions NULL
-- (verificado en vivo antes de escribir esto). Su gate no es RLS, son
-- `is_active_user()` / `my_company_id()` y la cláusula de la 024. Cambiar eso
-- de paso, en una migración que va de localización, sería mover la seguridad
-- a escondidas.
--
-- Definición copiada VERBATIM de la desplegada (pg_get_viewdef contra
-- rotoaxismatch-dev), MÁS las cinco columnas nuevas. Los cinco CASE WHEN de
-- identidad, los dos JOIN y el WHERE de la 024 quedan intactos.
--
-- `country`, `city`, `base_airport`, `latitude` y `longitude` (derivadas del
-- aeropuerto) SE QUEDAN: las pantallas siguen leyéndolas hasta F2c. Las
-- nuevas se llaman `location_*` para que no haya duda de cuál es cuál.
DROP VIEW IF EXISTS public.technician_public_view;

CREATE VIEW public.technician_public_view AS
  SELECT tp.id,
    tp.anonymous_code,
    tp.technician_type,
    tp.location_city_id,
    loc.country_name AS country,
    loc.city,
    COALESCE(loc.iata, loc.icao) AS base_airport,
    loc.latitude,
    loc.longitude,
    -- Fase 7 F2b: el modelo nuevo, junto al viejo hasta que F2c lo retire.
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
     JOIN location_airports loc ON loc.id = tp.location_city_id
     JOIN profiles p ON p.id = tp.user_id
  WHERE is_active_user() AND (p.status = ANY (ARRAY['active'::user_status, 'pending_verification'::user_status]));

-- GRANTs recreados EXPLÍCITAMENTE (el DROP se los llevó). Réplica exacta de
-- lo que había, igual que en la 040 y la 049.
GRANT ALL ON public.technician_public_view TO anon;
GRANT ALL ON public.technician_public_view TO authenticated;
GRANT ALL ON public.technician_public_view TO service_role;


-- ── Post-condiciones ───────────────────────────────────────
--
-- Lo que se comprueba aquí es exactamente lo que esta migración puede
-- romper en silencio: datos perdidos en el backfill, gates de identidad
-- caídos al recrear la vista, y GRANTs evaporados por el DROP.
DO $$
DECLARE
  v_rows      INT;
  v_def       TEXT;
  v_gates     INT;
  v_grants    INT;
  v_cols      INT;
BEGIN
  -- (1) Backfill: ninguna fila sin país, y ninguna sin ciudad — las 11
  -- vienen de un aeropuerto, que siempre tiene ciudad.
  SELECT
    (SELECT count(*) FROM public.technician_profiles WHERE location_country_code IS NULL OR location_city_name IS NULL)
  + (SELECT count(*) FROM public.companies           WHERE location_country_code IS NULL OR location_city_name IS NULL)
  + (SELECT count(*) FROM public.offers              WHERE location_country_code IS NULL OR location_city_name IS NULL)
  INTO v_rows;
  IF v_rows > 0 THEN
    RAISE EXCEPTION '% filas se quedaron sin país o sin ciudad tras el backfill.', v_rows;
  END IF;

  -- (2) Y ninguna con coordenadas: los migrados van sin ellas, a propósito.
  SELECT
    (SELECT count(*) FROM public.technician_profiles WHERE location_city_lat IS NOT NULL)
  + (SELECT count(*) FROM public.companies           WHERE location_city_lat IS NOT NULL)
  + (SELECT count(*) FROM public.offers              WHERE location_city_lat IS NOT NULL)
  INTO v_rows;
  IF v_rows > 0 THEN
    RAISE EXCEPTION
      '% filas migradas tienen coordenadas. El backfill no debe copiar las del aeropuerto: no son las de la ciudad.',
      v_rows;
  END IF;

  -- (3) La vista: los 5 gates de identidad siguen ahí.
  v_def := pg_get_viewdef('public.technician_public_view'::regclass, true);

  SELECT count(*) INTO v_gates
  FROM regexp_matches(v_def, 'offer_accepted_between', 'g');
  IF v_gates <> 5 THEN
    RAISE EXCEPTION
      'La vista tiene % gates de identidad, se esperaban 5 (first_name, last_name, email, phone, social_links).',
      v_gates;
  END IF;

  -- (4) Y el filtro de cuentas activas de la 024.
  IF v_def NOT LIKE '%is_active_user()%' OR v_def NOT LIKE '%pending_verification%' THEN
    RAISE EXCEPTION 'La vista perdió el filtro de cuentas activas de la migración 024.';
  END IF;

  -- (5) Las columnas nuevas llegaron a la vista.
  SELECT count(*) INTO v_cols
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='technician_public_view'
    AND column_name IN ('location_country_code','location_city_name','location_city_lat','location_city_lng','location_city_geoname_id');
  IF v_cols <> 5 THEN
    RAISE EXCEPTION 'La vista expone % de las 5 columnas nuevas.', v_cols;
  END IF;

  -- (6) Los GRANT, que es lo que el DROP se lleva por delante.
  SELECT count(DISTINCT grantee) INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='technician_public_view'
    AND grantee IN ('anon','authenticated','service_role')
    AND privilege_type = 'SELECT';
  IF v_grants <> 3 THEN
    RAISE EXCEPTION
      'Sólo % de los 3 grantees (anon/authenticated/service_role) tienen SELECT sobre la vista. El DROP se los llevó.',
      v_grants;
  END IF;

  RAISE NOTICE
    'F2b expandido: país+ciudad en las 3 tablas, 0 filas sin país, 0 con coordenadas migradas, vista con 5 gates y 3 grants.';
END $$;
