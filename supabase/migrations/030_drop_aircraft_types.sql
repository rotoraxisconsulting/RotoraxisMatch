-- ============================================================
-- 030 — DROP TABLE aircraft_types (catálogo pre-Part-66, 33 filas)
--
-- Fase 5.3 (misión Part-66). Fecha: 2026-07-28.
-- Rationale, cadena completa y verificaciones: docs/MISSION_PART66.md,
-- sección "Decisión 2026-07-28 — el catálogo viejo se va entero".
--
-- Cabecera deliberadamente CORTA: tras el incidente del socket al aplicar
-- la 029 (payload de comentarios largo → conexión cerrada sin respuesta),
-- la norma es que el .sql se envíe idéntico a como está en el repo, sin
-- versión abreviada aparte. La narrativa vive en el mission doc.
--
-- Último eslabón: 028 (FKs entrantes) → código 5.3 → 029 (drop columna +
-- NOT NULL) → 030 (esta).
--
-- DUMP PREVIO OBLIGATORIO, ya tomado:
--   supabase/dumps/aircraft_types_2026-07-28.sql  (33 filas + DDL + RLS)
--
-- Idempotente: segura de re-ejecutar.
-- ============================================================


-- ── A. El DROP ────────────────────────────────────────────────────────
-- SIN CASCADE, a propósito. El modo por defecto (RESTRICT) hace que
-- Postgres se niegue a borrar la tabla si algo sigue dependiendo de ella
-- —FK, vista, constraint— y aborte la transacción entera. Misma filosofía
-- que el SET NOT NULL de la 029: protección nativa en vez de una guarda a
-- medida, y un fallo ruidoso antes que un borrado silencioso que arrastre
-- objetos que nadie sabía que existían.
--
-- Si esto falla: NO añadas CASCADE. Averigua qué depende todavía de la
-- tabla (consulta por dirección entrante, confrelid/pg_depend — ver el
-- post-mortem de método en docs/PHASE5_INVENTORY.md) y retíralo primero,
-- de forma explícita, en su propia migración.

DROP TABLE IF EXISTS public.aircraft_types;


-- ── B. Comprobación de post-condiciones ───────────────────────────────

DO $$
BEGIN
  IF to_regclass('public.aircraft_types') IS NOT NULL THEN
    RAISE EXCEPTION '030 incompleta: public.aircraft_types sigue existiendo.';
  END IF;

  RAISE NOTICE '030 OK — aircraft_types eliminada. El catalogo vivo es aircraft_type_ratings (migracion 020).';
END $$;
