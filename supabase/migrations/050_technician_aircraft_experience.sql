-- ============================================================
-- AviationJobTalent V2 — Migration 050: experiencia en aeronaves SIN licencia
-- ============================================================
-- Created: 2026-08-10 (Fase 6, tanda B — docs/MISSION_PART66.md)
--
-- Problema que arregla:
--   `technician_habilitations.license_code` es NOT NULL, así que en el
--   sistema sólo existe quien tiene licencia. Un mecánico con 15 años de
--   A320 y sin licencia EASA no puede declarar absolutamente nada.
--
--   Son dos cosas distintas: la licencia AUTORIZA A FIRMAR el trabajo, la
--   experiencia dice que SABE HACERLO. Hasta hoy el modelo sólo sabía
--   representar la primera.
--
-- ⚠ MISMO NOMBRE QUE LA TABLA QUE BORRÓ LA 031, Y NO ES UNA VUELTA ATRÁS.
--   La de la 031 era experiencia por CÓDIGO DE AERONAVE del modelo
--   pre-Part-66: 0 filas desde siempre, 4 lecturas vivas y CERO caminos de
--   escritura — media feature cuyo único efecto real era dejar el componente
--   `experience` del score permanentemente inalcanzable. Ésta se diferencia
--   en las tres cosas que la mataron:
--     1. Apunta al catálogo Part-66 (`aircraft_type_ratings`), no a un
--        código suelto: nombra "Airbus A320 family — CFM56", no "A320".
--     2. TIENE camino de escritura desde el primer día (el editor del
--        perfil llega en este mismo commit).
--     3. NO PUNTÚA. En esta tanda se declara y se muestra, nada más. Que el
--        scorer la mire es la Tanda E, y depende del interruptor de
--        certificación que llega en la Tanda C.
--   El principio de la 031 sigue vigente y no se revierte: "la cualificación
--   puntúa, la experiencia informa".
--
--   Reutilizar un nombre sin que signifique lo mismo ya ha costado caro en
--   este repo: `offer_required_aircraft_types` acabó guardando family keys
--   sin renombrarse (migración 022) y diagnosticarlo llevó horas. De ahí que
--   este bloque exista: si el nombre se repite, la diferencia se escribe.
--
-- `technician_habilitations` NO SE TOCA. `license_code` sigue NOT NULL y la
-- invariante de MISMA FILA que protege CLAUDE.md queda intacta. Son DOS
-- LISTAS SEPARADAS, no una con la licencia opcional: en cuanto license_code
-- admitiera NULL, "la categoría y el rating vienen de la misma fila" dejaría
-- de ser verificable, que es justo el bug real que esa invariante impide
-- reintroducir.
-- ============================================================


-- ── Tabla ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.technician_aircraft_experience (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id           UUID NOT NULL
    REFERENCES public.technician_profiles(id) ON DELETE CASCADE,
  aircraft_type_rating_id UUID NOT NULL
    REFERENCES public.aircraft_type_ratings(id),
  -- NULL = NO DECLARADO, distinto de 0 = declarado sin años completos. Es la
  -- misma distinción de technician_profiles.years_experience y el mismo
  -- motivo: la AUSENCIA DE DATO NUNCA PENALIZA. Declarar la aeronave sin
  -- poner años es una declaración válida y completa.
  years                   NUMERIC(4,1)
    CHECK (years IS NULL OR (years >= 0 AND years <= 70)),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Una aeronave se declara UNA vez por técnico. Sin esto, "5 años en A320"
  -- y "9 años en A320" conviven y no hay forma de saber cuál vale.
  UNIQUE (technician_id, aircraft_type_rating_id)
);

COMMENT ON TABLE public.technician_aircraft_experience IS
  'Aeronaves en las que el técnico ha trabajado, CON O SIN licencia (Fase 6 '
  'tanda B). Separada de technician_habilitations a propósito: ésta dice que '
  'sabe hacer el trabajo, aquélla que está autorizado a firmarlo. No puntúa '
  'en el match — eso se decide en la Tanda E.';

CREATE INDEX IF NOT EXISTS idx_technician_aircraft_experience_technician
  ON public.technician_aircraft_experience (technician_id);

-- Para la dirección "quién ha trabajado en esta aeronave", que es la que
-- usará el scorer de la Tanda E y una futura búsqueda por aeronave.
CREATE INDEX IF NOT EXISTS idx_technician_aircraft_experience_rating
  ON public.technician_aircraft_experience (aircraft_type_rating_id);


-- ── La regla de la Tanda E, y por qué este modelo la permite ──
--
-- Regla acordada, A IMPLEMENTAR EN LA TANDA E, no aquí: tener licencia en una
-- aeronave cuenta TAMBIÉN como experiencia en ella; nunca al revés.
--
-- Este modelo la admite SIN DUPLICAR FILAS porque las dos tablas apuntan al
-- MISMO `aircraft_type_rating_id`. La Tanda E resuelve la regla como una
-- unión de conjuntos en lectura:
--
--   experiencia(t) = { h.aircraft_type_rating_id : h en habilitations(t) }
--                  ∪ { e.aircraft_type_rating_id : e en esta tabla(t) }
--
-- No hace falta escribir nada en esta tabla cuando alguien declara una
-- habilitación, y NO SE DEBE: una fila copiada aquí sería un duplicado que
-- hay que mantener sincronizado a mano y que se queda huérfano en cuanto la
-- habilitación se borra. La unión se calcula, no se persiste.
--
-- NO hay constraint que impida tener las dos para la misma aeronave, y es
-- deliberado: es un estado legítimo (tengo licencia de A320 Y quiero declarar
-- mis años en A320). Ojo, Tanda E: entonces hay DOS declaraciones de años
-- para el mismo rating — `technician_habilitations.experience_years` y
-- `technician_aircraft_experience.years` — y hay que decidir cuál manda.
-- Esta migración no lo decide, sólo deja constancia de que la ambigüedad
-- existe para que no se descubra tarde.


-- ── RLS: calcada de technician_habilitations ───────────────
--
-- Las cinco políticas, una a una, con los mismos predicados (verificados
-- contra pg_policies antes de escribir esto). Incluido el detalle de que
-- technician_habilitations NO TIENE política de UPDATE: por eso el
-- repositorio guarda esta tabla con la misma semántica de reemplazo
-- (borrar todo + insertar) que replaceHabilitations, y no con un UPDATE
-- diferencial que RLS rechazaría.
--
-- El SELECT de empresa es amplio igual que th_select_company: la tabla no
-- filtra por perfil visible. No es escape de privacidad — la experiencia es
-- campo público del contrato, como las habilitaciones — y en la práctica los
-- ids siempre salen de technician_public_view, que sí filtra por cuenta
-- activa.
ALTER TABLE public.technician_aircraft_experience ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tae_all_admin ON public.technician_aircraft_experience;
CREATE POLICY tae_all_admin ON public.technician_aircraft_experience
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS tae_select_own ON public.technician_aircraft_experience;
CREATE POLICY tae_select_own ON public.technician_aircraft_experience
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

DROP POLICY IF EXISTS tae_select_company ON public.technician_aircraft_experience;
CREATE POLICY tae_select_company ON public.technician_aircraft_experience
  FOR SELECT USING (auth_role() = 'company_user' AND is_active_user());

DROP POLICY IF EXISTS tae_insert_own ON public.technician_aircraft_experience;
CREATE POLICY tae_insert_own ON public.technician_aircraft_experience
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

DROP POLICY IF EXISTS tae_delete_own ON public.technician_aircraft_experience;
CREATE POLICY tae_delete_own ON public.technician_aircraft_experience
  FOR DELETE USING (technician_id = my_technician_id());


-- ── La vista pública NO se toca ────────────────────────────
--
-- Decisión del 2026-08-10, mismo criterio que technician_profile_types en la
-- tanda A: un campo público MULTIVALUADO viaja por su tabla con su propia
-- policy de empresa, no por technician_public_view. La vista es una fila por
-- técnico y existe para UN trabajo — anular los 5 campos de identidad con
-- offer_accepted_between(); meter una lista ahí exige agregar a JSON y
-- convierte una proyección en un transformador. Licencias y habilitaciones,
-- que son igual de públicas, ya salen por esa vía.
--
-- (Una versión previa de este comentario añadía como motivo que la 049
-- estuviera sin aplicar y recreara la misma vista. Ya no aplica: la 049 se
-- aplicó el 2026-08-10, versión 20260810122813, ANTES que ésta. El criterio
-- no dependía de eso.)


-- ── Post-condiciones ───────────────────────────────────────

DO $$
DECLARE
  v_policies INT;
  v_rls      BOOLEAN;
BEGIN
  SELECT relrowsecurity INTO v_rls
  FROM pg_class WHERE oid = 'public.technician_aircraft_experience'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS no está activo en technician_aircraft_experience.';
  END IF;

  SELECT count(*) INTO v_policies
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'technician_aircraft_experience';
  IF v_policies <> 5 THEN
    RAISE EXCEPTION 'Esperaba 5 políticas RLS, encontré %.', v_policies;
  END IF;

  -- technician_habilitations intacta: es la promesa central de esta tanda.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='technician_habilitations'
      AND column_name='license_code' AND is_nullable='YES'
  ) THEN
    RAISE EXCEPTION 'technician_habilitations.license_code ha pasado a NULLABLE. La invariante de misma fila deja de ser verificable.';
  END IF;

  RAISE NOTICE 'technician_aircraft_experience creada con RLS y 5 políticas; habilitations intacta.';
END $$;
