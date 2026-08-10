-- ============================================================
-- AviationJobTalent V2 — Migration 049: retirar
-- technician_profiles.profile_completeness
-- ============================================================
-- Created: 2026-08-10
--
-- ⚠ NO APLICAR HASTA QUE EL CÓDIGO QUE DEJA DE LEER LA COLUMNA ESTÉ
-- DESPLEGADO. Es la mitad de CONTRACCIÓN del expand-contract, y va DESPUÉS
-- del código, nunca antes — misma regla que la 029, la 045 y la 048.
--
-- El riesgo no es teórico: había tres SELECT que nombraban la columna
-- EXPLÍCITAMENTE (technicianRepositoryV2.PRIVATE_SELECT y PUBLIC_SELECT, y el
-- de app/technician/profile.tsx). PostgREST no ignora una columna que no
-- existe: devuelve error y tumba la consulta ENTERA. Con esta migración
-- aplicada antes de tiempo, el perfil del técnico, la búsqueda de empresa, el
-- mapa y el panel de admin dejan de cargar a la vez.
--
-- Por qué se retira (decisión del 2026-08-10):
--   Un porcentaje único sobre ejes independientes obliga a inventar un
--   reparto de pesos entre cosas que no se comparan (¿cuánto vale una
--   licencia frente a un aeropuerto base?), y producía un efecto perverso:
--   declarar la primera licencia BAJABA el número, porque abría el eje de
--   type ratings todavía sin rellenar. Un indicador que empeora cuando el
--   usuario aporta más datos no está midiendo al usuario.
--
--   Si hace falta decirle al técnico que le falta algo, es una LISTA de "te
--   falta esto" —que nunca baja y dice qué hacer—, no un porcentaje. Eso NO
--   se construye aquí: esta migración sólo retira.
--
-- Verificado ANTES de escribir esto, por dirección ENTRANTE y contra la base
-- en vivo (no contra la documentación):
--   - pg_policies  → 0 políticas RLS la nombran, ni en USING ni en WITH CHECK
--   - pg_proc      → 0 funciones la nombran (prosrc, prokind='f')
--   - pg_trigger   → 0 triggers en technician_profiles
--   - pg_indexes   → 0 índices
--   - pg_constraint→ 1: technician_profiles_profile_completeness_check
--                    (CHECK 0..100), que cae solo con la columna
--   - vistas       → 1: technician_public_view, que por eso se recrea aquí
-- Nunca fue un gate: no filtraba, no ordenaba, no bloqueaba aplicar a una
-- oferta, no condicionaba la verificación y no entraba en el match. Sólo se
-- pintaba, en dos sitios.
-- ============================================================


-- ── 1. Recrear la vista sin la columna ─────────────────────
--
-- Obligatorio ANTES del DROP: la vista depende de la columna y sin esto
-- Postgres aborta el ALTER TABLE. Y sin CASCADE a propósito — si algo más
-- dependiera, la respuesta es averiguar qué, no forzar el borrado.
--
-- Definición copiada VERBATIM de la desplegada (capturada con
-- pg_get_viewdef contra rotoaxismatch-dev antes de escribir este fichero),
-- menos la línea de profile_completeness. Los cinco CASE WHEN de identidad,
-- los JOIN y la cláusula de la 024 quedan intactos.
--
-- El DROP PIERDE LOS GRANT, así que se recrean explícitamente abajo. Es la
-- misma trampa documentada en la 040.
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

-- GRANTs recreados EXPLÍCITAMENTE (el DROP se los llevó). Réplica exacta de lo
-- que había, igual que en la 040.
GRANT ALL ON public.technician_public_view TO anon;
GRANT ALL ON public.technician_public_view TO authenticated;
GRANT ALL ON public.technician_public_view TO service_role;


-- ── 2. Retirar la columna ──────────────────────────────────
--
-- Esta es LA excepción a "una migración nunca borra datos". Está admitida
-- porque lo que se borra no es un dato del técnico: es un número DERIVADO,
-- recalculado entero en cada guardado a partir de campos que siguen todos en
-- su sitio. No hay nada que un técnico haya escrito que se pierda aquí.
--
-- El CHECK (0..100) cae solo con la columna; no hace falta borrarlo aparte.
ALTER TABLE public.technician_profiles DROP COLUMN IF EXISTS profile_completeness;


-- ── 3. Post-condiciones ────────────────────────────────────
--
-- Una recreación de vista es justo donde se pierden las garantías en
-- silencio. Se comprueban las cuatro que importan.
DO $$
DECLARE
  v_def    text;
  v_gates  int;
  v_grants int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='technician_profiles'
      AND column_name='profile_completeness'
  ) THEN
    RAISE EXCEPTION 'La columna profile_completeness sigue existiendo.';
  END IF;

  SELECT pg_get_viewdef('public.technician_public_view'::regclass, true) INTO v_def;

  IF v_def LIKE '%profile_completeness%' THEN
    RAISE EXCEPTION 'La vista todavía nombra profile_completeness.';
  END IF;

  -- Los cinco gates de identidad, intactos. Si una recreación los pierde, la
  -- vista deja de anonimizar y eso NO puede pasar en silencio.
  SELECT count(*) INTO v_gates
  FROM regexp_matches(v_def, 'offer_accepted_between', 'g');
  IF v_gates <> 5 THEN
    RAISE EXCEPTION 'Esperaba 5 gates offer_accepted_between, encontré %.', v_gates;
  END IF;

  -- La cláusula de la 024 (cuentas inactivas fuera), intacta.
  IF v_def NOT LIKE '%is_active_user()%' OR v_def NOT LIKE '%pending_verification%' THEN
    RAISE EXCEPTION 'La vista perdió el filtro de cuentas activas de la migración 024.';
  END IF;

  -- Y los GRANT, que es lo que el DROP se lleva por delante.
  SELECT count(DISTINCT grantee) INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='technician_public_view'
    AND grantee IN ('anon','authenticated','service_role');
  IF v_grants <> 3 THEN
    RAISE EXCEPTION 'Esperaba 3 grantees en la vista, encontré %.', v_grants;
  END IF;

  RAISE NOTICE 'profile_completeness retirada; vista recreada con sus 5 gates y 3 grants.';
END $$;
