-- ============================================================
-- AviationJobTalent V2 — Migración 059: retirar offers.location_city
-- y offers.location_base_airport
-- ============================================================
-- Created: 2026-08-11 (Fase 7, tanda F2b — docs/MISSION_PART66.md)
--
-- ⚠ NO APLICAR HASTA QUE EL CÓDIGO DE F2b ESTÉ DESPLEGADO. Es la mitad de
-- CONTRACCIÓN del expand-contract y va DESPUÉS del código — misma regla que
-- la 029, la 045, la 049, la 052 y la 054. `OFFER_COLUMNS` en
-- offerRepository.ts pedía las dos por nombre en las SIETE consultas de
-- ofertas del fichero: con esos lectores vivos, esta migración no degrada
-- nada, tumba el listado de ofertas entero.
--
-- ── Qué las sustituye ──────────────────────────────────────
-- `offers.location_city_name` (migración 057) toma el relevo de
-- `location_city`. `location_base_airport` NO tiene sustituto y no lo
-- necesita: es un código de aeropuerto, y el modelo nuevo no habla de
-- aeropuertos. Muere con las pantallas en F2c.
--
-- Las dos eran COPIAS DENORMALIZADAS de lo que `location_city_id` ya
-- determina — verificado en vivo antes de escribir esto: 0 filas donde
-- `location_city` difiera de `location_airports.city`, 0 donde
-- `location_base_airport` difiera de COALESCE(iata, icao). `mapOfferRow` las
-- deriva ahora, que es lo que siempre debieron ser.
--
-- ── Por qué esto NO mueve ningún score ─────────────────────
-- El scorer resuelve la localización de la oferta con
-- `resolveLocationSnapshot({ locationCityId, country, city, baseAirport })`,
-- y `resolveAirportCity` prueba PRIMERO por `locationCityId`. Como esa
-- columna es NOT NULL con FK a `location_airports`, SIEMPRE resuelve, y los
-- otros tres argumentos no se miran nunca. Estas dos columnas son entradas
-- muertas del scorer.
--
-- No es una lectura del código: está comprobado sobre los 255 aeropuertos del
-- catálogo en `scripts/testLocation.ts` ("Scorer — quitar location_city y
-- location_base_airport no puede mover un score"), incluso pasando datos
-- contradictorios en esos tres argumentos.
-- ============================================================


-- ── Precondiciones ─────────────────────────────────────────
DO $$
DECLARE
  v_diff INT;
BEGIN
  -- Lo que las sustituye tiene que existir YA. Dropear antes de la 057
  -- dejaría a las ofertas sin ninguna forma de nombrar su ciudad.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers' AND column_name='location_city_name'
  ) THEN
    RAISE EXCEPTION 'Falta offers.location_city_name. Aplica antes la migración 057.';
  END IF;

  -- Y no puede perderse información: si alguna fila tuviera una ciudad que
  -- NO coincide con la del modelo nuevo, dropear la borraría de verdad.
  SELECT count(*) INTO v_diff
  FROM public.offers
  WHERE location_city IS DISTINCT FROM location_city_name;

  IF v_diff > 0 THEN
    RAISE EXCEPTION
      '% ofertas tienen location_city distinta de location_city_name. Reconcilia antes de dropear: el DROP borraría el dato.',
      v_diff;
  END IF;
END $$;


-- ── Las dos columnas ───────────────────────────────────────
--
-- SIN CASCADE, misma filosofía RESTRICT que la 030/031/045/052/054: si algo
-- más dependiera de ellas —una vista, un índice, un CHECK— que Postgres
-- aborte y lo averigüemos, en vez de llevárselo por delante en silencio.
ALTER TABLE public.offers DROP COLUMN IF EXISTS location_city;
ALTER TABLE public.offers DROP COLUMN IF EXISTS location_base_airport;


-- ── Post-condiciones ───────────────────────────────────────
DO $$
DECLARE
  v_left INT;
BEGIN
  SELECT count(*) INTO v_left
  FROM information_schema.columns
  WHERE table_schema='public' AND table_name='offers'
    AND column_name IN ('location_city', 'location_base_airport');
  IF v_left > 0 THEN
    RAISE EXCEPTION '% de las dos columnas sigue existiendo.', v_left;
  END IF;

  -- Lo que NO se puede haber llevado por delante: la FK del aeropuerto sigue
  -- viva (el scorer y 27 ficheros dependen de ella hasta F2c) y el país nuevo
  -- sigue siendo obligatorio.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers' AND column_name='location_city_id'
  ) THEN
    RAISE EXCEPTION 'Se ha perdido offers.location_city_id, que F2c todavía necesita.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers'
      AND column_name='location_country_code' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'offers.location_country_code ha dejado de ser NOT NULL.';
  END IF;

  RAISE NOTICE 'offers: location_city y location_base_airport retiradas; location_city_name toma el relevo.';
END $$;
