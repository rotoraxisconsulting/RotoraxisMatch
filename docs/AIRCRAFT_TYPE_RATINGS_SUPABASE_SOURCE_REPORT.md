# Catálogo `aircraft_type_ratings` — Supabase como única fuente de verdad

> Alcance: eliminar la copia duplicada del catálogo de 80 habilitaciones aeronave–motor que vivía a la vez en `src/constants/aircraftTypeRatings.ts` (TypeScript) y en `public.aircraft_type_ratings` (Supabase), dejando Supabase como la **única** fuente de verdad en runtime, con caché, estados de carga explícitos, búsqueda en memoria, manejo de habilitaciones desactivadas, backfill legacy re-ejecutable, validación de la FK pendiente y un script de validación independiente contra la base real.
>
> **Corrige una afirmación incorrecta del informe anterior** (`AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md`, sección 14): decía que el backfill de datos legacy "volverá a ejecutarse correctamente en cuanto existan filas reales, ya que es idempotente", dando a entender que la migración `016` se re-ejecutaría sola. **Eso es falso.** Una migración ya aplicada no vuelve a correr nunca — ni automáticamente, ni al aparecer datos nuevos, ni al reiniciar la app. La sección 13 de este informe explica la corrección: `scripts/backfillLegacyAircraftRatings.ts`, un script explícito, re-ejecutable e idempotente que sustituye a esa expectativa incorrecta.
>
> Migraciones aplicadas en esta fase (nuevas, nunca se modificaron `016`/`017`): `018_validate_technician_habilitations_license_fk.sql`, `019_technician_habilitations_rating_index.sql`. No se han hecho commits ni pushes salvo que el usuario lo pida explícitamente después de revisar `git diff` (sección 24).

---

## 1. Estado anterior encontrado

Al iniciar esta fase, el catálogo de 80 habilitaciones existía **duplicado**:

- En SQL: `public.aircraft_type_ratings`, sembrada por la migración `016_part66_ratings_habilitations.sql` (reescrita íntegramente en una sesión previa a un modelo autocontenido de 80 filas, con IDs deterministas `00000000-0000-4000-a000-000000000001`…`080`), con un índice de rendimiento adicional en `017_part66_ratings_perf.sql`. Ambas migraciones **ya estaban aplicadas** contra el proyecto real `rotoaxismatch-dev` (`rwauwuremzkizeoginza`).
- En TypeScript: `src/constants/aircraftTypeRatings.ts` contenía el **mismo** array de 80 objetos, con los mismos IDs, mantenido a mano en paralelo. `catalogRepository.getAircraftTypeRatings()` leía exclusivamente de esa constante — la tabla de Supabase existía solo por integridad referencial (FKs desde `technician_habilitations`, `offer_required_habilitations`, `catalog_requests`), nunca se consultaba desde la app.

El propio informe de esa sesión (`AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md`) señalaba este problema como pendiente sin resolver: cualquier alta/baja/edición futura de una habilitación tendría que hacerse dos veces (SQL + TypeScript) y mantenerlas sincronizadas a mano, exactamente el antipatrón de "catálogos divergentes" que la Fase 1 ya había identificado para `aircraft_types`.

---

## 2. Decisión de arquitectura adoptada

`public.aircraft_type_ratings` pasa a ser la **única** fuente de verdad en runtime. `src/constants/aircraftTypeRatings.ts` se reescribió para contener exclusivamente:

- Tipos (`AircraftRatingIndex`, `AircraftTypeRatingRow`).
- Funciones puras que **reciben el catálogo o un índice como argumento** — ninguna sostiene ni recuerda datos propios: `buildAircraftRatingIndex`, `normalizeAircraftRatingSearchText`, `areRatingsRelated`, `ratingMatchesLegacyCode`, `getAircraftTypeRatingLabel`, `sortAircraftTypeRatings`, `filterAircraftTypeRatings`, `mapAircraftTypeRatingRow`.

**No se añadió ningún catálogo de emergencia hardcodeado.** Se evaluó explícitamente y se descartó: un fallback local reintroduciría el mismo problema de doble fuente de verdad que esta fase existe para eliminar, y ocultaría un fallo real de carga tras datos obsoletos en vez de mostrarlo. Un fallo o catálogo vacío se convierte en un estado `error`/`empty` explícito que la UI muestra con un botón "Reintentar" (sección 8) — nunca en una sustitución silenciosa.

Toda la lógica que antes buscaba una habilitación por id en el array global (matching, adaptadores V1-compat, filtros de búsqueda del repositorio de técnicos) se reescribió para recibir un `ratingIndex: Map<string, AircraftTypeRatingCatalog>` como parámetro explícito, cargado por quien orquesta la pantalla/hook **antes** de llamar a la lógica pura — nunca dentro de ella. Esto tocó ~20 archivos (repositorio, caché, hook, matching, adaptadores, 5 hooks de estado, 7 pantallas, el selector y `AdminTechnicianCard`) — ver el listado completo en la sección 23.

---

## 3. `catalogRepository.ts` — consultas a Supabase

`src/repositories/v2/catalogRepository.ts` consulta directamente `public.aircraft_type_ratings`:

```ts
const AIRCRAFT_TYPE_RATINGS_SELECT = `
  id, manufacturer, aircraft_family, engine_manufacturer, engine_family,
  easa_endorsement, display_name, commercial_aliases, aircraft_category,
  easa_group, source_revision, priority, is_active, created_at, updated_at
`;
```

- **`getAircraftTypeRatings(options?)`** → `fetchActiveAircraftTypeRatings()`: `.eq('is_active', true)`, ordenado por `priority desc, manufacturer asc, aircraft_family asc, engine_family asc`. Es la lista de la que se hacen **nuevas** selecciones — nunca incluye habilitaciones desactivadas.
- **`getAircraftTypeRatingById(id)`** y **`getAircraftTypeRatingsByIds(ids)`** → `fetchAircraftTypeRatingsByIds(ids)`: un único `.in('id', ids)`, **sin** filtrar `is_active`. Es el camino que resuelve etiquetas de habilitaciones que un técnico/oferta ya referencia, estén activas o no. `getAircraftTypeRatingsByIds` siempre agrupa en una sola consulta — nunca hace una llamada por id (verificado en tests, sección 22).
- **`searchAircraftTypeRatings(query, options?)`** → obtiene la lista activa cacheada y aplica `filterAircraftTypeRatings()` en memoria. Expuesta como capacidad del repositorio; el selector de UI (sección 8) usa `filterAircraftTypeRatings` directamente sobre la lista ya cargada por el hook en vez de llamar a este método, para no disparar una consulta de red por cada tecla — pero queda disponible para cualquier consumidor futuro que sí la necesite server-side.
- **`getAircraftTypeRatingsCacheStatus()`** / **`invalidateAircraftTypeRatingsCache()`** — introspección y control manual de la caché (sección 12).

Las funciones `getAircraftTypes`, `getLicenseCategories`, `getContractTypes`, `getTechnicianTypes`, `getCompanyTypes` no se tocaron — siguen leyendo de constantes TypeScript, fuera del alcance de esta fase.

---

## 4. Caché — `src/repositories/v2/aircraftTypeRatingsCache.ts`

Módulo nuevo, puro y con **inyección de dependencias** (`fetchActive`, `fetchByIds`, `ttlMs?`, `now?`) — no importa `src/lib/supabase.ts` ni nada con efectos secundarios, así que se puede testear con fetchers falsos sin conexión real (sección 22). `catalogRepository.ts` crea un único singleton a nivel de módulo, compartido por toda la app.

Diseño:

- **TTL configurable** (15 minutos por defecto) — dentro del TTL, `getActiveRatings()` devuelve el snapshot en memoria sin red.
- **Llamadas concurrentes comparten la misma promesa en curso** — dos componentes montándose a la vez nunca disparan dos fetch paralelos.
- **Un refresh fallido con catálogo previo válido sigue sirviendo el catálogo anterior** (estado se queda en `success`, el error queda registrado en `state.error` para quien quiera mostrar un aviso discreto) — nunca revierte a vacío ni lanza un error si ya había datos buenos. Si no hay catálogo previo, sí rechaza y el estado pasa a `error`.
- **`invalidate()`** — fuerza un refetch en la siguiente llamada aunque el TTL no haya vencido; usado tras aprobar una `catalog_request` (sección 12) o manualmente si hace falta.
- **`getRatingsByIds`** agrupa siempre los ids no resueltos en **una sola** llamada a `fetchByIds`, nunca N llamadas — y nunca excluye habilitaciones inactivas.

Durante el desarrollo de esta sesión se encontró y corrigió un bug propio en este mismo archivo antes de darlo por terminado (no reportado por el usuario, detectado al diseñar los tests de caché): el `.catch()` de `getActiveRatings()` relanzaba el error incluso cuando ya existía un catálogo previo válido, violando el requisito de "seguir sirviendo el último catálogo cargado si el refresh falla". Corregido distinguiendo `hadPreviousData` antes de decidir si el resultado se resuelve (con el catálogo antiguo) o se rechaza.

---

## 5. `useAircraftTypeRatingsCatalog` — hook compartido

`src/state/useAircraftTypeRatingsCatalog.ts`. Único punto de entrada para cualquier pantalla que necesite el catálogo (perfil técnico, formularios de oferta, matching, búsqueda). Devuelve:

```ts
{ ratings, ratingIndex, state: 'loading'|'success'|'empty'|'error', error, retry }
```

- Al montar (o al llamar `retry()`), consulta `catalogRepository.getAircraftTypeRatings()` (con `forceRefresh: true` en reintentos) y traduce el resultado: 0 filas → `'empty'`, error → `'error'` con el `Error` capturado, éxito con datos → `'success'`.
- `ratingIndex` está envuelto en `useMemo(() => buildAircraftRatingIndex(ratings), [ratings])` — **bug encontrado y corregido durante esta sesión**: la primera versión construía el `Map` en línea en cada render, creando una referencia nueva aunque `ratings` no hubiera cambiado; como `ratingIndex` se pasa como dependencia de `useCallback`/`useEffect` en ~10 pantallas, eso habría producido bucles de recarga. `useMemo` lo deja estable entre renders salvo que `ratings` cambie de verdad.
- Como la caché es un singleton de módulo, montar el hook en varias pantallas a la vez sólo dispara una petición de red (o ninguna, si el TTL sigue vigente).

---

## 6. `AircraftTypeRatingPicker.tsx` — selector

Reescrito para usar el hook de la sección 5. Estados manejados explícitamente, sin bloquear nunca la pantalla completa (el picker es un componente embebido, no una pantalla propia):

- **`loading`** → `ActivityIndicator` local.
- **`error`** → mensaje breve + botón "Reintentar" que llama a `retry()`.
- **`empty`** → mensaje de catálogo vacío (caso límite, no se espera en producción).
- **`success`** → búsqueda en memoria con `filterAircraftTypeRatings(ratings, query)` — `ratings` ya viene filtrado a `is_active=true` por el repositorio, así que el picker **nunca ofrece una habilitación inactiva para una selección nueva**.

Para el valor ya seleccionado (`value` prop), que puede referenciar una habilitación desactivada después de guardarse, el picker resuelve por separado con `catalogRepository.getAircraftTypeRatingById(value)` (sin filtro de `is_active`) y muestra un indicador discreto "Inactive catalog entry" si corresponde — nunca oculta ni rompe el valor ya guardado.

Sin dependencias nativas ni APIs solo-web: `TextInput`/`ScrollView`/`TouchableOpacity`/`ActivityIndicator` de React Native, igual en web/iOS/Android.

---

## 7. Búsqueda en memoria

`filterAircraftTypeRatings(ratings, query)` (en `src/constants/aircraftTypeRatings.ts`) sigue siendo pura y en memoria — recibe el catálogo como argumento, nunca lo consulta. Comportamiento sin cambios respecto a la versión anterior: normaliza (`trim` + minúsculas), rankea por calidad de coincidencia (exacta > empieza-por > contiene) sobre nombre visible, denominación EASA, fabricante, familia, motor y alias, y desempata con el mismo orden que `sortAircraftTypeRatings`. Deliberadamente **no** filtra por `is_active` — quien pase una lista que incluya inactivas (p. ej. `getAircraftTypeRatingsByIds`) las verá en los resultados; es responsabilidad de quien llama decidir qué lista pasar (el picker, en la práctica, siempre le pasa la lista ya activa-only del hook).

---

## 8. Matching — `ratingIndex` explícito

`src/utils/offerMatchExplain.ts`: `calculateOfferTechnicianMatch(offer, technician, ratingIndex)` — firma pasa de 2 a 3 parámetros. Ni esta función ni sus auxiliares (`evaluateHabilitationRequirement`, `evaluateLegacyBroadMatch`) consultan Supabase ni ningún catálogo global; todo llega por `ratingIndex`. Las reglas de nivel (`exact`/`related`/`legacy`/`not_met`) no cambiaron.

`src/utils/matchingV2.ts` (`getTechnicianMatchesForOffer`/`getOfferMatchesForTechnician`) ahora carga `catalogRepository.getAircraftTypeRatings()` en el mismo `Promise.all` que ya usaba para técnicos/ofertas, construye el índice una vez y lo pasa a cada llamada de matching.

`src/utils/v2CompatAdapters.ts` (`habilitationAircraftCodes`, `v2SafePreviewToSafeView`, `v2UnlockedViewToSafeView`, `v2TechnicianToV1`) y `src/repositories/v2/technicianRepositoryV2.ts` (`matchesSearchFilters`, `.search()`) reciben/cargan el mismo `ratingIndex`.

Siete pantallas que llamaban `calculateOfferTechnicianMatch` directamente se actualizaron para cargar el hook de la sección 5 y pasar `ratingIndex` como tercer argumento: `app/technician/offers/[id].tsx`, `app/technician/direct-offers/[id].tsx`, `app/technician/direct-offers/index.tsx`, `app/company/direct-offers/[id].tsx`, `app/company/applications/[id].tsx`, `app/company/applications/index.tsx`, `app/company/search.tsx`. Cinco hooks de estado (`useTechnicianSearch`, `useMapTechnicians`, `useAdminDashboard`, `useTechnicianDashboard`, `useCompanyDashboard`) hacen lo mismo internamente antes de invocar los adaptadores V1-compat.

**Bug encontrado durante la verificación final** (`npm run ts`): `technicianRepositoryV2.ts:83` usaba `Boolean(rating) && ratingMatchesLegacyCode(rating, ...)` sin afirmación de no-nulidad; TypeScript no estrecha `AircraftTypeRatingCatalog | undefined` a través de una llamada a `Boolean(...)`, a diferencia de `if (rating)`. El mismo patrón en `offerMatchExplain.ts` ya usaba `rating!` correctamente — se igualó `technicianRepositoryV2.ts` a ese patrón existente. Confirmado con `npm run ts` limpio tras el cambio.

---

## 9. Habilitaciones desactivadas — comportamiento garantizado

- **Una fila de `technician_habilitations`/`offer_required_habilitations` que ya apunta a una habilitación desde entonces desactivada sigue resolviendo su etiqueta real** — nunca un UUID en crudo. Camino: `getAircraftTypeRatingsByIds` (sin filtro `is_active`) en `profile.tsx`, `offers/edit.tsx` y dentro del propio picker para el valor seleccionado.
- **El matching no penaliza ni ignora una habilitación por estar desactivada** — `calculateOfferTechnicianMatch` no lee `is_active` en ningún punto; una fila exacta sigue siendo `exact` aunque la habilitación referenciada se haya desactivado después. Cubierto explícitamente por el test "Case 10" (sección 22).
- **El picker nunca la ofrece para una selección nueva** — `getAircraftTypeRatings()` siempre filtra `is_active=true` antes de llegar al picker (sección 3/6).
- **Nada se borra al desactivar una habilitación** — desactivar es `UPDATE aircraft_type_ratings SET is_active = false`, nunca un `DELETE`; las FKs desde `technician_habilitations`/`offer_required_habilitations`/`catalog_requests` siguen apuntando a una fila real.

---

## 10. Flujo de `catalog_requests` — sigue funcionando, y publicación sin nuevo deploy

`app/technician/profile.tsx` → `submitCatalogRequest()` ya usaba el esquema correcto (`catalogRequestRepository.create({ requestedBy, rawText, context })`) de la sesión anterior — no requirió cambios en esta fase.

**Proceso manual para que una habilitación nueva aparezca sin desplegar la app** (documentado explícitamente porque, corrigiendo el error de la sección 13, nada de esto ocurre solo):

1. El técnico envía "No encuentro mi habilitación" → se crea una fila `pending` en `catalog_requests`.
2. Un administrador revisa la solicitud (fuera de esta fase — no existe panel de aprobación, igual que en la fase anterior; se gestiona directamente en SQL/Studio).
3. Se inserta la fila nueva en `aircraft_type_ratings` (`INSERT ... VALUES (...)`).
4. Se le asigna un `id` (UUID nuevo, no reutilizar los deterministas `...001`–`...080`).
5. Se definen sus `commercial_aliases` (alias de búsqueda: variantes de modelo, apodos comerciales, apodos de motor).
6. Se define su `priority` relativa a las demás filas de su categoría.
7. Se marca `is_active = true` (o se deja el valor por defecto de la columna, si ya es `true`).
8. Se actualiza `catalog_requests.status`/`resolved_aircraft_type_rating_id`/`admin_notes` para cerrar la solicitud.

Después de esto, la fila nueva aparece en la app **sin ningún despliegue**, por cualquiera de estas tres vías (ninguna requiere intervención de código):
- Expira el TTL de la caché (15 min) y la siguiente carga la trae.
- Alguien llama `catalogRepository.invalidateAircraftTypeRatingsCache()` (o simplemente se reinicia la sesión / se recarga la pestaña web).
- El usuario pulsa "Reintentar" en un picker que esté mostrando un estado `error` en ese momento.

---

## 11. Migraciones nuevas de esta fase

Ninguna modifica `016`/`017` (ya aplicadas, tal como pide el encargo). Ambas se crearon, aplicaron y verificaron contra `rotoaxismatch-dev` (`rwauwuremzkizeoginza`) vía `mcp__supabase__apply_migration`:

- **`018_validate_technician_habilitations_license_fk.sql`** — `ALTER TABLE technician_habilitations VALIDATE CONSTRAINT fk_technician_habilitations_license;`. La FK se había añadido `NOT VALID` en la migración original (fase anterior); la consulta de diagnóstico documentada en esa misma migración se ejecutó primero y devolvió 0 filas huérfanas, así que validar era seguro. Confirmado tras aplicar: `SELECT conname, convalidated FROM pg_constraint WHERE conname = 'fk_technician_habilitations_license'` → `convalidated: true` (reconfirmado de nuevo al cierre de esta sesión, sección 20).
- **`019_technician_habilitations_rating_index.sql`** — `CREATE INDEX idx_technician_habilitations_rating ON technician_habilitations (aircraft_type_rating_id);`. Corrige la única regresión de rendimiento genuina detectada por `get_advisors` tras `016`/`017` (FK sin índice de cobertura); deliberadamente no toca los otros dos FKs sin índice de esa misma tabla (`aircraft_type_code`, `license_code`), preexistentes y fuera de alcance — ver triage en la sección 20.

---

## 12. `scripts/validateSeeds.js` — qué cambió

Ya no requiere ni parsea el array de 80 entradas (`AIRCRAFT_TYPE_RATING_CATALOG` ha dejado de existir en TypeScript). Se eliminó por completo el bloque que hacía parsing por regex del archivo de constantes (categorías válidas, IDs válidos, mapa de alias, conteo "exactamente 80"). Sigue validando, sobre los seeds locales JSON:

- Formato de `aircraftTypeRatingId`/`resolvedAircraftTypeRatingId` como UUID (chequeo ligero de formato, no de existencia contra Supabase — eso es responsabilidad del script nuevo de la sección 14).
- Duplicados de la clave `(technicianId, licenseCode, aircraftTypeRatingId)`.
- El resto de invariantes que ya validaba (perfiles, ofertas, cross-checks de `companyId`, invariantes de `identityRevealed`/`documentsUnlocked`), sin cambios.

La línea de resumen ahora remite explícitamente a `npm run validate:aircraft-ratings` para la validación real del catálogo contra Supabase.

---

## 13. Backfill legacy — script explícito, re-ejecutable (corrige el informe anterior)

`scripts/backfillLegacyAircraftRatings.ts` (nuevo). Mapea `technician_habilitations.aircraft_type_code` (legacy, sin `aircraft_type_rating_id`) al rating correspondiente **solo cuando exactamente una** fila del catálogo activo lo tiene entre sus `commercial_aliases` — nunca adivina entre varias, nunca sobreescribe una fila que ya tiene rating, nunca toca `aircraft_type_code`.

- `--dry-run` (por defecto) / `--apply` (opt-in explícito) vía `process.argv`.
- Requiere `SUPABASE_SERVICE_ROLE_KEY` (bypassa RLS porque escribe filas de técnicos que no son "uno mismo" — RLS lo bloquearía correctamente con la clave anon). Nunca se usa en código de cliente/app, solo en este script, documentado en `.env.example` como local/servidor únicamente, nunca commiteado.
- Reutiliza `planLegacyAircraftRatingBackfill`/`summarizeBackfillPlan` (`src/utils/aircraftRatingBackfillPlan.ts`, nuevo, puro, sin import de Supabase — testeado con fixtures fabricados, sección 22).
- El `UPDATE` real (solo con `--apply`) lleva una guarda de idempotencia (`.is('aircraft_type_rating_id', null)`) — ejecutarlo dos veces nunca duplica ni sobreescribe.

**Por qué existe este script en vez de confiar en que "la migración se re-ejecute"**: no lo hace. Una vez aplicada, `016` no vuelve a correr jamás — ni si aparece un técnico nuevo creado con un cliente viejo que aún escribe `aircraft_type_code` sin `aircraft_type_rating_id`, ni si se reinicia el proyecto. Este script es la forma explícita, correcta y repetible de barrer esos casos cuando haga falta, y debe ejecutarse manualmente (`npm run backfill:aircraft-ratings -- --dry-run` primero, `-- --apply` después de revisar el plan) cada vez que se sospeche que hay filas legacy nuevas sin normalizar.

---

## 14. `scripts/validateAircraftTypeRatingsCatalog.ts` — validación contra la base real

Nuevo. Único de los scripts de esta fase que valida el catálogo **real**, no seeds locales. Usa la clave publicable/anon (lectura de `aircraft_type_ratings` es pública — no necesita `service_role`).

Comprueba: IDs y `easa_endorsement` sin duplicados, campos obligatorios no vacíos, categoría dentro del enum válido, prioridad entera ≥ 0, alias sin duplicados dentro de la misma fila, **≥ 80 filas** (nunca "exactamente 80", para tolerar crecimiento futuro vía `catalog_requests` aprobadas), presencia de los 80 IDs base deterministas (generados programáticamente, sin duplicar los datos de las 80 filas), y validez de las referencias `aircraft_type_rating_id`/`resolved_aircraft_type_rating_id` desde `technician_habilitations`, `offer_required_habilitations` y `catalog_requests` contra el catálogo real.

---

## 15. Generated types de Supabase

Se buscó explícitamente algún archivo de tipos generados (`database.types.ts` o similar) en el repositorio — no existe ninguno; el proyecto siempre ha escrito sus tipos de dominio a mano (`src/types/*.ts`) y los mapea manualmente desde las filas de Supabase (`mapAircraftTypeRatingRow`, `supabaseMappers.ts`). No se generó ni adoptó ningún archivo nuevo de tipos generados — decisión deliberada de **no** introducir esa convención nueva a mitad de esta fase, fuera del alcance pedido; se documenta aquí como una no-acción explícita, no un olvido.

---

## 16. RLS

`aircraft_type_ratings` ya tenía lectura pública (`USING (true)`) y escritura restringida a `is_admin()`, coherente con el resto de catálogos del esquema (`aircraft_types`, `license_categories`, etc.) — no se necesitó ningún cambio de política en esta fase; solo se re-verificó con `get_advisors` (sección 20) que sigue siendo así y que no se introdujo ninguna regresión de seguridad.

---

## 17. Otros bugs encontrados y corregidos en esta sesión

Además del bug de caché (sección 4) y el de `useMemo` (sección 5) y el de estrechamiento de tipos (sección 8):

- **`scripts/lib/loadEnv.ts` resolvía mal la ruta de `.env`**: calculaba `path.join(__dirname, '..', '..', fileName)`, correcto solo si el script compilado quedara dentro de `scripts/` en el propio repo. Pero los tres scripts (`test:matching`, `validate:aircraft-ratings`, `backfill:aircraft-ratings`) compilan con `--outDir .tmp-<nombre>`, lo que añade un nivel extra de directorio (`lib` → `scripts` → `.tmp-<nombre>` → raíz del repo, tres niveles, no dos). El bug hacía que ambos scripts que sí necesitan `.env` (`validateAircraftTypeRatingsCatalog.ts`, `backfillLegacyAircraftRatings.ts`) fallaran con "Missing EXPO_PUBLIC_SUPABASE_URL..." incluso con el `.env` real presente. Corregido añadiendo el tercer `'..'`; verificado con `npm run validate:aircraft-ratings` pasando en verde tras el arreglo.

---

## 18. Garantía de fuente única — sin segunda copia del catálogo

Barrido completo (`grep`) tras terminar los cambios, confirmando ausencia de referencias a los símbolos eliminados en todo el árbol TypeScript:

- `AIRCRAFT_TYPE_RATING_CATALOG` (el array de 80) — 0 coincidencias.
- `findAircraftTypeRatingsForLegacyCode` — 0 coincidencias.
- El tipo literal `AircraftTypeRatingId` (distinto del campo `aircraftTypeRatingId`, verificado con límites de palabra) — 0 coincidencias.
- `getAircraftTypeRating(` (lookup global de un solo id, distinto de `getAircraftTypeRatingById`/`getAircraftTypeRatingsByIds`/`getAircraftTypeRatingLabel`) — 0 coincidencias.
- Todo import de `../constants/aircraftTypeRatings` en el árbol (22 archivos) usa exclusivamente los símbolos actuales (`AircraftRatingIndex`, `buildAircraftRatingIndex`, `areRatingsRelated`, `getAircraftTypeRatingLabel`, `ratingMatchesLegacyCode`, `mapAircraftTypeRatingRow`, `AircraftTypeRatingRow`, `filterAircraftTypeRatings`, `normalizeAircraftRatingSearchText`, `sortAircraftTypeRatings`).

Los tests (`scripts/testMatching.ts`) usan una fixture de **7** filas fabricadas a mano (`FIXTURES`), nunca el catálogo real de 80 — igual que `aircraftRatingBackfillPlan` en sus propios tests. El único lugar del repositorio que conoce las 80 filas reales es la propia tabla `aircraft_type_ratings` en Supabase.

---

## 19. Tests añadidos — `scripts/testMatching.ts`

Reescrito por completo. 32 casos, todos ejecutables sin conexión real (usan fixtures o fetchers falsos inyectados):

```
PASS — Matching — Case 1: exact category+rating match
PASS — Matching — Case 2: no false combination across categories
PASS — Matching — Case 3: same family, different engine => related + clarification
PASS — Matching — Case 4: technician can hold several distinct ratings under one license at once
PASS — Matching — Case 5: legacy broad requirement does not combine independent license/aircraft rows
PASS — Matching — Case 6: preferred requirement mismatch stays related, never excluded
PASS — Matching — Case 7: mandatory requirement mismatch is flagged but the profile still surfaces as related
PASS — Matching — Case 8: a pending catalog request id is never a resolvable rating
PASS — Matching — Case 9: no match from sharing only a manufacturer (Boeing 777 vs Boeing 787)
PASS — Matching — Case 10: a habilitation referencing a deactivated rating still matches exactly, and its label still resolves
PASS — Mapper — mapAircraftTypeRatingRow converts a Supabase snake_case row to the domain shape
PASS — Sort — sortAircraftTypeRatings orders by priority descending
PASS — Sort — ties on priority break by manufacturer, then family, then engine
PASS — Search — filterAircraftTypeRatings finds an alias match (A320neo)
PASS — Search — is case-insensitive and tolerates surrounding whitespace
PASS — Search — is a pure text filter; it does not exclude inactive rows on its own
PASS — Search — matches by commercial nickname (Dreamliner)
PASS — Cache — serves the cached result within the TTL without refetching
PASS — Cache — refetches once the TTL has expired
PASS — Cache — invalidate() forces the next call to refetch even within the TTL
PASS — Cache — a failed background refresh keeps serving the last good catalog
PASS — Cache — a failed fetch with no previous data rejects and leaves status 'error'
PASS — Cache — retrying after an error (with no previous data) can succeed
PASS — Cache — fetchActive resolving to zero rows is status 'success' with an empty array (the hook derives the UI "empty" state from this)
PASS — Cache — concurrent calls while a fetch is in flight share a single fetchActive request
PASS — Cache getRatingsByIds — includes inactive ratings so existing references still resolve
PASS — Cache getRatingsByIds — batches missing ids into a single fetchByIds call, never one request per id
PASS — Backfill plan — an unambiguous alias maps a legacy row to its rating
PASS — Backfill plan — an alias shared by two ratings is left ambiguous, never guessed
PASS — Backfill plan — a code with no matching alias is left untouched
PASS — Backfill plan — a mapping that would collide with an existing normalized row is avoided, not double-written
PASS — Backfill plan — summarizeBackfillPlan tallies every outcome across a mixed batch

32 passed, 0 failed
```

Mapeo con la matriz de ~22 puntos pedida: mapper de fila Supabase→dominio, orden por prioridad (+ desempate), búsqueda por alias/motor/nombre comercial, coincidencia exacta/parcial/sin coincidencia, catálogo vacío, error de carga, reintento, caché (fresca dentro de TTL, refetch tras expirar, invalidación manual, llamadas concurrentes deduplicadas), habilitación inactiva que sigue resolviendo (tanto en matching como en `getRatingsByIds`), `getRatingsByIds` sin N+1, backfill (mapeado/ambiguo/sin coincidencia/colisión evitada) y su resumen agregado — quedan todos cubiertos, varios con más de un test dedicado.

---

## 20. Resultado exacto de cada comando ejecutado

**`npm run ts`** — primera pasada: 1 error (`technicianRepositoryV2.ts:83`, sección 8). Corregido. Segunda pasada:
```
> tsc --noEmit
(sin salida — 0 errores)
```

**`node scripts/validateSeeds.js`**
```
=== SEED VALIDATION REPORT ===
... Habilitations: 46, OfferRequiredHabilitations: 3, CatalogRequests: 1, AircraftTypeCatalogCodes: 33
AircraftTypeRatingCatalog: validated against Supabase separately — run `npm run validate:aircraft-ratings`
Warnings: 0
Errors: 0
RESULT: PASS
```

**`npm run test:matching`** → `32 passed, 0 failed` (listado completo en sección 19).

**`npm run validate:aircraft-ratings`** — primera pasada: falló por el bug de rutas de `loadEnv.ts` (sección 17). Corregido. Segunda pasada:
```
=== AIRCRAFT TYPE RATINGS CATALOG VALIDATION ===
Total rows: 80
Active rows: 80
Base-80 ids present: 80/80
Warnings: 0
Errors: 0
RESULT: PASS
```

**`npm run backfill:aircraft-ratings -- --dry-run`** — compila sin errores; en tiempo de ejecución se detiene con el mensaje esperado `Missing SUPABASE_SERVICE_ROLE_KEY...` porque esta máquina no tiene esa clave configurada localmente (no se ha intentado obtenerla ni insertarla — es una clave de servidor sensible, fuera del alcance de lo que este asistente debe manejar). Esto confirma que la guarda de seguridad del script funciona correctamente (falla cerrado, con mensaje claro, sin intentar un camino alternativo inseguro). Ejecutar el dry-run real contra datos reales requiere que un operador con acceso al panel de Supabase añada `SUPABASE_SERVICE_ROLE_KEY` a su `.env` local.

**`npx expo export --platform web`**
```
Web Bundled 3085ms node_modules\expo-router\entry.js (2643 modules)
› Static routes (51): ... (todas las rutas existentes)
Exported: dist
```
Sin errores de bundling.

**Verificación SQL directa** (`mcp__supabase__execute_sql` contra `rwauwuremzkizeoginza`):
```json
[{"conname":"fk_technician_habilitations_license","convalidated":true},
 {"conname":"idx_technician_habilitations_rating exists: true","convalidated":null},
 {"conname":"aircraft_type_ratings total rows: 80","convalidated":null},
 {"conname":"aircraft_type_ratings active rows: 80","convalidated":null}]
```

**`mcp__supabase__get_advisors`** (seguridad + rendimiento, tras las migraciones `018`/`019`) — triage completo en la sección siguiente.

---

## 21. `get_advisors` — triage tras esta fase

**Seguridad**: un único hallazgo de nivel `ERROR` en todo el esquema — `security_definer_view` sobre `public.technician_public_view` — preexistente, de una fase muy anterior, sin relación con `aircraft_type_ratings`/`technician_habilitations`/`catalog_requests`/`offer_required_habilitations`. El resto son `WARN`/`INFO` de funciones `SECURITY DEFINER` ejecutables por `anon`/`authenticated`, mismo patrón schema-wide ya presente en ~30 funciones trigger, tampoco relacionado con esta fase. Ninguno de los hallazgos de seguridad menciona ninguna de las 4 tablas de esta fase.

**Rendimiento**:
- `unindexed_foreign_keys` en `technician_habilitations`: quedan **2** (`aircraft_type_code`, `license_code`), preexistentes y fuera de alcance (mismo patrón en otras 7 tablas del esquema). La FK de `aircraft_type_rating_id` que sí se corrigió con la migración `019` **ya no aparece** en esta lista — confirma que el arreglo funcionó.
- `unused_index`: 6 hallazgos `INFO` sobre índices nuevos de `aircraft_type_ratings`, `catalog_requests`, `offer_required_habilitations` y `technician_habilitations` (incluido el propio `idx_technician_habilitations_rating` de la migración `019`) — esperado e inofensivo: son índices recién creados en un proyecto de desarrollo sin tráfico real todavía; se "usarán" en cuanto haya lecturas reales. No es una regresión que arreglar.
- `multiple_permissive_policies`: aparece en las 4 tablas de esta fase, pero también en **otras 24 tablas** del esquema (28 en total, 291 hallazgos) — confirmado como convención preexistente y deliberada de todo el proyecto (política `_all_admin` de bypass + políticas específicas por rol en cada tabla), no algo introducido por esta fase ni por `016`/`017`/`018`/`019`.

**Conclusión**: ninguna regresión nueva atribuible a esta fase. La única regresión real de una fase anterior (FK sin índice) sigue confirmada como corregida por la migración `019`.

---

## 22. Archivos modificados o creados en esta fase

**Migraciones (nuevas, nunca se tocó `016`/`017`)**
- `supabase/migrations/018_validate_technician_habilitations_license_fk.sql`
- `supabase/migrations/019_technician_habilitations_rating_index.sql`

**Constantes / tipos**
- `src/constants/aircraftTypeRatings.ts` — reescrito (solo tipos + funciones puras)

**Caché y backfill (nuevos, puros, sin dependencia de React Native)**
- `src/repositories/v2/aircraftTypeRatingsCache.ts`
- `src/utils/aircraftRatingBackfillPlan.ts`

**Repositorio y hook**
- `src/repositories/v2/catalogRepository.ts` — reescrito
- `src/state/useAircraftTypeRatingsCatalog.ts` — nuevo

**Matching y adaptadores**
- `src/utils/offerMatchExplain.ts`, `src/utils/matchingV2.ts`, `src/utils/v2CompatAdapters.ts`
- `src/repositories/v2/technicianRepositoryV2.ts`

**Hooks de estado**
- `src/state/useTechnicianSearch.ts`, `useMapTechnicians.ts`, `useAdminDashboard.ts`, `useTechnicianDashboard.ts`, `useCompanyDashboard.ts`

**UI**
- `src/components/AircraftTypeRatingPicker.tsx` — reescrito
- `src/components/AdminTechnicianCard.tsx` — simplificado (quitada una recomputación redundante)
- `app/technician/profile.tsx`, `app/company/offers/new.tsx`, `app/company/offers/edit.tsx`, `app/company/offers/[id].tsx`
- `app/technician/offers/[id].tsx`, `app/technician/direct-offers/[id].tsx`, `app/technician/direct-offers/index.tsx`
- `app/company/direct-offers/[id].tsx`, `app/company/applications/[id].tsx`, `app/company/applications/index.tsx`, `app/company/search.tsx`
- `src/types/privacy.ts` — comentario corregido

**Scripts**
- `scripts/validateSeeds.js` — reescrito (ya no parsea el catálogo de 80)
- `scripts/validateAircraftTypeRatingsCatalog.ts` — nuevo
- `scripts/backfillLegacyAircraftRatings.ts` — nuevo
- `scripts/testMatching.ts` — reescrito
- `scripts/lib/loadEnv.ts` — nuevo (bug de rutas corregido en la misma sesión, sección 17)

**Configuración**
- `package.json` — scripts `validate:aircraft-ratings`, `backfill:aircraft-ratings`
- `.env.example` — sección nueva `SUPABASE_SERVICE_ROLE_KEY` (local/servidor únicamente)
- `.gitignore` — `.tmp-validate-aircraft-ratings/`, `.tmp-backfill-aircraft-ratings/`

**No tocados por esta fase** (heredados de la fase anterior, siguen vigentes tal cual): `src/types/catalog.ts`, `src/types/technician.ts`, `src/types/offer.ts`, `src/types/catalogRequest.ts`, `src/repositories/v2/catalogRequestRepository.ts`, `src/repositories/v2/supabaseMappers.ts`, `src/repositories/v2/offerRepository.ts`, `src/data/seeds/*.json`, `src/components/MatchExplanation.tsx`, `supabase/migrations/016...sql`, `017...sql`.

---

## 23. Riesgos o trabajo pendiente

- El dry-run real de `scripts/backfillLegacyAircraftRatings.ts` contra datos reales no se ha ejecutado en esta sesión porque `SUPABASE_SERVICE_ROLE_KEY` no está configurada localmente; solo se verificó que la guarda de seguridad rechaza correctamente sin ella (sección 20). Un operador con esa clave debe ejecutar `npm run backfill:aircraft-ratings -- --dry-run` y revisar el plan antes de considerar un `--apply`.
- `rotoaxismatch-dev` sigue sin datos reales de técnicos en `technician_habilitations` (heredado de la fase anterior) — el backfill y la validación de la FK son correctos pero triviales hasta que haya datos reales; ambos son seguros y re-ejecutables cuando los haya.
- No se ha podido verificar visualmente en navegador/móvil el nuevo comportamiento del picker (estados de carga/error/reintento, badge de "Inactive catalog entry") — este entorno no dispone de automatización de navegador. Se verificó `tsc`, bundling web, y el estado real de la base de datos, pero no la interacción manual. Ver pasos de QA en la sección 24.
- No existe panel de administración para aprobar `catalog_requests` ni para editar `aircraft_type_ratings` desde la UI — el proceso de 8 pasos de la sección 10 es manual vía SQL/Studio, tal como ya lo era en la fase anterior; sigue explícitamente fuera de alcance de esta fase.

---

## 24. Pasos exactos para verificar manualmente el flujo

1. `npm run web` (o `expo start --web`), iniciar sesión como técnico de demo.
2. Ir a `/technician/profile` → sección "Habilitations" → abrir el selector y confirmar que aparece un `ActivityIndicator` brevemente y luego la lista (o, si se simula un fallo de red desconectando momentáneamente, que aparece el mensaje de error con botón "Reintentar" y que pulsarlo recupera la lista).
3. Buscar `A320neo`, `LEAP`, `Dreamliner` y confirmar resultados razonables ordenados por prioridad.
4. Guardar una habilitación, recargar la página y confirmar que persiste y muestra su nombre legible.
5. (Requiere acceso a Supabase Studio) Desactivar (`is_active = false`) una habilitación que un técnico de seed ya tenga asignada, recargar su perfil, y confirmar: (a) sigue mostrando el nombre real, no un UUID; (b) aparece el indicador "Inactive catalog entry"; (c) esa misma habilitación ya no aparece en los resultados de búsqueda del picker al intentar añadir una **nueva**.
6. Insertar manualmente una fila nueva en `aircraft_type_ratings` (proceso de la sección 10), invalidar la caché (recargar la pestaña basta) y confirmar que aparece en el picker sin ningún cambio de código ni redeploy.
7. Como empresa, en `/company/offers/new` o `/company/offers/edit`, repetir la búsqueda y confirmar que el formulario de requisitos exactos sigue funcionando igual.
8. Confirmar que ninguna de estas acciones oculta nunca a un técnico de una lista ni le impide aplicar — solo cambia la explicación/etiqueta mostrada.

---

## Resumen — checklist de criterios de aceptación

| # | Criterio | Estado |
|---|---|---|
| 1 | Supabase es la única fuente de verdad del catálogo | ✅ `catalogRepository` consulta `aircraft_type_ratings` en vivo |
| 2 | No queda el array de 80 en TypeScript | ✅ verificado por grep, sección 18 |
| 3 | El picker carga desde Supabase | ✅ vía hook + repositorio + caché |
| 4 | El matching no depende de un catálogo hardcodeado | ✅ `ratingIndex` inyectado explícitamente |
| 5 | La búsqueda funciona sobre los datos cargados | ✅ `filterAircraftTypeRatings` pura, en memoria |
| 6 | Habilitaciones nuevas aparecen sin nuevo deploy | ✅ TTL/invalidate/retry — sección 10 |
| 7 | Habilitaciones inactivas existentes se siguen mostrando | ✅ `getAircraftTypeRatingsByIds` sin filtro |
| 8 | Inactivas no seleccionables para relaciones nuevas | ✅ `getAircraftTypeRatings()` filtra `is_active=true` |
| 9 | Caché funciona y es invalidable | ✅ TTL + `invalidate()` + tests |
| 10 | FK validada | ✅ migración `018`, `convalidated: true` reconfirmado |
| 11 | Backfill legacy con script explícito | ✅ `backfillLegacyAircraftRatings.ts`, dry-run/apply |
| 12 | Tests pasan | ✅ 32/32 |
| 13 | TypeScript compila | ✅ `npm run ts` sin errores |
| 14 | El export web funciona | ✅ 51 rutas, sin errores |
| 15 | RLS sigue siendo segura | ✅ sin cambios necesarios, confirmado con advisors |
| 16 | Advisors sin regresiones nuevas | ✅ triage completo, sección 21 |
| 17 | QA manual documentado | ✅ sección 24 |
| 18 | Sin segunda copia completa del catálogo en TypeScript | ✅ solo tipos/funciones puras + fixtures pequeñas en tests |
