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

**Hallazgo lateral (severidad baja, no bloquea nada)**: la única constraint
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

`aircraft_types` la tabla: FK viva desde
`technician_habilitations.aircraft_type_code` (`technician_habilitations_aircraft_type_code_fkey`)
— confirmado en `pg_constraint`. Es el ÚNICO motivo por el que la tabla no se
puede borrar todavía. Con (a) confirmando 0 filas legacy hoy, el DROP de la FK
+ columna + tabla es mecánicamente seguro en `rotoaxismatch-dev` — pero sigue
yendo en la migración 028 de la sub-fase 5.3, con checkpoint, no antes.

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
