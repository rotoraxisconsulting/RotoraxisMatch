-- ============================================================
-- AviationJobTalent V2 — Migration 054: retirar license_code y
-- requirement_level de offer_required_habilitations
-- ============================================================
-- Created: 2026-08-10 (Fase 6, tanda D — docs/MISSION_PART66.md)
--
-- ⚠ NO APLICAR HASTA QUE EL CÓDIGO DE LA TANDA D ESTÉ DESPLEGADO. Es la
-- mitad de CONTRACCIÓN del expand-contract y va DESPUÉS del código — misma
-- regla que la 029, la 045, la 049 y la 052. `loadOfferRequirements` pide
-- las dos columnas por nombre en su SELECT: con el lector vivo, esta
-- migración no degrada nada, tumba el listado de ofertas entero.
--
-- Las sustituyen `offers.license_code` y `offers.requires_all_aircraft`
-- (migración 053). Cada fila queda como lo que de verdad es: UNA AERONAVE.
--
-- ⚠ ESTA MIGRACIÓN RECONSTRUYE LA PRIMARY KEY, y ése es su punto delicado.
-- La PK actual es (offer_id, license_code, aircraft_type_rating_id). Al
-- quitar `license_code`, Postgres DROPEA LA PK ENTERA por dependencia, con
-- un simple NOTICE — y la tabla se queda SIN clave primaria, admitiendo la
-- misma aeronave repetida N veces en la misma oferta. Por eso el DROP y el
-- ADD de la PK van explícitos aquí, en vez de dejar que ocurra solo.
--
-- La invariante de misma fila NO se relaja: es una regla sobre el TÉCNICO
-- (`technician_habilitations`, intacta, `license_code` sigue NOT NULL). Del
-- lado de la oferta desaparece la ambigüedad que la hacía necesaria, porque
-- con UNA licencia por oferta no hay dos entre las que confundirse. Ver la
-- explicación larga en la cabecera de la 053.
-- ============================================================


DO $$
DECLARE
  v_rows INT;
BEGIN
  SELECT count(*) INTO v_rows FROM public.offer_required_habilitations;
  IF v_rows > 0 THEN
    RAISE EXCEPTION
      'offer_required_habilitations tiene % filas. Comprueba que su license_code coincide con offers.license_code y que ninguna oferta pierde requisitos al colapsar la PK, antes de dropear.',
      v_rows;
  END IF;

  -- Las columnas que las sustituyen tienen que existir YA: dropear éstas
  -- antes de la 053 dejaría al sistema sin ninguna forma de expresar la
  -- licencia de una oferta.
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers' AND column_name='license_code'
  ) THEN
    RAISE EXCEPTION 'Falta offers.license_code. Aplica antes la migración 053.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers' AND column_name='requires_all_aircraft'
  ) THEN
    RAISE EXCEPTION 'Falta offers.requires_all_aircraft. Aplica antes la migración 053.';
  END IF;
END $$;


-- ── 1. PK fuera, explícitamente ────────────────────────────
ALTER TABLE public.offer_required_habilitations
  DROP CONSTRAINT IF EXISTS offer_required_habilitations_pkey;


-- ── 2. Las dos columnas ────────────────────────────────────
--
-- Se llevan consigo lo que colgaba de ellas:
--   license_code      -> offer_required_habilitations_license_code_fkey
--   requirement_level -> offer_required_habilitations_requirement_level_check
--
-- SIN CASCADE, misma filosofía RESTRICT que la 030/031/045/052: si algo más
-- dependiera, que Postgres aborte y lo averigüemos.
ALTER TABLE public.offer_required_habilitations
  DROP COLUMN IF EXISTS license_code;

ALTER TABLE public.offer_required_habilitations
  DROP COLUMN IF EXISTS requirement_level;


-- ── 2b. Y la tabla offer_required_licenses entera ──────────
--
-- No estaba en el encargo original de la tanda y aparece al implementarla:
-- `offers.license_code` no sólo sustituye a la columna de la tabla de
-- requisitos, también al CONJUNTO de categorías que la oferta pedía por su
-- lado (`offer_required_licenses`, que alimentaba
-- `OfferWithRequirements.requiredLicenses`). Las dos colapsan en la misma
-- columna: una licencia por oferta.
--
-- El commit de la tanda D deja de leerla (loadOfferRequirements) y de
-- escribirla (replaceRequirements) a la vez, así que llega aquí sin lectores
-- ni escritores. Dejarla viva sería mantener una tabla que nadie consulta y
-- que la próxima persona interpretaría como una segunda forma legítima de
-- expresar la licencia de una oferta.
DO $$
DECLARE
  v_rows INT;
BEGIN
  SELECT count(*) INTO v_rows FROM public.offer_required_licenses;
  IF v_rows > 0 THEN
    RAISE EXCEPTION
      'offer_required_licenses tiene % filas. Comprueba que cada una coincide con offers.license_code antes de dropearla.',
      v_rows;
  END IF;
END $$;

DROP TABLE IF EXISTS public.offer_required_licenses;


-- ── 3. PK nueva ────────────────────────────────────────────
--
-- (offer_id, aircraft_type_rating_id): una aeronave se pide UNA vez por
-- oferta. Sin esto la tabla admitiría el mismo A320 repetido, que en la UI
-- serían dos chips idénticos y en el scorer una evaluación duplicada.
ALTER TABLE public.offer_required_habilitations
  ADD CONSTRAINT offer_required_habilitations_pkey
  PRIMARY KEY (offer_id, aircraft_type_rating_id);


-- ── Post-condiciones ───────────────────────────────────────
DO $$
DECLARE
  v_pk TEXT;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offer_required_habilitations'
      AND column_name IN ('license_code', 'requirement_level')
  ) THEN
    RAISE EXCEPTION 'Alguna de las dos columnas sigue existiendo.';
  END IF;

  SELECT pg_get_constraintdef(oid) INTO v_pk
  FROM pg_constraint
  WHERE conrelid='public.offer_required_habilitations'::regclass AND contype='p';

  IF v_pk IS NULL THEN
    RAISE EXCEPTION 'La tabla se ha quedado SIN primary key: admitiría la misma aeronave repetida.';
  END IF;
  IF v_pk NOT LIKE '%offer_id%' OR v_pk NOT LIKE '%aircraft_type_rating_id%' THEN
    RAISE EXCEPTION 'La primary key no es (offer_id, aircraft_type_rating_id), es %.', v_pk;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name='offer_required_licenses'
  ) THEN
    RAISE EXCEPTION 'offer_required_licenses sigue existiendo.';
  END IF;

  -- Las dos FK compuestas de la 047 tienen que sobrevivir intactas: son las
  -- que impiden meter un helicóptero en una oferta de aviones.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.offer_required_habilitations'::regclass AND conname='orh_matches_offer'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.offer_required_habilitations'::regclass AND conname='orh_matches_rating'
  ) THEN
    RAISE EXCEPTION 'Se han perdido las FK compuestas de producto de la migración 047.';
  END IF;

  RAISE NOTICE 'offer_required_habilitations: cada fila es ahora UNA AERONAVE; PK y FK de producto verificadas.';
END $$;
