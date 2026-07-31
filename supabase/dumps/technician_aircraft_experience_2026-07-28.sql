-- ============================================================
-- DUMP DE SEGURIDAD — public.technician_aircraft_experience
-- Tomado de rotoaxismatch-dev el 2026-07-28, INMEDIATAMENTE ANTES de la
-- migración 031 (supabase/migrations/031_drop_technician_aircraft_experience.sql),
-- que elimina esta tabla.
--
-- **CONTENIDO: 0 FILAS.** La tabla estuvo vacía toda su vida — nunca existió
-- un camino de escritura en el código. Este fichero restaura estructura,
-- constraints, índice y políticas RLS; no hay datos que restaurar porque
-- nunca los hubo.
--
-- Por qué se retira: experiencia por código de aeronave del modelo
-- pre-Part-66. 0 filas, 4 lecturas vivas y CERO escrituras — una feature a
-- medio construir cuyo único efecto real era dejar el componente
-- `experience` del match score permanentemente inalcanzable en cuanto una
-- oferta pidiera minYearsExperience > 0. La sustituye
-- technician_profiles.years_experience (migración 032): un único número
-- declarado, visual y filtrable, nunca puntuable.
-- Ver docs/MISSION_PART66.md, "Sub-fase de experiencia".
--
-- El tipo enum `experience_unit` SÍ se elimina en la 031 y por eso se
-- recrea aquí primero: verificado contra el catálogo que su único uso en
-- toda la base era `technician_aircraft_experience.unit` (0 funciones, 0
-- dominios), así que tras el DROP TABLE queda huérfano.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
                 WHERE n.nspname = 'public' AND t.typname = 'experience_unit') THEN
    CREATE TYPE public.experience_unit AS ENUM ('hours', 'years');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.technician_aircraft_experience (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id      UUID NOT NULL REFERENCES public.technician_profiles(id) ON DELETE CASCADE,
  aircraft_type_code TEXT NOT NULL,
  value              DOUBLE PRECISION NOT NULL,
  unit               experience_unit NOT NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT technician_aircraft_experience_value_check CHECK (value >= 0),
  CONSTRAINT technician_aircraft_experienc_technician_id_aircraft_type_c_key
    UNIQUE (technician_id, aircraft_type_code)
);

-- OJO: la FK que esta columna tenía a aircraft_types(code) NO se recrea.
-- La retiró la migración 028 y la tabla aircraft_types ya no existe (030).

CREATE INDEX IF NOT EXISTS idx_aircraft_exp_technician
  ON public.technician_aircraft_experience(technician_id);

ALTER TABLE public.technician_aircraft_experience ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tae_select_own     ON public.technician_aircraft_experience;
CREATE POLICY tae_select_own     ON public.technician_aircraft_experience
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

DROP POLICY IF EXISTS tae_select_company ON public.technician_aircraft_experience;
CREATE POLICY tae_select_company ON public.technician_aircraft_experience
  FOR SELECT USING (auth_role() = 'company_user'::app_role AND is_active_user());

DROP POLICY IF EXISTS tae_insert_own     ON public.technician_aircraft_experience;
CREATE POLICY tae_insert_own     ON public.technician_aircraft_experience
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

-- Añadida por la migración 025 (2026-07-24): durante toda su vida anterior,
-- una fila, una vez insertada, no se podía editar.
DROP POLICY IF EXISTS tae_update_own     ON public.technician_aircraft_experience;
CREATE POLICY tae_update_own     ON public.technician_aircraft_experience
  FOR UPDATE USING (technician_id = my_technician_id() AND is_active_user())
         WITH CHECK (technician_id = my_technician_id() AND is_active_user());

DROP POLICY IF EXISTS tae_delete_own     ON public.technician_aircraft_experience;
CREATE POLICY tae_delete_own     ON public.technician_aircraft_experience
  FOR DELETE USING (technician_id = my_technician_id());

DROP POLICY IF EXISTS tae_all_admin      ON public.technician_aircraft_experience;
CREATE POLICY tae_all_admin      ON public.technician_aircraft_experience
  FOR ALL USING (is_admin());

-- Verificación de restauración: debe devolver 0 (la tabla nunca tuvo datos).
-- SELECT count(*) FROM public.technician_aircraft_experience;
