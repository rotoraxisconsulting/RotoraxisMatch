-- ============================================================
-- AviationJobTalent V2 — Migration 053: una licencia por oferta, y la
-- exigencia sobre las aeronaves como decisión de la oferta
-- ============================================================
-- Created: 2026-08-10 (Fase 6, tanda D — docs/MISSION_PART66.md)
--
-- ── 1. offers.license_code ─────────────────────────────────
--   Hoy cada fila de `offer_required_habilitations` lleva su propia
--   `license_code`, así que una oferta puede pedir B1.3 y B2 a la vez —
--   mecánico y aviónico, dos profesiones distintas. Misma regla que ya se
--   aplicó al tipo de perfil (tanda C), al producto (047) y a la
--   certificación: si son dos puestos, son dos ofertas.
--
--   NULLABLE, no NOT NULL, y el CHECK explica por qué: en la tanda C se
--   fijó que una oferta con `requires_certification = false` NO PUEDE
--   exigir licencia. Una columna NOT NULL obligaría a esas ofertas a
--   nombrar una licencia inventada que el propio repositorio rechaza como
--   requisito. "Una sola licencia" se cumple igual — la columna es escalar;
--   lo que el CHECK añade es que esa licencia exista exactamente cuando la
--   oferta dice que hace falta certificar.
--
--   Efecto secundario que el CHECK evita, y que motivó revisar esto:
--   `getMatchScoreWeights` elige entre QUALIFICATION_WEIGHTS (escala 100) y
--   NO_REQUIREMENTS_WEIGHTS (escala 75) según si la oferta nombra licencia o
--   aeronaves. Con `license_code` obligatoria en TODAS, la segunda tabla se
--   quedaba sin uso y toda oferta sin certificar saltaba de 75 a 100 — es
--   decir, la migración habría cambiado el scorer por la puerta de atrás.
--
-- ── 2. offers.requires_all_aircraft ────────────────────────
--   Hoy cada fila lleva `requirement_level` (mandatory/preferred) y nadie
--   entiende cómo se combinan varias: la empresa mete tres aeronaves
--   creyendo que exige las tres, y el scorer se queda con la mejor
--   (`bestTier`), así que basta con una. La empresa nunca se entera de lo
--   que ha pedido.
--
--   DEFAULT false = "basta con una", que es la respuesta esperada en la
--   mayoría de casos Y el comportamiento actual del scorer. `true` = hacen
--   falta todas, y es lo que hereda el cap que hoy dispara `mandatory`.
--
-- ⚠ LA INVARIANTE DE MISMA FILA NO SE ROMPE. Léelo antes de asustarte:
--   CLAUDE.md protege que licencia y aeronave viajen JUNTAS EN LA MISMA FILA
--   para no combinar "tiene B1.1" con "tiene A320" y concluir "tiene B1.1 en
--   A320". Esa invariante es sobre el TÉCNICO — `technician_habilitations`,
--   que NO SE TOCA aquí y cuya `license_code` sigue NOT NULL.
--
--   Del lado de la OFERTA deja de hacer falta, y no por relajarla sino
--   porque desaparece la ambigüedad que la hacía necesaria: con UNA sola
--   licencia por oferta, cada aeronave listada se cruza con esa licencia y
--   no hay ninguna otra con la que confundirla. No hay dos licencias entre
--   las que elegir mal. El emparejamiento sigue siendo exacto en el scorer
--   (evaluateHabilitationRequirement compara contra las filas del técnico
--   que tienen ESA licencia), sólo que la licencia ahora viene de la oferta
--   en vez de repetirse en cada fila.
--
-- Las columnas que sobran de `offer_required_habilitations`
-- (`license_code`, `requirement_level`) se retiran en la migración 054,
-- DESPUÉS del código. Misma regla que la 029, la 045, la 049 y la 052.
--
-- SIN BACKFILL: 0 ofertas y 0 filas de requisitos, verificado en vivo. Las
-- guardas abortan si eso deja de ser cierto.
-- ============================================================


-- ── Guardas previas ────────────────────────────────────────
DO $$
DECLARE
  v_offers INT;
  v_reqs   INT;
BEGIN
  SELECT count(*) INTO v_offers FROM public.offers;
  SELECT count(*) INTO v_reqs   FROM public.offer_required_habilitations;

  IF v_offers > 0 OR v_reqs > 0 THEN
    RAISE EXCEPTION
      'Esta migración asume 0 ofertas y 0 requisitos (encontré % y %). Escribe el backfill de offers.license_code antes de aplicarla: hay que elegir UNA licencia por oferta entre las que hoy tiene repartidas por filas, y eso es una decisión de producto, no algo que la migración pueda inventar.',
      v_offers, v_reqs;
  END IF;
END $$;


-- ── 1. offers.license_code ─────────────────────────────────

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS license_code TEXT REFERENCES public.license_categories(code);

COMMENT ON COLUMN public.offers.license_code IS
  'UNA sola licencia por oferta (Fase 6 tanda D). NULL exactamente cuando '
  'requires_certification = false: una oferta que no exige certificar no '
  'puede exigir licencia (invariante de la tanda C). Sustituye a '
  'offer_required_habilitations.license_code, retirada en la 054.';

-- El CHECK sube a la base la invariante que hasta ahora sólo vivía en
-- assertRequirementsMatchCertification (offerRepository). Que el repositorio
-- la imponga sigue siendo útil — da un mensaje legible en vez de un error de
-- constraint — pero un CHECK no se puede saltar desde otro camino de
-- escritura, y una invariante que sólo vive en TypeScript no es una
-- invariante, es una costumbre.
ALTER TABLE public.offers
  DROP CONSTRAINT IF EXISTS chk_offers_license_matches_certification;

ALTER TABLE public.offers
  ADD CONSTRAINT chk_offers_license_matches_certification CHECK (
    (requires_certification AND license_code IS NOT NULL)
    OR (NOT requires_certification AND license_code IS NULL)
  );


-- ── 2. offers.requires_all_aircraft ────────────────────────

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS requires_all_aircraft BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.offers.requires_all_aircraft IS
  'false (por defecto) = basta con UNA de las aeronaves listadas; true = '
  'hacen falta TODAS. Fase 6 tanda D: sustituye a '
  'offer_required_habilitations.requirement_level (mandatory/preferred), '
  'que se evaluaba por fila y cuya combinación nadie entendía — el scorer se '
  'quedaba con la mejor coincidencia, así que "tres obligatorias" en la '
  'práctica significaba "una cualquiera".';


-- ── Post-condiciones ───────────────────────────────────────

DO $$
DECLARE
  v_default TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers'
      AND column_name='license_code' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'offers.license_code debe existir y ser NULLABLE (ver el CHECK).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid='public.offers'::regclass
      AND conname='chk_offers_license_matches_certification'
  ) THEN
    RAISE EXCEPTION 'Falta chk_offers_license_matches_certification.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='offers'
      AND column_name='requires_all_aircraft' AND is_nullable='NO'
  ) THEN
    RAISE EXCEPTION 'offers.requires_all_aircraft no existe o admite NULL.';
  END IF;

  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name='offers' AND column_name='requires_all_aircraft';
  IF v_default IS DISTINCT FROM 'false' THEN
    RAISE EXCEPTION 'El DEFAULT de requires_all_aircraft debe ser false ("basta con una"), es %.', v_default;
  END IF;

  -- La promesa que más importa de esta tanda: el lado del TÉCNICO intacto.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='technician_habilitations'
      AND column_name='license_code' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'technician_habilitations.license_code ha pasado a NULLABLE. La invariante de misma fila del TÉCNICO no se toca en esta tanda.';
  END IF;

  RAISE NOTICE 'offers: license_code (nullable + CHECK) y requires_all_aircraft (NOT NULL DEFAULT false) listas.';
END $$;
