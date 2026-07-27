# Informe de reconciliación — migración 020 (catálogo EASA completo)

Generado: 2026-07-19 por `scripts/generateEasaFullCatalogMigration.ts`.

> **APLICADA.** Tras la revisión de CHECKPOINT 1 (correcciones: motor de Cessna 337, 4 categorías reclasificadas, columna `product_type` añadida — ver historial de commits), la migración se aplicó contra `rotoaxismatch-dev` (`rwauwuremzkizeoginza`) en 9 pasos idempotentes (por límite de tamaño de una sola llamada, no por el contenido): `ALTER TABLE` de `product_type`, las 4 correcciones de deriva, 7 lotes del upsert de 606 filas, y el chequeo de sanidad final. Verificado en vivo: 606/606 filas activas, 0 `easa_group` NULL, 0 `product_type` NULL, los 80 ids originales preservados (ninguno cambió), Cessna 337 con `engine_manufacturer=Continental` en ambas filas. `get_advisors` re-ejecutado después: sin regresiones nuevas — los únicos hallazgos sobre `aircraft_type_ratings` son 2 índices sin uso (esperado, catálogo recién ampliado en un entorno de desarrollo) y el mismo patrón RLS preexistente `atr_admin`+`atr_read` de la migración 016.

## Resumen

- Endorsements en la fuente oficial: 606
- Filas actuales en `aircraft_type_ratings`: 80
- Correcciones de deriva de texto aplicadas (mismo id, string corregido): 4
- Coinciden (UPDATE, id preservado): 80
- Nuevas (INSERT): 526
- Obsoletas hoy activas sin match oficial (is_active=false, nunca delete): 0

## Correcciones de deriva de texto (easa_endorsement)

| id | string anterior (016) | string oficial (JSON) |
|---|---|---|
| 00000000-0000-4000-a000-000000000036 | Bombardier DHC-8-100/200/300 (PWC PW120) | Bombardier DHC-8-100/200/300 (PWC PW 120) |
| 00000000-0000-4000-a000-000000000038 | Fokker 50/60 Series (PWC PW125/127) | Fokker 50/60 Series (PWC PW 125/127) |
| 00000000-0000-4000-a000-000000000042 | BAe 146/AVRO 146-RJ (Honeywell ALF500 Series) | BAe 146/ AVRO 146-RJ (Honeywell ALF500 Series) |
| 00000000-0000-4000-a000-000000000057 | Dassault Falcon 900C/EX (Honeywell TFE731) | Falcon 900C/EX (Honeywell TFE731) |

## Filas que se desactivarían

Ninguna — las 80 filas activas actuales tienen correspondencia en la lista oficial (tras las 4 correcciones de deriva).

## Distribución de aircraft_category (heurística, todas las 606 filas)

| categoría | filas |
|---|---|
| general_aviation | 299 |
| helicopter | 82 |
| commercial_airplane | 74 |
| business_jet | 72 |
| regional_turboprop | 71 |
| regional_airplane | 8 |

## Motor: casos donde el parser no reconoció el patrón (16 de 606)

`engine_manufacturer` queda con el texto crudo completo y `engine_family` en NULL — nunca se adivinó una separación. Revisar si alguno merece añadirse a la tabla de prefijos conocidos del generador.

- "Airbus A380 (EA GP7200)" — designation: "EA GP7200"
- "Airbus A400M (EPI TP400)" — designation: "EPI TP400"
- "Alenia C-27 (Allison/RR AE2100)" — designation: "Allison/RR AE2100"
- "Antonov An-28 (ТВД)" — designation: "ТВД"
- "Falcon 2000 (CFE 738)" — designation: "CFE 738"
- "Falcon 7X (PW307)" — designation: "PW307"
- "Honda Aircraft HA-420 (HF120)" — designation: "HF120"
- "Kamov Ka 32 (Klimov)" — designation: "Klimov"
- "PZL-Swidnik W-3A/W-3AS (Rzeszow PZL-10W)" — designation: "Rzeszow PZL-10W"
- "RRJ-95 (PowerJet SaM146)" — designation: "PowerJet SaM146"
- "Sikorsky S-76D (PW210S)" — designation: "PW210S"
- "Thrush S2R Series (GEAC H80)" — designation: "GEAC H80"
- "Thrush S2R Series (TPE331)" — designation: "TPE331"
- "Air Tractor AT-401 (PZL-3S)" — designation: "PZL-3S"
- "Cessna 182/F182 Series (SMA)" — designation: "SMA"
- "Thrush S2R (Wsk PZL-3S)" — designation: "Wsk PZL-3S"

## Todas las filas de Aeroplane grupo 1 clasificadas (222 filas) — para auditar la heurística de categoría

| aircraftFamily | categoría asignada | motivo |
|---|---|---|
| ATP | regional_turboprop | group=1, regional-turboprop keyword match |
| ATR 42-200/300 series | regional_turboprop | group=1, regional-turboprop keyword match |
| ATR 42-400/500/72-212A | regional_turboprop | group=1, regional-turboprop keyword match |
| ATR 72-100/200 series | regional_turboprop | group=1, regional-turboprop keyword match |
| Air Tractor AT-800 Series | commercial_airplane | group=1, default (no keyword match) |
| Airbus A300 basic model | commercial_airplane | group=1, default (no keyword match) |
| Airbus A300 basic model | commercial_airplane | group=1, default (no keyword match) |
| Airbus A300-600 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A300-600 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A300-600 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A300-600ST | commercial_airplane | group=1, default (no keyword match) |
| Airbus A310 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A310 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A310 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A318 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A318/A319/A320/A321 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A319/A320/A321 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A319/A320/A321 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A319/A320/A321 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A330 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A330 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A330 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A330 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A340 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A340 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A350 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A380 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A380 | commercial_airplane | group=1, default (no keyword match) |
| Airbus A400M | commercial_airplane | group=1, default (no keyword match) |
| Alenia C-27 | regional_turboprop | group=1, regional-turboprop keyword match |
| Antonov AN26 | regional_turboprop | group=1, regional-turboprop keyword match |
| Antonov An-28 | regional_turboprop | group=1, regional-turboprop keyword match |
| BAe 125 Series | business_jet | group=1, business-jet keyword match |
| BAe 125 Series | business_jet | group=1, business-jet keyword match |
| BAe 125 Series 1000 | business_jet | group=1, business-jet keyword match |
| BAe 125 Series 750/800XP/850XP/900XP | business_jet | group=1, business-jet keyword match |
| BAe 146/ AVRO 146-RJ | regional_airplane | group=1, regional-jet keyword match |
| Beech 1900 | regional_turboprop | group=1, regional-turboprop keyword match |
| Beech 200 Series | general_aviation | group=1, general-aviation keyword match |
| Beech 300 Series | general_aviation | group=1, general-aviation keyword match |
| Beech 390 | business_jet | group=1, business-jet keyword match |
| Beech 400/Mitsubishi MU-300 | business_jet | group=1, business-jet keyword match |
| Beech 400A | business_jet | group=1, business-jet keyword match |
| Beech 90 Series | general_aviation | group=1, general-aviation keyword match |
| Beech 99/100 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Beech B100 | general_aviation | group=1, general-aviation keyword match |
| Beriev 200 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 707 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 707 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 707/720 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 727 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 737-100/200 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 737-300/400/500 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 737-600/700/800/900 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 737-7/8/9 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-100 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-400 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-400 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-400 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747-8 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 747SP | commercial_airplane | group=1, default (no keyword match) |
| Boeing 757-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 757-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 767-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 767-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 767-200/300/400 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 767-300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 777-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 777-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 777-200/300 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 787-8/9/10 | commercial_airplane | group=1, default (no keyword match) |
| Boeing 787-8/9/10 | commercial_airplane | group=1, default (no keyword match) |
| Bombardier BD-100-1A10 | business_jet | group=1, business-jet keyword match |
| Bombardier BD-500 Series | commercial_airplane | group=1, default (no keyword match) |
| Bombardier BD-700 Series | business_jet | group=1, business-jet keyword match |
| Bombardier BD-700-2A12 | business_jet | group=1, business-jet keyword match |
| Bombardier CL-600-1A11 | business_jet | group=1, business-jet keyword match |
| Bombardier CL-600-2A12/2B16 (601/601-3A/3R Variant) | business_jet | group=1, business-jet keyword match |
| Bombardier CL-600-2B16 (604 Variant) | business_jet | group=1, business-jet keyword match |
| Bombardier CL-600-2B19 | business_jet | group=1, business-jet keyword match |
| Bombardier CL-600-2C10/2D15/2D24/2E25 | business_jet | group=1, business-jet keyword match |
| Bombardier DHC-8-100/200/300 | regional_turboprop | group=1, regional-turboprop keyword match |
| Bombardier DHC-8-400 | regional_turboprop | group=1, regional-turboprop keyword match |
| Britten-Norman BN2T Series | general_aviation | group=1, general-aviation keyword match |
| CASA C-212 | regional_turboprop | group=1, regional-turboprop keyword match |
| CASA C-212 | regional_turboprop | group=1, regional-turboprop keyword match |
| CASA C-295 | regional_turboprop | group=1, regional-turboprop keyword match |
| CASA CN-235 | regional_turboprop | group=1, regional-turboprop keyword match |
| CIRRUS SF50 | business_jet | group=1, business-jet keyword match |
| Canadair CL-215 | commercial_airplane | group=1, default (no keyword match) |
| Canadair CL-215 | commercial_airplane | group=1, default (no keyword match) |
| Canadair CL-415 | commercial_airplane | group=1, default (no keyword match) |
| Cessna 400 Series | general_aviation | group=1, general-aviation keyword match |
| Cessna 425 | general_aviation | group=1, general-aviation keyword match |
| Cessna 441 | general_aviation | group=1, general-aviation keyword match |
| Cessna 500/550/560 | business_jet | group=1, business-jet keyword match |
| Cessna 501 | business_jet | group=1, business-jet keyword match |
| Cessna 501/551 | business_jet | group=1, business-jet keyword match |
| Cessna 510 | business_jet | group=1, business-jet keyword match |
| Cessna 525/525A/525B | business_jet | group=1, business-jet keyword match |
| Cessna 525C | business_jet | group=1, business-jet keyword match |
| Cessna 550/560 | business_jet | group=1, business-jet keyword match |
| Cessna 550/S550 | business_jet | group=1, business-jet keyword match |
| Cessna 560XL/XLS | business_jet | group=1, business-jet keyword match |
| Cessna 650 | business_jet | group=1, business-jet keyword match |
| Cessna 680 | business_jet | group=1, business-jet keyword match |
| Cessna 750 | business_jet | group=1, business-jet keyword match |
| DC-10/MD-10 | commercial_airplane | group=1, default (no keyword match) |
| DC-8 | commercial_airplane | group=1, default (no keyword match) |
| DC-8 | commercial_airplane | group=1, default (no keyword match) |
| DC-8 | commercial_airplane | group=1, default (no keyword match) |
| DC-9 | commercial_airplane | group=1, default (no keyword match) |
| De Havilland DHC-6 | regional_turboprop | group=1, regional-turboprop keyword match |
| De Havilland DHC-7 | regional_turboprop | group=1, regional-turboprop keyword match |
| Dornier 228 | regional_turboprop | group=1, regional-turboprop keyword match |
| Dornier 328-100 | regional_turboprop | group=1, regional-turboprop keyword match |
| Dornier 328-300 | regional_turboprop | group=1, regional-turboprop keyword match |
| Dornier Do 28 | regional_turboprop | group=1, regional-turboprop keyword match |
| Dornier Do 28 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Dornier Seastar CD2 | regional_turboprop | group=1, regional-turboprop keyword match |
| Eclipse EA500 | business_jet | group=1, business-jet keyword match |
| Embraer EMB-110 | regional_turboprop | group=1, regional-turboprop keyword match |
| Embraer EMB-120 | regional_turboprop | group=1, regional-turboprop keyword match |
| Embraer EMB-121 | general_aviation | group=1, general-aviation keyword match |
| Embraer EMB-135/145 | regional_airplane | group=1, regional-jet keyword match |
| Embraer EMB-500 | business_jet | group=1, business-jet keyword match |
| Embraer EMB-505 | business_jet | group=1, business-jet keyword match |
| Embraer EMB-545/550 | business_jet | group=1, business-jet keyword match |
| Embraer ERJ-170 Series | regional_airplane | group=1, regional-jet keyword match |
| Embraer ERJ-190 Series | regional_airplane | group=1, regional-jet keyword match |
| Embraer ERJ-190 Series | regional_airplane | group=1, regional-jet keyword match |
| Fairchild SA226 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Fairchild SA227 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Fairchild SA227 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Fairchild SA26-T | regional_turboprop | group=1, regional-turboprop keyword match |
| Fairchild SA26AT | regional_turboprop | group=1, regional-turboprop keyword match |
| Falcon 10 | business_jet | group=1, business-jet keyword match |
| Falcon 20 | business_jet | group=1, business-jet keyword match |
| Falcon 20-5 | business_jet | group=1, business-jet keyword match |
| Falcon 200 | business_jet | group=1, business-jet keyword match |
| Falcon 2000 | business_jet | group=1, business-jet keyword match |
| Falcon 2000EX | business_jet | group=1, business-jet keyword match |
| Falcon 2000EX EASy | business_jet | group=1, business-jet keyword match |
| Falcon 20E | business_jet | group=1, business-jet keyword match |
| Falcon 50 | business_jet | group=1, business-jet keyword match |
| Falcon 50EX | business_jet | group=1, business-jet keyword match |
| Falcon 7X | business_jet | group=1, business-jet keyword match |
| Falcon 900 | business_jet | group=1, business-jet keyword match |
| Falcon 900C/EX | business_jet | group=1, business-jet keyword match |
| Falcon 900EX EASy | business_jet | group=1, business-jet keyword match |
| Fokker 50/60 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Fokker 70/100 | regional_airplane | group=1, regional-jet keyword match |
| Fokker F27 / Fairchild F-27/FH-227 Series | regional_turboprop | group=1, regional-turboprop keyword match |
| Fokker F28 Series | regional_airplane | group=1, regional-jet keyword match |
| Grob G 520 Series | general_aviation | group=1, general-aviation keyword match |
| Gulfstream (IAI) 100/1125/Astra SPX | business_jet | group=1, business-jet keyword match |
| Gulfstream (IAI) 200/Galaxy | business_jet | group=1, business-jet keyword match |
| Gulfstream (IAI) G150 | business_jet | group=1, business-jet keyword match |
| Gulfstream (IAI) G280 | business_jet | group=1, business-jet keyword match |
| Gulfstream G-1159 Series | business_jet | group=1, business-jet keyword match |
| Gulfstream G-159 | business_jet | group=1, business-jet keyword match |
| Gulfstream GIV-X Series | business_jet | group=1, business-jet keyword match |
| Gulfstream GIV/GIV-SP Series | business_jet | group=1, business-jet keyword match |
| Gulfstream GV basic model | business_jet | group=1, business-jet keyword match |
| Gulfstream GV-SP Series | business_jet | group=1, business-jet keyword match |
| Gulfstream GVI | business_jet | group=1, business-jet keyword match |
| Gulfstream GVII | business_jet | group=1, business-jet keyword match |
| HS748 | regional_turboprop | group=1, regional-turboprop keyword match |
| Hawker 4000 | business_jet | group=1, business-jet keyword match |
| Honda Aircraft HA-420 | business_jet | group=1, business-jet keyword match |
| IAI 1121/1123 | business_jet | group=1, business-jet keyword match |
| IAI 1124 | business_jet | group=1, business-jet keyword match |
| Jetstream 31/32 | regional_turboprop | group=1, regional-turboprop keyword match |
| Jetstream 41 | regional_turboprop | group=1, regional-turboprop keyword match |
| Learjet 23 | business_jet | group=1, business-jet keyword match |
| Learjet 24/25 | business_jet | group=1, business-jet keyword match |
| Learjet 31 | business_jet | group=1, business-jet keyword match |
| Learjet 35/36 | business_jet | group=1, business-jet keyword match |
| Learjet 45 | business_jet | group=1, business-jet keyword match |
| Learjet 55 | business_jet | group=1, business-jet keyword match |
| Learjet 60 | business_jet | group=1, business-jet keyword match |
| Let L-410 | regional_turboprop | group=1, regional-turboprop keyword match |
| Let L-410 | regional_turboprop | group=1, regional-turboprop keyword match |
| Let L-420 | regional_turboprop | group=1, regional-turboprop keyword match |
| Let-410 | regional_turboprop | group=1, regional-turboprop keyword match |
| Lockheed 1329 | business_jet | group=1, business-jet keyword match |
| Lockheed 1329 PW | business_jet | group=1, business-jet keyword match |
| Lockheed 188 | commercial_airplane | group=1, default (no keyword match) |
| Lockheed 382 | commercial_airplane | group=1, default (no keyword match) |
| Lockheed L-1011 | commercial_airplane | group=1, default (no keyword match) |
| MD 717-200 | commercial_airplane | group=1, default (no keyword match) |
| MD-11 | commercial_airplane | group=1, default (no keyword match) |
| MD-11 | commercial_airplane | group=1, default (no keyword match) |
| MD-80 Series | commercial_airplane | group=1, default (no keyword match) |
| MD-90 | commercial_airplane | group=1, default (no keyword match) |
| Mitsubishi MU-2B | general_aviation | group=1, general-aviation keyword match |
| Nomad N22/24 Series | general_aviation | group=1, general-aviation keyword match |
| PZL M 28 | general_aviation | group=1, general-aviation keyword match |
| Piaggio P166 | general_aviation | group=1, general-aviation keyword match |
| Piaggio P180 Avanti/Avanti II | general_aviation | group=1, general-aviation keyword match |
| Pilatus PC-12 | general_aviation | group=1, general-aviation keyword match |
| Pilatus PC-24 | business_jet | group=1, business-jet keyword match |
| Piper PA-31T Series | general_aviation | group=1, general-aviation keyword match |
| Piper PA-42 | general_aviation | group=1, general-aviation keyword match |
| Piper PA-42 | general_aviation | group=1, general-aviation keyword match |
| Piper PA-46-500TP/600TP | general_aviation | group=1, general-aviation keyword match |
| RRJ-95 | regional_airplane | group=1, regional-jet keyword match |
| Reims-Cessna F 406 | general_aviation | group=1, general-aviation keyword match |
| Saab (SF) 340 | regional_turboprop | group=1, regional-turboprop keyword match |
| Saab 2000 | regional_turboprop | group=1, regional-turboprop keyword match |
| Shorts SC7 | regional_turboprop | group=1, regional-turboprop keyword match |
| Shorts SD3 Series-30/SD3-60 | regional_turboprop | group=1, regional-turboprop keyword match |
| Socata TBM700 | general_aviation | group=1, general-aviation keyword match |
| TAI TT32 | commercial_airplane | group=1, default (no keyword match) |
| Textron Defense 3000 | commercial_airplane | group=1, default (no keyword match) |
| Tupolev TU 204 | commercial_airplane | group=1, default (no keyword match) |
| Twin Commander 680/681/690/695 Series | general_aviation | group=1, general-aviation keyword match |
| Vulcanair AP68TP Series | general_aviation | group=1, general-aviation keyword match |
| Vulcanair SF600 | general_aviation | group=1, general-aviation keyword match |

## Filas de Gas Airship (mapeadas a general_aviation — decisión a confirmar)

- Skyship (Skyship (Porsche))
- Worldwide Aeros (Worldwide Aeros (Continental))
- Zeppelin LZ N07 (Zeppelin LZ N07 (Lycoming))
