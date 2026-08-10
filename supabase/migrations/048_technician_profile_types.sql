-- ============================================================
-- AviationJobTalent V2 — Migration 048: un técnico puede tener VARIOS
-- tipos de perfil
-- ============================================================
-- Created: 2026-08-10 (Fase 6, tanda A — docs/MISSION_PART66.md)
--
-- Problema que arregla:
--   `technician_profiles.technician_type` es una sola columna, así que quien
--   se registró como "avionic" y luego añadió una licencia B1.3 (mecánico)
--   NO aparece en las ofertas de mecánico, aunque tenga la licencia. El tipo
--   de perfil hace de portero cuando la licencia ya es mejor prueba.
--
--   Los datos vivos ya lo demuestran: de las 11 filas de technician_licenses
--   de hoy, un perfil `avionic` sostiene A2/B1.1/B1.2/B1.3 (rama mecánica) y
--   un `mechanic` sostiene una B2 (rama aviónica). La etiqueta elegida al
--   registrarse no describe lo que la persona declara después.
--
-- Qué hace (todo aditivo):
--   1. Tabla puente technician_profile_types (technician_id, type_code).
--   2. Backfill: una fila por cada technician_profiles.technician_type.
--   3. Guarda: aborta si algún perfil se quedara sin fila.
--   4. RLS calcada de technician_licenses / technician_habilitations.
--   5. signup_technician() acepta un ARRAY de tipos.
--
-- Lo que NO hace, a propósito:
--   `technician_profiles.technician_type` NO se borra. Sigue siendo NOT NULL
--   y sigue escribiéndose. Se retira en una migración posterior, cuando no
--   queden lectores — misma regla que la 029 y la 045: el DROP va DESPUÉS
--   del código, nunca antes (expand-contract). Hasta entonces la columna es
--   una copia del primer tipo, no una segunda fuente de verdad: el código
--   que lee tipos lee SIEMPRE la tabla puente.
--
-- Por qué la vista pública NO cambia:
--   `technician_type` es campo PÚBLICO del contrato (lo ven las empresas
--   antes de aceptar), igual que las licencias y las habilitaciones. Y esas
--   dos ya viajan FUERA de technician_public_view, por su propia tabla con
--   su propia policy de empresa (tl_select_company / th_select_company);
--   la vista solo existe para anular los 5 campos de IDENTIDAD con
--   offer_accepted_between(). Un campo público multivaluado por la vía de
--   las relaciones es el patrón ya establecido aquí, así que la tabla nueva
--   lo sigue en vez de obligar a recrear la vista entera (y con ella los
--   cinco CASE WHEN de privacidad, que es justo el código que no conviene
--   reescribir por un campo que no es privado).
-- ============================================================


-- ── 1. Tabla puente ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.technician_profile_types (
  technician_id UUID NOT NULL
    REFERENCES public.technician_profiles(id) ON DELETE CASCADE,
  type_code     TEXT NOT NULL
    REFERENCES public.technician_types(code),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (technician_id, type_code)
);

COMMENT ON TABLE public.technician_profile_types IS
  'Tipos de perfil de un técnico (Fase 6 tanda A). Sustituye a '
  'technician_profiles.technician_type, que se mantiene por compatibilidad '
  'hasta que no queden lectores. Sin restricción de mezcla: se puede ser '
  'aviónico y pintor a la vez.';

-- La PK ya cubre (technician_id, type_code); este índice es para la
-- dirección contraria, "qué técnicos son de este tipo", que es la que usan
-- las búsquedas de empresa y admin.
CREATE INDEX IF NOT EXISTS idx_technician_profile_types_type
  ON public.technician_profile_types (type_code);


-- ── 2. Backfill + 3. guarda ────────────────────────────────
--
-- ON CONFLICT DO NOTHING hace el backfill idempotente: reejecutar la
-- migración no duplica ni pisa filas que el técnico haya añadido después.
INSERT INTO public.technician_profile_types (technician_id, type_code)
SELECT tp.id, tp.technician_type
FROM public.technician_profiles tp
ON CONFLICT (technician_id, type_code) DO NOTHING;

DO $$
DECLARE
  v_orphans INT;
  v_total   INT;
BEGIN
  SELECT count(*) INTO v_orphans
  FROM public.technician_profiles tp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.technician_profile_types t
    WHERE t.technician_id = tp.id
  );

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Backfill incompleto: % perfiles sin ninguna fila en technician_profile_types. Migración abortada.',
      v_orphans;
  END IF;

  -- Y la dirección contraria: ningún perfil puede haber PERDIDO su tipo
  -- original. La guarda de arriba solo exige "al menos una fila"; esta
  -- exige que esa fila sea la que tenía.
  SELECT count(*) INTO v_orphans
  FROM public.technician_profiles tp
  WHERE NOT EXISTS (
    SELECT 1 FROM public.technician_profile_types t
    WHERE t.technician_id = tp.id AND t.type_code = tp.technician_type
  );

  IF v_orphans > 0 THEN
    RAISE EXCEPTION
      'Backfill incoherente: % perfiles no conservan su technician_type original. Migración abortada.',
      v_orphans;
  END IF;

  SELECT count(*) INTO v_total FROM public.technician_profiles;
  RAISE NOTICE 'technician_profile_types: % perfiles con tipo conservado.', v_total;
END $$;


-- ── 4. RLS ─────────────────────────────────────────────────
--
-- Calcada de technician_habilitations (th_*), no de technician_licenses:
-- las dos son idénticas salvo que licenses tiene además un UPDATE, y esta
-- tabla no puede tenerlo — sus dos únicas columnas son la PK, así que
-- "cambiar un tipo" es borrar una fila e insertar otra, nunca un UPDATE.
--
-- El SELECT de empresa es amplio a propósito, exactamente igual que
-- th_select_company: la tabla no filtra por perfil visible. No es un
-- escape de privacidad — el tipo de técnico es campo público del contrato,
-- y en la práctica los ids siempre salen de technician_public_view, que sí
-- filtra por cuenta activa.
ALTER TABLE public.technician_profile_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tpt_all_admin ON public.technician_profile_types;
CREATE POLICY tpt_all_admin ON public.technician_profile_types
  FOR ALL USING (is_admin());

DROP POLICY IF EXISTS tpt_select_own ON public.technician_profile_types;
CREATE POLICY tpt_select_own ON public.technician_profile_types
  FOR SELECT USING (technician_id = my_technician_id() AND is_active_user());

DROP POLICY IF EXISTS tpt_select_company ON public.technician_profile_types;
CREATE POLICY tpt_select_company ON public.technician_profile_types
  FOR SELECT USING (auth_role() = 'company_user' AND is_active_user());

DROP POLICY IF EXISTS tpt_insert_own ON public.technician_profile_types;
CREATE POLICY tpt_insert_own ON public.technician_profile_types
  FOR INSERT WITH CHECK (technician_id = my_technician_id() AND is_active_user());

DROP POLICY IF EXISTS tpt_delete_own ON public.technician_profile_types;
CREATE POLICY tpt_delete_own ON public.technician_profile_types
  FOR DELETE USING (technician_id = my_technician_id());


-- ── 5. signup_technician() acepta un array ─────────────────
--
-- Séptimo parámetro, DEFAULT NULL, por el mismo motivo documentado en la
-- 044: un bundle ya cargado en el navegador de alguien sigue llamando con 6
-- argumentos nombrados y PostgREST lo resuelve contra esta función, que
-- entonces cae en ARRAY[p_technician_type] — exactamente lo que guardaba
-- antes. La firma de 6 argumentos se DROPea al final, después de que exista
-- la nueva, para que no haya ningún instante sin función invocable ni una
-- llamada de 6 argumentos ambigua entre dos definiciones.
--
-- `technician_type` (singular) se sigue escribiendo con el PRIMER elemento:
-- la columna es NOT NULL y no se retira en esta tanda.
CREATE OR REPLACE FUNCTION public.signup_technician(
  p_first_name       text,
  p_last_name        text,
  p_birth_date       date,
  p_technician_type  text,
  p_location_city_id text,
  p_years_experience integer DEFAULT NULL,
  p_technician_types text[]  DEFAULT NULL
)
 RETURNS uuid
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
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Un array vacío es tan inválido como NULL: el mínimo es UN tipo. Se
  -- deduplica porque la PK de la tabla puente rechazaría el duplicado y
  -- abortaría un alta por lo que en la UI es un doble toque.
  SELECT array_agg(DISTINCT t) INTO v_types
  FROM unnest(COALESCE(NULLIF(p_technician_types, '{}'), ARRAY[p_technician_type])) AS t
  WHERE t IS NOT NULL AND t <> '';

  IF v_types IS NULL OR array_length(v_types, 1) IS NULL THEN
    RAISE EXCEPTION 'At least one technician type is required';
  END IF;

  -- Idempotency: return existing profile if user already completed signup
  SELECT id INTO v_tid FROM technician_profiles WHERE user_id = v_uid;
  IF v_tid IS NOT NULL THEN
    RETURN v_tid;
  END IF;

  SELECT email INTO v_email FROM profiles WHERE id = v_uid;

  -- Retry loop only guards against anonymous_code collision
  LOOP
    v_anon := 'T' || upper(left(replace(gen_random_uuid()::text, '-', ''), 9));
    BEGIN
      INSERT INTO technician_profiles (
        user_id, anonymous_code,
        first_name, last_name, email,
        birth_date, technician_type, location_city_id,
        years_experience
      ) VALUES (
        v_uid, v_anon,
        p_first_name, p_last_name, v_email,
        p_birth_date, v_types[1], p_location_city_id,
        p_years_experience
      )
      RETURNING id INTO v_tid;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      NULL; -- anonymous_code collision, retry
    END;
  END LOOP;

  -- Sin ON CONFLICT: v_tid acaba de nacer en este mismo bloque, así que un
  -- conflicto aquí sería un fallo real que conviene ver, no ruido a tragar.
  -- Un código inexistente lo rechaza la FK y tumba el alta entera, que es
  -- lo correcto: un perfil a medias no se puede reparar desde la app.
  INSERT INTO technician_profile_types (technician_id, type_code)
  SELECT v_tid, t FROM unnest(v_types) AS t;

  RETURN v_tid;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.signup_technician(text, text, date, text, text, integer, text[])
  TO anon, authenticated, service_role;

-- Firma superada de 6 argumentos. Se borra sólo DESPUÉS de que exista la de
-- arriba.
DROP FUNCTION IF EXISTS public.signup_technician(text, text, date, text, text, integer);

-- PostgREST cachea el esquema; sin esto el argumento nuevo se rechaza como
-- desconocido hasta que la caché se refresque por su cuenta.
NOTIFY pgrst, 'reload schema';
