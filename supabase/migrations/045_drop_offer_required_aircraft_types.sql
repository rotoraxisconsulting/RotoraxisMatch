-- ============================================================
-- 045 — DROP TABLE offer_required_aircraft_types
--        (el requisito aproximado de aeronave por familia)
--
-- Fase 5 (misión Part-66, docs/MISSION_PART66.md). Fecha: 2026-08-04.
--
-- ⚠ PREPARADA, NO APLICADA. Se deja escrita y sin ejecutar a propósito
-- (instrucción explícita de la tarea). Esta cabecera NO declara si está
-- aplicada: por norma del proyecto (docs/MISSION_PART66.md, "las migraciones
-- NO llevan línea de estado") el estado vive en
-- supabase_migrations.schema_migrations y en el mission doc, nunca aquí.
--
-- ── Qué cierra ─────────────────────────────────────────────
-- Retirada del filtro aproximado por familia de aeronave del formulario de
-- oferta:
--   cambios de código Fase 5   → HECHOS (mismo commit que este fichero)
--   045 (esta)                 → DROP TABLE, con dump previo abajo
--
-- Va DESPUÉS de los cambios de código, no antes — mismo orden y mismo motivo
-- que la 029. El lector de esta tabla vivía en
-- src/repositories/v2/supabaseMappers.ts (loadOfferRequirements) dentro de un
-- Promise.all con `throwIfError(aircraftRes.error)` justo debajo: dropear la
-- tabla con ese SELECT en pie no habría degradado nada, habría tumbado el
-- LISTADO DE OFERTAS ENTERO (empresa, técnico y admin comparten ese mapper).
-- Ese lector ya no existe. Verificado antes de escribir esto:
--   - grep de `offer_required_aircraft_types` sobre app/ src/ scripts/ → 0
--     lectores y 0 escritores
--   - `npx tsc --noEmit` limpio
--   - `npm run test:matching` 150/150 en verde
--   - oferta 20012170 × técnico TAE839E67B sigue dando 76 %
--
-- ── Alcance: la tabla entera, no una columna ───────────────
-- offer_required_aircraft_types existe SOLO para el requisito aproximado.
-- Con `offer.requiredAircraftTypes` fuera de los tipos, los mappers y el
-- scorer, no le queda ni un lector ni un escritor: no es una columna
-- redundante dentro de una tabla viva, es una tabla que ya no representa
-- nada. Por eso DROP TABLE y no DROP COLUMN.
--
-- NO confundir con offer_required_licenses, que se QUEDA: sigue siendo un
-- requisito vivo, se edita en el formulario (RequiredLicensesSection), se
-- muestra en el detalle de la oferta y lo puntúa la rama de categoría de
-- licencia de offerMatchExplain.ts.
--
-- ── Barrido de dependencias ENTRANTES (dirección correcta) ──
-- Sobre offer_required_aircraft_types, 2026-08-04, consultando por
-- `confrelid` y los cuatro catálogos:
--   FKs entrantes (pg_constraint.confrelid) ........ 0
--   políticas RLS (pg_policies) .................... 4  ← todas SUYAS
--     └─ ora_select_published, ora_select_own_company,
--        ora_insert_company, ora_delete_company
--        Son políticas SOBRE esta tabla, no sobre otras que la referencien:
--        caen automáticamente con el DROP TABLE, no hay que borrarlas a mano.
--   funciones/RPC (pg_proc.prosrc) ................. 0
--   triggers (pg_trigger) .......................... 0
--   vistas (pg_depend + pg_rewrite) ................ 0
--   índices (pg_indexes) ........................... 1  ← su propia PK
--     └─ offer_required_aircraft_types_pkey — cae con la tabla.
-- Ninguna otra tabla apunta a esta, así que el DROP no necesita CASCADE y
-- deliberadamente no lo lleva: si apareciera una dependencia futura, es
-- preferible que el DROP falle ruidosamente a que arrastre objetos ajenos.
--
-- ── DUMP PREVIO (obligatorio, red de seguridad de la misión) ─
-- Estado en rotoaxismatch-dev leído inmediatamente antes de escribir esto:
--   16 filas, 4 ofertas distintas.
--
-- Las 4 ofertas afectadas tienen TODAS al menos una fila en
-- offer_required_habilitations, así que las cuatro ya se puntúan por la vía
-- exacta y ninguna dependía de estas filas para su score. Comprobado:
--   fc738962 → 5 filas aquí, 4 habilitaciones exactas
--   20012170 → 4 filas aquí, 2 habilitaciones exactas
--   18fbf24b → 4 filas aquí, 3 habilitaciones exactas
--   922c1206 → 3 filas aquí, 1 habilitación exacta
--
-- Contenido íntegro (offer_id | aircraft_type_code), recuperable tal cual:
--
--   18fbf24b-451a-4c82-9d5c-7510c9282ef7 | Bell::Agusta AB206 / Bell 206
--   18fbf24b-451a-4c82-9d5c-7510c9282ef7 | Bell::Bell 407
--   18fbf24b-451a-4c82-9d5c-7510c9282ef7 | Leonardo::AW169
--   18fbf24b-451a-4c82-9d5c-7510c9282ef7 | Robinson::Robinson R66
--   20012170-2e2c-4eeb-b267-68de7a4f4019 | Airbus Helicopters::Eurocopter AS 350
--   20012170-2e2c-4eeb-b267-68de7a4f4019 | Airbus Helicopters::Eurocopter EC 135
--   20012170-2e2c-4eeb-b267-68de7a4f4019 | Airbus Helicopters::Eurocopter MBB-BK 117 C2
--   20012170-2e2c-4eeb-b267-68de7a4f4019 | Leonardo::Agusta AB139 / AW139
--   922c1206-c9b2-4bb5-bc35-068dd94cfc9f | Airbus Helicopters::Eurocopter AS 350
--   922c1206-c9b2-4bb5-bc35-068dd94cfc9f | Airbus Helicopters::Eurocopter EC 135
--   922c1206-c9b2-4bb5-bc35-068dd94cfc9f | Sikorsky::Sikorsky S-76C
--   fc738962-a6fe-4f1d-90ee-c5e4c64749a6 | Airbus Helicopters::Eurocopter AS 350
--   fc738962-a6fe-4f1d-90ee-c5e4c64749a6 | Airbus Helicopters::Eurocopter EC 135
--   fc738962-a6fe-4f1d-90ee-c5e4c64749a6 | Airbus Helicopters::Eurocopter EC 175
--   fc738962-a6fe-4f1d-90ee-c5e4c64749a6 | Robinson::Robinson R22/R44 Series
--   fc738962-a6fe-4f1d-90ee-c5e4c64749a6 | Sikorsky::Sikorsky S-76C
--
-- Los valores son family keys ("<manufacturer>::<aircraftFamily>", migración
-- 022), no códigos del catálogo pre-Part-66: la columna conserva el nombre
-- `aircraft_type_code` por herencia, pero dejó de guardar códigos legacy.
--
-- Antes de aplicar, volcado adicional recomendado desde el CLI:
--   supabase db dump --data-only -t public.offer_required_aircraft_types \
--     -f dumps/2026-08-04_offer_required_aircraft_types.sql
--
-- Idempotente: DROP TABLE IF EXISTS; segura de re-ejecutar.
-- ============================================================


-- ── A. La tabla ───────────────────────────────────────────────────────
-- Arrastra consigo, automáticamente: su PK
-- (offer_required_aircraft_types_pkey) y sus 4 políticas RLS. Sin CASCADE
-- a propósito — ver la cabecera.

DROP TABLE IF EXISTS offer_required_aircraft_types;


-- ── B. Comprobación de post-condiciones ───────────────────────────────
-- Falla ruidosamente si el estado final no es el declarado, en vez de dejar
-- una migración "aplicada" que no consiguió lo que dice.

DO $$
DECLARE
  tabla_existe    BOOLEAN;
  politicas       INTEGER;
  licencias_vivas BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public'
                   AND table_name='offer_required_aircraft_types') INTO tabla_existe;

  SELECT COUNT(*) INTO politicas
  FROM pg_policies
  WHERE schemaname='public' AND tablename='offer_required_aircraft_types';

  SELECT EXISTS (SELECT 1 FROM information_schema.tables
                 WHERE table_schema='public'
                   AND table_name='offer_required_licenses') INTO licencias_vivas;

  IF tabla_existe THEN
    RAISE EXCEPTION '045 incompleta: offer_required_aircraft_types sigue existiendo.';
  END IF;

  IF politicas <> 0 THEN
    RAISE EXCEPTION '045 inconsistente: quedaron % políticas RLS huérfanas de offer_required_aircraft_types.', politicas;
  END IF;

  -- Guarda de alcance: esta migración retira SOLO el requisito aproximado.
  -- Si offer_required_licenses hubiera desaparecido, algo se llevó por
  -- delante un requisito vivo y hay que parar.
  IF NOT licencias_vivas THEN
    RAISE EXCEPTION '045 abortada: offer_required_licenses no existe — esa tabla NO entra en esta retirada y su ausencia significa que algo más la borró.';
  END IF;

  RAISE NOTICE '045 OK — offer_required_aircraft_types eliminada con sus políticas; offer_required_licenses intacta.';
END $$;
