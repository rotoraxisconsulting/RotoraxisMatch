-- ============================================================
-- AviationJobTalent V2 — Migration 051: la oferta declara si hay que
-- certificar, y tiene UN SOLO tipo de perfil
-- ============================================================
-- Created: 2026-08-10 (Fase 6, tanda C — docs/MISSION_PART66.md)
--
-- Dos cambios, una misma idea: **una oferta afirma una sola cosa**, y lo que
-- exige es propiedad del PUESTO, no de la etiqueta de quien lo ocupa.
--
-- ── 1. requires_certification ──────────────────────────────
--   Hoy una oferta no puede decir "busco un ayudante para el A320, sin
--   licencia". La única forma de expresar algo parecido era elegir tipos de
--   perfil no licenciados, con lo que el TIPO acababa gobernando si hacía
--   falta licencia. Eso es exactamente lo que la Fase 6 deshace: un mecánico
--   puede no tener licencia y seguir siendo mecánico (tanda A), y desde la
--   tanda B puede declarar experiencia sin ella. Faltaba el lado de la
--   oferta.
--
--   DEFAULT true a propósito: conserva el significado actual. Toda oferta
--   existente (0 hoy en dev) y toda oferta creada por un cliente antiguo
--   siguen exigiendo certificación, que es lo que exigían antes de existir
--   la columna. Ningún score se mueve al desplegar.
--
-- ── 2. technician_type, uno solo ───────────────────────────
--   Una oferta que pide mecánico Y pintor son dos puestos en un anuncio.
--   Misma regla que ya se aplicó a la licencia (una por oferta), al producto
--   (migración 047: aviones o helicópteros, nunca ambos) y ahora a la
--   certificación.
--
--   Sustituye a la tabla puente `offer_required_technician_types`, que se
--   retira en la migración 052 — DESPUÉS del código, nunca antes. Es la
--   misma regla de la 029, la 045 y la 049: PostgREST no ignora una tabla o
--   columna que ha dejado de existir, tumba la consulta entera.
--
-- SIN BACKFILL, y con guardas que abortan si eso deja de ser cierto:
-- verificado en vivo antes de escribir esto, `offers` = 0 filas y
-- `offer_required_technician_types` = 0 filas.
-- ============================================================


-- ── Guardas previas ────────────────────────────────────────
--
-- Van ANTES de tocar nada: si algún día esta migración se ejecuta contra una
-- base con ofertas reales, tiene que abortar y obligar a escribir el backfill
-- a mano, no inventar un tipo de perfil por su cuenta.
DO $$
DECLARE
  v_offers INT;
  v_bridge INT;
BEGIN
  SELECT count(*) INTO v_offers FROM public.offers;
  SELECT count(*) INTO v_bridge FROM public.offer_required_technician_types;

  IF v_offers > 0 OR v_bridge > 0 THEN
    RAISE EXCEPTION
      'Esta migración asume 0 ofertas y 0 filas puente (encontré % y %). Escribe el backfill de offers.technician_type antes de aplicarla.',
      v_offers, v_bridge;
  END IF;
END $$;


-- ── 1. requires_certification ──────────────────────────────

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS requires_certification BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN public.offers.requires_certification IS
  '¿El puesto exige poder CERTIFICAR el trabajo (licencia EASA en vigor)? '
  'Fase 6 tanda C. DEFAULT true conserva el significado previo a la columna. '
  'En la tanda C se guarda y se muestra pero NO cambia el scoring; que el '
  'scorer elija la fuente de evidencia según este booleano es la Tanda E.';


-- ── 2. technician_type ─────────────────────────────────────
--
-- Se añade NULLABLE y se pasa a NOT NULL en dos pasos, con la guarda de
-- arriba garantizando que no hay filas que rellenar. Un ADD COLUMN NOT NULL
-- sin DEFAULT sobre una tabla con filas fallaría; hacerlo en dos pasos deja
-- la migración correcta también el día que la tabla no esté vacía (fallaría
-- en la guarda, que es donde debe fallar, con un mensaje que explica qué
-- hacer).
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS technician_type TEXT REFERENCES public.technician_types(code);

ALTER TABLE public.offers
  ALTER COLUMN technician_type SET NOT NULL;

COMMENT ON COLUMN public.offers.technician_type IS
  'UN SOLO tipo de perfil por oferta (Fase 6 tanda C). Sustituye a la tabla '
  'puente offer_required_technician_types, retirada en la migración 052. '
  'Pedir dos tipos a la vez eran dos puestos en un anuncio.';

CREATE INDEX IF NOT EXISTS idx_offers_technician_type
  ON public.offers (technician_type);


-- ── La tabla puente NO se toca aquí ────────────────────────
--
-- `offer_required_technician_types` sigue existiendo con sus 5 políticas RLS
-- hasta la migración 052. Entre este despliegue y aquél queda viva y vacía:
-- el código de la tanda C deja de leerla y de escribirla en el mismo commit,
-- así que no acumula filas huérfanas.


-- ── Post-condiciones ───────────────────────────────────────

DO $$
DECLARE
  v_default TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers'
      AND column_name='requires_certification' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'offers.requires_certification no existe o admite NULL.';
  END IF;

  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='offers' AND column_name='requires_certification';
  IF v_default IS DISTINCT FROM 'true' THEN
    RAISE EXCEPTION 'El DEFAULT de requires_certification debe ser true para conservar el significado previo, es %.', v_default;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers'
      AND column_name='technician_type' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'offers.technician_type no existe o admite NULL.';
  END IF;

  -- La FK al catálogo: sin ella la columna admitiría cualquier cadena y el
  -- selector de la UI sería la única validación.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.offers'::regclass AND contype='f'
      AND pg_get_constraintdef(oid) LIKE '%technician_type%technician_types(code)%'
  ) THEN
    RAISE EXCEPTION 'Falta la FK de offers.technician_type a technician_types(code).';
  END IF;

  RAISE NOTICE 'offers: requires_certification (NOT NULL DEFAULT true) y technician_type (NOT NULL, FK) listas.';
END $$;
