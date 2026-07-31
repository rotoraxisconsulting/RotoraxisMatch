-- ============================================================
-- 028 — Retirar las referencias entrantes a aircraft_types
--        + limpiar el índice único duplicado que introdujo la 027
--
-- Fase 5.3 (misión Part-66, docs/MISSION_PART66.md). Fecha: 2026-07-28.
--
-- Esta cabecera NO declara si la migración está aplicada: por norma del
-- proyecto (docs/MISSION_PART66.md, "las migraciones NO llevan línea de
-- estado") el estado vive en supabase_migrations.schema_migrations y en el
-- mission doc, nunca en el fichero .sql. Aquí solo hay intención y
-- razonamiento, que no caducan.
--
-- ── Por qué existe esta migración ──────────────────────────
-- `aircraft_types` (33 filas) es el catálogo pre-Part-66 de códigos de
-- aeronave. Ya no tiene ningún lector en `src/`: el modelo vivo es
-- `aircraft_type_ratings` (606 filas, migración 020) referenciado desde
-- `technician_habilitations.aircraft_type_rating_id`. Lo único que lo
-- mantenía atado al esquema eran sus referencias entrantes. Esta migración
-- las retira, dejando la tabla huérfana y libre para decidir su destino
-- por separado.
--
-- ── ⚠ Corrección respecto a la versión anterior de esta migración ──
-- Una 028 previa (no commiteada, no aplicada — verificado contra
-- `supabase_migrations.schema_migrations`, última aplicada = 027) retiraba
-- UNA SOLA FK. HABRÍA FALLADO: hay DOS referencias entrantes a
-- `aircraft_types`, no una. El inventario de la Fase 5.1
-- (docs/PHASE5_INVENTORY.md, sección d) listaba solo la primera; está
-- corregido allí, junto con el post-mortem de por qué la consulta de
-- verificación se dejó la segunda.
--
-- Consulta que da la lista COMPLETA (dirección entrante — `confrelid`,
-- no `conrelid`; ese fue exactamente el error):
--
--   SELECT c.conname, r.relname AS table_name, pg_get_constraintdef(c.oid)
--   FROM pg_constraint c
--   JOIN pg_class r ON r.oid = c.conrelid
--   WHERE c.confrelid = 'public.aircraft_types'::regclass;
--
-- Resultado verificado en vivo contra rotoaxismatch-dev (2026-07-28):
--   technician_habilitations_aircraft_type_code_fkey
--   technician_aircraft_experience_aircraft_type_code_fkey
--
-- Barrido del resto de dependencias entrantes, misma fecha, mismo criterio:
--   vistas (pg_depend + pg_rewrite) ......... 0
--   funciones/RPC (pg_proc.prosrc) .......... 0
--   triggers (pg_trigger) ................... 0
-- Las dos FKs de arriba son la lista completa.
--
-- ── Seguridad del cambio (datos verificados en vivo) ───────
--   technician_habilitations ............... 5 filas
--     con aircraft_type_rating_id .......... 5  (100%)
--     con aircraft_type_code legacy ........ 2  (B407, B412 — y AMBAS
--        llevan además su aircraft_type_rating_id resuelto, así que el
--        código legacy es hoy información redundante, no la única
--        referencia de esa habilitación)
--   technician_aircraft_experience ......... 0 filas
--   aircraft_types ......................... 33 filas (intactas aquí)
-- Retirar una FK no borra ni modifica ninguna fila. Es reversible: basta
-- volver a añadir la constraint mientras el catálogo siga existiendo.
--
-- ── Lo que esta migración deliberadamente NO hace ──────────
-- (cada punto es una decisión de checkpoint, no un olvido)
--
--  1. NO hace `DROP TABLE aircraft_types`. Choca con la regla de CLAUDE.md
--     ("nunca DROP/DELETE/TRUNCATE de datos existentes en una migración;
--     desactivar, no borrar") sobre 33 filas reales. Tras esta migración
--     la tabla queda inerte y sin referencias; su retirada, si se aprueba,
--     va en una migración propia.
--
--  2. NO hace `DROP COLUMN technician_habilitations.aircraft_type_code`,
--     aunque el plan de la Fase 5 lo pida. Hoy la leen CUATRO puntos de
--     cliente vivos:
--       src/repositories/v2/supabaseMappers.ts:253  (en la carga de TODO
--                                                    técnico — rompería el
--                                                    producto entero)
--       app/technician/profile.tsx:249 y :288
--       scripts/backfillLegacyAircraftRatings.ts:71
--     Borrar la columna antes de migrar ese código rompe la app en
--     runtime. Va en la 029, DESPUÉS del cambio de código de la 5.3.
--     Entonces caerán con ella, automáticamente y sin trabajo extra, su
--     CHECK dual `chk_technician_habilitations_target` y la UNIQUE legacy
--     `technician_habilitations_technician_id_license_code_aircraf_key`.
--     Aviso para esa 029: al caer el CHECK dual, el invariante "toda
--     habilitación resuelve a un rating" deja de estar garantizado. El
--     reemplazo correcto NO es `NOT NULL` sobre `aircraft_type_rating_id`
--     — la 027 documenta que una fila `needs_review = true` conserva
--     `aircraft_type_rating_id` NULL a propósito — sino:
--       CHECK (aircraft_type_rating_id IS NOT NULL OR needs_review)
--
--  3. NO toca `technician_aircraft_experience` más allá de su FK. Tiene 0
--     filas y ningún camino de escritura en el código, pero SÍ tiene 4
--     lecturas vivas (una de ellas alimenta el componente `experience`
--     del match score). Retirarla es un cambio de producto, no una
--     limpieza: inventariada con 3 opciones en
--     docs/PHASE5_INVENTORY.md sección d-bis, pendiente de decisión.
--
-- Idempotente: segura de re-ejecutar.
-- ============================================================


-- ── A. FK entrante #1 — technician_habilitations ──────────────────────
-- La única que el inventario original había detectado.

ALTER TABLE technician_habilitations
  DROP CONSTRAINT IF EXISTS technician_habilitations_aircraft_type_code_fkey;

COMMENT ON COLUMN technician_habilitations.aircraft_type_code IS
  'Código de aeronave del modelo pre-Part-66. LEGACY, en retirada. Desde la migración 028 ya no tiene FK a aircraft_types: se conserva como texto libre solo para poder etiquetar filas legacy en la UI (HabilitationsEditor) hasta que la 5.3 migre esos 4 lectores de cliente; la columna la elimina la 029. La referencia viva es aircraft_type_rating_id → aircraft_type_ratings.';


-- ── B. FK entrante #2 — technician_aircraft_experience ────────────────
-- LA QUE FALTABA. Sin esta línea, un futuro DROP de aircraft_types falla
-- con "cannot drop table aircraft_types because other objects depend on
-- it". 0 filas en la tabla, así que retirar la constraint no puede dejar
-- ningún valor huérfano.

ALTER TABLE technician_aircraft_experience
  DROP CONSTRAINT IF EXISTS technician_aircraft_experience_aircraft_type_code_fkey;

COMMENT ON COLUMN technician_aircraft_experience.aircraft_type_code IS
  'Código de aeronave del modelo pre-Part-66. Desde la migración 028 ya no tiene FK a aircraft_types. La tabla tiene 0 filas y ningún camino de escritura en el código — feature a medio construir, pendiente de decisión (docs/PHASE5_INVENTORY.md, sección d-bis).';


-- ── C. Índice único duplicado (arrastre de la 027) ────────────────────
-- La 027 creó `uq_technician_habilitations_normalized` porque el
-- inventario 5.1 afirmó que no existía ningún índice único que cubriera
-- `aircraft_type_rating_id`. Sí existía: lo creó la 016 (línea 213) como
-- `uq_technician_habilitations_rating`, con columnas y predicado
-- IDÉNTICOS. Verificado en pg_indexes: hoy conviven los dos, duplicados
-- byte a byte. No es un bug de datos —la unicidad se aplica igual— pero
-- es doble coste en cada escritura y una trampa para el próximo que lea
-- el esquema.
--
-- Se retira el de la 027 (el más nuevo) y se conserva el de la 016 (el
-- original, y el que documenta el razonamiento de por qué la unicidad es
-- license-scoped). Retirar un índice duplicado no relaja ninguna
-- garantía: el gemelo sigue en pie.
--
-- NOTA: esto NO viola la regla de "nunca editar una migración aplicada".
-- La 027 se queda tal cual está en disco; su efecto se corrige aquí, en
-- una migración nueva, que es el mecanismo correcto.

DROP INDEX IF EXISTS uq_technician_habilitations_normalized;


-- ── D. Comprobación de post-condiciones ───────────────────────────────
-- Falla ruidosamente si el estado final no es el esperado, en vez de
-- dejar una migración "aplicada" que no consiguió lo que dice. Es la
-- traducción a SQL de la lección del post-mortem: no dar por buena una
-- verificación que no se ha ejecutado de verdad.

DO $$
DECLARE
  remaining_fks INTEGER;
  fk_list       TEXT;
  unique_idx    INTEGER;
BEGIN
  -- D.1 — cero referencias entrantes a aircraft_types, consultado por
  -- dirección entrante (confrelid), no por lista curada de tablas.
  SELECT COUNT(*), COALESCE(string_agg(c.conname, ', '), '(ninguna)')
    INTO remaining_fks, fk_list
  FROM pg_constraint c
  WHERE c.confrelid = 'public.aircraft_types'::regclass
    AND c.contype = 'f';

  IF remaining_fks <> 0 THEN
    RAISE EXCEPTION
      '028 incompleta: quedan % FK(s) apuntando a aircraft_types: %. '
      'Añádelas a esta migración — es exactamente el fallo que la 028 '
      'original cometió al listar solo una.',
      remaining_fks, fk_list;
  END IF;

  -- D.2 — la unicidad de las habilitaciones normalizadas sigue protegida
  -- por el índice de la 016 después de retirar el duplicado.
  SELECT COUNT(*) INTO unique_idx
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename  = 'technician_habilitations'
    AND indexname  = 'uq_technician_habilitations_rating';

  IF unique_idx <> 1 THEN
    RAISE EXCEPTION
      '028 abortada: uq_technician_habilitations_rating (migración 016) no '
      'existe. No retires el duplicado de la 027 sin él — dejarías las '
      'habilitaciones normalizadas sin unicidad a nivel de BD.';
  END IF;

  RAISE NOTICE '028 OK — aircraft_types sin referencias entrantes; unicidad de habilitaciones intacta (uq_technician_habilitations_rating).';
END $$;
