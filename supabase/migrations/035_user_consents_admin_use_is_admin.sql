-- ============================================================
-- 035 — `user_consents: admin select` pasa a usar is_admin()
--
-- Fecha: 2026-07-28. Rationale: docs/MISSION_PART66.md.
--
-- ── El motivo NO es solo la duplicación ────────────────────
-- La política expresaba inline lo que hace el helper:
--
--     EXISTS (SELECT 1 FROM profiles
--             WHERE id = auth.uid() AND role = 'admin')
--
-- Pero el problema de fondo es un **acoplamiento oculto entre políticas**:
--
--   - `is_admin()` es `SECURITY DEFINER`, así que evalúa `profiles`
--     SALTÁNDOSE la RLS de esa tabla. Responde "¿eres admin?" y punto.
--   - La versión inline se ejecuta con los permisos del llamante, así que
--     depende de que exista `profiles_select_own` (`id = auth.uid()`) para
--     poder leer su propia fila.
--
-- Consecuencia: **endurecer la RLS de `profiles` denegaría admins aquí, en
-- silencio.** Un cambio en una política de otra tabla rompiendo ésta, sin
-- error y sin relación aparente. Ese acoplamiento invisible es lo que se
-- elimina; la deduplicación es el efecto secundario agradable.
--
-- ── EQUIVALENCIA: precisión, no atajo ──────────────────────
-- A diferencia de la 034 —donde la lista inline era demostrablemente
-- redundante porque el helper ya estaba en el mismo WHERE— aquí la
-- equivalencia es CONDICIONAL, y conviene decirlo tal cual:
--
--   - **Equivalente HOY**: `profiles_select_own` (`id = auth.uid()`) existe y
--     permite a cualquier usuario leer su propia fila, así que el EXISTS
--     inline devuelve exactamente lo mismo que `is_admin()` para los tres
--     casos posibles (admin / no-admin / sin fila). Verificado en
--     `pg_policies` antes de escribir esto.
--   - **Divergente MAÑANA, y a propósito**: si algún día se endurece la RLS
--     de `profiles`, la inline empezaría a devolver false para un admin real
--     y `is_admin()` no. En esa situación la nueva versión es MÁS PERMISIVA
--     que la vieja — y es justo lo correcto: el admin sigue siendo admin.
--     Lo que hoy parecería "más permisivo" es en realidad "deja de romperse
--     por un cambio no relacionado".
--
-- El resto de políticas de `user_consents` (owner select / owner insert) NO
-- se tocan.
--
-- Idempotente: DROP POLICY IF EXISTS + CREATE.
-- ============================================================


-- ── A. La política ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "user_consents: admin select" ON public.user_consents;

CREATE POLICY "user_consents: admin select" ON public.user_consents
  FOR SELECT
  TO authenticated
  -- Única expresión de "¿es admin?" en todo el esquema. NO vuelvas a
  -- escribir el EXISTS sobre profiles: además de duplicar, reintroduce la
  -- dependencia con la RLS de esa tabla.
  USING (is_admin());


-- ── B. Comprobación de post-condiciones ───────────────────────────────

DO $$
DECLARE
  regla     TEXT;
  n_pol     INTEGER;
  n_inline  INTEGER;
BEGIN
  SELECT coalesce(qual::text, '') INTO regla
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'user_consents'
    AND policyname = 'user_consents: admin select';

  IF regla IS NULL OR regla = '' THEN
    RAISE EXCEPTION '035 ABORTADA: la politica no existe o no tiene USING.';
  END IF;

  IF regla NOT LIKE '%is_admin()%' THEN
    RAISE EXCEPTION '035 incompleta: la politica no delega en is_admin().';
  END IF;

  IF regla ~ 'FROM profiles' THEN
    RAISE EXCEPTION '035 incompleta: la politica sigue consultando profiles inline.';
  END IF;

  -- Las otras dos políticas de la tabla deben seguir intactas: si una
  -- recreación se llevara por delante `owner select`, un usuario dejaría de
  -- ver sus propios consentimientos.
  SELECT count(*) INTO n_pol
  FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_consents';
  IF n_pol <> 3 THEN
    RAISE EXCEPTION '035 ABORTADA: user_consents deberia tener 3 politicas y tiene %.', n_pol;
  END IF;

  -- Y globalmente: ninguna politica del esquema debe volver a consultar
  -- profiles inline para preguntar por el rol.
  SELECT count(*) INTO n_inline
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (coalesce(qual::text,'') || coalesce(with_check::text,'')) ~ 'FROM profiles';
  IF n_inline <> 0 THEN
    RAISE EXCEPTION '035 incompleta: quedan % politica(s) consultando profiles inline.', n_inline;
  END IF;

  RAISE NOTICE '035 OK — user_consents delega en is_admin(); cero politicas consultan profiles inline; las 3 politicas de la tabla intactas.';
END $$;
