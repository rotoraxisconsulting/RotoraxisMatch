# Análisis: modelado de licencias Part-66, habilitaciones, experiencia y requisitos de oferta

> Documento de análisis. No modifica código ni esquema. Generado a partir de lectura directa del repositorio (`supabase/migrations/001_initial_schema_v2.sql`, `src/types/*`, `src/constants/*`, `src/repositories/v2/*`, `src/utils/*`, pantallas en `app/technician/*` y `app/company/*`, seeds en `src/data/seeds/*`, y `docs/*_V2.md`) en su estado a 2026-07-08, rama `main`.

---

## 1. Resumen ejecutivo

El sistema **ya tiene una arquitectura de datos mejor de lo que el enunciado del encargo presupone**. La migración `001_initial_schema_v2.sql` no modela licencias y aeronaves como dos listas planas independientes: existe una tabla `technician_habilitations` que vincula explícitamente `technician_id + license_code + aircraft_type_code` en una sola fila (el equivalente a la "Opción 4" que se propone evaluar en el encargo). Eso es la decisión de diseño correcta y **no hay que rehacerla**.

El problema real no es la ausencia de este vínculo — es que:

1. **Un bug de escritura lo rompe en la práctica.** `technicianRepositoryV2.updateAircraftTypes()` (`src/repositories/v2/technicianRepositoryV2.ts:221-241`) borra todas las habilitaciones del técnico y las reinserta usando **una sola licencia por defecto** (`licenses[0]?.licenseCode`) para *todas* las aeronaves seleccionadas. Un técnico con B1.1 + B2 que marca A320 y AW139 en el formulario de perfil termina con ambas habilitaciones colgadas de la misma licencia (la primera del array), sin importar cuál es la real. Esto es exactamente el caso prohibido en la sección 4.3 del encargo, y hoy se produce automáticamente cada vez que un técnico guarda su perfil.
2. **El algoritmo de matching no usa el vínculo que sí existe.** `calculateOfferTechnicianMatch()` (`src/utils/matchingV2.ts:22-37`) puntúa "licencia" y "habilitación" **por separado**: mira si el técnico tiene *alguna* licencia requerida (`technician.licenses`, tabla sin aeronave) y, en un cálculo distinto, si tiene *alguna* habilitación con la aeronave requerida (`technician.habilitations`, ignorando su `licenseCode`). Un técnico con licencia B1.1 (sin aeronave) y una habilitación A320 colgada de B2 puntúa el máximo en ambos criterios para una oferta "B1.1 + A320", aunque esa combinación no exista realmente en su perfil.
3. **No existe la dimensión motor/variante.** `aircraft_types` es un catálogo a nivel de familia/modelo (`A320`, `B737`, `AW139`…) sin ningún campo de motorización. Los casos reales descritos en la sección 4.1 del encargo (A320 CFM56 vs A320 V2500, A330 CF6 vs A330 Trent 700) no se pueden representar hoy.
4. **Los requisitos de oferta no distinguen obligatorio/preferido.** `offer_required_technician_types`, `offer_required_licenses`, `offer_required_aircraft_types` son tablas puente de clave compuesta sin ninguna columna de prioridad. Hoy, en la práctica, **nada bloquea nada**: la ausencia de requisitos otorga puntuación automática máxima y la presencia de requisitos solo resta puntos si no se cumplen, pero nunca excluye a un técnico de la búsqueda ni le impide aplicar.
5. **Hay dos catálogos de aeronaves divergentes.** El `aircraft_types` sembrado en SQL (`001_initial_schema_v2.sql:181-214`) agrupa por `aircraft_family` en baldes muy anchos (`narrow_body`, `wide_body`, `turboprop`, `helicopter`). El catálogo real que usa la aplicación —`src/constants/aircraftTypes.ts`, consultado por `catalogRepository`, que **no toca Supabase para catálogos**— agrupa por familia comercial real (`A320` agrupa A318/19/20/21, `CRJ` agrupa los tres CRJ, etc.). Son dos fuentes de verdad distintas para el mismo concepto.

La recomendación de este informe **no es construir una jerarquía nueva completa** (rechazamos la Opción 5 y la propuesta de la sección 16 tal cual, ver §10-11), sino:

- Arreglar (en una fase posterior, no ahora) los dos bugs anteriores, que no requieren cambio de esquema.
- Añadir un puñado de columnas **opcionales y aditivas** a tablas que ya existen (`technician_habilitations`, `technician_licenses`, `offer_required_*`) para capturar motor (texto libre, no catálogo nuevo todavía), obligatorio/preferido, y verificado/declarado.
- Diferir la construcción de un catálogo formal de "habilitaciones específicas" (`aircraft_ratings`) a una fase posterior, una vez que el campo de texto libre demuestre qué combinaciones motor+familia se repiten de verdad en los datos reales de la plataforma.
- Reescribir el algoritmo de matching como reglas explicables (exacta / cercana / por experiencia / información insuficiente / sin coincidencia clara) en vez del score aditivo opaco actual.

Esto respeta el principio de la sección 22 del encargo: no asumir que una arquitectura más compleja es mejor, y no tocar lo que ya funciona.

---

## 2. Alcance del análisis

Revisado en profundidad y de forma directa (no por muestreo):
- Migración completa `supabase/migrations/001_initial_schema_v2.sql` (1636 líneas) y las 15 migraciones incrementales (`002`–`015`).
- Tipos TypeScript: `src/types/catalog.ts`, `technician.ts`, `offer.ts`, `offerRequest.ts`, `enums.ts`, `matching.ts`, `matchRequest.ts`, `privacy.ts`, `profile.ts`.
- Constantes: `src/constants/aircraftTypes.ts`, `licenses.ts`, `technicianTypes.ts`, `verificationStatuses.ts`.
- Repositorios V2 completos: `catalogRepository.ts`, `technicianRepositoryV2.ts`, `offerRepository.ts`, `offerRequestRepository.ts`, `offerApplicationRepository.ts`, `chatRepository.ts`, `documentRepositoryV2.ts`, `supabaseMappers.ts`.
- Lógica de negocio: `src/utils/matching.ts` (V1, código muerto salvo `getMatchLabel`), `matchingV2.ts` (el vigente), `offerRelationStateMachine.ts`, `privacyV2.ts`, `v2CompatAdapters.ts`, `companyPermissionsV2.ts`.
- Pantallas: `app/technician/profile.tsx`, `app/company/offers/new.tsx` y `edit.tsx`, `app/company/search.tsx`, `app/company/applications/[id].tsx`, `app/company/direct-offers/[id].tsx`, `app/technician/offers/[id].tsx`, `app/technician/direct-offers/[id].tsx`.
- Componentes de presentación: `MatchBadge.tsx`, `InlineScore.tsx`, `TechnicianFilters.tsx`, `TechnicianCard.tsx`, `MatchRequestCard.tsx` (estos dos últimos confirmados como código muerto, no importados en `app/`).
- Seeds completos: `technicianLicenses.json`, `technicianHabilitations.json`, `technicianAircraftExperience.json`, `offerRequiredAircraftTypes.json`, `offerRequiredLicenses.json`, `offerRequiredTechnicianTypes.json`, y muestras de `technicianProfiles.json` / `offers.json`.
- Documentación V2: `DATA_MODEL_V2.md`, `TYPESCRIPT_TYPES_V2.md`, `SUPABASE_SCHEMA_V2.sql`, `RLS_PLAN_V2.md`, `MIGRATION_FROM_DEMO_TO_V2.md`, `HANDOFF_SUMMARY.md`, más los informes puntuales `V2_AIRCRAFT_CATEGORY_UX_REPORT.md`, `V2_S0B_H8_GENERAL_AIRCRAFT_CODE_REPORT.md`, `V2_S0B_H9_OFFER_REQUIREMENTS_COMPOSITE_PK_REPORT.md`.

No se ha modificado ningún archivo. No se ha ejecutado ninguna migración. Este informe es puramente de lectura y análisis.

---

## 3. Arquitectura actual encontrada

El patrón repetido en toda la capa de datos V2 es: **catálogo estático (código/etiqueta) + tabla relacional por técnico u oferta que referencia el código**. No hay jerarquías; todo es plano a un nivel, salvo `technician_habilitations`, que es la única tabla de dos dimensiones (categoría × aeronave).

```
Catálogos (código/etiqueta, sin jerarquía):
  technician_types, license_categories, aircraft_types, company_types, contract_types

Por técnico:
  technician_profiles ─┬─ technician_licenses          (technician_id, license_code)
                        ├─ technician_habilitations      (technician_id, license_code, aircraft_type_code)  ← única tabla 2D
                        └─ technician_aircraft_experience (technician_id, aircraft_type_code, value, unit)

Por oferta:
  offers ─┬─ offer_required_technician_types (offer_id, technician_type_code)
           ├─ offer_required_licenses         (offer_id, license_code)
           └─ offer_required_aircraft_types    (offer_id, aircraft_type_code)
```

Dato relevante: **`catalogRepository.ts` no consulta Supabase en absoluto** — todas sus funciones (`getAircraftTypes()`, `getLicenseCategories()`, etc.) leen directamente de los arrays constantes de `src/constants/*.ts`. Las tablas `aircraft_types`/`license_categories`/`technician_types`/`company_types`/`contract_types` en Supabase existen únicamente para dar integridad referencial (FKs) a las tablas relacionales — la UI nunca las lee. Esto explica por qué pueden divergir (ver §9) sin que nada lo detecte automáticamente.

---

## 4. Tablas y relaciones actuales

| Tabla | Columnas clave | Constraint relevante | Archivo:línea |
|---|---|---|---|
| `license_categories` | `code` (PK), `label`, `category_group`, `sort_order` | 13 filas: A1-A4, B1.1-B1.4, B2, B2L, B3, L, C | `001:130-135`, seed `166-179` |
| `aircraft_types` | `code` (PK), `label`, `manufacturer`, `aircraft_family`, `aircraft_category` CHECK(`airplane`\|`helicopter`), `is_active` | 33 filas | `001:137-144`, seed `181-214` |
| `technician_licenses` | `id`, `technician_id`→`technician_profiles`, `license_code`→`license_categories`, `issued_at`, `expires_at` | `UNIQUE(technician_id, license_code)` | `001:641-649` |
| `technician_habilitations` | `id`, `technician_id`, `license_code`→`license_categories`, `aircraft_type_code`→`aircraft_types`, `issued_at`, `expires_at` | `UNIQUE(technician_id, license_code, aircraft_type_code)` | `001:651-660` |
| `technician_aircraft_experience` | `id`, `technician_id`, `aircraft_type_code`→`aircraft_types`, `value` (float), `unit` (`hours`\|`years`) | `UNIQUE(technician_id, aircraft_type_code)` | `001:662-670` |
| `documents` | `id`, `technician_id`, `type` (TEXT libre, sin CHECK), `status` (`document_status`), `reviewed_at`, `rejection_reason`, `expires_at` | — | `001:672-683` |
| `offers` | ... `min_years_experience` (escalar único, no por aeronave/categoría) | — | `001:717-733` |
| `offer_required_technician_types` | `offer_id`, `technician_type_code` | PK compuesta | `001:735-739` |
| `offer_required_licenses` | `offer_id`, `license_code` | PK compuesta | `001:741-745` |
| `offer_required_aircraft_types` | `offer_id`, `aircraft_type_code` | PK compuesta | `001:747-751` |

Puntos importantes que no son evidentes solo con los nombres:

- **`technician_habilitations` no tiene FK hacia `technician_licenses`.** Son tablas independientes que comparten `license_code` solo como valor, no como relación forzada por la base de datos. Nada impide (a nivel de esquema) que un técnico tenga una habilitación con `license_code = 'B2'` sin tener nunca una fila en `technician_licenses` con `license_code = 'B2'`. En los seeds esto es consistente por convención de quien escribió los datos, no por constraint.
- **`technician_aircraft_experience` no tiene dimensión de categoría/licencia.** Es intencional según `docs/DATA_MODEL_V2.md` ("Experience... is stored separately — these two are independent"), y corresponde exactamente a la distinción que pide la sección 4.6 del encargo entre "qué aparece en la AML" y "qué experiencia declara" — **ya está separado correctamente**, aunque le faltan campos (línea/base, última fecha trabajada — ver §7).
- `documents.type` es texto libre sin `CHECK`; los valores usados en la práctica (`license`, `training`, `resume`, `other`, `medical`, `id`) están solo documentados en un comentario de `007_restrict_company_doc_access.sql:14-19`, no forzados por el esquema.
- RLS: las tres tablas técnicas (`technician_licenses`, `technician_habilitations`, `technician_aircraft_experience`) comparten un patrón de 5 políticas (`001:1111-1164`): owner select/insert/delete, **una política de solo-lectura para cualquier `company_user` activo** (sin relación con si esa empresa tiene match con el técnico — es una lectura global, no por privacidad de identidad, coherente con que estos datos ya son "seguros" según `RLS_PLAN_V2.md`), y admin-all.
- `offer_required_*`: legibles públicamente si la oferta está `published` y `visible`; escribibles solo por `can_act_for_company(offer.company_id)`.
- No existe ningún ENUM de Postgres para las categorías Part-66 — es una tabla (`license_categories`), lo cual es correcto y extensible (añadir B1.E o subcategorías de L en el futuro es un `INSERT`, no una migración de esquema).

---

## 5. Flujos actuales de técnico y empresa

**Perfil técnico** (`app/technician/profile.tsx`, 916 líneas, sin componentes de formulario separados — todo inline):
- Carga en paralelo `technician_profiles` + `technician_licenses` + `technician_habilitations` + `technician_aircraft_experience` (líneas 193-206).
- Sección "Licenses" (línea 635): grid plano de chips con los 13 códigos de `LICENSE_CATEGORIES`. **No hay campos de número de licencia, autoridad emisora ni fecha de caducidad**, aunque el tipo `TechnicianLicense` y la tabla ya soportan `issuedAt`/`expiresAt`.
- Sección "Aircraft types" (línea 649): dos grids planos independientes (aviones / helicópteros) sobre `AIRCRAFT_TYPE_CATALOG`. **Categoría y aeronave no están vinculadas en la UI** — se eligen de listas completamente separadas.
- Guardado (`handleSave`, línea 281): borra y reinserta todo el conjunto de licencias y habilitaciones (líneas 322-360). Es aquí donde ocurre el bug del §1.4 (`defaultLicense = form.licenseCategories[0]`, línea 349).
- No hay entrada manual para aeronaves fuera de catálogo. No hay edición de `technicianType` en esta pantalla (se fija en el alta, `app/auth/signup/technician.tsx:51`, y no se puede cambiar después). No hay campos de línea/base maintenance, ni de curso de tipo, ni de última fecha trabajada — solo un número derivado de "años de experiencia" (máximo entre filas de `technician_aircraft_experience`, no editable por aeronave).

**Creación/edición de oferta** (`app/company/offers/new.tsx`, `edit.tsx`): tres selectores de chips independientes (tipo de técnico, licencias, aeronaves — estas últimas con pestañas Airplanes/Helicopters), todos con el mismo patrón "vacío = abierto a cualquiera". No hay distinción obligatorio/preferido en ningún sitio del formulario ni del tipo `OfferWithRequirements`. El único texto libre es `description` — no hay un campo de "observaciones" separado. `minYearsExperience` es un stepper 0-30, escalar, no por aeronave.

**Búsqueda de empresa** (`app/company/search.tsx`): el componente de filtros "oficial" del V1 (`TechnicianFilters.tsx`) está **muerto, no importado en ningún sitio**. La pantalla real usa filtros inline: país/ciudad (texto libre), disponibilidad (binario: cualquiera / disponible ahora — más simple que las 3 opciones del componente muerto), verificación (binario), licencia (solo 8 de las 13 categorías, `LICENSE_CATEGORIES.slice(0,8)`, selección única), y categoría de aeronave (no tipo específico — solo avión/helicóptero, aplicado como post-filtro en cliente). No hay filtro por aeronave concreta (p. ej. "A320") en la pantalla viva.

**Aplicaciones y ofertas directas**: dos tablas paralelas (`offer_applications` iniciada por técnico, `offer_requests` iniciada por empresa), gobernadas por una máquina de estados común (`offerRelationStateMachine.ts`): `pending → {accepted, rejected, expired, withdrawn}` (terminal). Ambos repositorios ya se protegen mutuamente contra duplicados cruzados (no se puede tener una aplicación activa y una oferta directa activa para el mismo par técnico/oferta a la vez).

**Chat e identidad**: gateado íntegramente por `status === 'accepted'` (`privacyV2.ts:65-74`, función `hasAcceptedRecord`), sin excepciones. `chatRepository.getOrCreateRoom()` nunca crea una sala del lado del cliente — solo la busca; si no existe, lanza el error explícito *"Chat is only available after an accepted offer."* La sala la crea un trigger de servidor al aceptar. Esta regla ya existe hoy, es intencional, documentada como el "core rule" de `privacyV2.ts`, y **coincide exactamente** con la excepción de seguridad/privacidad que la sección 12 del encargo permite mantener sin cambios.

---

## 6. Lógica de matching actual

Hay dos implementaciones; solo una está viva.

**`src/utils/matching.ts` (V1) — código muerto** salvo `getMatchLabel`. `computeMatchScore()` no tiene ningún llamador en todo el repositorio. Es el ejemplo de libro del riesgo que describe la sección 4.3 del encargo: compara `technician.licenseCategories.includes(...)` y `technician.aircraftTypes.includes(...)` como dos arrays de strings totalmente planos y sin ninguna relación entre sí (matching.ts:15,18). Al estar muerto, no es un problema activo, pero confirma que el patrón "arrays paralelos sin vínculo" existió y quedó reemplazado por V2 — solo que no del todo (ver siguiente punto).

**`src/utils/matchingV2.ts` — el vigente**, usado por `app/company/search.tsx`, `app/map.tsx`, y las 4 pantallas de detalle de aplicación/oferta directa. `calculateOfferTechnicianMatch(offer, technician)` (líneas 11-72) es una suma aditiva por reglas fijas, sin exclusión dura en ningún punto:

```
verified      25 pts si technician.verificationStatus === 'verified'
habilitation  25 pts si offer.requiredAircraftTypes vacío, o si ALGUNA habilitación
              del técnico tiene aircraftTypeCode incluido en requiredAircraftTypes
              (matchingV2.ts:24-28 — NO mira h.licenseCode)
license       20 pts si offer.requiredLicenses vacío, o si ALGUNA licencia del
              técnico (tabla technician_licenses, independiente) está en
              requiredLicenses (matchingV2.ts:30-37)
availability  15 pts si el contractType de la oferta está en las del técnico
experience     10 pts si la suma de aircraftExperience (años, horas/2000) ≥ minYearsExperience
location        5 pts por coincidencia de ciudad/aeropuerto base
```

`requiredTechnicianTypes` **nunca se puntúa** — se recoge como requisito de oferta pero `calculateOfferTechnicianMatch` no lo usa en absoluto (confirmado, no hay ninguna referencia a `requiredTechnicianTypes` dentro de la función). Total 0-100, etiquetado vía `getMatchLabel` (≥80 Excellent, ≥60 Strong, ≥40 Partial, si no Low). **Nada excluye a un técnico de los resultados o de poder aplicar** — el score es puramente informativo/de orden.

El defecto central, ya adelantado en el resumen: las líneas 24-28 y 30-37 evalúan `habilitation` y `license` **contra dos colecciones distintas del técnico sin cruzarlas entre sí**, a pesar de que el propio dato del técnico (`TechnicianHabilitation.licenseCode` + `.aircraftTypeCode`) contiene la pareja exacta necesaria para hacerlo bien. Es decir: el modelo de datos ya resuelve el problema de la sección 4.3, pero el código de matching no lo aprovecha y reintroduce el mismo riesgo por otra vía.

Esto mismo se repite en la capa de compatibilidad V1 (`src/utils/v2CompatAdapters.ts:111-132,159-182`), que aplana `habilitations` a un array de `aircraftTypeCode` únicos y lo junta por separado con `licenses` — cualquier pantalla que todavía dependa de tipos V1 hereda el mismo problema.

---

## 7. Problemas reales detectados

Ordenados por severidad/urgencia:

1. **Bug de escritura que rompe el vínculo licencia↔aeronave al guardar el perfil.** `technicianRepositoryV2.ts:221-241`. Severidad alta: genera datos incorrectos de forma silenciosa y sistemática para cualquier técnico multi-licencia que edite sus habilitaciones.
2. **Bug de lectura que ignora el vínculo al puntuar.** `matchingV2.ts:22-37`. Severidad alta: produce falsos positivos de matching hoy mismo, incluso con datos correctos en la base.
3. **Sin dimensión de motor/variante en ningún nivel.** No se puede representar ninguno de los casos reales de la sección 4.1 del encargo (A320 CFM56 vs V2500 vs LEAP-1A vs PW1100G; A330 CF6 vs Trent 700).
4. **Sin obligatorio/preferido en requisitos de oferta.** Las tres tablas `offer_required_*` son listas sin peso ni prioridad; el matching las trata todas igual y nunca excluye.
5. **Catálogo de aeronaves duplicado y divergente** entre el seed SQL (`aircraft_family` = tamaño de fuselaje) y `src/constants/aircraftTypes.ts` (`aircraftFamily` = familia comercial real) — ver §9.
6. **Sin distinción declarado/verificado a nivel de fila.** Existe verificación de perfil (`technician_profiles.verificationStatus`) y de documento (`documents.status`), pero ninguna licencia ni habilitación individual tiene su propio estado — no se puede mostrar "AW139 verificado en AML" vs "Bell 412 documento pendiente" como pide la sección 18, porque no hay dónde guardarlo.
7. **Sin entrada manual/fuera de catálogo.** Ni para licencias (razonable, son 13 fijas) ni para aeronaves/habilitaciones (no razonable — el catálogo de 33 tipos no cubre todo el mercado real).
8. **Sin campos de línea/base maintenance ni última fecha trabajada** en `technician_aircraft_experience` — la sección 4.6 y 11 del encargo los pide explícitamente y hoy no existen.
9. **Sin modelado de curso de tipo / OJT / formación pendiente de anotación en AML** — concepto totalmente ausente del esquema (ni tabla ni campo).
10. **`TechnicianFilters.tsx`, `TechnicianCard.tsx`, `MatchRequestCard.tsx` son código muerto** que sigue en el repo y podría confundir a quien lo edite pensando que está en uso.
11. **Filtro de búsqueda de licencia limitado a 8 de 13 categorías** (`LICENSE_CATEGORIES.slice(0, 8)`, `app/company/search.tsx:~317`) — corte arbitrario, probablemente no intencional.

---

## 8. Ejemplos de incoherencias (con los datos reales del repo)

**Caso A — bug de escritura.** Técnico con `technician_licenses = [B1.1, B2]` (B1.1 insertada primero). En su perfil marca aeronaves `A320` y `AW139`. Al guardar, `updateAircraftTypes` inserta:
```
technician_habilitations: (B1.1, A320), (B1.1, AW139)
```
Aunque en realidad el técnico solo tiene A320 bajo B1.1 y AW139 bajo B2 (exactamente el caso prohibido de la sección 4.3: "AW139 habilitado únicamente en B2… El sistema no debe deducir B1.3+AW139"). Aquí se deduce automáticamente B1.1+AW139, que es falso.

**Caso B — bug de matching.** Oferta requiere `licenses=[B1.1]`, `aircraftTypes=[A320]`. Técnico tiene `technician_licenses=[B1.1]` (sin aeronave asociada en esa tabla) y `technician_habilitations=[{licenseCode:'B2', aircraftTypeCode:'A320'}]` (su única habilitación A320 es de aviónica, no de mecánica). `calculateOfferTechnicianMatch` otorga 20/20 en `license` (tiene B1.1 en algún lado) y 25/25 en `habilitation` (tiene A320 en algún lado) → 45 de esos 45 puntos posibles, sin que exista realmente ningún "B1.1 + A320" en el perfil del técnico.

**Caso C — motorización invisible.** Oferta real: "B1.1, A320 Family, preferiblemente CFM56". Hoy solo se puede modelar como `licenses=[B1.1]`, `aircraftTypes=[A320]` (u opcionalmente A318/A319/A321 como filas adicionales). No hay forma de indicar la preferencia de motor ni de que el sistema la compare contra ninguna habilitación del técnico, porque el técnico tampoco tiene dónde declarar qué motor tiene.

**Caso D — seeds ya "correctos" a nivel de dato pero indefendibles a nivel de constraint.** `technicianHabilitations.json` (hab-003): `{technicianId:'tech-001', licenseCode:'C', aircraftTypeCode:'B737'}`. Es coherente porque quien escribió el seed lo hizo con cuidado, pero nada en el esquema impediría una fila `{licenseCode:'C', aircraftTypeCode:'AW139'}` para un técnico que nunca tuvo B737 ni AW139 en base maintenance — no hay ninguna regla de negocio (ni en DB ni en TS) que valide que la combinación categoría+aeronave tenga sentido según lo que la organización certificadora realmente emitió; solo depende de que quien inserta la fila (hoy: la función con el bug del Caso A) lo haga bien.

---

## 9. Dependencias de `aircraft_types`

- **FKs de base de datos**: `technician_habilitations.aircraft_type_code`, `technician_aircraft_experience.aircraft_type_code`, `offer_required_aircraft_types.aircraft_type_code` — las tres con `REFERENCES aircraft_types(code)`. Cualquier cambio de `code` (p. ej. renombrar `A320` a algo más específico) rompe estas tres FKs y requiere migración de datos, no solo de esquema.
- **TypeScript**: `AircraftTypeCode` (`src/constants/aircraftTypes.ts:44`) es un union type derivado de `AIRCRAFT_TYPE_CATALOG` — lo usan `TechnicianHabilitation.aircraftTypeCode`, `TechnicianAircraftExperience.aircraftTypeCode`, `OfferWithRequirements.requiredAircraftTypes` (`string[]`, no tipado al union — nótese que en `offer.ts` es `string[]` genérico, no `AircraftTypeCode[]`).
- **UI**: `AIRPLANES`/`HELICOPTERS` (filtros derivados del catálogo) se usan en `app/technician/profile.tsx`, `app/company/offers/new.tsx`/`edit.tsx`, y el filtro de categoría en `app/company/search.tsx`.
- **Matching**: `matchingV2.ts` compara códigos de aeronave como strings simples — no depende de la forma del catálogo, solo de que el código exista.
- **Catálogo duplicado (hallazgo clave)**: el seed SQL (`001_initial_schema_v2.sql:181-214`) y `src/constants/aircraftTypes.ts:4-42` contienen **los mismos 33 códigos** pero con `aircraft_family` con semántica distinta:

  | code | `aircraft_family` en SQL (seed DB) | `aircraftFamily` en TS (usado por la app) |
  |---|---|---|
  | A318, A319, A320, A321 | `narrow_body` (igual que B737, CRJ, E-Jet…) | `A320` (agrupa solo estos 4) |
  | A330 | `wide_body` | `A330` |
  | B407, B412 | `helicopter` | `Bell 400` |

  Como `catalogRepository` nunca lee la tabla de Supabase, este desajuste no rompe nada **hoy**, pero es una bomba de relojería: si en el futuro se migra el catálogo a ser gestionable desde Supabase/admin (como sugiere el comentario "New types can be added at any time without migrations" en `DATA_MODEL_V2.md`), habrá que decidir cuál de las dos fuentes es la verdadera y reconciliar manualmente los 33 valores de `aircraft_family`.
- **Documentación**: `docs/DATA_MODEL_V2.md` documenta el catálogo como simplificado a propósito ("*Aircraft type codes are intentionally simplified — one code per aircraft family… more granular variant codes (B737NG, B737CL, B737M, EC135, DH8D, AS350) can be introduced as separate catalog rows in a later migration if clients need them*") — es decir, el propio equipo ya anticipó (aunque no implementó) la necesidad de más granularidad, pero pensando en variantes de modelo, no en motor.

---

## 10. Opciones consideradas

Evaluadas contra el estado real encontrado, no en abstracto.

**Opción 1 — Añadir `engine` a `aircraft_types`.** Insuficiente: una fila de `aircraft_types` representa un modelo o familia entera; forzar un único motor por fila no permite representar que el mismo A320 admite CFM56 **o** V2500 según el técnico, ni que una habilitación real cubre 4 modelos con un motor (caso 4.2 del encargo). Se descarta.

**Opción 2 — Una fila de `aircraft_types` por combinación aeronave+motor.** Rompe la unicidad simple de "A320" como término de búsqueda/interés general (el propio encargo, sección 7.1, pide mantenerlo), duplica catálogo (4 filas por cada combinación real: A318-CFM56, A319-CFM56, A320-CFM56, A321-CFM56, y lo mismo ×4 motores), y obliga a re-teclar el mismo motor en 4 filas cada vez que aparece una habilitación nueva del mismo tipo. Además rompería la FK actual de `offer_required_aircraft_types`/`technician_aircraft_experience`, que hoy asumen "un código = una familia reconocible". Se descarta como solución única, aunque el patrón de "una fila por combinación" sí es válido para una tabla *nueva* y *separada* de habilitaciones (ver Opción 6).

**Opción 3 — Separar familia comercial de habilitación oficial** (catálogo `aircraft_ratings` con relación N:M a `aircraft_types`). Es conceptualmente la más fiel a la realidad de una AML real (una habilitación cubre varios modelos). Correcta a medio plazo, pero cara de poblar bien desde el primer día — requeriría cargar decenas de combinaciones reales de motor/modelo con datos de calidad para que aporte valor por encima de un campo de texto libre. Se recomienda como Fase 2/futura, no como Fase 1 (ver §21).

**Opción 4 — Relación explícita categoría↔habilitación del técnico** (`technician_licence_ratings` o similar). **Ya existe** como `technician_habilitations` (`technician_id, license_code, aircraft_type_code`). No hay que crearla: hay que arreglar sus dos puntos de uso rotos (escritura y matching) y extenderla con columnas nuevas (motor en texto libre, verificación, origen, límites).

**Opción 5 — Árbol jerárquico completo** (TC holder → fabricante → familia → modelo → variante → motor → habilitación → categoría → grupo regulatorio). Se descarta explícitamente para el MVP: es el escenario que la sección 2 del encargo prohíbe ("no convertir el MVP en... una base de datos aeronáutica excesivamente compleja"). Nada en los formularios actuales, en los seeds, ni en los casos de uso descritos justifica ese nivel de profundidad ahora. Queda documentado como posible fase futura si algún día se integra un catálogo oficial EASA.

**Opción 6 — Híbrida (recomendada).** Mantener `aircraft_types` como catálogo general (familias/términos de búsqueda, section 7.1 del encargo), mantener y **arreglar** `technician_habilitations` como el vínculo categoría↔aeronave, añadirle un campo de motor en **texto libre** (no catálogo nuevo) más campos de origen/verificación/límites, añadir obligatorio/preferido a `offer_required_*`, y permitir experiencia declarada sin habilitación formal (ya existe, solo hay que enriquecerla con línea/base y última fecha). El catálogo formal de habilitaciones específicas (Opción 3) queda preparado como evolución natural del campo de texto libre, no como bloqueo del MVP.

---

## 11. Comparación de opciones

| Criterio | Op.1 | Op.2 | Op.3 | Op.4 | Op.5 | Op.6 (recomendada) |
|---|---|---|---|---|---|---|
| Representa 1 habilitación → N modelos (4.2) | No | Parcial (duplica filas) | Sí | Ya existe pero sin motor | Sí | Sí (fase 2, vía texto libre en fase 1) |
| Representa motor por habilitación (4.1) | Parcial (1 motor fijo por fila) | Sí | Sí | No (hoy) | Sí | Sí |
| Evita combinaciones falsas (4.3) | No mejora | No mejora | Sí si se implementa bien | Sí, si se arregla el bug | Sí | Sí (arreglando el bug + campo motor) |
| Coste de implementación | Bajo | Medio-alto (duplicación) | Medio-alto (poblar catálogo real) | Bajo (ya existe) | Muy alto | Bajo (fase 1) / medio (fase 2) |
| Compatible con datos actuales | Sí | No (rompe códigos existentes) | Sí (aditiva) | Sí (aditiva) | No | Sí |
| Formulario sigue simple | Sí | No | Sí si se oculta bien | Sí | No | Sí |
| Evolutiva sin romper todo después | Limitada | Limitada | Alta | Alta | N/A (ya es el techo) | Alta |

**Conclusión de la comparación**: ninguna opción "pura" del enunciado es exactamente correcta por sí sola para el MVP. La combinación Opción 4 (ya construida, hay que arreglarla) + motor en texto libre (subconjunto barato de la Opción 3) es el punto de mejor relación coste/beneficio, con la Opción 3 completa como paso natural de Fase 2/futura si el texto libre demuestra que hace falta normalizar.

---

## 12. Solución recomendada

**No crear un árbol nuevo. Extender lo que ya existe con columnas aditivas y nulas, arreglar los dos bugs de vínculo, y mover la complejidad de "motor exacto" a texto libre + chat en vez de a un catálogo nuevo en el día 1.**

Resumen de cambios mínimos (detalle completo en §13-18):

1. **`technician_habilitations`**: añadir `engine_label` (texto libre, nullable), `verification_status` (`declared`\|`verified`, default `declared`), `source` (`catalog`\|`manual`, default `catalog`), `raw_label` (texto libre para entradas manuales), `limitations` (texto libre). Relajar `aircraft_type_code` a nullable con `CHECK` que exige o bien un código de catálogo válido (`source='catalog'`) o bien un `raw_label` (`source='manual'`).
2. **`technician_licenses`**: añadir `license_number`, `issuing_authority`, `verification_status` (mismo patrón declared/verified).
3. **`offer_required_technician_types` / `offer_required_licenses` / `offer_required_aircraft_types`**: añadir `requirement_level` (`mandatory`\|`preferred`, **default `preferred`** — ver §17 sobre por qué el default no puede ser `mandatory` sin romper el comportamiento actual).
4. **Corrección de código** (no ejecutar todavía, queda listado como tarea de implementación): `updateAircraftTypes` debe recibir pares `{aircraftTypeCode, licenseCode}` en vez de una lista plana; `calculateOfferTechnicianMatch` debe comprobar la pareja `(licenseCode, aircraftTypeCode)` en la misma fila de habilitación cuando la oferta pide ambas cosas a la vez, no dos existencias independientes.
5. **Matching reescrito como reglas explicables** (exacta / cercana / por experiencia-formación / información insuficiente / sin coincidencia clara) — ver §14 y §22.
6. Diferir a Fase 2: `technician_aircraft_experience` (línea/base, última fecha), tabla nueva de cursos/formación, catálogo formal `aircraft_ratings` si el volumen de datos reales lo justifica.

---

## 13. Modelo de datos mínimo propuesto

### 13.1 Tablas reutilizadas (sin cambio de estructura, solo de uso/código)
- `license_categories`, `aircraft_types`, `technician_types`, `company_types`, `contract_types` — catálogos, se mantienen tal cual.
- `technician_profiles`, `offers`, `companies` — sin cambios.
- `documents` — sin cambios de esquema; se referencia desde el nuevo flujo de verificación por fila (opcionalmente, `technician_habilitations`/`technician_licenses` podrían enlazar un `document_id` en Fase 2, no Fase 1).

### 13.2 Tablas modificadas (columnas nuevas, todas nullable o con default — no destructivo)

**`technician_habilitations`** (Fase 1):
```sql
ALTER TABLE technician_habilitations
  ALTER COLUMN aircraft_type_code DROP NOT NULL,
  ADD COLUMN engine_label        TEXT,               -- texto libre: "CFM56", "V2500", "PWC PT6"...
  ADD COLUMN source               TEXT NOT NULL DEFAULT 'catalog' CHECK (source IN ('catalog','manual')),
  ADD COLUMN raw_label            TEXT,               -- descripción libre si source='manual'
  ADD COLUMN verification_status  TEXT NOT NULL DEFAULT 'declared' CHECK (verification_status IN ('declared','verified')),
  ADD COLUMN limitations          TEXT,
  ADD CONSTRAINT chk_habilitation_source CHECK (
    (source = 'catalog' AND aircraft_type_code IS NOT NULL)
    OR (source = 'manual' AND raw_label IS NOT NULL)
  );
```
Por qué: es el cambio mínimo que permite capturar los casos 4.1/4.2 (motor en texto libre, sin inventar catálogo), la sección 7.5 (entrada manual sin bloquear el perfil), y la sección 18 (declarado vs verificado). `verification_status` debe quedar protegido por trigger igual que `technician_profiles.verificationStatus` (patrón ya existente en `009_restrict_server_owned_fields.sql`) para que el técnico no pueda auto-verificarse.

**`technician_licenses`** (Fase 1):
```sql
ALTER TABLE technician_licenses
  ADD COLUMN license_number      TEXT,
  ADD COLUMN issuing_authority   TEXT,
  ADD COLUMN verification_status TEXT NOT NULL DEFAULT 'declared' CHECK (verification_status IN ('declared','verified'));
```
Por qué: la sección 11 del encargo pide explícitamente estos campos en el perfil técnico y hoy no existen ni en la tabla ni en el formulario.

**`offer_required_technician_types` / `offer_required_licenses` / `offer_required_aircraft_types`** (Fase 1):
```sql
ALTER TABLE offer_required_aircraft_types
  ADD COLUMN requirement_level TEXT NOT NULL DEFAULT 'preferred' CHECK (requirement_level IN ('mandatory','preferred'));
-- misma columna en offer_required_licenses y offer_required_technician_types
```
Por qué: es el único cambio que permite a la empresa distinguir "obligatorio" de "preferido" (sección 9-10 del encargo). El default `'preferred'` (no `'mandatory'`) es deliberado: hoy ningún requisito bloquea nada, así que si el default fuera `mandatory` todas las ofertas existentes pasarían a filtrar duro de la noche a la mañana sin que ninguna empresa lo haya decidido — ver §17 y la pregunta pendiente en §25.

**`technician_aircraft_experience`** (Fase 2, no bloqueante para Fase 1):
```sql
ALTER TABLE technician_aircraft_experience
  ADD COLUMN maintenance_scope TEXT CHECK (maintenance_scope IN ('line','base')),
  ADD COLUMN last_worked_at    DATE,
  ADD COLUMN notes             TEXT;
```

### 13.3 Tablas nuevas

**Fase 2 — `technician_type_courses`** (formación/curso de tipo, OJT, pendiente de anotación en AML — sección 11 y 5 del encargo):
```sql
CREATE TABLE technician_type_courses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  technician_id       UUID NOT NULL REFERENCES technician_profiles(id) ON DELETE CASCADE,
  aircraft_type_code  TEXT REFERENCES aircraft_types(code),
  license_code        TEXT REFERENCES license_categories(code),
  course_kind         TEXT NOT NULL CHECK (course_kind IN ('theoretical','practical','ojt','full')),
  organization         TEXT,
  completed_at         DATE,
  pending_endorsement  BOOLEAN NOT NULL DEFAULT true,  -- "curso hecho, aún no anotado en AML"
  document_id          UUID REFERENCES documents(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
Por qué ahora no: ningún flujo actual (perfil, oferta, matching, chat) referencia cursos; es un concepto completamente nuevo. Por qué en Fase 2: la sección 4.6 y 11 del encargo lo piden como diferenciador explícito frente a habilitación/experiencia, y es la pieza que permite el mensaje-tipo de la sección 8 ("El técnico declara curso CFM56 pendiente de revisión"). Campos mínimos: los de arriba; constraints mínimas: ninguna combinación es obligatoria salvo `technician_id` y `course_kind`, todo lo demás es opcional para no bloquear el perfil (sección 7.5).

**Fase 2/futura — `aircraft_ratings` + `aircraft_rating_aircraft_types`** (catálogo formal de habilitaciones específicas, Opción 3 completa):
```sql
CREATE TABLE aircraft_ratings (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label          TEXT NOT NULL,         -- "Airbus A318/A319/A320/A321 (CFM56)"
  short_label    TEXT NOT NULL,         -- "A320 Family — CFM56" (para UI)
  engine_family  TEXT,                  -- "CFM56"
  manufacturer   TEXT,
  is_active      BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE aircraft_rating_aircraft_types (
  aircraft_rating_id UUID NOT NULL REFERENCES aircraft_ratings(id) ON DELETE CASCADE,
  aircraft_type_code TEXT NOT NULL REFERENCES aircraft_types(code),
  PRIMARY KEY (aircraft_rating_id, aircraft_type_code)
);

ALTER TABLE technician_habilitations
  ADD COLUMN aircraft_rating_id UUID REFERENCES aircraft_ratings(id);  -- nullable, upgrade path desde engine_label
```
Por qué no en Fase 1: poblar este catálogo con datos reales de calidad (las combinaciones reales de motor/modelo que describe la sección 4 del encargo) es trabajo de contenido, no solo de esquema, y el campo `engine_label` de texto libre ya resuelve el 80% del valor (mostrar la discrepancia motor en el matching y en el chat) sin ese coste. Camino de migración: una vez el texto libre acumule suficientes valores repetidos (`engine_label = 'CFM56'` en N filas de aeronaves A318-A321), se puede crear la fila de `aircraft_ratings` correspondiente y hacer un `UPDATE` de backfill que rellene `aircraft_rating_id` — no destructivo, no bloqueante.

### 13.4 Constraints y reglas de integridad (resumen)
- `chk_habilitation_source` (arriba) — evita filas ambiguas sin catálogo ni texto manual.
- Ningún cambio nuevo toca `UNIQUE(technician_id, license_code, aircraft_type_code)` de `technician_habilitations` — sigue siendo válido para `source='catalog'`; para `source='manual'` (aircraft_type_code NULL) esa unicidad no aplica por definición de NULL en Postgres (varias filas manuales con el mismo `technician_id`+`license_code` y `aircraft_type_code IS NULL` no violan el UNIQUE existente — comportamiento correcto, no hace falta constraint adicional).
- `verification_status` en `technician_habilitations`/`technician_licenses`: debe protegerse con un trigger `BEFORE UPDATE` que solo permita el cambio si `is_admin()`, replicando exactamente el patrón ya usado en `009_restrict_server_owned_fields.sql:36-75` para `technician_profiles.verification_status`.
- `requirement_level` en las tres tablas de requisitos de oferta: sin trigger especial — es un campo que la propia empresa controla vía `offerRepository.replaceRequirements`, análogo a cómo ya controla qué códigos incluir.

---

## 14. Estados de verificación

Propuesta deliberadamente de **dos estados**, no cinco, para no sobrecargar la UI ni la base de datos con una taxonomía que nadie va a mantener:

| Estado | Significado | Quién lo pone |
|---|---|---|
| `declared` (default) | El técnico lo ha introducido en su perfil. No hay evidencia documental verificada todavía. | El técnico, al guardar |
| `verified` | Un admin ha revisado la licencia/habilitación (normalmente contra un documento subido) y confirma que es correcta. | Solo admin, vía RPC nueva (Fase 2) análoga a `admin_update_technician_verification` |

Esto cubre directamente los ejemplos de la sección 18 del encargo:
- "AW139 — B2, Verificado en AML" → fila de `technician_habilitations` con `verification_status='verified'`.
- "Bell 412 — B2, Documento pendiente de revisión" → fila con `verification_status='declared'` + un `document` asociado con `status='pending'` (el enlace documento↔habilitación es un `INNER JOIN` por `technician_id` + tipo de documento en Fase 1; un `document_id` explícito en `technician_habilitations` queda como mejora de Fase 2 si hace falta precisión 1:1).
- "H145 — Curso de tipo, Declarado por el técnico, No consta como habilitación AML" → fila en la nueva `technician_type_courses` (Fase 2) con `pending_endorsement=true`, sin fila correspondiente en `technician_habilitations`.

No se añade un estado "rechazado" a nivel de habilitación individual en Fase 1: si un admin considera que una habilitación declarada es incorrecta, la vía existente es contactar al técnico (chat) o, como último recurso, marcar el perfil completo (`technician_profiles.verificationStatus`) — introducir rechazo granular por fila es una ampliación de Fase 2/futura si se demuestra necesaria en el uso real.

---

## 15. Flujo del perfil técnico (propuesto, Fase 1)

Sin romper la estructura actual del formulario (secciones Licenses / Aircraft types), el cambio de UX mínimo es:

1. **Licencias**: mismos chips de siempre, pero al añadir cada una se despliegan (opcionalmente, sin obligar a rellenar) tres campos: número de licencia, autoridad emisora, fecha de caducidad.
2. **Habilitaciones**: en vez de dos grids independientes de aeronaves, cada aeronave seleccionada se asocia **a una licencia concreta ya marcada por el técnico** (selector contextual, no lista global) — esto es tanto el arreglo del bug de escritura como el cumplimiento explícito de la sección 4.3 del encargo. Al marcar una aeronave bajo una licencia, aparece un campo opcional de texto libre "Motor (opcional)" que alimenta `engine_label`.
3. **"No encuentro mi habilitación / esta aeronave"**: enlace que abre una entrada manual (`source='manual'`, `raw_label` de texto libre) — no bloquea el guardado, se muestra después con una etiqueta "Entrada manual, por revisar" en vez de como catálogo verificado.
4. **Experiencia** (Fase 2): por cada aeronave con habilitación o experiencia declarada, campos opcionales de línea/base y última fecha trabajada.

Este flujo mantiene el "empezar simple, ampliar después" que pide la sección 11 del encargo — todos los campos nuevos son opcionales, nada bloquea guardar un perfil mínimo.

---

## 16. Flujo de creación de oferta (propuesto, Fase 1)

Se mantiene la estructura de tres chips (tipo de técnico / licencia / aeronave) sin añadir jerarquía de navegación. Cambios mínimos:

1. Cada chip seleccionado, al activarse, muestra un pequeño toggle **Obligatorio / Preferido** (default: Preferido, coherente con el default de base de datos del §13.2).
2. Para aeronaves, un campo opcional de texto libre "Motor preferido" junto a cada aeronave seleccionada (alimenta un futuro filtro/puntuación por `engine_label`, sin bloquear si se deja vacío).
3. El campo `description` existente ya cubre "observaciones" — no hace falta un campo nuevo (la sección 10 del encargo pregunta si añadirlo; la recomendación es reutilizar `description`, que ya es multilínea y libre, para evitar duplicar un campo de texto).

No se introduce ningún selector de "familia general vs habilitación exacta vs varias habilitaciones alternativas" como jerarquía nueva: seleccionar varias aeronaves ya expresa "cualquiera de estas" (la lógica `.some(...)` de matching ya lo interpreta así), y el toggle obligatorio/preferido ya cubre la distinción de prioridad. Esto evita el formulario complejo que la sección 10 del encargo pide explícitamente evitar.

---

## 17. Lógica de matching propuesta

Sustituye el score aditivo opaco por una clasificación de reglas explicables, manteniendo el número (0-100) como orden secundario dentro de cada categoría, no como criterio principal:

**Filtro duro (excluye de "coincidencia" pero no de poder aplicar ni chatear) — el único caso:**
- La oferta marca una **licencia/categoría como `mandatory`** y el técnico no tiene esa categoría ni en `technician_licenses` ni en ninguna `technician_habilitations`. Esto es el único requisito verdaderamente regulatorio-binario (no se puede "casi" tener una categoría Part-66). Se muestra en una sección separada "Sin coincidencia clara — categoría incompatible", no se oculta al técnico ni se le impide aplicar (la aplicación sigue abierta; solo cambia el orden/agrupación en resultados de búsqueda de la empresa).
- Ningún otro campo (aeronave, experiencia, disponibilidad, ubicación) excluye nunca, ni siquiera si está marcado `mandatory` — solo reduce fuertemente la puntuación y aparece en "Por confirmar". Esto respeta el anti-objetivo explícito de la sección 22 ("no excluir candidatos por detalles secundarios").

**Niveles de coincidencia (por combinación oferta+técnico, no global):**

| Nivel | Condición |
|---|---|
| **Coincidencia exacta** | Para cada aeronave requerida: existe una fila de `technician_habilitations` con `license_code` = categoría requerida (si la oferta la pide) **y** `aircraft_type_code` = la aeronave requerida **y**, si la oferta declaró `engine_label`, coincide (case-insensitive) con el de la habilitación. |
| **Coincidencia cercana** | Misma categoría y misma aeronave/familia, pero `engine_label` distinto o ausente en una de las dos partes → "por confirmar: motor". O bien: coincide la aeronave pero la habilitación está en `verification_status='declared'` sin documento verificado → "por confirmar: verificación". |
| **Coincidencia por experiencia/formación** | No hay fila de `technician_habilitations` para esa aeronave, pero sí `technician_aircraft_experience` para la misma aeronave, o una fila en `technician_type_courses` (Fase 2) con `pending_endorsement=true` para esa aeronave. |
| **Información insuficiente** | La única señal disponible es una entrada manual (`source='manual'`) o falta un dato necesario para decidir (p. ej. la oferta no declaró motor pero el técnico tiene dos habilitaciones con motores distintos para la misma aeronave). |
| **Sin coincidencia clara** | Solo cuando aplica el filtro duro de categoría descrito arriba, o cuando ni habilitación ni experiencia ni curso mencionan esa aeronave/familia en absoluto y el requisito es `mandatory`. |

**Cómo puntuar (para ordenar dentro de cada nivel, no para decidir el nivel):**
- Dato verificado > declarado (peso mayor en el score, nunca determina el nivel por sí solo).
- Curso sin habilitación anotada cuenta como señal positiva débil (nivel "por experiencia/formación"), nunca como si fuera una habilitación real.
- Experiencia sin habilitación formal cuenta igual que un curso — señal positiva débil, mismo nivel.
- Misma familia con motor distinto nunca se trata como "sin coincidencia" — siempre al menos "cercana", porque en la práctica muchos técnicos con V2500 pueden convertir a CFM56 con poco entrenamiento adicional (esto es precisamente lo que debe resolver el chat, no el algoritmo).

**Cómo evitar falsos positivos**: dejar de evaluar `license` y `habilitation` como existencias independientes (el bug del §6) — la comprobación de "coincidencia exacta"/"cercana" siempre parte de una fila concreta de `technician_habilitations`, nunca de cruzar `technician_licenses` con `technician_habilitations` de otra fila.

**Cómo evitar falsos negativos**: ningún requisito de aeronave/experiencia excluye nunca (solo categoría, y solo si `mandatory`); toda información parcial (declarada, manual, sin motor especificado) se muestra como "por confirmar" en vez de desaparecer de los resultados.

**Presentación en UI**: sustituir el actual `{score}%` desnudo de `MatchBadge`/`InlineScore` por dos listas cortas — "Coincide" y "Por confirmar" — generadas directamente a partir de los niveles de arriba, en el mismo formato de ejemplo que da la sección 8 del encargo. El número (0-100) puede conservarse como badge de color de fondo para no romper el diseño visual actual, pero deja de ser el único dato mostrado.

---

## 18. Integración con el chat

No se propone ningún cambio a la regla de bloqueo existente (`status === 'accepted'`, `privacyV2.ts`) — es una regla de seguridad/privacidad deliberada y ya viva, y el encargo permite explícitamente mantenerla. Lo que sí se propone (Fase 4, baja/media complejidad):

- Un generador de resumen (`Coincidís en / Por confirmar`) que reutiliza exactamente la salida del clasificador de matching del §17 para el par oferta+técnico, mostrado al abrir el chat por primera vez tras la aceptación.
- Un mensaje sugerido (plantilla de texto) construido a partir de la lista "Por confirmar" — p. ej. si el punto por confirmar es "motor: oferta pide CFM56, técnico declara V2500", la plantilla genera automáticamente una pregunta como la del ejemplo de la sección 12 del encargo.
- Nada de esto bloquea el chat ni condiciona si se puede abrir — es contenido adicional dentro de una conversación que de todas formas solo existe tras aceptación.

Importante: como la aceptación ya ocurre *antes* de que el chat exista, la "aclaración por chat" que pide el encargo para casos como "motor distinto" en la práctica sucede **después** de que la empresa ya decidió avanzar con ese técnico (aceptar la aplicación/oferta directa), no antes, durante el descubrimiento de candidatos. Esto es coherente con el modelo de privacidad actual (no se puede chatear con un candidato anónimo), pero vale la pena señalarlo como decisión de producto ya tomada, no como algo que este cambio de matching altere.

---

## 19. Tratamiento de entradas manuales

- **Habilitaciones/aeronaves fuera de catálogo**: `technician_habilitations` con `source='manual'`, `aircraft_type_code=NULL`, `raw_label` con la descripción libre del técnico. Se muestran en el perfil y en cualquier vista de empresa con una etiqueta visual distinta ("Entrada manual, no normalizada") y **nunca** contribuyen al nivel "Coincidencia exacta" del matching (como mucho, "Información insuficiente").
- **Cursos/formación adicional** (Fase 2): misma idea vía `technician_type_courses`, con `organization` y `course_kind` libres si no hay catálogo de organizaciones formadoras (no se propone crear uno).
- Ninguna entrada manual bloquea el guardado del perfil ni la aplicación a una oferta — se acepta, se guarda, se muestra diferenciada, y puede revisarse más tarde por un admin (marcarla como `verified` si se aporta evidencia, o simplemente dejarla como está).

---

## 20. Estrategia de migración

**Principio**: ningún dato existente se reinterpreta automáticamente como algo más específico de lo que realmente es. Todas las columnas nuevas son nullable o tienen un default que preserva el comportamiento actual.

| Dato legacy | Qué se hace |
|---|---|
| Técnico con `technician_licenses=[B1.1]` y `technician_habilitations=[{B1.1, A320}]` (ya correcto porque respeta el vínculo) | Nada que migrar — sigue siendo una fila válida; `engine_label`, `verification_status`, `source` quedan en sus defaults (`NULL`, `declared`, `catalog`). No se le asigna motor: queda "sin precisar", visible como tal. |
| Técnico con `technician_licenses=[B1.3, B2]` y habilitaciones ya mal vinculadas por el bug de escritura actual (p. ej. AW139 colgado de B1.3 cuando en realidad es B2) | **No se puede corregir automáticamente** — no hay forma de saber cuál era la intención real solo con los datos existentes. Se deja tal cual, marcado implícitamente como "declarado" (nunca "verificado"), y queda pendiente de que el propio técnico lo revise la próxima vez que edite su perfil (una vez arreglado el formulario del §15, que ya no permite guardar esta ambigüedad). |
| Oferta legacy que pide `aircraftTypes=[A320]` sin motor | Se queda con `requirement_level='preferred'` (default) y sin `engine_label` — sigue funcionando exactamente igual que hoy en el matching (nivel "coincidencia cercana" para cualquier técnico con habilitación A320 de cualquier motor, en vez del actual "match ciego"). La empresa puede editarla más tarde para marcarla `mandatory` o añadir motor si quiere. |
| Oferta que en el futuro necesita "A320 CFM56 obligatorio" | Se crea/edita con el nuevo formulario: aeronave A320 + `requirement_level='mandatory'` + `engine_label='CFM56'`. |
| Dato manual no normalizado (ej. "EC135 con dotación policial, no está en catálogo") | Nueva fila `technician_habilitations` con `source='manual'`, `raw_label` con ese texto, sin `aircraft_type_code`. |

**Qué puede automatizarse**: añadir las columnas nuevas con sus defaults (operación DDL pura, sin `UPDATE` de datos). **Qué no debe deducirse nunca**: a qué motor concreto corresponde una habilitación existente, ni si una combinación categoría+aeronave legacy es realmente correcta más allá de lo que el bug de escritura ya haya hecho. **Qué requiere confirmación del usuario**: nada de forma obligatoria — todo lo nuevo es opcional y se completa progresivamente, tal como pide la sección 11 del encargo.

**Entornos**: los seeds locales (`src/data/seeds/*.json`) necesitarán las columnas nuevas añadidas con valores por defecto para que `scripts/validateSeeds.js` siga pasando (revisar sus invariantes actuales, que hoy no conocen estos campos). No hay entorno de producción con datos reales de usuarios todavía más allá de lo sembrado — confirmar este punto con el equipo antes de planear cualquier `UPDATE` masivo (ver preguntas pendientes, §25).

**Compatibilidad temporal**: `v2CompatAdapters.ts` seguirá aplanando `habilitations`/`licenses` a arrays independientes para las pantallas V1 que aún lo consuman — mientras eso exista, cualquier pantalla V1-compat seguirá teniendo el riesgo de falsa combinación descrito en §6, aunque los datos subyacentes ya sean correctos. Se recomienda auditar en Fase 1 qué pantallas activas todavía dependen de `v2CompatAdapters` (aparte de las ya confirmadas muertas `TechnicianCard.tsx`/`TechnicianFilters.tsx`/`MatchRequestCard.tsx`) antes de dar por cerrado el riesgo.

---

## 21. Categorías especiales — clasificación

| Categoría/tema | Clasificación | Motivo |
|---|---|---|
| B2L (alcances de sistema) | Fuera de alcance del MVP; preparado gratis | `license_categories` ya es tabla, no enum — añadir granularidad futura es un `INSERT`, no una migración de esquema. El campo `limitations` (texto libre, §13.2) ya permite anotar alcance sin modelo formal. |
| Categoría L (subcategorías) | Fuera de alcance ahora; preparar trivial | Mismo motivo — tabla, no enum. Ningún seed ni caso de uso actual lo necesita hoy. |
| B1.E | Fuera de alcance; preparación trivial (un `INSERT` cuando haga falta) | No hay evidencia de demanda en los datos actuales del repo. |
| Categoría A (autorizaciones de tarea/organización) | Fuera de alcance explícito | La sección 5 del encargo lo dice: depende de autorizaciones internas de la organización certificadora, no es responsabilidad de esta plataforma. Sus aeronaves se tratan igual que B1/B2 (como habilitación/experiencia), nunca como certificación de tareas. |
| Categoría C | Ya soportada sin cambios | `technician_habilitations` con `license_code='C'` + `aircraft_type_code` ya funciona hoy (ver seed `hab-003`, C+B737) — no requiere ninguna tabla nueva. |
| Grupos/subgrupos regulatorios (TC holder groups) | Fuera de alcance del MVP | El `category_group` que ya existe en `license_categories` (A/B1/B2/B3/L/C) es la única agrupación necesaria ahora. Grupos de tipo TC-holder quedan para un catálogo `aircraft_ratings` completo (Fase futura, §13.3). |

---

## 22. Plan de implementación por fases

### Fase 1 — Corrección mínima del modelo
**Complejidad: media** (no baja, porque toca la ruta de guardado del perfil técnico y el algoritmo de matching, ambos con datos de producción/demo ya cargados; pero no baja porque nada requiere jerarquía nueva ni catálogo nuevo).
- Arreglar `updateAircraftTypes` (par licencia+aeronave explícito, ya no `licenses[0]`).
- Arreglar `calculateOfferTechnicianMatch` (comprobación conjunta licencia+aeronave sobre la misma fila de habilitación).
- Migración aditiva: columnas nuevas en `technician_habilitations`, `technician_licenses`, `offer_required_*` (§13.2).
- UI de perfil: vincular selección de aeronave a licencia concreta + campo motor opcional + entrada manual.
- UI de oferta: toggle obligatorio/preferido + campo motor preferido opcional.
- Actualizar seeds + `scripts/validateSeeds.js` con los campos nuevos.

### Fase 2 — Perfil técnico y ofertas más precisos
**Complejidad: media**.
- `technician_aircraft_experience`: línea/base, última fecha trabajada.
- Tabla nueva `technician_type_courses`.
- `verification_status` administrable vía RPC nueva (`admin_update_habilitation_verification`, análoga a las ya existentes).
- Opcional: catálogo formal `aircraft_ratings` si el uso real de `engine_label` en texto libre demuestra patrones repetidos que merezcan normalizarse.

### Fase 3 — Matching explicable
**Complejidad: media**.
- Implementar el clasificador de niveles del §17 sobre los datos ya enriquecidos en Fase 1/2.
- Rediseñar `MatchBadge`/`InlineScore` para mostrar "Coincide / Por confirmar" en vez de solo el porcentaje.
- Extender a las 4 pantallas de detalle (`applications/[id].tsx`, `direct-offers/[id].tsx` ×2, `offers/[id].tsx`) y a `search.tsx`.

### Fase 4 — Chat asistido
**Complejidad: baja-media**.
- Resumen automático + mensaje sugerido reutilizando la salida de Fase 3, sin tocar la regla de bloqueo de chat existente.

### Fase futura (fuera de bloqueo del MVP)
- Catálogo EASA oficial completo, versionado de catálogo, TC holders, variantes/subgrupos regulatorios, OJT detallado, recencia de privilegios distinta de vigencia documental, autorizaciones internas de organización, extracción automática de licencias (OCR), normalización automática de entradas manuales, subcategorías de L, sistemas de B2L, B1.E.

---

## 23. Riesgos

- **Riesgo de UX**: si el toggle obligatorio/preferido se malinterpreta como "obligatorio = solo verá candidatos que cumplan", hay que dejar clarísimo en la propia UI (texto de ayuda) que obligatorio solo agrupa/ordena distinto y **nunca** oculta candidatos por completo — coherente con el anti-objetivo de la sección 22 del encargo, pero fácil de romper si un desarrollador futuro decide "mejorar" el filtro y lo convierte en exclusión real de resultados de búsqueda sin querer.
- **Riesgo de migración silenciosa incorrecta**: cualquier tentación futura de "rellenar `engine_label` automáticamente" a partir del catálogo o de inferencia debe evitarse — el propio encargo lo prohíbe explícitamente (sección 19, "no asignes automáticamente todas las motorizaciones").
- **Riesgo de arrastre del bug ya existente**: si el bug de `updateAircraftTypes` no se arregla en la misma fase en que se añade `engine_label`, cada guardado de perfil seguirá generando combinaciones categoría+aeronave falsas, ahora además con un motor "declarado" pegado a la combinación incorrecta — es decir, el nuevo campo puede *empeorar* la calidad percibida del dato si el bug de origen no se corrige a la vez.
- **Riesgo en `v2CompatAdapters.ts`**: mientras exista, cualquier pantalla que aún dependa de él (hay que auditar cuáles, más allá de las tres ya confirmadas muertas) seguirá mostrando/matchando con el patrón de listas planas, neutralizando parcialmente el arreglo.
- **Riesgo de divergencia de catálogo** (§9): si en el futuro se decide leer `aircraft_types` desde Supabase en vez de las constantes TS, hay que reconciliar los 33 valores de `aircraft_family` antes, o la agrupación por familia cambiará de comportamiento sin que nadie lo haya decidido explícitamente.

---

## 24. Decisiones pendientes (preguntas concretas para antes de implementar)

1. **Default de `requirement_level`**: ¿confirmáis que debe ser `'preferred'` para no convertir retroactivamente las ofertas existentes en filtros duros, o preferís revisar manualmente las ofertas activas y decidir caso por caso antes de fijar un default?
2. **Alcance de Fase 1 para `technician_licenses`**: ¿los campos `license_number`/`issuing_authority` son realmente necesarios ya, o pueden esperar a Fase 2 junto con `technician_aircraft_experience`? (No bloquean nada del problema central de motor/combinaciones falsas — se incluyeron en Fase 1 porque el encargo los pide en la sección 11, pero podrían moverse.)
3. **`engine_label` como texto libre vs. lista corta curada**: ¿preferís un `TextInput` totalmente libre, o una lista corta editable-por-admin de motores comunes (CFM56, V2500, LEAP-1A, PW1100G, Trent 700, CF6, GE90, PT6, Arriel…) con opción "otro"? Afecta directamente a si Fase 2 (catálogo `aircraft_ratings`) tiene sentido antes o después.
4. **Alcance de auditoría de `v2CompatAdapters.ts`**: ¿autorizáis una pasada de auditoría (sin implementar cambios) para confirmar exactamente qué pantallas activas, si alguna, siguen dependiendo de la capa de compatibilidad V1, antes de decidir si hace falta tocarla en Fase 1?
5. **Entorno de datos**: ¿existen ya usuarios/técnicos reales en producción sobre `technician_habilitations`, o todo el dato actual es demo/seed? Cambia si la migración de Fase 1 necesita algún tipo de comunicación al usuario ("completa tu perfil con el motor") o si es puramente técnica.
6. **Nivel de detalle del filtro duro de categoría**: ¿aceptáis que "sin coincidencia clara" solo excluya de la agrupación principal de resultados pero nunca impida aplicar ni ver la oferta, tal como se describe en §17, o queréis un comportamiento distinto (p. ej. ocultar completamente)?

---

## 25. Recomendación final para el MVP

1. **No reconstruir nada.** El vínculo categoría↔aeronave que pide la sección 4.3 del encargo ya existe como `technician_habilitations`. La prioridad número uno, antes de cualquier columna nueva, es corregir los dos puntos donde el código actual ignora ese vínculo: `updateAircraftTypes` (escritura) y `calculateOfferTechnicianMatch` (lectura/scoring).
2. **Añadir motor como texto libre, no como catálogo nuevo**, en la misma fase que el arreglo anterior. Es la forma más barata de resolver los casos reales 4.1/4.2 del encargo sin comprometerse a mantener un catálogo de habilitaciones oficiales que nadie ha empezado a poblar todavía.
3. **Añadir obligatorio/preferido a los tres `offer_required_*`** con default `preferred`, y usarlo únicamente como agrupación/orden — nunca como exclusión total, salvo el único caso de categoría Part-66 incompatible marcada `mandatory`, que es el único requisito verdaderamente binario en este dominio.
4. **Posponer a Fase 2**: número de licencia/autoridad emisora, línea/base maintenance, última fecha trabajada, cursos de tipo/OJT, verificación granular por fila con RPC de admin.
5. **Posponer a Fase futura, sin bloquear nada del MVP**: catálogo formal `aircraft_ratings`, jerarquía TC holder/variante/grupo regulatorio, B2L con sistemas, subcategorías de L, B1.E, autorizaciones de organización para categoría A.
6. **El chat no cambia su regla de bloqueo** (post-aceptación) — solo se enriquece en Fase 4 con un resumen automático de coincidencias/por confirmar generado por el mismo clasificador de matching de Fase 3.
7. **Orden de implementación recomendado**: Fase 1 (bugs + columnas aditivas + UI mínima) → Fase 3 (matching explicable, porque ya hay datos con motor/manual para explicar) → Fase 2 (enriquecimiento de perfil/formación, en paralelo o después, es la que menos depende de las demás) → Fase 4 (chat asistido, depende de Fase 3).

---

## 26. Entregables concretos

### 26.1 Archivos afectados (reales, confirmados por lectura directa)

**Base de datos**
- `supabase/migrations/001_initial_schema_v2.sql` — referencia, no se edita directamente; los cambios van en una migración nueva (p. ej. `016_habilitation_precision.sql`, numeración a confirmar contra el estado real de `supabase/migrations/` en el momento de implementar).
- `supabase/migrations/009_restrict_server_owned_fields.sql` — patrón a replicar para proteger `verification_status` en las tablas nuevas/modificadas.

**TypeScript — tipos**
- `src/types/technician.ts` (`TechnicianLicense`, `TechnicianHabilitation`, `TechnicianAircraftExperience`)
- `src/types/offer.ts` (`OfferWithRequirements`)
- `src/types/offerRequest.ts` (si se añade `requirement_level` a los requisitos embebidos en vistas de oferta)
- `src/types/matching.ts` (`MatchScore`, `MatchLabel` — nuevos niveles de coincidencia)
- `src/types/catalog.ts` (si se añade `aircraft_ratings` en Fase 2)

**TypeScript — constantes**
- `src/constants/aircraftTypes.ts` (reconciliar `aircraftFamily` con el seed SQL, §9)
- `src/constants/licenses.ts` (sin cambios necesarios en Fase 1)

**TypeScript — repositorios**
- `src/repositories/v2/technicianRepositoryV2.ts` (`updateAircraftTypes`, `updateLicenses`, `getWithRelations`)
- `src/repositories/v2/offerRepository.ts` (`replaceRequirements`, `getWithRequirements`)
- `src/repositories/v2/supabaseMappers.ts` (`loadTechnicianRelations`, `loadOfferRequirements`, mappers de fila)
- `src/repositories/v2/catalogRepository.ts` (si se añade `aircraft_ratings` en Fase 2)

**TypeScript — lógica**
- `src/utils/matchingV2.ts` (`calculateOfferTechnicianMatch` — reescritura central)
- `src/utils/v2CompatAdapters.ts` (auditar dependientes antes de tocar, §24 pregunta 4)
- `src/utils/privacyV2.ts` (paso de campos nuevos a `SafeTechnicianPreview`, trivial)

**UI**
- `app/technician/profile.tsx` (secciones Licenses y Aircraft types)
- `app/company/offers/new.tsx` y `app/company/offers/edit.tsx` (toggle obligatorio/preferido, motor preferido)
- `app/company/search.tsx` (opcional: reflejar `requirement_level` en agrupación de resultados)
- `src/components/MatchBadge.tsx`, `src/components/InlineScore.tsx` (presentación de niveles)
- `app/company/applications/[id].tsx`, `app/company/direct-offers/[id].tsx`, `app/technician/offers/[id].tsx`, `app/technician/direct-offers/[id].tsx` (breakdown de coincidencia)
- `src/components/TechnicianFilters.tsx`, `src/components/TechnicianCard.tsx`, `src/components/MatchRequestCard.tsx` — **candidatos a eliminar** (código muerto confirmado), decisión aparte de este análisis.

**Seeds y validación**
- `src/data/seeds/technicianHabilitations.json`, `technicianLicenses.json`, `offerRequiredAircraftTypes.json`, `offerRequiredLicenses.json`, `offerRequiredTechnicianTypes.json`
- `scripts/validateSeeds.js`

**Documentación**
- `docs/DATA_MODEL_V2.md`, `docs/TYPESCRIPT_TYPES_V2.md`, `docs/SUPABASE_SCHEMA_V2.sql`, `docs/RLS_PLAN_V2.md`, `docs/MIGRATION_FROM_DEMO_TO_V2.md`

### 26.2 Base de datos
- **Migraciones nuevas**: 1 en Fase 1 (columnas aditivas + constraints + trigger de protección de `verification_status`), 1-2 en Fase 2 (`technician_type_courses`, columnas de experiencia, RPC de verificación), 1 opcional en Fase futura (`aircraft_ratings` + join).
- **Tablas nuevas**: `technician_type_courses` (Fase 2); `aircraft_ratings`, `aircraft_rating_aircraft_types` (Fase futura).
- **Columnas nuevas**: ver §13.2 completo.
- **Constraints**: `chk_habilitation_source` (Fase 1); FKs de las tablas nuevas (Fase 2/futura).
- **Índices**: ninguno adicional estrictamente necesario en Fase 1 (los `UNIQUE` existentes ya indexan lo relevante); revisar en Fase 2 si `technician_type_courses` necesita índice por `technician_id`.
- **Funciones/triggers**: trigger de protección de `verification_status` en `technician_habilitations`/`technician_licenses` (replica patrón de `009`).
- **RLS**: nuevas columnas no requieren políticas nuevas en Fase 1 (mismas tablas, mismas políticas); `technician_type_courses` (Fase 2) necesita su propio juego de 5 políticas replicando el patrón de `technician_habilitations`.
- **RPCs afectados/nuevos**: nuevo `admin_update_habilitation_verification` / `admin_update_license_verification` (Fase 2), análogos a `admin_update_technician_verification` (`010_admin_rpcs_and_member_guards.sql:23-96`).

### 26.3 TypeScript
- Tipos que cambian: `TechnicianHabilitation`, `TechnicianLicense`, `TechnicianAircraftExperience`, `OfferWithRequirements`, `MatchScore`/`MatchLabel`.
- Interfaces nuevas: `TechnicianTypeCourse` (Fase 2), `AircraftRating` (Fase futura).
- Repositorios afectados: `technicianRepositoryV2`, `offerRepository`, `supabaseMappers`, `catalogRepository` (Fase futura).
- Hooks afectados: los que consuman `useTechnicianSearch`, matching en `app/map.tsx`, y cualquier hook detrás de las pantallas de detalle listadas en §26.1 (no identificado un hook dedicado separado de las pantallas mismas en la investigación — la lógica está mayormente inline en los componentes de pantalla).
- Consultas afectadas: todas las que pasan por `loadTechnicianRelations`/`loadOfferRequirements`.
- Validaciones afectadas: `scripts/validateSeeds.js`.

### 26.4 UI
Perfil técnico, edición de licencia, experiencia, creación de oferta, edición de oferta, filtros/resultados, detalle técnico (embebido en aplicaciones/ofertas directas), detalle de oferta, chat (solo Fase 4) — lista exacta de archivos en §26.1.

### 26.5 Matching
- Reglas propuestas y prioridades: §17.
- Filtros duros: únicamente categoría Part-66 `mandatory` incumplida.
- Factores de ordenación: verificado > declarado; exacta > cercana > experiencia/formación > información insuficiente.
- Explicaciones mostradas: listas "Coincide" / "Por confirmar" (§17, §8 del encargo).
- Tratamiento de datos no verificados: nunca se ocultan, siempre se etiquetan como declarados/manuales.

### 26.6 Migración — ejemplos
Ver tabla completa en §20. Resumen de los cinco casos pedidos explícitamente en la sección 25 del encargo: técnico legacy B1.1+A320 (se queda como "sin motor precisado", nivel cercana en vez de exacta); técnico con B1.3+B2 (no se corrige automáticamente el vínculo si ya estaba mal por el bug; queda declarado, pendiente de revisión manual del técnico); oferta legacy que pide A320 (pasa a `requirement_level='preferred'` por default, sin motor); oferta que necesita A320 CFM56 (se crea/edita explícitamente con los campos nuevos); dato manual no normalizado (`source='manual'`, `raw_label` libre, `aircraft_type_code=NULL`).

### 26.7 Complejidad
| Fase | Complejidad | Motivo |
|---|---|---|
| Fase 1 | Media | Toca ruta de guardado de perfil y algoritmo de matching en producción/demo, aunque el cambio de esquema es puramente aditivo. |
| Fase 2 | Media | Tabla nueva + RPC nueva + columnas nuevas, pero sin cambios de arquitectura ni de UI compleja. |
| Fase 3 | Media | Reescritura del clasificador de matching y de 5 componentes de presentación; sin cambios de esquema. |
| Fase 4 | Baja-media | Generación de texto a partir de datos ya calculados en Fase 3; no toca la regla de seguridad del chat. |
| Fase futura | Alta (si se aborda) | Catálogo formal con datos reales de calidad — coste de contenido, no solo de código. |

### 26.8 Preguntas pendientes
Ver §24 — seis preguntas concretas, ninguna especulativa, todas necesarias antes de escribir la migración de Fase 1.
