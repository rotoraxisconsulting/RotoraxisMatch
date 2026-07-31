# Fase 5.1 — Inventario (CHECKPOINT, nada tocado)

**Fecha:** 2026-07-26. **Rama:** part66-phase5 (aún no creada — se crea al cerrar
este checkpoint). **Alcance:** solo lectura — cero migraciones, cero borrados,
cero cambios de código. Todo lo de abajo está verificado contra
`rotoaxismatch-dev` en vivo o contra grep del código actual, no asumido desde
el mission doc.

**Hallazgo que reordena el resto del documento**: varios elementos que el plan
de misión daba por "legacy V1 seguro de borrar" resultaron ser, al comprobarlo,
funcionalidad V2 ACTIVA y con carga real, mal etiquetada `@deprecated`. Están
marcados **⚠ REQUIERE DECISIÓN** según aparecen. No son un bloqueo del resto
del inventario, pero sí deberían decidirse antes de que 5.2/5.3 toquen nada
relacionado.

---

## a. Habilitaciones legacy (aircraftTypeCode sin aircraftTypeRatingId)

**Resultado: no hay nada que migrar.**

```
technician_habilitations — total_rows: 5
  con aircraft_type_rating_id: 5 (100%)
  con aircraft_type_code:      2
  con AMBOS:                   2
  solo-código (rating_id NULL): 0
```

Las 5 filas que existen hoy en `rotoaxismatch-dev` YA tienen
`aircraft_type_rating_id` poblado. Las 2 que además llevan un
`aircraft_type_code` legacy (`B407`, `B412`) son residuo histórico de la
cuenta **ya borrada** `6146de18-...` (anonymous_code `TF0E8866C8`, el caso del
"Bug prioritario" de la Fase 3b) — no bloquean nada, el matching ya lee
`aircraft_type_rating_id`.

**Necesita resolución vía `resolveLegacyCodeToFamilyKeys()`: cero filas.**
`needsReview`: lista vacía.

⚠ **Caveat, no descartar**: esto es cierto SOLO para `rotoaxismatch-dev`, que
tiene datos de desarrollo mínimos. La migración 027 (paso 5.2) debe seguir
escribiéndose para manejar el caso general (una base con más historial real
podría tener filas solo-código) — este resultado dice "hoy no hay trabajo que
hacer aquí", no "el código de migración es innecesario".

### ⛔ CORRECCIÓN (2026-07-28) — el "hallazgo lateral" de abajo era FALSO

Buscando la causa del fallo de la sección (d) encontré que **este hallazgo
lateral también es incorrecto, por la misma razón**, y que ya tiene
consecuencia aplicada en producción.

El índice único parcial que este apartado pedía "valorar añadir" **ya existía
desde la migración 016** (`016_part66_ratings_habilitations.sql:213`):

```sql
CREATE UNIQUE INDEX uq_technician_habilitations_rating
  ON technician_habilitations (technician_id, license_code, aircraft_type_rating_id)
  WHERE aircraft_type_rating_id IS NOT NULL;
```

La migración 027, escrita sobre este inventario, creó
`uq_technician_habilitations_normalized` con **columnas y predicado idénticos**
(`027_...sql:86`). Verificado en `pg_indexes`: los dos índices existen hoy en
`rotoaxismatch-dev`, duplicados byte a byte. No es un bug de datos (la
unicidad se aplica igual), pero es doble coste de escritura y una fuente futura
de confusión. Lo retira la 028.

**Por qué falló**: la verificación consultó `pg_constraint`, y un índice creado
con `CREATE UNIQUE INDEX` **no aparece nunca en `pg_constraint`** — solo en
`pg_indexes`/`pg_index`. La consulta no devolvió el índice de la 016, y la
ausencia se leyó como inexistencia. Mismo patrón que la sección (d): un
catálogo, una dirección, resultado tomado como completo.

Texto original, conservado como estaba (su premisa "nada a nivel de BD lo
impide" es la parte falsa):

> **Hallazgo lateral (severidad baja, no bloquea nada)**: la única constraint
`UNIQUE` de `technician_habilitations`
(`technician_habilitations_technician_id_license_code_aircraf_key`) cubre
`(technician_id, license_code, aircraft_type_code)` — nunca incluye
`aircraft_type_rating_id`. Postgres no aplica unicidad sobre NULLs, así que en
teoría nada a nivel de BD impide dos filas normalizadas duplicadas
`(technician_id, license_code, aircraftTypeRatingId)` idénticas. En la
práctica, `HabilitationsEditor.tsx:111` ya bloquea el duplicado del lado
cliente (`value.some(h => h.licenseCode === ... && h.aircraftTypeRatingId ===
...)`), igual que `TypeRatingRequirementsEditor.tsx` hace para ofertas — así
que no es un bug activo, solo un hueco de defensa-en-profundidad. Anotado para
que la migración 027 (o una futura) valore añadir un índice único parcial
`WHERE aircraft_type_rating_id IS NOT NULL`.

---

## b. Ofertas con requiredLicenses/requiredAircraftTypes

**Importante — esto NO es "legacy a eliminar", es el filtro aproximado que la
Fase 3b diseñó y mantuvo deliberadamente.** No confundir con el ítem c/f de
abajo (eso sí es debate real). El plan original de Fase 5 solo pide eliminar
la **rama de matching legacy** que las trata como si fueran tan buenas como un
match exacto (`offerMatchExplain.ts` T3), no las tablas ni la UI.

```
offer_required_licenses:        5 filas, 2 ofertas
offer_required_aircraft_types:   3 filas, 1 oferta — YA son family keys
                                 (p.ej. "Airbus Helicopters::Eurocopter AS 350"),
                                 confirmado migración 022 completa, cero
                                 códigos legacy de aircraft_types(code) restantes
offer_required_habilitations:   2 filas, 2 ofertas (requisito exacto)
total offers:                   7
```

**Quién escribe hoy** (grep confirmado, único camino):
`app/company/offers/new.tsx` / `edit.tsx` → `ApproximateFilterSection.tsx` +
`TypeRatingRequirementsEditor.tsx` → `offerRepository.replaceRequirements()`
(`src/repositories/v2/offerRepository.ts`). Nadie más escribe estas tablas.

**Quién lee** (display, no escritura): `app/company/offers/[id].tsx`,
`index.tsx`; `app/technician/offers/[id].tsx`, `index.tsx`,
`direct-offers/[id].tsx`; `app/admin/offers.tsx`; matching
(`offerMatchExplain.ts` — la rama que SÍ se retoca en 5.3, ver abajo).

**Para 5.3**: la única eliminación real de este ítem es la rama de
`evaluateLegacyBroadMatch` en `offerMatchExplain.ts` que hoy trata
`requiredLicenses`/`requiredAircraftTypes` — el plan ya dice que T3 queda solo
para habilitaciones `needsReview`, etiquetado. La UI (`ApproximateFilterSection`)
y las tablas se QUEDAN — son producto, no deuda.

---

## c. Tipos `@deprecated` — usos reales ⚠ REQUIERE DECISIÓN

El plan de misión los listaba como una línea más de limpieza junto a "seeds
huérfanos" y "docs obsoletos". El grep real dice que dos de ellos NO son una
línea de limpieza — son la base de gran parte de la UI viva.

### c.1 — Genuinamente muertos (cero consumidores reales, seguros de borrar)

| Símbolo | Definido en | Consumidores reales |
|---|---|---|
| `ContractType` (V1, distinto de `ContractTypeCode`) | `types/technician.ts` | Ninguno fuera de su propia definición + barrel `types/index.ts` |
| `LEGACY_CONTRACT_TYPES` | `constants/contractTypes.ts` | Ninguno |
| `AIRCRAFT_TYPES` / `AircraftType` (dentro del ya-legacy `aircraftTypes.ts`) | `constants/aircraftTypes.ts` | Solo `TechnicianFilters.tsx` (ya muerto, ver d) |
| `technicianRepositoryV2.updateAircraftTypes()` | ya lanza excepción siempre | Solo desde `useTechnicianDashboard.updateProfile()` (muerto, ver abajo) |

### c.2 — Uso real pero acotado (admin only, migración pequeña)

`LegacyVerificationStatus` + `mapLegacyVerificationStatusToV2()` —
`app/admin/companies.tsx`, `app/admin/technicians.tsx`,
`AdminCompanyCard.tsx`, `AdminTechnicianCard.tsx`. Guard defensivo sobre datos
antiguos persistidos; 4 archivos, cambio contenido.

### c.3 — ⚠ Uso real y extenso — NO es limpieza mecánica

**`Technician` (V1)** — consumidores reales (excluyendo el propio archivo y el
adaptador intencional `v2CompatAdapters.ts`):
- `app/technician/profile.tsx` — **la pantalla de perfil del técnico entera**
  usa `Technician` como tipo del form state (`useState<Technician | null>`,
  `updateField<K extends keyof Technician>`, etc.) — la pantalla más grande y
  más tocada de toda la Fase 3/3b.
- `app/admin/documents.tsx`, `app/admin/technicians.tsx` — tipos de parámetro/retorno.
- `src/state/useAdminDashboard.ts`, `src/state/useTechnicianDashboard.ts` —
  shape de estado del hook (consumido por `app/technician/index.tsx` y
  `app/technician/documents.tsx`).
- `src/utils/matching.ts` — **este SÍ es código muerto ya confirmado** (0
  call sites reales, solo `TechnicianCard.tsx`, también muerto, lo importaba)
  — no cuenta para la decisión.

**`SafeTechnicianView` (V1)** — consumidores reales, aún más extensos:
`app/company/search.tsx`, `TechnicianMap.native.tsx`,
`TechnicianMapLeafletImpl.tsx` (las DOS implementaciones del mapa),
`MatchRequestCard.tsx`, `RequestContactModal.tsx`, `useCompanyDashboard.ts`,
`useMapTechnicians.ts`, `useTechnicianSearch.ts`. Es literalmente el tipo que
usa toda la UI de "empresa busca/ve técnicos" hoy.

**`MatchRequest`/`MatchRequestStatus` (V1)** — mismo patrón: dashboards de
técnico/empresa/admin, `AdminRequestCard.tsx`, `IncomingRequestCard.tsx`,
`MatchRequestCard.tsx`.

**Por qué siguen vivos**: `v2CompatAdapters.ts` (`v2TechnicianToV1`,
`v2SafePreviewToSafeView`, `v2UnlockedViewToSafeView`, `v2OfferRequestToMatchRequest`)
es un adaptador PUENTE deliberado (memoria "V2-1d complete") — los hooks V2
convierten internamente al shape V1 para que las pantallas, escritas contra
V1, sigan funcionando sin reescribirse. El puente cumplió su función durante
toda la migración V1→V2, pero nunca se completó el otro lado (reescribir las
pantallas a los tipos V2 nativos: `SafeTechnicianPreview`/`UnlockedTechnicianView`,
`OfferRequest`/`OfferApplication`).

**Decisión que hace falta**: "eliminar tipos `@deprecated`" tal como lo dice
el plan original NO es una tarea de Fase 5 de tamaño acorde al resto —
implica reescribir `app/technician/profile.tsx` completo, las dos
implementaciones del mapa, la pantalla de búsqueda de empresa, y 4 hooks de
estado. Propongo NO intentarlo dentro de esta Fase 5 (que ya es la fase
terminal de ESTA misión, centrada en Part-66/catálogo) y en su lugar:
marcarlo como **misión aparte, post-Fase-5** ("V2 UI migration — retire
v2CompatAdapters"), documentada como deuda conocida, no como sorpresa. Si
prefieres intentarlo de todos modos dentro de esta fase, dímelo y lo
replanifico como una 5.3-bis con su propio checkpoint pantalla a pantalla
(mismo patrón que la 3b).

---

## d. `aircraft_types` (tabla, 33 filas) y `constants/aircraftTypes.ts`

Confirmado, sin cambios desde el cierre de la 3b — exactamente 3 consumidores
reales:
1. `src/components/technician/HabilitationsEditor.tsx` — solo para poner
   label a filas legacy (`aircraftTypeCode` sin `aircraftTypeRatingId`) — y
   el ítem (a) confirma que hoy esas filas son 0 en `rotoaxismatch-dev`, pero
   el código debe seguir soportando el caso (podría haberlas en otro entorno).
2. `src/components/TechnicianFilters.tsx` — **muerto**, cero call sites
   (confirmado de nuevo).
3. `app/technician/offers/index.tsx` — filtro de categoría amplia
   Airplane/Helicopter vía `inferAircraftCategory()`. Ya reclasificado como
   MIGRACIÓN pendiente (no solo "consumidor a revisar") en el cierre de la
   Fase 3b — su filtro debe pasar a leer `productType` del catálogo real
   cuando se borre `aircraftTypes.ts`. Este es el ítem 1 de la sub-fase 5.3
   del plan.

### ⛔ CORRECCIÓN (2026-07-28) — este apartado decía UNA FK y son DOS

**El texto original de esta sección era incorrecto y la migración 028 escrita
sobre él habría fallado al ejecutarse.** Lo detectó una revisión externa
(Codex/ChatGPT) y lo verifiqué yo contra `rotoaxismatch-dev` en vivo. Texto
original, tachado, conservado para que se vea el error:

> ~~`aircraft_types` la tabla: FK viva desde
> `technician_habilitations.aircraft_type_code`
> (`technician_habilitations_aircraft_type_code_fkey`) — confirmado en
> `pg_constraint`. Es el ÚNICO motivo por el que la tabla no se puede borrar
> todavía.~~

**Lo real.** Consulta ejecutada (`confrelid`, no `conrelid` — ver "por qué
falló" abajo):

```sql
SELECT c.conname, con_rel.relname AS table_name, pg_get_constraintdef(c.oid)
FROM pg_constraint c
JOIN pg_class con_rel ON con_rel.oid = c.conrelid
WHERE c.confrelid = 'public.aircraft_types'::regclass;
```

```
technician_habilitations_aircraft_type_code_fkey
  → technician_habilitations.aircraft_type_code       FK aircraft_types(code)
technician_aircraft_experience_aircraft_type_code_fkey
  → technician_aircraft_experience.aircraft_type_code FK aircraft_types(code)
```

**Son DOS referencias entrantes, no una.** `technician_aircraft_experience`
tiene **0 filas** (verificado), así que retirar su FK es igual de seguro que la
otra — pero tenía que estar contemplado, y no lo estaba.

Barrido completo de dependencias entrantes sobre `aircraft_types`, ya con la
dirección correcta (para no repetir el fallo): vistas vía `pg_depend`/`pg_rewrite`
→ **0**; funciones con el nombre en `prosrc` → **0**; triggers → **0**. Las dos
FKs de arriba son la lista completa.

**Por qué falló el inventario original.** Ver el apartado de método al final de
este documento ("Post-mortem"). Resumen: la consulta original enumeró las
constraints *de las tablas que estaba estudiando* (`conrelid`), que responde
"¿a qué apunta esta tabla?", cuando la pregunta que importaba para un DROP era
la inversa, "¿quién apunta a `aircraft_types`?" (`confrelid`).

**Estado real de la tabla.** Con las dos FKs retiradas, `aircraft_types` queda
huérfana a nivel de BD y sin lectores en `src/` (los 3 consumidores de
`constants/aircraftTypes.ts` de arriba son de la copia TS, no de la tabla). El
`DROP TABLE` en sí NO va en la 028 — ver la cabecera de
`supabase/migrations/028_retire_aircraft_types_fks.sql` para el porqué del
troceado.

---

## d-bis. `technician_aircraft_experience` — inventario y propuesta

Añadido 2026-07-28 a raíz de la corrección de (d): la tabla no estaba
inventariada por sí misma, solo apareció como el segundo extremo de la FK que
faltaba. Todo lo de abajo verificado en vivo o por grep, nada asumido.

**Qué es en BD.** `id, technician_id, aircraft_type_code (FK → aircraft_types,
NOT NULL), value double precision NOT NULL, unit enum NOT NULL, created_at`.
UNIQUE `(technician_id, aircraft_type_code)`, índice por `technician_id`, RLS
completa: `tae_select_own`, `tae_select_company`, `tae_insert_own`,
`tae_delete_own`, `tae_all_admin` (001) **+ `tae_update_own`, que no existió
hasta la 025** (2026-07-24) — es decir, durante toda su vida hasta hace 4 días
una fila, una vez insertada, no se podía editar.

**Filas: 0.** Cero desde siempre, en todos los perfiles.

**Consumidores — el dato que importa: se LEE en 4 sitios y no se ESCRIBE en
ninguno.** Grep exhaustivo sobre `app/`, `src/`, `scripts/`:

| Sitio | Qué hace |
|---|---|
| `src/repositories/v2/supabaseMappers.ts:254` | la carga en **cada** `TechnicianWithRelations` (todo el producto pasa por aquí) |
| `app/technician/profile.tsx:251-254,311-321` | deriva el `yearsExperience` que se muestra en el perfil |
| `src/utils/offerMatchExplain.ts:542-545` | **componente `experience` del match score** |
| `src/utils/v2CompatAdapters.ts:126,185,236` | `computeYearsExperience()` → el `yearsExperience` que ven las empresas en búsqueda/mapa/tarjetas |
| `src/repositories/v2/technicianRepositoryV2.ts:194` | `getAircraftExperience()` — **0 call sites**, muerto |

Cero `INSERT`/`UPSERT`/`UPDATE` en todo el repo. No hay pantalla, formulario ni
script que permita a un técnico declarar experiencia por tipo de aeronave.

**Consecuencias reales de que esté vacía (no teóricas):**

1. `totalYears` en `offerMatchExplain` es **siempre 0**. El componente
   `experience` del score (10 pts con requisitos, 15 sin ellos) solo se otorga
   cuando la oferta pide `minYearsExperience === 0`. Cualquier oferta que pida
   1 año o más deja esos puntos permanentemente inalcanzables **para todos los
   técnicos por igual** — no falsea el ranking relativo, pero comprime la
   escala y hace que el filtro de experiencia de la empresa no discrimine nada.
2. `yearsExperience` mostrado a las empresas es **siempre 0**.
3. La línea `if (t.yearsExperience > 0) score += 10` de
   `profile.tsx:93` (completitud de perfil) es inalcanzable: 10 puntos que
   ningún técnico puede conseguir, sin ninguna UI que le diga cómo.
4. Fase 4 ya documentó su límite estructural (`offerMatchExplain.ts:353-355`,
   test `Case 5d` en `scripts/testMatching.ts:368`): tiene `aircraftTypeCode`
   pero **ningún vínculo a `aircraft_type_ratings`**, así que por diseño no
   puede satisfacer un requisito de familia. Es del modelo pre-Part-66.

**Diagnóstico: sí, es una feature a medio construir** — mitad de lectura
construida (con peso en el scoring), mitad de escritura nunca construida,
sobre el modelo de datos anterior a Part-66. Y sí tiene consumidores, al
contrario de lo que sugiere "0 filas": por eso NO es un `DROP TABLE` mecánico.

**Propuesta — 3 opciones, no borro nada:**

- **(A) Retirarla entera, y con ella el componente `experience` del score.**
  Requiere código antes que SQL: quitar las 4 lecturas, redistribuir los 10/15
  pts del peso `experience` entre los otros componentes (o reducir el máximo),
  y decidir qué pasa con `minYearsExperience` en el formulario de oferta —
  la empresa seguiría pidiendo años que nada mide. Es la más limpia y la que
  menos deuda deja, pero toca el scoring, que es producto.
- **(B) Reconstruirla sobre Part-66**: sustituir `aircraft_type_code` por
  `aircraft_type_rating_id` y darle UI de escritura. Ojo: `technician_habilitations`
  **ya tiene `experience_years`** por habilitación (016) — es decir, esta tabla
  sería en gran parte redundante con lo que ya existe. La opción real aquí es
  más bien *"borrarla y alimentar el score desde `habilitations.experience_years`"*.
- **(C) Dejarla congelada** y documentarla como inerte. Es el estado de hoy;
  cuesta 0 pero mantiene vivos los 4 puntos muertos de arriba.

**Mi recomendación: (A), pero en su propia sub-fase con checkpoint, no dentro
de la 028** — cambia el scoring, y el scoring es la única cosa de esta misión
que el CLAUDE.md marca como principio de negocio. La 028 solo le retira la FK
(reversible, no prejuzga nada); la tabla y sus 0 filas quedan intactas
esperando tu decisión entre A/B/C.

---

## e. `src/data/seeds/` huérfanos

Confirmado exactamente como dice CLAUDE.md: **único consumidor real,
`scripts/validateSeeds.js`**. `scripts/validateAircraftTypeRatingsCatalog.ts`
solo lo MENCIONA en un comentario, no lo importa. Ningún script de
`package.json` invoca `validateSeeds.js` — no está en ningún flujo
automatizado (ni CI, no hay ninguno configurado en el repo fuera de
node_modules de dependencias). 19 ficheros JSON en `src/data/seeds/`, cero
lectores desde `app/`/`src/` (confirmado, CLAUDE.md ya lo documentaba
correctamente).

---

## f. Availability legacy (`status` vs `immediately`) ⚠ REQUIERE DECISIÓN

### ⛔ CORRECCIÓN (2026-07-29) — la dirección estaba AL REVÉS, y encima había un bug

**Todo el apartado de abajo describe la derivación en el sentido contrario al
real.** Lo detectó la auditoría de cierre (hallazgos B1/I2 de
`docs/FINAL_AUDIT_REPORT.md`) y se comprobó contra los datos, no contra el
código:

```sql
SELECT anonymous_code, (availability ? 'status') AS tiene_status
FROM technician_profiles;
-- tiene_status = false en las 7 filas
```

**`status` NUNCA se persistió.** Lo guardado siempre fue `immediately` (+ el
difunto `available_from`); `status` se derivaba EN MEMORIA al leer, en
`v2CompatAdapters.deriveAvailabilityStatus()`. Es decir: `immediately` era la
fuente de verdad y `status` la proyección, exactamente lo contrario de lo que
dice el texto conservado abajo.

**Y no era sólo una etiqueta mal puesta.** El formulario del técnico guardaba
`immediately = (status === 'available')`, así que elegir **"Open to offers" sin
fecha** se escribía como `immediately=false, available_from=null` y al recargar
se volvía a derivar como **"Unavailable"**. El técnico veía un estado que no
había elegido. Y como ninguna fila tenía fecha, el filtro "Open to offers" del
lado empresa **no casaba con nadie jamás**.

**Resuelto (2026-07-29, migración 041)**: la disponibilidad pasa a DOS estados
sin fecha, `immediately` ES el modelo y `status` es sólo su etiqueta de UI, 1:1
y **sin pérdida** en ambos sentidos. Con eso, la pregunta que este apartado
planteaba —"¿colapsamos a 2 estados perdiendo la distinción?"— queda respondida:
la distinción que se temía perder **no existía en los datos**.

Texto original conservado, con su premisa invertida:

**Mismo patrón que (c): `AvailabilityStatus`/`.availability.status` está
marcado `@deprecated` ("V2 usa `immediately: boolean`") pero es la ÚNICA forma
de expresar el filtro de 3 estados que la Fase 3b usa hoy en producción.**

`v2CompatAdapters.ts` (la conversión real, líneas 288-294) deriva
`immediately` a partir de `status`:
```
status === 'available'      → immediately = true
status === 'open_to_offers' → immediately = false
status === 'unavailable'    → immediately = false
```
Es una proyección CON PÉRDIDA, de un solo sentido: `open_to_offers` y
`unavailable` colapsan al mismo `false`. No hay forma de reconstruir `status`
a partir de `immediately` — por tanto `immediately` no es un reemplazo de
`status`, es una simplificación derivada para UN uso concreto (el filtro
"disponible ahora mismo").

**Consumidores reales de `.status`** (no del `.immediately` derivado):
`app/company/search.tsx` (badge + etiqueta), `app/company/offers/[id].tsx`
(badge), `app/technician/profile.tsx` (el FORMULARIO de disponibilidad
entero — guarda/lee `status`), `TechnicianMap.native.tsx` +
`TechnicianMapLeafletImpl.tsx` (color/etiqueta del pin),
`technicianRepositoryV2.search()` (`availabilityStatuses` filter, usado por
`useMapTechnicians.ts` y `useTechnicianSearch.ts` — es decir, el filtro de
disponibilidad de búsqueda Y mapa de la Fase 3b).

**Decisión que hace falta**: borrar `AvailabilityStatus`/`.status` tal como
sugiere la etiqueta `@deprecated` requeriría antes rediseñar el filtro de
disponibilidad para que funcione solo con un booleano — perdiendo la
distinción "open to offers" vs "unavailable" en el filtro, un cambio de
producto real, no una limpieza de tipos. Mismo tratamiento que propongo para
(c): NO tocarlo en esta Fase 5, marcarlo como deuda conocida documentada, o —
si prefieres resolverlo aquí — decidir primero si el filtro de 3 estados se
queda (y entonces `AvailabilityStatus` deja de estar mal etiquetado como
`@deprecated`, se re-etiqueta como campo V2 legítimo) o se colapsa a 2 estados
a propósito (con tu OK explícito, porque es una regresión de producto
visible).

---

## g. Blindaje T | null — inventario de consumidores de SessionContext

Recuperado y verificado de nuevo hoy (no ha cambiado desde el fix del mapa,
salvo que `app/map.tsx` ahora es `app/company/map.tsx`):

**28 consumidores totales** de `useCompanySession()`/`useTechnicianSession()`/`useSession()`/`useAdminSession()`.

**Ya seguros hoy** (protegidos por el gate de `sessionLoading` en
`CompanyLayout`/`TechnicianLayout`, o por guard propio ya existente): los 8
de siempre — `company/index.tsx`, `technician/index.tsx`, `admin/index.tsx`,
`company/offers/index.tsx`, `company/offers/[id].tsx`,
`company/map.tsx`+`useMapTechnicians.ts`, `company/direct-offers/index.tsx`,
`CompanyTeamManagement.tsx`.

**Los ~18 que necesitarán un guard explícito para volver a compilar** el día
que `useCompanySession()`/`useTechnicianSession()` devuelvan `T | null`
(ninguno está roto hoy — el gate de layout ya los protege en runtime; esto es
puramente para que el blindaje de tipos no rompa el build):

Lado empresa: `applications/index.tsx`, `applications/[id].tsx`,
`chats/index.tsx`, `chats/[id].tsx`, `direct-offers/[id].tsx`, `profile.tsx`,
`search.tsx`, `offers/new.tsx` (riesgo bajo, solo en submit),
`useCompanyDashboard.ts`.

Lado técnico: `applications/index.tsx`, `chats/index.tsx`, `chats/[id].tsx`,
`direct-offers/index.tsx`, `direct-offers/[id].tsx`, `offers/index.tsx`,
`offers/[id].tsx`, `documents.tsx` (vía `useTechnicianDashboard.ts`),
`useTechnicianDashboard.ts`.

Migración mecánica (añadir un guard `if (!session) return ...` tras
desestructurar), sin lógica de negocio nueva — pero 18 archivos, no un
cambio pequeño. Ver tarea ya anotada en `docs/MISSION_PART66.md` Fase 5
punto 5.

---

## h. Docs obsoletos → candidatos a `docs/archive/`

**Nunca borrar, solo mover.** Categorizado por lectura del propio contenido,
no solo del nombre.

**Vivos, se quedan donde están** (canónicos per CLAUDE.md, o referencia
operativa activa): `PRODUCT_CONTEXT_V2.md`, `DATA_MODEL_V2.md`,
`USER_FLOWS_V2.md`, `SUPABASE_PLAN_V2.md`, `IMPLEMENTATION_PHASES_V2.md`,
`HANDOFF_SUMMARY.md`, `TYPESCRIPT_TYPES_V2.md`, `SUPABASE_SCHEMA_V2.sql`,
`RLS_PLAN_V2.md`, `MIGRATION_FROM_DEMO_TO_V2.md`, `ENVIRONMENT.md`,
`MISSION_PART66.md`. `V2_S1_ADMIN_BOOTSTRAP_SQL.sql` — no es histórico, es el
procedimiento para bootstrapear un admin en un entorno nuevo; propongo
mantenerlo como referencia operativa, no archivar.

**Candidatos a archivar** (informes de punto-en-el-tiempo, ya reflejados en
el estado actual del código/mission doc — **40 archivos**, corregido
2026-07-27: el conteo manual original decía 33, recontado por exclusión
antes de mover nada; ver `docs/MISSION_PART66.md` "Decisiones del
checkpoint 5.1" para la nota completa):
`AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md`,
`AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md`, `DOCS_CLEANUP_REPORT.md`,
`EASA_FULL_CATALOG_RECONCILIATION_REPORT.md`,
`MIGRATION_023_FAMILY_NORMALIZATION_REPORT.md`, `MVP_ARCHITECTURE_HANDOFF.md`
(2026-05-27, "Local demo complete" — superado hace mucho por el propio
Supabase real), `MVP_DECISIONS_ALIGNMENT_REPORT.md`,
`MVP_SIMPLICITY_AUDIT_REPORT.md`, `PART66_AIRCRAFT_MODEL_ANALYSIS.md`,
`PART66_PHASE1_IMPLEMENTATION_REPORT.md`, `PRE_SUPABASE_CODE_AUDIT_REPORT.md`,
`V2_10_ACTIVITY_BADGES_REPORT.md`, `V2_10_ALERT_WEB_FIX_REPORT.md`,
`V2_10_PREFLIGHT_FIXES_REPORT.md`, `V2_11_UI_UX_POLISH_REPORT.md`,
`V2_12_COMPANY_UI_POLISH_REPORT.md`, `V2_13_ADMIN_UI_POLISH_REPORT.md`,
`V2_2_QA_REPORT.md` … `V2_9_QA_REPORT.md` (8 ficheros),
`V2_AIRCRAFT_CATEGORY_UX_REPORT.md`, `V2_LEGACY_CLEANUP_REPORT.md`,
`V2_LOCAL_QA_REPORT.md`, `V2_S0B_H1`…`H11_*_REPORT.md` (9 ficheros — **valor
real como precedente**: `H6` fue exactamente cómo se detectó que el bug de
`offerApplicationRepository` de esta sesión era una regresión, no un bug
nuevo — archivar sí, pero mantenerlos grepables, nunca perderlos),
`V2_S0C_FINAL_PRE_SUPABASE_AUDIT_REPORT.md`,
`V2_S0_SERVER_OWNED_FIELDS_REPORT.md`, `V2_S0_UUID_SEED_STRATEGY_REPORT.md`.

**Necesita corrección de contenido antes de archivar** (no solo mover):
`OFFER_DELETE_SOFT_DELETE_PROPOSAL.md` — su propia cabecera dice "migración
026 NOT yet applied, awaiting explicit go-ahead" — ESO YA NO ES CIERTO, 026
se aplicó y verificó el 2026-07-24. Actualizar el status antes de archivar,
para no dejar un documento archivado con una afirmación falsa.

**Se queda activo, NO archivar** (propuesta real todavía sin resolver):
`DELETED_ACCOUNT_ANONYMIZATION_PROPOSAL.md` — el propio mission doc ya lo
marca como pendiente, "a retomar aparte".

**Reciente, tu criterio**: `RLS_OPERATION_AUDIT_2026-07-23_REPORT.md` — es de
esta misma sesión de hardening; técnicamente ya "resuelto" (025/026
aplicadas), pero es tan reciente que igual prefieres dejarlo visible un poco
más. Sin urgencia por ninguno de los dos lados.

---

## Post-mortem de método (2026-07-28) — por qué este inventario falló dos veces

Dos errores, misma causa. Merece la pena escribirlo porque el sesgo es
reutilizable y volvería a aparecer en la 5.4/5.5.

**Los dos fallos:**
1. (d) FK a `aircraft_types`: se listó 1, había 2.
2. (a) índice único: se dijo "no existe", existía desde la 016 — y la 027 lo
   duplicó en producción por creerlo.

**La causa común no es "se me olvidó mirar".** Las dos verificaciones SÍ
consultaron el catálogo de Postgres. El fallo es que cada una eligió **un
catálogo y una dirección**, y trató un resultado vacío/corto como respuesta
completa:

- En (d), la consulta enumeró constraints por `conrelid` — las constraints
  *que salen de* las tablas bajo estudio (`technician_habilitations`,
  `offer_required_aircraft_types`), que eran las tablas en las que yo ya estaba
  pensando. Eso responde "¿a qué apunta esta tabla?". La pregunta de un DROP es
  la contraria: "¿quién apunta a la tabla que quiero borrar?", que es
  `confrelid`. `technician_aircraft_experience` nunca entró en el `WHERE`
  porque no estaba en mi lista mental de tablas del dominio Part-66 — y ese es
  exactamente el tipo de tabla que un barrido por dirección correcta encuentra
  y uno por lista curada no.
- En (a), la consulta miró `pg_constraint`, donde un `CREATE UNIQUE INDEX`
  **no aparece por definición**. Buscar un índice en la tabla de constraints y
  concluir que no hay índice.

**El nombre del sesgo, sin adornos: confirmación por consulta filtrada.**
Construí la consulta desde la hipótesis ("la FK que bloquea es la de
habilitations", "falta un índice único") en vez de desde la pregunta ("qué
depende de esto"). Una consulta así solo puede confirmar; estructuralmente no
tiene forma de contradecirte. Y el documento agravó el problema: registró la
conclusión ("confirmado en `pg_constraint`") **sin registrar el SQL**, así que
nadie —yo incluido— podía auditarla después. Una verificación cuyo SQL no está
escrito no es una verificación, es una afirmación con adorno de rigor.

**Reglas que adopto para el resto de la misión** (aplicadas ya en la corrección
de (d), que por eso incluye también el barrido de vistas/funciones/triggers):

1. **Antes de cualquier `DROP`, la consulta va en dirección entrante**
   (`confrelid`, `pg_depend`), nunca por lista de tablas que yo elija. La lista
   curada es justo el punto ciego.
2. **Un `DROP` se verifica contra los cuatro catálogos**, no uno:
   `pg_constraint` (FKs entrantes) + `pg_depend`/`pg_rewrite` (vistas) +
   `pg_proc.prosrc` (funciones/RPC) + `pg_trigger`. Y `pg_indexes` aparte de
   `pg_constraint` siempre que la pregunta sea sobre unicidad.
3. **El SQL ejecutado se pega literal en el inventario**, junto al resultado.
   Sin el SQL, la línea no cuenta como verificada.
4. **Resultado vacío ⇒ verificar la consulta antes que la conclusión.** Un `[]`
   confirma lo que esperaba: es el caso donde más barato es equivocarse y menos
   se nota.

**Alcance del daño ya revisado:** re-verifiqué en vivo con dirección entrante
los ítems (a), (b) y (d) — las tres afirmaciones de BD del inventario. (b)
(`offer_required_aircraft_types` sin FK legacy, 3 filas ya family keys) se
sostiene: la migración 022 la retiró y no hay FK entrante a `aircraft_types`
desde ahí, cosa que la consulta correcta de (d) confirma por construcción. Los
ítems (c), (e), (f), (g), (h) son de grep sobre código, no de catálogo SQL, y
no les aplica este sesgo — pero sí les aplica la regla 4, y (h) ya falló por
esa vía una vez (el conteo "33 docs" que resultaron ser 40).

---

## Resumen — qué decidir antes de 5.2

1. **(c) y (f) — el hallazgo grande**: ¿migramos `app/technician/profile.tsx`,
   las 2 implementaciones del mapa, `company/search.tsx` y 4 hooks de estado
   a tipos V2 nativos DENTRO de esta Fase 5, o lo aparcamos como misión
   propia post-Fase-5 y en esta fase solo tocamos lo genuinamente muerto
   (`ContractType`, `LEGACY_CONTRACT_TYPES`, `AIRCRAFT_TYPES`/`AircraftType`,
   `LegacyVerificationStatus` acotado)?
2. **(f) en concreto**: si el filtro de disponibilidad de 3 estados se queda
   (mi lectura: sí, es funcionalidad activa de la 3b), ¿re-etiquetamos
   `AvailabilityStatus` como campo V2 legítimo en vez de `@deprecated`, para
   que deje de aparecer como "legacy a borrar" en el próximo inventario?
3. **(h)**: ¿archivo los candidatos ya (40, no 33 — ver corrección arriba), o los revisas tú primero uno a
   uno? Puedo hacerlo en un solo commit reversible.
4. Todo lo demás (a, b, d, e, g) no necesita decisión — son hechos
   confirmados, listos para que 5.2 actúe sobre ellos tal como estaban ya
   previstos en el plan original.

Para aquí, según protocolo. Necesito tu OK (y las respuestas de arriba) antes
de escribir una sola línea de la migración 027.

---

## Addendum 2026-07-28 — qué decidir ahora, tras las correcciones

El punto 4 de arriba ("a, b, d... no necesitan decisión") **ya no es cierto**:
(a) y (d) estaban mal, ver las dos correcciones ⛔. Lo que queda abierto:

5. **`technician_aircraft_experience` (d-bis)**: ¿(A) retirarla y rehacer el
   componente `experience` del score, (B) reconstruirla sobre
   `aircraft_type_rating_id` — probablemente redundante con
   `habilitations.experience_years`, o (C) congelarla documentada?
   Recomiendo (A) en sub-fase propia con checkpoint. La 028 no la toca salvo
   por su FK.
6. **`DROP TABLE aircraft_types` (33 filas)**: choca con la regla de CLAUDE.md
   "nunca borres datos en una migración, desactiva". Fuera de la 028 a
   propósito; decide si la mata una 030 o si se queda inerte sin FKs.
7. **Columna `technician_habilitations.aircraft_type_code`**: su DROP está
   fuera de la 028 porque **hoy la leen 4 sitios de cliente vivos**
   (`supabaseMappers.ts:253` — en la carga de todo técnico —,
   `profile.tsx:249,288`, `scripts/backfillLegacyAircraftRatings.ts:71`).
   Borrarla antes de migrar ese código rompe la app en runtime. Va en la 029,
   después del cambio de código de la 5.3.
