-- ============================================================
-- 032 — technician_profiles.years_experience + exponerlo en
--        technician_public_view (para el filtro duro server-side)
--
-- Sub-fase de experiencia (misión Part-66). Fecha: 2026-07-28.
-- Rationale completo: docs/MISSION_PART66.md, "Sub-fase de experiencia".
--
-- Sustituye a technician_aircraft_experience (retirada en la 031) por UN
-- único número declarado por el técnico.
--
-- ── Por qué una columna y no la suma de habilitations.experience_years ──
-- Tres razones, la tercera es la decisiva:
--   1. Una suma DOBLE-CUENTA experiencia concurrente (5 años en A320 + 5 en
--      B737 pueden ser los mismos 5 años). Tolerable para una etiqueta;
--      inaceptable para un filtro que excluye gente.
--   2. Una suma es un agregado sobre una tabla hija, así que no se puede
--      filtrar con `.gte()` en la consulta: haría imposible el requisito de
--      filtro server-side.
--   3. Una suma NO PUEDE expresar la regla de producto. Sumar nada da 0,
--      indistinguible de "declaré 0 años". La regla es que la AUSENCIA DE
--      DATO NUNCA PENALIZA, y eso exige distinguir NULL de 0.
--
-- NULL  = no declarado → PASA cualquier filtro, la UI muestra "not specified"
-- 0..N  = declarado    → se excluye si está por debajo del mínimo de la oferta
--
-- NO puntúa. El componente `experience` del score se ha eliminado; sus 10
-- puntos (15 en la rama sin requisitos) se han redistribuido.
--
-- Idempotente: segura de re-ejecutar.
-- ============================================================


-- ── A. La columna ─────────────────────────────────────────────────────
-- NULLABLE a propósito, sin DEFAULT: un DEFAULT 0 destruiría la distinción
-- entre "no declarado" y "declarado sin experiencia", que es justo lo que
-- hace implementable la regla de ausencia. No le pongas DEFAULT.

ALTER TABLE public.technician_profiles
  ADD COLUMN IF NOT EXISTS years_experience INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.technician_profiles'::regclass
      AND conname  = 'chk_technician_years_experience_range'
  ) THEN
    ALTER TABLE public.technician_profiles
      ADD CONSTRAINT chk_technician_years_experience_range
      CHECK (years_experience IS NULL OR (years_experience >= 0 AND years_experience <= 70));
  END IF;
END $$;

COMMENT ON COLUMN public.technician_profiles.years_experience IS
  'Años TOTALES de carrera, autodeclarados por el técnico. NULL = no declarado (distinto de 0 = declarado sin experiencia): esa distinción implementa la regla "la ausencia de dato nunca penaliza" del filtro duro por offer.min_years_experience. Dato VISUAL y FILTRABLE, nunca puntuable — el componente experience del match score fue eliminado en esta misma sub-fase.';


-- ── B. La vista ───────────────────────────────────────────────────────
-- Recreada para añadir UNA columna. El resto se reproduce EXACTAMENTE como
-- estaba (obtenido de pg_get_viewdef antes de escribir esto), incluidos:
--   - el gate de identidad por offer_accepted_between() en los 5 campos
--     privados (first_name, last_name, email, phone, social_links);
--   - **la exclusión de perfiles no activos que introdujo la migración 024**
--     (`WHERE is_active_user() AND p.status IN ('active','pending_verification')`).
--
-- Esa cláusula WHERE es exactamente el tipo de garantía que se pierde en una
-- recreación descuidada. El paso C la verifica DESPUÉS de aplicar, contra el
-- catálogo, no contra el diff de este fichero.
--
-- `years_experience` va AL FINAL de la lista, no junto a `availability` donde
-- encajaría mejor por legibilidad: `CREATE OR REPLACE VIEW` solo permite
-- AÑADIR columnas al final, nunca insertarlas en medio ni reordenarlas
-- (falla con "cannot change name of view column"). La alternativa —DROP +
-- CREATE— perdería los GRANT de la vista, así que no compensa por estética.
-- El orden es irrelevante para la app: PUBLIC_SELECT selecciona por nombre.

CREATE OR REPLACE VIEW public.technician_public_view AS
 SELECT tp.id,
    tp.anonymous_code,
    compute_age(tp.birth_date) AS age,
    tp.technician_type,
    tp.location_city_id,
    loc.country_name AS country,
    loc.city,
    COALESCE(loc.iata, loc.icao) AS base_airport,
    loc.latitude,
    loc.longitude,
    tp.availability,
    tp.verification_status,
    tp.profile_completeness,
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


-- ── C. Comprobación de post-condiciones ───────────────────────────────
-- Verifica contra el CATÁLOGO lo que la recreación pudo haber perdido.

DO $$
DECLARE
  has_col        BOOLEAN;
  view_has_col   BOOLEAN;
  viewdef        TEXT;
  privacy_gates  INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='technician_profiles'
                   AND column_name='years_experience' AND is_nullable='YES') INTO has_col;
  IF NOT has_col THEN
    RAISE EXCEPTION '032 incompleta: technician_profiles.years_experience no existe o no es NULLABLE. El NULL es la regla de producto, no un detalle.';
  END IF;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='technician_public_view'
                   AND column_name='years_experience') INTO view_has_col;
  IF NOT view_has_col THEN
    RAISE EXCEPTION '032 incompleta: technician_public_view no expone years_experience — el filtro server-side no podria aplicarse.';
  END IF;

  viewdef := pg_get_viewdef('public.technician_public_view'::regclass, true);

  -- La garantía de la 024 que esta recreación podría haberse comido.
  IF viewdef NOT LIKE '%is_active_user()%'
     OR viewdef NOT LIKE '%pending_verification%' THEN
    RAISE EXCEPTION '032 ABORTADA: la recreacion de technician_public_view perdio la exclusion de perfiles no activos de la migracion 024. NO dejes esto aplicado.';
  END IF;

  -- El gate de identidad: 5 campos privados, 5 CASE WHEN offer_accepted_between.
  SELECT (length(viewdef) - length(replace(viewdef, 'offer_accepted_between', ''))) / length('offer_accepted_between')
    INTO privacy_gates;
  IF privacy_gates <> 5 THEN
    RAISE EXCEPTION '032 ABORTADA: se esperaban 5 gates offer_accepted_between (first_name, last_name, email, phone, social_links) y hay %. La privacidad es el nucleo del producto.', privacy_gates;
  END IF;

  RAISE NOTICE '032 OK — years_experience creada (nullable) y expuesta en la vista; exclusion de la 024 y los 5 gates de identidad intactos.';
END $$;
