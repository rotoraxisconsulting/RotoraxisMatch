-- ============================================================
-- 031 — DROP TABLE technician_aircraft_experience
--
-- Sub-fase de experiencia (misión Part-66). Fecha: 2026-07-28.
-- Rationale y decisión de producto: docs/MISSION_PART66.md,
-- "Sub-fase de experiencia — retirada de technician_aircraft_experience".
--
-- Principio fijado por el usuario: **la cualificación puntúa, la experiencia
-- informa y filtra**. Los años de experiencia dejan de ser un componente del
-- match score; pasan a ser dato visual + filtro duro server-side.
--
-- Esta tabla era experiencia por código de aeronave del modelo pre-Part-66:
-- 0 filas desde siempre, 4 lecturas vivas y CERO caminos de escritura. Su
-- único efecto real era dejar el componente `experience` del score
-- permanentemente inalcanzable en cuanto una oferta pidiera
-- minYearsExperience > 0. La sustituye technician_profiles.years_experience
-- (migración 032).
--
-- DUMP PREVIO OBLIGATORIO, ya tomado:
--   supabase/dumps/technician_aircraft_experience_2026-07-28.sql
--   (estructura + constraints + índice + RLS; 0 filas, nunca hubo datos)
--
-- Idempotente: segura de re-ejecutar.
-- ============================================================


-- ── A. El DROP ────────────────────────────────────────────────────────
-- SIN CASCADE, igual que la 030: RESTRICT (el modo por defecto) hace que
-- Postgres se niegue si algo sigue dependiendo de la tabla. Si falla, NO
-- añadas CASCADE — averigua qué depende todavía (consulta por dirección
-- entrante, ver el post-mortem de método en docs/PHASE5_INVENTORY.md) y
-- retíralo explícitamente.
--
-- Arrastra consigo su índice, su UNIQUE, su CHECK y sus 6 políticas RLS.

DROP TABLE IF EXISTS public.technician_aircraft_experience;


-- ── B. El tipo enum, que queda huérfano ───────────────────────────────
-- Corrección (usuario, 2026-07-28): una versión previa de esta migración
-- decía que `experience_unit` era "un tipo compartido del esquema" y lo
-- dejaba en pie. Es FALSO. Verificado por dirección entrante contra el
-- catálogo — columnas (pg_attribute.atttypid), argumentos y retornos de
-- función (pg_proc), y dominios derivados (pg_type.typbasetype):
--
--   technician_aircraft_experience.unit ... 1 uso (la tabla del paso A)
--   funciones .......................... 0
--   dominios ........................... 0
--
-- Tras el DROP del paso A queda completamente huérfano. Sin CASCADE, misma
-- filosofía RESTRICT que la 030 y el paso A: si algo dependiera todavía,
-- que aborte la transacción entera y lo averigüemos, no que lo arrastre en
-- silencio.

DROP TYPE IF EXISTS public.experience_unit;


-- ── C. Comprobación de post-condiciones ───────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.technician_aircraft_experience') IS NOT NULL THEN
    RAISE EXCEPTION '031 incompleta: public.technician_aircraft_experience sigue existiendo.';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace
             WHERE n.nspname = 'public' AND t.typname = 'experience_unit') THEN
    RAISE EXCEPTION '031 incompleta: el tipo public.experience_unit sigue existiendo.';
  END IF;

  RAISE NOTICE '031 OK — technician_aircraft_experience y el tipo experience_unit eliminados. Los anios de experiencia viven ahora en technician_profiles.years_experience (032).';
END $$;
