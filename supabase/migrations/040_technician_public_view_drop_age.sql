-- 040 — la edad sale del contrato público.
--
-- Intención: `technician_public_view` exponía `compute_age(birth_date) AS age`,
-- y toda empresa la veía en el cribado. La edad es característica protegida en
-- normativa laboral europea: mostrarla al empleador durante la criba es riesgo
-- de discriminación, y es incoherente con anonimizar el nombre justo para
-- reducir sesgo. No aporta al cribado — licencias, type ratings y años de
-- experiencia ya cubren lo relevante.
--
-- Efecto colateral deseado: `app/privacy-policy.tsx` promete que la fecha de
-- nacimiento se usa "for age verification; NOT SHARED". Hoy esa promesa es
-- falsa. Tras esta migración es cierta.
--
-- ORDEN (expand-contract, norma del proyecto): el código dejó de leer `age`
-- ANTES de esta migración — `PUBLIC_SELECT`, los mappers, `SafeTechnicianPreview`,
-- `TechnicianProfile.age`, `calculateAge()` y el badge de la UI ya no existen.
-- Aplicar esto primero habría roto toda consulta a la vista.
--
-- DROP + CREATE, no CREATE OR REPLACE: `CREATE OR REPLACE VIEW` sólo permite
-- AÑADIR columnas al final, nunca quitarlas (la 032 tropezó con esta misma
-- restricción por el otro lado). El DROP PIERDE LOS GRANT, así que se recrean
-- explícitamente abajo — es exactamente el motivo por el que la 032 evitó el
-- DROP, y aquí no hay alternativa.

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

-- GRANTs recreados EXPLÍCITAMENTE (el DROP se los llevó). Réplica exacta de lo
-- que había antes, capturado de information_schema.role_table_grants.
GRANT ALL ON public.technician_public_view TO anon;
GRANT ALL ON public.technician_public_view TO authenticated;
GRANT ALL ON public.technician_public_view TO service_role;

-- compute_age() queda sin un solo llamador tras quitar la columna. Verificado
-- por dirección ENTRANTE en los cuatro catálogos ANTES de escribir esto
-- (pg_rewrite, pg_proc.prosrc, pg_constraint, pg_attrdef, pg_indexes,
-- pg_trigger, pg_depend): el único consumidor era esta misma vista.
-- Sin CASCADE a propósito: si algo dependiera todavía, Postgres aborta y la
-- respuesta es averiguar qué, no forzar el borrado.
DROP FUNCTION IF EXISTS public.compute_age(date);

-- Post-condiciones. Una recreación de vista es justo donde se pierden las
-- garantías: se comprueban las tres (columna fuera, gates de identidad
-- intactos, cláusula de la 024 intacta) y además los GRANT.
DO $$
DECLARE
  v_def       text;
  v_gates     int;
  v_grants    int;
  v_has_age   boolean;
BEGIN
  SELECT pg_get_viewdef('public.technician_public_view'::regclass, true) INTO v_def;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='technician_public_view' AND column_name='age'
  ) INTO v_has_age;
  IF v_has_age THEN
    RAISE EXCEPTION 'La vista sigue exponiendo la columna age';
  END IF;

  -- Los CINCO gates de identidad tienen que seguir ahí, uno por campo.
  v_gates := (length(v_def) - length(replace(v_def, 'offer_accepted_between', ''))) / length('offer_accepted_between');
  IF v_gates <> 5 THEN
    RAISE EXCEPTION 'Se esperaban 5 gates offer_accepted_between, hay %', v_gates;
  END IF;

  -- La cláusula de la 024 (excluir deleted/blocked/suspended) tiene que seguir.
  IF v_def NOT LIKE '%pending_verification%' OR v_def NOT LIKE '%is_active_user()%' THEN
    RAISE EXCEPTION 'Se ha perdido la clausula de la migracion 024';
  END IF;

  -- Y las tres columnas que deben seguir presentes.
  IF v_def NOT LIKE '%years_experience%' OR v_def NOT LIKE '%profile_completeness%' THEN
    RAISE EXCEPTION 'Faltan columnas que la vista debia conservar';
  END IF;

  SELECT count(DISTINCT grantee) INTO v_grants
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name='technician_public_view'
    AND privilege_type='SELECT' AND grantee IN ('anon','authenticated','service_role');
  IF v_grants <> 3 THEN
    RAISE EXCEPTION 'GRANTs no restaurados: % de 3 roles con SELECT', v_grants;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public' AND p.proname='compute_age') THEN
    RAISE EXCEPTION 'compute_age() sigue existiendo';
  END IF;
END $$;
