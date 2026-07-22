# Informe — migración 023 (normalización de aircraft_family en las 80 filas curadas)

Generado: 2026-07-22. CHECKPOINT — no aplicado contra Supabase. Ver
`supabase/migrations/023_normalize_curated_aircraft_family.sql`.

## Origen

El usuario auditó directamente `aircraft_type_ratings` en Supabase: de las 80
filas curadas en la migración 016, 72 tienen `aircraft_family` distinto del
valor que se derivaría oficialmente (el mismo que usa
`scripts/generateEasaFullCatalogMigration.ts` para las ~526 filas que la
migración 020 sí insertó desde cero: el campo `aircraftFamily` propio de la
entrada JSON, encontrada por `easaEndorsement` — no una re-derivación nueva
por regex). Solo 8 ya coincidían. Verificado de forma independiente aquí
(script ad-hoc, mismo resultado: 72/80, 8/80) antes de escribir el SQL.

## Resumen

- Filas curadas auditadas: 80
- Ya coincidían con el valor oficial: 8
- Requieren UPDATE: 72
- Filas de `offer_required_aircraft_types` afectadas (family keys de la
  migración 022 que quedarían huérfanas): 3, las mismas 3 de siempre
  (offer `922c1206-c9b2-4bb5-bc35-068dd94cfc9f`)

## Las 8 que ya coincidían (sin cambios)

`00000000-0000-4000-a000-0000000000{39,41,46,47,57,65,76,77}`

## Las 72 filas: nombre viejo → nombre nuevo

| id (sufijo) | manufacturer | aircraft_family (viejo) | aircraft_family (nuevo, oficial) |
|---|---|---|---|
| 001 | Airbus | A318/A319/A320/A321 | Airbus A318/A319/A320/A321 |
| 002 | Airbus | A319/A320/A321 | Airbus A319/A320/A321 |
| 003 | Airbus | A319/A320/A321 | Airbus A319/A320/A321 |
| 004 | Airbus | A319/A320/A321 | Airbus A319/A320/A321 |
| 005 | Airbus | A330 | Airbus A330 |
| 006 | Airbus | A330 | Airbus A330 |
| 007 | Airbus | A330 | Airbus A330 |
| 008 | Airbus | A330neo | Airbus A330 |
| 009 | Airbus | A340-200/300 | Airbus A340 |
| 010 | Airbus | A340-500/600 | Airbus A340 |
| 011 | Airbus | A350 | Airbus A350 |
| 012 | Airbus | A380 | Airbus A380 |
| 013 | Airbus | A380 | Airbus A380 |
| 014 | Airbus | A220 | Bombardier BD-500 Series |
| 015 | Boeing | 737 Classic | Boeing 737-300/400/500 |
| 016 | Boeing | 737 NG | Boeing 737-600/700/800/900 |
| 017 | Boeing | 737 MAX | Boeing 737-7/8/9 |
| 018 | Boeing | 747-400 | Boeing 747-400 |
| 019 | Boeing | 747-400 | Boeing 747-400 |
| 020 | Boeing | 747-400 | Boeing 747-400 |
| 021 | Boeing | 747-8 | Boeing 747-8 |
| 022 | Boeing | 757 | Boeing 757-200/300 |
| 023 | Boeing | 757 | Boeing 757-200/300 |
| 024 | Boeing | 767 | Boeing 767-200/300/400 |
| 025 | Boeing | 767 | Boeing 767-200/300 |
| 026 | Boeing | 777 | Boeing 777-200/300 |
| 027 | Boeing | 777 | Boeing 777-200/300 |
| 028 | Boeing | 777 | Boeing 777-200/300 |
| 029 | Boeing | 787 | Boeing 787-8/9/10 |
| 030 | Boeing | 787 | Boeing 787-8/9/10 |
| 031 | Embraer | ERJ 135/145 | Embraer EMB-135/145 |
| 032 | Embraer | E170/E175 | Embraer ERJ-170 Series |
| 033 | Embraer | E190/E195 | Embraer ERJ-190 Series |
| 034 | Embraer | E190-E2/E195-E2 | Embraer ERJ-190 Series |
| 035 | ATR | ATR 42/72 | ATR 42-400/500/72-212A |
| 036 | Bombardier | Dash 8-100/200/300 | Bombardier DHC-8-100/200/300 |
| 037 | Bombardier | Dash 8 Q400 | Bombardier DHC-8-400 |
| 038 | Fokker | Fokker 50/60 | Fokker 50/60 Series |
| 040 | Saab | Saab 340 | Saab (SF) 340 |
| 042 | BAe | BAe 146/Avro RJ | BAe 146/ AVRO 146-RJ |
| 043 | CASA | C-212 | CASA C-212 |
| 044 | CASA | CN-235 | CASA CN-235 |
| 045 | Airbus Defence and Space | C-295 | CASA C-295 |
| 048 | Cessna | CitationJet/CJ1/CJ2/CJ3 | Cessna 525/525A/525B |
| 049 | Cessna | Citation CJ4 | Cessna 525C |
| 050 | Cessna | Citation II/V/Bravo/Ultra/Encore | Cessna 550/560 |
| 051 | Bombardier | Challenger 300/350 | Bombardier BD-100-1A10 |
| 052 | Bombardier | Global Express/5000/6000 | Bombardier BD-700 Series |
| 053 | Bombardier | Challenger 604/605 | Bombardier CL-600-2B16 (604 Variant) |
| 054 | Gulfstream | GIV/GIV-SP | Gulfstream GIV/GIV-SP Series |
| 055 | Gulfstream | GV-SP | Gulfstream GV-SP Series |
| 056 | Gulfstream | GVI | Gulfstream GVI |
| 058 | Pilatus | PC-12 | Pilatus PC-12 |
| 059 | Pilatus | PC-24 | Pilatus PC-24 |
| 060 | Daher | TBM | Socata TBM700 |
| 061 | Airbus Helicopters | AS350 | Eurocopter AS 350 |
| 062 | Airbus Helicopters | AS350/H125 | Eurocopter AS 350 |
| 063 | Airbus Helicopters | EC130/H130 | Eurocopter EC 130 |
| 064 | Bell | Bell 206/AB206 | Agusta AB206 / Bell 206 |
| 066 | Robinson | R66 | Robinson R66 |
| 067 | Robinson | R22/R44 | Robinson R22/R44 Series |
| 068 | Airbus Helicopters | EC135/H135 | Eurocopter EC 135 |
| 069 | Airbus Helicopters | EC135/H135 | Eurocopter EC 135 |
| 070 | Airbus Helicopters | EC145/BK117 C2 | Eurocopter MBB-BK 117 C2 |
| 071 | Airbus Helicopters | H145/BK117 D2 | Eurocopter MBB-BK 117 D2 |
| 072 | Airbus Helicopters | H175 | Eurocopter EC 175 |
| 073 | Airbus Helicopters | H225 | Eurocopter EC 225 |
| 074 | Leonardo | A109 | Agusta A109 Series |
| 075 | Leonardo | AW139 | Agusta AB139 / AW139 |
| 078 | Bell | Bell 412/AB412 | Bell 412 / Agusta AB412 |
| 079 | Sikorsky | S-76C | Sikorsky S-76C |
| 080 | Sikorsky | S-92A | Sikorsky S-92A |

(id completo: `00000000-0000-4000-a000-0000000000<sufijo>`)

## Las 3 family keys de offer_required_aircraft_types: vieja → nueva

| offer_id | family key (vieja, migración 022) | family key (nueva, migración 023) |
|---|---|---|
| 922c1206-c9b2-4bb5-bc35-068dd94cfc9f | `Sikorsky::S-76C` | `Sikorsky::Sikorsky S-76C` |
| 922c1206-c9b2-4bb5-bc35-068dd94cfc9f | `Airbus Helicopters::AS350/H125` | `Airbus Helicopters::Eurocopter AS 350` |
| 922c1206-c9b2-4bb5-bc35-068dd94cfc9f | `Airbus Helicopters::EC135/H135` | `Airbus Helicopters::Eurocopter EC 135` |

## Efecto colateral real (mejora, no solo relabeling)

Las filas `...061` ("AS350") y `...062` ("AS350/H125") pasan a compartir
family `"Eurocopter AS 350"` — antes estaban fragmentadas en dos grupos
distintos por una inconsistencia de naming puramente curada, no por ser
endorsements EASA distintos (mismo `easa_endorsement` base "Eurocopter AS
350", solo difieren en motor Arriel 1 vs Arriel 2). El filtro amplio
correctamente las agrupará como una sola familia tras esta migración.

## Lo que NO cambia (no es curación nueva, es el dato oficial tal cual)

El solape ceo/neo de la familia A320 de Airbus (ids 002/003/004, todas pasan
a `"Airbus A319/A320/A321"` — un rating V2500 ceo junto con dos ratings neo,
LEAP-1A y PW1100G) se mantiene después de esta normalización. Es así en el
propio endorsement EASA (no distingue ceo/neo en la parte "rango de
fuselaje" del nombre), no un artefacto de curación — no se ha inventado
ninguna partición nueva para separarlo.

## Otros sitios revisados que persisten o comparan por aircraft_family

- `offer_required_aircraft_types.aircraft_type_code` (migración 022) — el
  único otro lugar que PERSISTE un valor derivado de `aircraft_family`.
  Cubierto en la sección 2 de la migración 023.
- `src/utils/v2CompatAdapters.ts` (líneas ~44, ~335, ~513) y
  `app/technician/profile.tsx` (líneas ~510-516): derivan una lista de
  `aircraftFamily` en memoria, en cada lectura, para compat V1 / cálculo de
  completeness — nunca persisten el string en sí, solo un conteo/derivado
  que se recalcula solo. Se autocorrigen sin backfill. Aviso: si un técnico
  tenía habilitaciones en `...061` y `...062` por separado, su
  `profile_completeness` podría subir un punto tras esta migración (menos
  entradas "distintas" porque ahora se fusionan) — no es un bug, es más
  preciso.
- `information_schema.columns` de todo el proyecto: solo
  `aircraft_type_ratings.aircraft_family` y la tabla legacy no relacionada
  `aircraft_types.aircraft_family` (33 filas, en la lista de eliminación de
  Fase 5, esquema totalmente separado) tienen una columna con ese nombre.
  Nada más persiste una copia.
- `scripts/testMatching.ts` (FIXTURES): datos sintéticos, IDs `fx-*`, no
  relacionados con las filas curadas reales — no requieren backfill.
- `docs/*.md`, `docs/SUPABASE_SCHEMA_V2.sql`: pueden citar strings de
  family viejos como ejemplo — documentación histórica, nada los lee
  programáticamente, no se han tocado.
