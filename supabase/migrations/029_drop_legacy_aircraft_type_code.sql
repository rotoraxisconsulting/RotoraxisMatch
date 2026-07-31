-- ============================================================
-- 029 — Retirar la columna legacy aircraft_type_code de
--        technician_habilitations, hacer obligatorio el rating,
--        y eliminar needs_review
--
-- Fase 5.3 (misión Part-66, docs/MISSION_PART66.md). Fecha: 2026-07-28.
--
-- Esta cabecera NO declara si la migración está aplicada: por norma del
-- proyecto (docs/MISSION_PART66.md, "las migraciones NO llevan línea de
-- estado") el estado vive en supabase_migrations.schema_migrations y en el
-- mission doc, nunca en el fichero .sql.
--
-- ── Qué cierra ─────────────────────────────────────────────
-- Segundo eslabón de la cadena de retirada del catálogo pre-Part-66:
--   028 (FKs entrantes + índice duplicado)  → APLICADA
--   cambios de código 5.3                    → HECHOS
--   029 (esta)                               → drop columna + NOT NULL
--   030                                      → DROP TABLE aircraft_types
--                                              (con dump previo)
--
-- Va DESPUÉS de los cambios de código, no antes: hasta la 5.3 había cuatro
-- lectores de cliente vivos de `aircraft_type_code` (uno de ellos en la
-- carga de TODO técnico), y dropear la columna con ellos en pie rompía la
-- app en runtime. Ya no queda ninguno — verificado por grep sobre
-- `app/`/`src/`/`scripts/`, con `npm run ts` limpio y 114/114 tests en
-- verde tras la retirada.
--
-- ── Decisión de alcance (usuario, 2026-07-28) ──────────────
-- El catálogo viejo se va ENTERO, sin caminos de compatibilidad: proyecto
-- en desarrollo, sin producción, y se prefiere borrar datos a mano antes
-- que arrastrar código legacy.
--
-- Consecuencia deliberada: esta migración NO lleva bloque de guarda
-- `IF EXISTS (...) RAISE EXCEPTION` sobre filas sin resolver. El propio
-- `SET NOT NULL` del paso A falla nativamente si alguna fila tuviera
-- `aircraft_type_rating_id` NULL — misma protección, cero código a medida,
-- y un invariante PERMANENTE en vez de una comprobación de un solo uso.
--
-- El CHECK dual `chk_technician_habilitations_target`
-- (`aircraft_type_code IS NOT NULL OR aircraft_type_rating_id IS NOT NULL`)
-- cae automáticamente con la columna y **NO se sustituye** por
-- `CHECK (aircraft_type_rating_id IS NOT NULL OR needs_review)`: ese
-- reemplazo, discutido antes, presuponía conservar `needs_review`, que esta
-- misma migración elimina. El `NOT NULL` del paso A es el invariante final
-- y es más fuerte que cualquiera de los dos.
--
-- ── Estado verificado en vivo antes de escribir esto ───────
--   technician_habilitations ................ 5 filas
--     con aircraft_type_rating_id ........... 5 (100%) → el NOT NULL pasa
--     sin resolver (rating_id NULL) ......... 0
--   filas con needs_review = true ........... 0
-- Confirmado también por el usuario. Las 2 filas que aún llevan un código
-- legacy (B407, B412, cuenta ya borrada TF0E8866C8) tienen AMBAS su
-- aircraft_type_rating_id resuelto: el código es información redundante,
-- no la única referencia de esas habilitaciones. No se pierde ningún
-- vínculo real.
--
-- ── Barrido de dependencias entrantes (dirección correcta) ─
-- Sobre aircraft_type_code y needs_review en technician_habilitations,
-- 2026-07-28, los cuatro catálogos + índices:
--   políticas RLS (pg_policies, qual/with_check) ... 0
--   funciones/RPC (pg_proc.prosrc) ................. 0
--   triggers (pg_trigger) .......................... 0
--   vistas (pg_depend + pg_rewrite) ................ 0
--   índices (pg_indexes) ........................... 1
--     └─ technician_habilitations_technician_id_license_code_aircraf_key
--        (la UNIQUE legacy) — cae automáticamente con la columna, no hay
--        que dropearla a mano; se comprueba en el paso D.
--
-- ── Uniqueness después de esta migración ───────────────────
-- Queda `uq_technician_habilitations_rating` (migración 016):
--   UNIQUE (technician_id, license_code, aircraft_type_rating_id)
--   WHERE aircraft_type_rating_id IS NOT NULL
-- Con el NOT NULL del paso A su predicado pasa a ser siempre cierto, así
-- que cubre la tabla entera — la unicidad se REFUERZA, no se relaja. El
-- índice no se toca: reescribirlo como no-parcial sería churn sin efecto.
--
-- Idempotente: segura de re-ejecutar (SET NOT NULL sobre una columna ya
-- NOT NULL es un no-op; los DROP llevan IF EXISTS).
-- ============================================================


-- ── A. El invariante, PRIMERO ─────────────────────────────────────────
-- Deliberadamente antes de cualquier DDL destructivo: si alguna fila
-- tuviera aircraft_type_rating_id NULL, la migración aborta aquí, sin
-- haber intentado borrar nada. (La transacción revertiría igual si fuera
-- al revés, pero así el fallo es lo primero que ocurre y el mensaje de
-- Postgres apunta directo a la causa.)
--
-- Si esto falla en algún entorno futuro: NO relajes el NOT NULL. Resuelve
-- las filas — cada una es una habilitación que no dice qué aeronave es.

ALTER TABLE technician_habilitations
  ALTER COLUMN aircraft_type_rating_id SET NOT NULL;


-- ── B. La columna legacy ──────────────────────────────────────────────
-- Arrastra consigo, automáticamente:
--   - chk_technician_habilitations_target  (el CHECK dual)
--   - technician_habilitations_technician_id_license_code_aircraf_key
--     (la UNIQUE legacy sobre technician_id, license_code, aircraft_type_code)
-- Ninguno de los dos se sustituye — ver la cabecera.

ALTER TABLE technician_habilitations
  DROP COLUMN IF EXISTS aircraft_type_code;


-- ── C. needs_review ───────────────────────────────────────────────────
-- Añadida por la 027 con un único propósito: marcar una fila cuyo
-- aircraft_type_code no se pudo resolver a exactamente un rating del
-- catálogo. Sin códigos legacy que resolver y con el NOT NULL del paso A,
-- ninguna ruta puede volver a ponerla a true: queda sin significado
-- posible.
--
-- Revisado si había motivo para conservarla y no lo hay: NO es un estado
-- de verificación general de habilitaciones — eso vive en
-- verification_status de perfiles y documentos, no aquí.

ALTER TABLE technician_habilitations
  DROP COLUMN IF EXISTS needs_review;


-- ── D. Comprobación de post-condiciones ───────────────────────────────
-- Falla ruidosamente si el estado final no es el declarado, en vez de
-- dejar una migración "aplicada" que no consiguió lo que dice.

DO $$
DECLARE
  has_legacy_col  BOOLEAN;
  has_needs_col   BOOLEAN;
  rating_notnull  BOOLEAN;
  dual_check      INTEGER;
  legacy_unique   INTEGER;
  rating_unique   INTEGER;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='technician_habilitations'
                   AND column_name='aircraft_type_code')  INTO has_legacy_col;

  SELECT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='technician_habilitations'
                   AND column_name='needs_review')        INTO has_needs_col;

  SELECT a.attnotnull INTO rating_notnull
  FROM pg_attribute a
  WHERE a.attrelid = 'public.technician_habilitations'::regclass
    AND a.attname  = 'aircraft_type_rating_id'
    AND NOT a.attisdropped;

  SELECT COUNT(*) INTO dual_check
  FROM pg_constraint
  WHERE conrelid = 'public.technician_habilitations'::regclass
    AND conname  = 'chk_technician_habilitations_target';

  SELECT COUNT(*) INTO legacy_unique
  FROM pg_indexes
  WHERE schemaname='public' AND tablename='technician_habilitations'
    AND indexname='technician_habilitations_technician_id_license_code_aircraf_key';

  SELECT COUNT(*) INTO rating_unique
  FROM pg_indexes
  WHERE schemaname='public' AND tablename='technician_habilitations'
    AND indexname='uq_technician_habilitations_rating';

  IF has_legacy_col THEN
    RAISE EXCEPTION '029 incompleta: technician_habilitations.aircraft_type_code sigue existiendo.';
  END IF;

  IF has_needs_col THEN
    RAISE EXCEPTION '029 incompleta: technician_habilitations.needs_review sigue existiendo.';
  END IF;

  IF NOT rating_notnull THEN
    RAISE EXCEPTION '029 incompleta: aircraft_type_rating_id no quedó NOT NULL — el invariante de esta fase no está en pie.';
  END IF;

  IF dual_check <> 0 THEN
    RAISE EXCEPTION '029 inconsistente: chk_technician_habilitations_target sobrevivió al DROP de la columna. Revísalo — no debe sustituirse, debe desaparecer.';
  END IF;

  IF legacy_unique <> 0 THEN
    RAISE EXCEPTION '029 inconsistente: la UNIQUE legacy sobre aircraft_type_code sobrevivió al DROP de la columna.';
  END IF;

  -- La única garantía de unicidad que queda debe seguir en pie: sin ella,
  -- nada a nivel de BD impediría dos habilitaciones normalizadas idénticas.
  IF rating_unique <> 1 THEN
    RAISE EXCEPTION '029 abortada: uq_technician_habilitations_rating (migración 016) no existe — la tabla se quedaría sin unicidad.';
  END IF;

  RAISE NOTICE '029 OK — aircraft_type_code y needs_review eliminadas; aircraft_type_rating_id NOT NULL; unicidad intacta y ahora efectiva sobre toda la tabla.';
END $$;
