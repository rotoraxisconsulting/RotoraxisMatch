# Catálogo Part-66 de habilitaciones aeronave–motor — informe de implementación

> Alcance: catálogo inicial de 80 combinaciones válidas aeronave–motor EASA Part-66, con matching exacto/parcial/sin coincidencia, selector de búsqueda, solicitud de habilitaciones no encontradas, migración segura de datos legacy, RLS y pruebas.
> **Migración aplicada.** Con confirmación explícita del usuario, se aplicó `016_part66_ratings_habilitations.sql` contra el proyecto de desarrollo `rotoaxismatch-dev` (`rwauwuremzkizeoginza`) vía `mcp__supabase__apply_migration`. `get_advisors` (seguridad + rendimiento) se ejecutó inmediatamente después; se detectaron 2 hallazgos de rendimiento reales (no presentes en las tablas hermanas) y se corrigieron con una segunda migración de seguimiento, `017_part66_ratings_perf.sql`, también aplicada. Ver sección 16.
> No se han hecho commits ni pushes.

---
 
## 1. Estado anterior encontrado

El repositorio ya tenía una implementación **previa e incompleta** de este mismo problema, generada en una fase anterior ("Fase 1", ver `docs/PART66_AIRCRAFT_MODEL_ANALYSIS.md` y `docs/PART66_PHASE1_IMPLEMENTATION_REPORT.md`), sentada como archivos **sin commitear y sin aplicar a ningún Supabase real**:

- Migración `supabase/migrations/016_part66_ratings_habilitations.sql` con un catálogo de solo **12 motores** (`engine_types`) + **12 habilitaciones** (`aircraft_ratings`), normalizadas mediante una tabla puente `aircraft_rating_aircraft_types` hacia el catálogo `aircraft_types` ya existente (33 aeronaves, sin motor).
- `technician_habilitations.aircraft_rating_code` (nullable) y `offer_required_habilitations` referenciando esas 12 habilitaciones por código de texto.
- `catalog_requests` para solicitudes de "no encuentro mi habilitación", con `request_type IN ('engine','aircraft_rating')`.
- Matching reescrito como niveles explicables (`exact`/`related`/`legacy`/`not_met`) en `src/utils/offerMatchExplain.ts`, ya con la regla correcta de "licencia+aeronave solo cuentan si vienen de la misma fila".
- Seeds, `validateSeeds.js` y `scripts/testMatching.ts` (8 tests) adaptados a ese catálogo de 12.

**Verificado con `mcp__supabase__list_migrations` y `mcp__supabase__list_tables` contra el proyecto real `rotoaxismatch-dev` (rwauwuremzkizeoginza)**: ninguna de esas tablas existe en la base de datos real; el historial de migraciones remoto termina en `admin_update_company_verification` (2026-07-03), anterior a esta migración 016. Es decir, la Fase 1 nunca llegó a desplegarse — ni siquiera localmente contra un proyecto de desarrollo.

Además, `catalogRepository` **nunca consulta Supabase para catálogos** — `getAircraftTypes()`, y ahora `getAircraftTypeRatings()`, leen directamente de constantes TypeScript. Las tablas de catálogo en Supabase existen solo por integridad referencial (FKs), no por lectura de la UI. Esto es clave para entender por qué el catálogo de 80 debe existir **igual en TypeScript y en SQL, con los mismos IDs**.

---

## 2. Decisión de modelo adoptada

**Se sustituyó por completo el diseño de la Fase 1** (motor normalizado en tabla separada + join hacia `aircraft_types`) por el modelo autocontenido que pide este encargo: una única tabla `aircraft_type_ratings` con fabricante, familia, fabricante/familia de motor, alias y categoría como columnas planas de cada fila — sin tabla de motores reutilizable.

Justificación de por qué se reescribe en vez de "apilar" una migración 017 encima:

1. **Nunca se aplicó a ningún Supabase real** (verificado arriba) ni está commiteada en git — no hay ningún consumidor real que dependa de su forma anterior.
2. El propio encargo (sección 15) prohíbe explícitamente "crear un sistema genérico de motores reutilizables" — que es exactamente lo que la Fase 1 había construido (`engine_types`).
3. Mantener las dos formas en paralelo (12 + 80) habría recreado el mismo antipatrón que el análisis de Fase 1 ya había señalado como problema real: **dos catálogos de aeronaves divergentes** (`aircraft_types` en SQL vs. `src/constants/aircraftTypes.ts`). Añadir un tercer catálogo de "ratings" habría sido peor, no mejor.

Se conservan de la Fase 1, por seguir siendo válidas y no relacionadas con el cambio de modelo:
- La corrección de la FK compuesta `(technician_id, license_code)` sobre `technician_licenses`.
- La columna `requirement_level` (`mandatory`/`preferred`) en las cuatro tablas de requisitos — **se mantiene el nombre `mandatory`, no `required`** como pide el enunciado literal, porque ya es la convención existente en las otras tres tablas (`offer_required_technician_types/licenses/aircraft_types`) y en el matching probado; cambiarlo solo para esta tabla habría introducido dos etiquetas para el mismo concepto binario sin ningún beneficio. Documentado como desviación deliberada del enunciado literal.
- La tabla `catalog_requests` (en vez de crear `aircraft_type_rating_requests` como tabla nueva) — incorpora exactamente los campos pedidos en la sección 7 del encargo (`raw_text`, `context`, `status`, `resolved_aircraft_type_rating_id`, `admin_notes`), bajo el nombre ya establecido en el repositorio. El encargo permite explícitamente esta libertad de nombres.
- `technician_aircraft_type_ratings` **no se creó como tabla nueva y separada**: se adaptó `technician_habilitations` (ya era la relación técnico↔aeronave con licencia) añadiéndole `aircraft_type_rating_id`, `experience_years`, `is_current` — así se conserva `license_code`/`issued_at`/`expires_at` que el encargo pide expresamente no perder ("Licencia... Categoría Part-66"). El índice único es `(technician_id, license_code, aircraft_type_rating_id)`, no solo `(technician_id, aircraft_type_rating_id)` como en el literal del encargo, precisamente para no perder la posibilidad — ya soportada por el esquema real de la tabla desde su migración original — de que el mismo técnico declare la misma habilitación bajo dos categorías distintas (p. ej. B1.1 y B2 sobre el mismo A320neo/LEAP-1A).
- `offer_aircraft_type_ratings` tampoco se creó aparte: se adaptó `offer_required_habilitations`, manteniendo `license_code` en la fila (necesario para que el matching siga evaluando categoría+rating como una unidad, tal como ya hacía el matching de Fase 1).

`aircraft_types` (33 aeronaves, catálogo general para experiencia y requisitos amplios) **no se ha tocado** — sigue sirviendo su propósito actual, independiente del nuevo catálogo de 80 ratings.

---

## 3. Tablas creadas o modificadas

| Tabla | Tipo | Notas |
|---|---|---|
| `aircraft_type_ratings` | **nueva** | `id uuid, manufacturer, aircraft_family, engine_manufacturer, engine_family, easa_endorsement (unique), display_name, commercial_aliases text[], aircraft_category (check 6 valores), easa_group, source_revision, priority, is_active, created_at, updated_at` — 80 filas sembradas |
| `technician_habilitations` | modificada | `+aircraft_type_rating_id uuid FK`, `+experience_years numeric`, `+is_current boolean default true`; `aircraft_type_code` pasa a nullable; nuevo `CHECK` de "al menos uno de los dos"; nuevo índice único parcial `(technician_id, license_code, aircraft_type_rating_id)`; nueva FK compuesta `(technician_id, license_code)` → `technician_licenses`, `NOT VALID` |
| `offer_required_habilitations` | **nueva** | `offer_id, license_code, aircraft_type_rating_id, requirement_level (mandatory/preferred), notes, created_at, updated_at`; PK `(offer_id, license_code, aircraft_type_rating_id)` |
| `offer_required_technician_types` / `offer_required_licenses` / `offer_required_aircraft_types` | modificadas | `+requirement_level` (default `preferred`) |
| `catalog_requests` | **nueva** | `id, requested_by, raw_text, context, status, resolved_aircraft_type_rating_id, admin_notes, created_at, updated_at` |

---

## 4. Migraciones creadas

Dos migraciones, ambas aplicadas contra `rotoaxismatch-dev` (`rwauwuremzkizeoginza`):

- `supabase/migrations/016_part66_ratings_habilitations.sql` — la migración principal (catálogo, adaptación de tablas, RLS, backfill legacy). Aditiva sobre el esquema real (`001`…`admin_update_company_verification`); no contiene `DROP`/`DELETE`/`TRUNCATE`.
- `supabase/migrations/017_part66_ratings_perf.sql` — migración de seguimiento generada tras revisar `get_advisors` inmediatamente después de aplicar la 016 (sección 16): añade 4 índices que faltaban sobre columnas FK de `catalog_requests`/`offer_required_habilitations`, y reescribe 2 políticas RLS de `catalog_requests` para evaluar `auth.uid()` una vez por consulta en vez de una vez por fila (mismo predicado, solo envuelto en `(select auth.uid())`).

---

## 5. Estrategia de migración de datos legacy

Se buscaron en el repositorio todas las tablas/campos relacionados con aeronaves/motores que pide analizar el encargo (`aircraft_models`, `aircraft_types`, `engine_types`, `aircraft_experience`, `aircrafts`, `models`, `engines`, `required_aircraft`, `preferred_aircraft`, `type_ratings`). Resultado:

- `aircraft_types` (33 filas, catálogo general): **no se toca** — sigue usándose para `technician_aircraft_experience` y `offer_required_aircraft_types`, conceptos independientes del rating exacto.
- `engine_types` / `aircraft_ratings` (Fase 1): no existían en ninguna base real; no hay datos que migrar desde ellas, solo un diseño de esquema que se sustituye antes de nacer (sección 2).
- `technician_habilitations.aircraft_type_code` (legacy real, 41 filas en el seed local): es el único dato con contenido real que necesitaba mapeo.

**Regla aplicada**: mapear automáticamente un `aircraft_type_code` legacy a un `aircraft_type_rating_id` **solo cuando el código tiene una única coincidencia inequívoca** entre los alias de las 80 habilitaciones nuevas. Un código como `A320`, `B737`, `B747`, `B777`, `B787`, `A330`, `A340`, `A380` o `H135` corresponde a **varias** motorizaciones distintas en el catálogo nuevo — no se adivina cuál, se deja el dato legacy intacto.

Mapeo inequívoco aplicado (16 códigos):

| Código legacy | Habilitación nueva |
|---|---|
| A220 | Airbus A220 — PW1500G |
| A350 | Airbus A350 — Trent XWB |
| Q400 | Dash 8 Q400 — PW150 |
| E175 | Embraer E170/E175 — CF34 |
| E190, E195 | Embraer E190/E195 — CF34 |
| ATR42, ATR72 | ATR 42/72 — PW120 |
| B407 | Bell 407 — RR250 |
| B412 | Bell 412 / AB412 — PT6 |
| S76 | Sikorsky S-76C — Arriel 2 |
| S92 | Sikorsky S-92A — CT7-8 |
| H125 | Airbus AS350 B3/H125 — Arriel 2 |
| H145 | Airbus H145/BK117 D2 — Arriel 2 |
| AW139 | Leonardo AW139 — PT6 |
| R44 | Robinson R22/R44 — Lycoming |

CRJ200/CRJ700/CRJ900 no tienen ninguna coincidencia en el catálogo inicial de 80 (Bombardier CRJ no está en la lista pedida) — quedan como legacy sin mapear, sin generar ninguna solicitud automática de catálogo (evita ruido: son 1 fila en los seeds, no se sabe si el volumen real justifica añadirlo a un futuro lote).

**Hallazgo durante la propia validación**: la primera versión del mapeo de A350/A220/B407 fallaba porque los alias curados usan la forma específica de variante ("A350-900", "A220-100", "Bell 407") y no la forma corta que usa el catálogo legacy ("A350", "A220", "B407"). Se corrigió añadiendo el alias corto a esas 3 habilitaciones (en TypeScript y en SQL, en el mismo commit conceptual) — el propio validador de seeds (sección 9) detectó esto como error antes de dar por buena la migración.

**Colisión evitada**: `hab-037` (tech-017, B1.3, legacy `B412`) NO se mapea automáticamente pese a que B412 es inequívoco, porque ese mismo técnico ya tiene `hab-046` normalizada explícitamente como `(tech-017, B1.3, Bell 412/AB412 — PT6)` desde la Fase 1 — mapear también `hab-037` habría violado el índice único `(technician_id, license_code, aircraft_type_rating_id)`. El `UPDATE` de la migración incluye un `NOT EXISTS` que hace esta comprobación automáticamente y de forma idempotente para cualquier dato real futuro, no solo para este caso conocido.

**Conteo final** (seed local, representativo de la regla que aplicaría igual en Supabase):
- 10 filas legacy mapeadas automáticamente (`hab-020, 024, 027, 029, 030, 031, 033, 035, 036, 041`).
- 1 fila legacy explícitamente no mapeada por colisión (`hab-037`, correcto — ya cubierta por `hab-046`).
- 5 filas ya normalizadas en Fase 1, migradas de `aircraft_rating_code` (texto) a `aircraft_type_rating_id` (uuid del nuevo catálogo): `hab-042…046`.
- 25 filas restantes con `aircraft_type_code` ambiguo (A320/B737/B747/B757/B767/B777/B787/A330/A340/A380 y CRJ*) quedan sin tocar, exactamente como estaban.

Nada se borra, nada se reinterpreta, cero pérdida de datos.

---

## 6. Catálogo inicial de 80 habilitaciones

Insertado exactamente como se especifica en el encargo (fabricante, familia, motor, denominación EASA, nombre visible, alias, categoría, prioridad), en `src/constants/aircraftTypeRatings.ts` **y** en la migración SQL, con los mismos 80 IDs fijos y deterministas (`00000000-0000-4000-a000-000000000001`…`080`) para que un `aircraft_type_rating_id` elegido por la UI (que lee la constante TS) sea siempre un FK válido contra la tabla real. Verificado programáticamente: 80 registros, 0 IDs duplicados, 0 `easa_endorsement` duplicados, las 6 categorías presentes.

---

## 7. Seeds

- `src/constants/aircraftTypeRatings.ts` — el catálogo en sí (como ya es la convención del repo para catálogos: `aircraftTypes.ts`, `licenses.ts`, etc. — no son filas de Supabase, son la fuente de verdad que lee `catalogRepository`).
- `src/data/seeds/technicianHabilitations.json` — actualizado (ver sección 5).
- `src/data/seeds/offerRequiredHabilitations.json` — 3 filas, `aircraftRatingCode` → `aircraftTypeRatingId` con los IDs nuevos.
- `src/data/seeds/catalogRequests.json` — 1 fila (`catreq-001`), migrada al nuevo esquema y usada para demostrar el ciclo de vida completo: la solicitud original ("AW169 (PWC 210)") coincide exactamente con la habilitación #76 del catálogo nuevo, así que se representa como `status: 'merged'` con `resolvedAircraftTypeRatingId` apuntando a esa fila — la única demostración de una solicitud ya resuelta.
- `scripts/validateSeeds.js` — reescrito para parsear el nuevo catálogo (80 entradas) en vez de los antiguos `engineTypes.ts`/`aircraftRatings.ts`; ver sección 9.

---

## 8. Formularios modificados

- **`app/technician/profile.tsx`** — sección "Habilitations": el selector de 12 chips planos se sustituyó por `AircraftTypeRatingPicker` (buscador sobre las 80 habilitaciones) + campo opcional "Years of experience on this rating". El panel "Request a catalog addition" se adaptó al nuevo esquema (`rawText`/`context` en vez de `requestType`/`licenseCode`/`aircraftTypeCode`/`requestedLabel`).
- **`app/company/offers/new.tsx`** y **`edit.tsx`** — sección "Exact habilitations (optional)": mismo cambio, chips de 12 → `AircraftTypeRatingPicker`.
- **`src/components/AircraftTypeRatingPicker.tsx`** (nuevo) — componente compartido: cuadro de búsqueda + lista filtrada (máx. 25 resultados) sobre `searchAircraftTypeRatings()`, sin dependencia externa (solo `TextInput`/`ScrollView`/`TouchableOpacity` de React Native, funciona igual en web/iOS/Android). Búsqueda por fabricante, familia, motor, denominación EASA, nombre visible y alias; agrupado/ordenado por prioridad → fabricante → familia → motor tal como pide la sección 6 del encargo. Muestra `displayName` como texto principal y `easaEndorsement` como texto secundario más pequeño (no la denominación técnica completa por defecto).
- **`app/technician/offers/[id].tsx`** — se corrigió un bug preexistente de la Fase 1: la lista de "Exact habilitations" en la pantalla de detalle de oferta mostraba el **código interno** de la habilitación (`h.aircraftRatingCode`) en vez de una etiqueta legible; ahora usa `getAircraftTypeRatingLabel(...)`.
- `src/components/AdminTechnicianCard.tsx`, `app/company/search.tsx`, `app/company/offers/[id].tsx` — sin cambios de código: siguen funcionando a través de `habilitationAircraftCodes()` (adaptador actualizado, sección 10), que ahora resuelve la familia de aeronave desde el rating normalizado en vez del array `aircraftTypeCodes` (que ya no existe en el modelo nuevo).
- `src/components/MatchExplanation.tsx` — sin cambios: consume `MatchScore`, cuya forma no varía en esta fase.

No se ha creado ningún panel de administración para revisar/aprobar `catalog_requests` — explícitamente fuera de alcance (sección 7 del encargo).

---

## 9. Cambios en el matching

`src/utils/offerMatchExplain.ts` reescrito para usar el nuevo catálogo, conservando la firma pública y las reglas de nivel (`exact`/`related`/`legacy`/`not_met`) intactas:

- **Exacta**: mismo `license_code` + mismo `aircraft_type_rating_id`, en la misma fila del técnico.
- **Parcial por familia**: `areRatingsRelated(idA, idB)` — mismo fabricante y al menos un token en común entre los campos `aircraft_family` (separados por `/`), ids distintos. Cubre exactamente el ejemplo del encargo (A320 Family CFM56 ↔ A320 Family V2500 comparten los tokens `a319/a320/a321`).
- **Sin coincidencia por fabricante**: si solo comparten fabricante pero ninguna familia (p. ej. Boeing 777/GE90 vs. Boeing 787/GEnx — tokens `777` vs `787`, sin solapamiento), no se considera relacionado — nuevo test (Caso 9) verifica explícitamente este caso pedido en la sección 5 del encargo.
- **Cobertura de código legacy**: `ratingMatchesLegacyCode(rating, code)` — coincidencia exacta (no difusa) contra los alias de la habilitación; sustituye a la antigua tabla puente `aircraft_rating_aircraft_types`.

Se decidió deliberadamente **no** usar solapamiento de alias como señal de "relacionado" (se probó y producía falsos positivos: p. ej. Bell 206 y Bell 407 comparten el alias de motor "Allison 250" sin ser la misma familia de aeronave) — el criterio final usa el campo `aircraft_family`, que no mezcla nomenclatura de motor.

`src/utils/matchingV2.ts` no cambia (ya solo reexporta la lógica pura). `src/utils/v2CompatAdapters.ts::habilitationAircraftCodes()` actualizado para el nuevo campo.

---

## 10. Cambios de RLS

- **`aircraft_type_ratings`**: lectura pública (`USING (true)`), escritura solo `is_admin()` — mismo patrón que el resto de catálogos (`aircraft_types`, `license_categories`...). Un usuario normal no puede insertar, activar, editar ni desactivar una habilitación oficial.
- **`offer_required_habilitations`**: calcado de `offer_required_aircraft_types` — lectura pública si la oferta está publicada+visible, lectura propia si es de la empresa, inserción/borrado solo con `can_act_for_company()`, admin acceso total.
- **`catalog_requests`**: inserción solo propia (`requested_by = auth.uid()`), lectura solo propia, sin política de `UPDATE` para no-admin (nadie salvo admin puede aprobar/rechazar/fusionar). El trigger `force_catalog_request_defaults` fuerza `status='pending'`, `resolved_aircraft_type_rating_id=NULL`, `admin_notes=NULL` en cada `INSERT`, cerrando el hueco de que un usuario inserte directamente una solicitud ya "resuelta".
- **`technician_habilitations` / `technician_licenses`**: sin cambios de política — las columnas nuevas son nullable y quedan cubiertas por las políticas de owner ya existentes desde la migración `001` (select/insert/delete propios).

No se usa `service_role` en el cliente en ningún punto nuevo.

**Verificado con `get_advisors` tras aplicar la migración**: ningún hallazgo de seguridad nuevo introducido por las 3 tablas nuevas — el único hallazgo que las menciona (`force_catalog_request_defaults` ejecutable vía RPC por `anon`/`authenticated` al ser `SECURITY DEFINER`) es el mismo patrón ya presente en ~15 funciones trigger preexistentes del esquema (`force_document_pending_on_insert`, `force_offer_relation_defaults`, `force_technician_profile_defaults`, etc.) — no es una regresión, es la convención ya aceptada en este proyecto para funciones de trigger `BEFORE INSERT`. Sí se encontraron 2 hallazgos de **rendimiento** genuinos (no presentes en las tablas hermanas de las que se copió el patrón RLS): 4 FKs sin índice de cobertura y 2 políticas que reevaluaban `auth.uid()` por fila — corregidos de inmediato en `017_part66_ratings_perf.sql` (sección 4).

---

## 11. Tests añadidos

`scripts/testMatching.ts` — ampliado de 8 a **14 casos**, todos ejecutables sin conexión a base de datos:

```
PASS — Case 1 — exact category+rating match
PASS — Case 2 — no false combination across categories
PASS — Case 3 — same family, different engine => related + clarification
PASS — Case 4 — technician can hold several engine variants of one family at once
PASS — Case 5 — legacy broad requirement does not combine independent license/aircraft rows
PASS — Case 6 — preferred requirement mismatch stays related, never excluded
PASS — Case 7 — mandatory requirement mismatch is flagged but the profile still surfaces as related
PASS — Case 8 — pending catalog request codes are not resolvable ratings
PASS — Case 9 — no match from sharing only a manufacturer (Boeing 777 vs Boeing 787)
PASS — Case 10 — aircraft_type_ratings catalog has exactly 80 active entries
PASS — Case 11 — easa_endorsement values are unique across the catalog
PASS — Case 12 — search by alias finds the right rating (A320neo)
PASS — Case 13 — search by engine finds all matching engine variants (LEAP)
PASS — Case 14 — search by commercial nickname finds the right ratings (Dreamliner)

14 passed, 0 failed
```

Mapeo con los 12 casos pedidos en la sección 14 del encargo:

| # pedido | Cubierto por |
|---|---|
| 1. Catálogo con exactamente 80 registros | Caso 10 (test) + `validateSeeds.js` (conteo por texto, independiente) |
| 2. Denominaciones EASA únicas | Caso 11 (test) + `validateSeeds.js` |
| 3. Búsqueda por alias | Caso 12 |
| 4. Búsqueda por motor | Caso 13 |
| 5. Búsqueda por nombre comercial | Caso 14 |
| 6. Coincidencia exacta | Caso 1 |
| 7. Coincidencia parcial por familia | Caso 3 |
| 8. Ausencia de coincidencia por fabricante únicamente | Caso 9 |
| 9. Prevención de duplicados del técnico | `validateSeeds.js` (clave `technicianId+licenseCode+aircraftTypeRatingId`) + índice único real en la migración |
| 10. Prevención de duplicados en la oferta | `validateSeeds.js` (clave `offerId+licenseCode+aircraftTypeRatingId`, ya existía) + PK real en la migración |
| 11. Creación de una solicitud de habilitación | Seed `catreq-001` + `catalogRequestRepository.create()` — sin test de I/O porque el proyecto no tiene un arnés de test contra Supabase real (mismo criterio que la Fase 1) |
| 12. Restricciones RLS principales | Verificado con `get_advisors` (seguridad) tras aplicar la migración — ver sección 10 |

`scripts/validateSeeds.js` ampliado con validación completa del catálogo de 80 (IDs/EASA/alias duplicados, categoría y prioridad válidas, exactamente 80 activos) y de las relaciones que lo usan (habilitaciones de técnico, requisitos de oferta, solicitudes de catálogo), incluida una comprobación cruzada de que todo `aircraftTypeRatingId` migrado automáticamente desde un `aircraftTypeCode` legacy realmente aparece entre los alias de esa habilitación (esta comprobación fue la que detectó y permitió corregir el problema descrito en la sección 5).

---

## 12. Resultado exacto de cada comando ejecutado

**`npm run ts`**
```
(sin salida — 0 errores)
```

**`node scripts/validateSeeds.js`**
```
=== SEED VALIDATION REPORT ===
... Habilitations: 46, OfferRequiredHabilitations: 3, CatalogRequests: 1,
    AircraftTypeCatalogCodes: 33, AircraftTypeRatingCatalog entries: 80 (active ids tracked: 80) ...
Warnings: 0
Errors: 0
RESULT: PASS
```

**`npm run test:matching`**
```
14 passed, 0 failed
```

**`npx expo export --platform web`**
```
Web Bundled 2632ms node_modules\expo-router\entry.js (2640 modules)
› Static routes (51): ... (todas las rutas existentes, incluidas /technician/profile,
  /company/offers/new, /company/offers/edit, y las 6 pantallas de detalle relacionadas)
Exported: dist
```
Sin errores de bundling.

**`mcp__supabase__apply_migration` (016 y 017, contra `rwauwuremzkizeoginza`)**
```
{"success":true}   (ambas)
```
Verificado tras aplicar:
```sql
SELECT count(*) AS total, count(*) FILTER (WHERE is_active) AS active FROM aircraft_type_ratings;
-- {"total":80,"active":80}
```
`aircraft_type_ratings`, `offer_required_habilitations` y `catalog_requests` aparecen en `list_tables` con `rls_enabled: true`.

**`mcp__supabase__get_advisors` (seguridad + rendimiento, tras 016)**
- Seguridad: 0 hallazgos nuevos achacables a las 3 tablas nuevas (el único que las menciona es un patrón ya presente en ~15 funciones trigger preexistentes — sección 10).
- Rendimiento: 2 hallazgos reales (4 FKs sin índice, 2 políticas RLS reevaluando `auth.uid()` por fila) — corregidos con `017_part66_ratings_perf.sql` y reverificados (`pg_indexes` confirma los 4 índices nuevos creados).

---

## 13. Archivos modificados

**Base de datos**
- `supabase/migrations/016_part66_ratings_habilitations.sql` (reescrito por completo) — **aplicada**
- `supabase/migrations/017_part66_ratings_perf.sql` (nuevo, generado a partir de `get_advisors`) — **aplicada**

**TypeScript — tipos**
- `src/types/catalog.ts` — `AircraftTypeRatingCatalog`, `AircraftRatingCategory` (sustituyen a `EngineTypeCatalog`/`AircraftRatingCatalog`/`AircraftRatingAircraftType`)
- `src/types/technician.ts` — `TechnicianHabilitation.aircraftTypeRatingId`/`.experienceYears`/`.isCurrent`
- `src/types/offer.ts` — `OfferRequiredHabilitation.aircraftTypeRatingId`
- `src/types/catalogRequest.ts` — reescrito (`rawText`, `context`, `resolvedAircraftTypeRatingId`, `adminNotes`, `updatedAt`)
- `src/types/index.ts` — comentario actualizado

**TypeScript — constantes**
- `src/constants/aircraftTypeRatings.ts` (nuevo) — catálogo de 80 + `getAircraftTypeRating`, `searchAircraftTypeRatings`, `areRatingsRelated`, `ratingMatchesLegacyCode`, `sortAircraftTypeRatings`
- `src/constants/engineTypes.ts`, `src/constants/aircraftRatings.ts` — **eliminados** (nunca desplegados, sustituidos)
- `src/constants/index.ts` — barrel actualizado

**TypeScript — repositorios**
- `src/repositories/v2/catalogRepository.ts` — `getAircraftTypeRatings`, `getAircraftTypeRating`, `searchAircraftTypeRatings`
- `src/repositories/v2/technicianRepositoryV2.ts` — `replaceHabilitations()` con `aircraftTypeRatingId`/`experienceYears`/`isCurrent`; filtro de búsqueda actualizado
- `src/repositories/v2/offerRepository.ts` — `replaceRequiredHabilitations()`/`create()`/`replaceRequirements()` con `aircraftTypeRatingId`
- `src/repositories/v2/supabaseMappers.ts` — mapeos de habilitaciones, requisitos de oferta y solicitudes de catálogo
- `src/repositories/v2/catalogRequestRepository.ts` — `create()`/`getForUser()` con el nuevo esquema

**TypeScript — lógica**
- `src/utils/offerMatchExplain.ts` — reescrito para el nuevo catálogo
- `src/utils/v2CompatAdapters.ts` — `habilitationAircraftCodes()` actualizado

**UI**
- `src/components/AircraftTypeRatingPicker.tsx` (nuevo)
- `app/technician/profile.tsx`, `app/company/offers/new.tsx`, `app/company/offers/edit.tsx` — selector + campos nuevos
- `app/technician/offers/[id].tsx` — corrección de bug (código en vez de etiqueta)

**Seeds y validación**
- `src/data/seeds/technicianHabilitations.json`, `offerRequiredHabilitations.json`, `catalogRequests.json`
- `scripts/validateSeeds.js`, `scripts/testMatching.ts`

**No modificados por esta fase** (heredados tal cual de la Fase 1, siguen vigentes): `src/types/matching.ts`, `src/utils/matchingV2.ts`, `src/components/MatchExplanation.tsx`, `src/repositories/v2/index.ts`, `src/data/seeds/technicianLicenses.json`, `supabase/functions/delete-account/index.ts`, `supabase/functions/invite-company-member/index.ts`, `.gitignore`, `package.json` (script `test:matching`).

---

## 14. Riesgos o trabajo pendiente

- No se ha podido verificar visualmente en navegador ni en móvil el nuevo selector `AircraftTypeRatingPicker` — este entorno no dispone de una herramienta de automatización de navegador. Se verificó `tsc`, el bundling web, las 51 rutas y el estado real de la base de datos tras aplicar la migración, pero no la interacción manual. Ver sección 16 para los pasos de QA manual.
- `is_current` (booleano) se añadió al modelo y al repositorio, pero no se expone todavía en el formulario del perfil técnico (solo `experienceYears`) — para no sobrecargar el formulario en esta fase; queda disponible para una iteración de UI posterior.
- CRJ200/CRJ700/CRJ900 (3 filas de experiencia/habilitación legacy en los seeds) no tienen ninguna habilitación equivalente en el catálogo inicial de 80 — es fiel al encargo ("no inventes más registros fuera de estos 80"), pero quedan sin poder normalizarse hasta un lote futuro.
- La FK `fk_technician_habilitations_license` se añadió `NOT VALID` (heredado de la Fase 1, ya aplicado tal cual) — antes de `VALIDATE CONSTRAINT` hay que ejecutar la consulta de diagnóstico incluida como comentario en la propia migración; no se ha ejecutado en esta sesión porque `technician_habilitations` tiene 0 filas reales en este momento, así que la validación sería trivial pero no aporta información hasta que haya datos reales.
- La migración quedó aplicada contra `rotoaxismatch-dev`, que en este momento no tiene datos reales de técnicos/ofertas (0 filas en `technician_habilitations`, `offers`, etc.) — el `UPDATE` de backfill de la sección 3 corrió sin efecto (no hay nada que migrar todavía); volverá a ejecutarse correctamente en cuanto existan filas reales, ya que es idempotente.
- Los archivos locales `supabase/migrations/016...sql` y `017...sql` y el estado remoto de `rotoaxismatch-dev` están sincronizados en este momento — si se hace un `supabase db pull`/`push` desde otro entorno, confirmar que no haya divergencia con estos dos archivos antes de aplicar nada más.

---

## 15. Migración aplicada — resultado

La migración **ya se aplicó** contra `rotoaxismatch-dev` (`rwauwuremzkizeoginza`) con confirmación explícita del usuario, vía `mcp__supabase__apply_migration`:

1. `016_part66_ratings_habilitations.sql` — aplicada (`{"success":true}`). Verificado: `aircraft_type_ratings` con 80/80 filas activas, `offer_required_habilitations` y `catalog_requests` creadas con RLS habilitado (`list_tables` → `rls_enabled: true` en las 3).
2. `mcp__supabase__get_advisors` ejecutado (seguridad + rendimiento) inmediatamente después — ver hallazgos en la sección 10 y 12.
3. `017_part66_ratings_perf.sql` — generada a partir de esos hallazgos (índices + RLS `auth.uid()`) y aplicada (`{"success":true}`). Verificado con `pg_indexes` que los 4 índices nuevos existen.
4. `list_migrations` confirma ambas: `part66_ratings_habilitations` (20260708192123) y `part66_ratings_perf` (20260708192518), a continuación de `admin_update_company_verification`.

Pendiente, no bloqueante (para cuando el proyecto tenga datos reales de técnicos):
- Ejecutar la consulta de diagnóstico de la sección 6 del archivo `016...sql` sobre `technician_habilitations` y decidir si `VALIDATE CONSTRAINT fk_technician_habilitations_license`.
- Volver a ejecutar `get_advisors` periódicamente conforme se añadan datos reales (algunos hallazgos de rendimiento solo aparecen con volumen).

---

## 16. Pasos exactos para verificar manualmente el flujo

1. `npm run web` (o `expo start --web`), iniciar sesión como técnico de demo.
2. Ir a `/technician/profile` → sección "Habilitations" → añadir una categoría (chip) → en "Add habilitation — aircraft + engine rating", escribir `A320neo` y confirmar que aparecen las 2 habilitaciones neo (LEAP-1A, PW1100G) y no las ceo (CFM56, V2500). Seleccionar una, opcionalmente indicar años de experiencia, pulsar "Add habilitation", guardar, recargar y confirmar que persiste.
3. Repetir la búsqueda con `LEAP`, `CFM56`, `H145`, `Dash 8`, `Global 6000` y confirmar que cada una devuelve resultados razonables ordenados por prioridad.
4. Pulsar "Can't find your habilitation? Request it.", rellenar y enviar — confirmar el mensaje "Request pending catalog addition."
5. Como empresa, ir a `/company/offers/new`, sección "Exact habilitations (optional)", repetir la búsqueda y añadir una habilitación exacta con nivel "Mandatory".
6. Publicar la oferta y, desde el perfil técnico usado en el paso 2, comprobar en la pantalla de aplicación/oferta directa correspondiente que `MatchExplanation` muestra el nivel correcto (`exact`/`related`) y que el texto de habilitaciones requeridas en `/technician/offers/[id]` muestra el nombre legible (p. ej. "Airbus A320 family — CFM56"), no un código interno.
7. Verificar que ninguna de estas acciones oculta nunca a un técnico de una lista ni le impide aplicar — solo cambia la explicación mostrada.

---

## Resumen

- **Implementado**: catálogo completo de 80 habilitaciones aeronave–motor EASA (TypeScript + migración SQL con los mismos IDs), adaptación no destructiva de `technician_habilitations` y `offer_required_habilitations`, tabla `catalog_requests` para habilitaciones no encontradas, selector de búsqueda compartido sin dependencias pesadas, matching por niveles (exacto/parcial por familia/sin coincidencia por fabricante), migración segura de datos legacy con backfill inequívoco documentado, RLS, 14 tests de matching + validador de seeds ampliado, y **migración aplicada y verificada contra el proyecto Supabase real `rotoaxismatch-dev`** (con confirmación explícita del usuario), incluida una segunda migración de rendimiento (017) generada a partir de `get_advisors`.
- **¿Los 80 registros están insertados?** Sí — en `src/constants/aircraftTypeRatings.ts` (fuente de verdad en runtime), en la migración SQL, y ahora también en la tabla real `aircraft_type_ratings` de `rotoaxismatch-dev` (`SELECT count(*)` → 80/80 activas, verificado en vivo).
- **¿La migración conserva los datos actuales?** Sí — es aditiva, sin `DROP`/`DELETE`; el único `UPDATE` sobre datos existentes está acotado a los 16 códigos legacy inequívocos y protegido contra colisiones con `NOT EXISTS`. Aplicada contra un proyecto que en este momento tiene 0 filas reales en las tablas afectadas, así que no hubo ningún dato en riesgo.
- **¿El matching exacto y parcial funciona?** Sí, con 14/14 tests en verde, incluidos los casos explícitos del encargo (A320neo+LEAP-1A exacto, A320 CFM56 vs V2500 parcial, Boeing 777 vs 787 sin coincidencia).
- **¿TypeScript compila?** Sí, `npm run ts` sin errores.
- **¿Los seeds pasan validación?** Sí, `node scripts/validateSeeds.js` → `RESULT: PASS`, 0 errores, 0 warnings.
- **¿El export web funciona?** Sí, `npx expo export --platform web` — 51 rutas, sin errores de bundling.
- **Acciones manuales pendientes**: verificar visualmente el nuevo selector en navegador/móvil (no se pudo automatizar en este entorno — pasos de QA en la sección 16), y ejecutar la consulta de diagnóstico de `fk_technician_habilitations_license` cuando el proyecto tenga datos reales de técnicos.
