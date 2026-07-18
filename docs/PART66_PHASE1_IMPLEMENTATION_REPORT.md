# Fase 1 — Corrección del modelo Part-66: informe de implementación

> Ámbito: exactamente lo descrito en el encargo de Fase 1 (bugs de escritura/matching, catálogo controlado de motores/habilitaciones, requisitos exactos de oferta, solicitudes de catálogo). No se ha tocado el chat, cursos de tipo, OJT, recencia, número/autoridad de licencia, ni ningún panel de administración.
> No se han ejecutado migraciones contra una base de datos Supabase real — no hay un proyecto Supabase vivo accesible desde este entorno. La migración queda como archivo, lista para aplicarse, con su diagnóstico de validación documentado.
> No se han hecho commits ni pushes.

---

## 1. Resumen de implementación

Se corrigieron los dos bugs confirmados en el análisis previo (asignación de todas las aeronaves a la primera licencia; matching que comprobaba licencia y aeronave en filas independientes), se añadió un catálogo controlado y pequeño de motores (12) y habilitaciones exactas (12), se vinculó explícitamente categoría+habilitación tanto en el perfil técnico como en los requisitos de oferta, y se reescribió el algoritmo de matching como una clasificación explicable (`exact` / `related` / `legacy` / `not_met`) en lugar de un score aditivo opaco. Todo es aditivo: ninguna tabla existente se eliminó, ninguna fila legacy se reinterpretó automáticamente.

**Hallazgo importante de esta fase, no anticipado en el informe previo**: el bug de "todas las aeronaves a la primera licencia" existía **duplicado en dos sitios independientes**, y el que realmente se ejecutaba en producción no era el que el encargo señalaba por nombre. Ver sección 2.

---

## 2. Hallazgos adicionales encontrados durante el preflight

1. **El bug real vivía en `app/technician/profile.tsx`, no (solo) en `technicianRepositoryV2.updateAircraftTypes()`.** La pantalla activa de perfil técnico nunca llamaba a ese método del repositorio — hacía sus propias queries Supabase inline en `handleSave()` (líneas 341-360 de la versión previa), con el mismo patrón de bug (`const defaultLicense = form.licenseCategories[0]`). El método `technicianRepositoryV2.updateAircraftTypes()` señalado en el encargo existía, tenía el mismo bug, pero **no tenía ningún llamador activo**: solo lo invocaba `useTechnicianDashboard().updateProfile()`, y ese hook solo se importa desde `app/technician/documents.tsx`, que nunca llama a `updateProfile()`. Confirmado con `grep -rn "\.updateProfile("` sobre todo el árbol `app/` tras la implementación: cero resultados. Se corrigieron **ambos** sitios: la pantalla (reescrita para usar el repositorio) y el método del repositorio (convertido en una función seguro-por-diseño que lanza una excepción explicativa en vez de volver a poder crear una asociación falsa).
2. **`v2CompatAdapters.ts` no es código muerto** como sugería el informe previo (que solo verificó que `TechnicianCard.tsx`/`TechnicianFilters.tsx`/`MatchRequestCard.tsx` estaban muertos). Los adaptadores `v2SafePreviewToSafeView` y `v2TechnicianToV1` sí están activos, consumidos por `useTechnicianSearch` (pantalla `app/company/search.tsx`), `useMapTechnicians` (`app/map.tsx`) y `useAdminDashboard` (pantallas `app/admin/*`). Al hacer `aircraftTypeCode` opcional en `TechnicianHabilitation`, estos tres consumidores habrían quedado con `aircraftTypes: (string|undefined)[]` si no se corregía — se añadió `habilitationAircraftCodes()` (exportado desde `v2CompatAdapters.ts`) que resuelve el código de aeronave desde la habilitación normalizada (rating) cuando no hay `aircraftTypeCode` legacy, y se propagó a los 3 sitios adicionales que hacían el mismo `.map(h => h.aircraftTypeCode)` sin pasar por el adaptador: `app/company/offers/[id].tsx`, `app/company/search.tsx` (un segundo punto, en el render de tarjeta) y `src/components/AdminTechnicianCard.tsx`.
3. Existe una tabla `hooks` real bajo `src/state/*` (`useTechnicianDashboard`, `useTechnicianSearch`, `useMapTechnicians`, `useCompanyDashboard`, `useAdminDashboard`) que el análisis previo no había mapeado explícitamente a sus pantallas — quedó mapeado en esta fase (ver hallazgo 2).
4. La numeración de migraciones tiene una duplicidad preexistente (`014_dedup_technician_profiles.sql` y `014_remove_member_deletes_user.sql`, ambas con prefijo `014`, no relacionado con este trabajo). La nueva migración se numeró `016` (siguiente entero libre tras el `015` más alto), sin tocar la duplicidad existente.

---

## 3. Archivos modificados

**Base de datos**
- `supabase/migrations/016_part66_ratings_habilitations.sql` (nuevo)

**TypeScript — tipos**
- `src/types/catalog.ts` — `EngineTypeCatalog`, `AircraftRatingCatalog`, `AircraftRatingAircraftType`, `RequirementLevel`
- `src/types/technician.ts` — `TechnicianHabilitation.aircraftTypeCode`/`aircraftRatingCode` ahora opcionales
- `src/types/offer.ts` — `OfferRequiredHabilitation`, `OfferWithRequirements.requiredHabilitations`
- `src/types/matching.ts` — `MatchLevel`, `MatchScore` extendido con `level`/`matches`/`clarifications`/`mandatoryMissing`
- `src/types/catalogRequest.ts` (nuevo) — `CatalogRequest`, `CatalogRequestType`, `CatalogRequestStatus`
- `src/types/index.ts` — re-export de `catalogRequest.ts`

**TypeScript — constantes**
- `src/constants/engineTypes.ts` (nuevo) — catálogo de 12 motores
- `src/constants/aircraftRatings.ts` (nuevo) — catálogo de 12 habilitaciones + helpers (`getAircraftRating`, `areRatingsRelated`, `ratingCoversAircraftType`)
- `src/constants/index.ts` — barrel actualizado

**TypeScript — repositorios**
- `src/repositories/v2/catalogRepository.ts` — `getEngineTypes`, `getEngineType`, `getAircraftRatings`, `getAircraftRating`, `getAircraftRatingsForAircraftType`
- `src/repositories/v2/technicianRepositoryV2.ts` — `replaceHabilitations()` nuevo, `deleteHabilitation()` nuevo, `updateAircraftTypes()` convertido en stub seguro que lanza excepción, filtro de búsqueda por aeronave actualizado para considerar `aircraftRatingCode`
- `src/repositories/v2/offerRepository.ts` — `replaceRequiredHabilitations()` nuevo, `replaceRequirements()`/`create()` extendidos para aceptar habilitaciones exactas
- `src/repositories/v2/supabaseMappers.ts` — `loadOfferRequirements()` carga `offer_required_habilitations`; `loadTechnicianRelations()` lee `aircraft_rating_code`; nuevos `mapOfferRequiredHabilitationRow()`, `mapCatalogRequestRow()`
- `src/repositories/v2/catalogRequestRepository.ts` (nuevo) — `create()`, `getForUser()`
- `src/repositories/v2/index.ts` — export de `catalogRequestRepository`

**TypeScript — lógica**
- `src/utils/offerMatchExplain.ts` (nuevo) — función pura `calculateOfferTechnicianMatch()` (sin imports de Supabase/repositorios, testeable de forma aislada), `getMatchLabel()`
- `src/utils/matchingV2.ts` — reescrito para reexportar la lógica pura y conservar solo las funciones que hacen I/O (`getTechnicianMatchesForOffer`, `getOfferMatchesForTechnician`)
- `src/utils/v2CompatAdapters.ts` — `habilitationAircraftCodes()` exportado, usado donde antes se aplanaba `aircraftTypeCode` directamente

**UI**
- `app/technician/profile.tsx` — sección "Habilitations" reescrita (filas explícitas categoría+rating), panel "Request a catalog addition", guardado vía `technicianRepositoryV2.replaceHabilitations()` en vez de SQL inline con licencia por defecto
- `app/company/offers/new.tsx` y `app/company/offers/edit.tsx` — sección "Exact habilitations (optional)" (categoría + habilitación + obligatorio/preferido + nota)
- `app/company/applications/[id].tsx`, `app/company/direct-offers/[id].tsx`, `app/technician/offers/[id].tsx`, `app/technician/direct-offers/[id].tsx` — integran `MatchExplanation` junto al breakdown existente
- `app/company/offers/[id].tsx`, `app/company/search.tsx`, `src/components/AdminTechnicianCard.tsx` — corregidos para el nuevo `aircraftTypeCode` opcional (hallazgo 2)
- `src/components/MatchExplanation.tsx` (nuevo) — presentación de `level`/`matches`/`clarifications`/`mandatoryMissing`

**Seeds y validación**
- `src/data/seeds/technicianLicenses.json`, `technicianHabilitations.json` — filas nuevas (no se modificó ninguna fila existente)
- `src/data/seeds/offerRequiredHabilitations.json` (nuevo)
- `src/data/seeds/catalogRequests.json` (nuevo)
- `scripts/validateSeeds.js` — parseo de `engineTypes.ts`/`aircraftRatings.ts`, validación de habilitaciones/requisitos/solicitudes nuevos

**Otros**
- `package.json` — script `test:matching`
- `.gitignore` — ignora el directorio de compilación temporal del test

---

## 4. Migraciones creadas

`supabase/migrations/016_part66_ratings_habilitations.sql` — una sola migración, aditiva, sin `DROP`/`DELETE`/`TRUNCATE`. No se ha aplicado contra ningún proyecto Supabase (no hay uno accesible desde este entorno); queda lista para revisión y despliegue.

---

## 5. Tablas y columnas nuevas

| Objeto | Tipo | Notas |
|---|---|---|
| `engine_types` | tabla nueva | `code, label, manufacturer, is_active, sort_order, created_at` — 12 filas sembradas |
| `aircraft_ratings` | tabla nueva | `code, label, short_label, engine_code, is_active, sort_order, created_at` — 12 filas sembradas |
| `aircraft_rating_aircraft_types` | tabla nueva | `(aircraft_rating_code, aircraft_type_code)` PK compuesta — 21 filas sembradas |
| `offer_required_habilitations` | tabla nueva | `(offer_id, license_code, aircraft_rating_code)` PK compuesta, `requirement_level`, `notes`, `created_at` |
| `catalog_requests` | tabla nueva | `id, requested_by, request_type, license_code, aircraft_type_code, requested_label, notes, status, created_at, reviewed_at, reviewed_by` |
| `technician_habilitations.aircraft_type_code` | columna modificada | `NOT NULL` → nullable |
| `technician_habilitations.aircraft_rating_code` | columna nueva | `TEXT NULL REFERENCES aircraft_ratings(code)` |
| `offer_required_technician_types.requirement_level` | columna nueva | `TEXT NOT NULL DEFAULT 'preferred'` |
| `offer_required_licenses.requirement_level` | columna nueva | ídem |
| `offer_required_aircraft_types.requirement_level` | columna nueva | ídem |

---

## 6. Constraints e índices

- `chk_technician_habilitations_target` — `CHECK (aircraft_type_code IS NOT NULL OR aircraft_rating_code IS NOT NULL)`.
- `uq_technician_habilitations_rating` — índice único parcial `(technician_id, license_code, aircraft_rating_code) WHERE aircraft_rating_code IS NOT NULL`. Permite guardar simultáneamente B1.1+CFM56, B1.1+V2500, B1.1+LEAP-1A (verificado en el test automatizado, Caso 4).
- `fk_technician_habilitations_license` — FK compuesta `(technician_id, license_code) REFERENCES technician_licenses (technician_id, license_code)`, añadida como `NOT VALID` (no se revalidan filas existentes; se exige en filas nuevas/actualizadas de inmediato). Consulta de diagnóstico incluida como comentario en la propia migración:
  ```sql
  SELECT h.id, h.technician_id, h.license_code
  FROM technician_habilitations h
  LEFT JOIN technician_licenses l
    ON l.technician_id = h.technician_id AND l.license_code = h.license_code
  WHERE l.technician_id IS NULL;
  ```
  Cuando esa consulta devuelva cero filas (o las filas devueltas se hayan corregido/aceptado como legacy), ejecutar `ALTER TABLE technician_habilitations VALIDATE CONSTRAINT fk_technician_habilitations_license;`.
- Claves compuestas nuevas: `aircraft_rating_aircraft_types (aircraft_rating_code, aircraft_type_code)`, `offer_required_habilitations (offer_id, license_code, aircraft_rating_code)`.
- `CHECK` de valores cerrados: `request_type IN ('engine','aircraft_rating')`, `status IN ('pending','approved','rejected','merged')` en `catalog_requests`; `requirement_level IN ('mandatory','preferred')` en las 4 tablas que lo usan.

---

## 7. Políticas RLS

Siguiendo exactamente los patrones ya usados en `001_initial_schema_v2.sql`:

- `engine_types`, `aircraft_ratings`, `aircraft_rating_aircraft_types` — lectura pública (`FOR SELECT USING (true)`), escritura solo admin (`FOR ALL USING (is_admin())`), igual que `license_categories`/`aircraft_types`.
- `offer_required_habilitations` — 5 políticas calcadas de `offer_required_aircraft_types`: lectura si la oferta está publicada+visible, lectura si es de la propia empresa, inserción/borrado solo con `can_act_for_company(offer.company_id)`, admin acceso total. Sin política de `UPDATE` (se reemplaza por borrar+insertar, igual que el resto de tablas de requisitos).
- `catalog_requests` — inserción solo de las propias (`requested_by = auth.uid()`), lectura solo de las propias, admin acceso total. Sin política de `UPDATE` para usuarios no-admin (ningún usuario normal puede aprobar/rechazar). Trigger `force_catalog_request_defaults()` (`BEFORE INSERT`) fuerza `status='pending', reviewed_at=NULL, reviewed_by=NULL` sin importar lo que envíe el cliente, cerrando el hueco de que alguien inserte directamente una solicitud ya "aprobada".

No se ha debilitado ninguna política existente. No se usa `service_role` en el frontend en ningún punto nuevo.

**No verificado contra una base de datos real** (no hay proyecto Supabase accesible desde este entorno) — recomendado antes de producción: aplicar en una rama/branch de desarrollo y ejecutar `get_advisors` (seguridad) sobre el proyecto resultante.

---

## 8. Cambios de tipos TypeScript

Ver sección 3. Resumen de los tipos más relevantes:

```ts
export interface TechnicianHabilitation {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  aircraftTypeCode?: string;   // antes: string (obligatorio)
  aircraftRatingCode?: string; // nuevo
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface OfferRequiredHabilitation {
  offerId: string;
  licenseCode: LicenseCode;
  aircraftRatingCode: string;
  requirementLevel: RequirementLevel; // 'mandatory' | 'preferred'
  notes?: string;
  createdAt: string;
}

export type MatchLevel = 'exact' | 'related' | 'legacy' | 'not_met';
// MatchScore ahora incluye: level, matches: string[], clarifications: string[], mandatoryMissing: string[]
```

`npm run ts` (`tsc --noEmit`) termina sin errores tras estos cambios (ver sección 16).

---

## 9. Cambios en repositorios

- **`technicianRepositoryV2.replaceHabilitations(technicianId, entries)`** — sustituye a `updateAircraftTypes`. Recibe `{ licenseCode, aircraftRatingCode, issuedAt?, expiresAt? }[]` explícito, nunca infiere licencia. Solo borra/reinserta filas **normalizadas** (`aircraft_rating_code IS NOT NULL`) — las filas legacy quedan intactas siempre.
- **`technicianRepositoryV2.updateAircraftTypes()`** — marcada `@deprecated`, ahora lanza `Error` inmediatamente en vez de escribir nada. Sigue existiendo solo para que el call site tipado en `useTechnicianDashboard.ts` siga compilando; no tiene ningún llamador activo (hallazgo 2 de esta fase).
- **`offerRepository.replaceRequirements()`** — acepta un campo opcional `habilitations`; si se omite, no toca `offer_required_habilitations` (compatibilidad total con los llamadores que ya existían).
- **`offerRepository.replaceRequiredHabilitations()`** — nuevo, borra+inserta solo la tabla exacta.
- **`catalogRequestRepository`** — nuevo, `create()`/`getForUser()`.

---

## 10. Cambios en el perfil técnico

`app/technician/profile.tsx`:
- La sección "Aircraft types" (dos grids planos de chips) se sustituyó por "Habilitations": lista de filas explícitas `categoría + habilitación` (con badge "Declared" para las normalizadas y "Legacy" para las antiguas, de solo lectura), un selector de categoría **restringido a las licencias ya marcadas por el técnico**, un selector de habilitación sobre el catálogo de 12, botón "Add habilitation", y botón "Remove" por fila.
- Enlace "Can't find your habilitation? Request it." abre un panel con categoría/aeronave o familia/nombre en la licencia/notas, que llama a `catalogRequestRepository.create()` y muestra "Request pending catalog addition." tras enviar.
- `handleSave()` ya no hace `DELETE`+`INSERT` inline sobre `technician_habilitations` con licencia por defecto — llama a `technicianRepositoryV2.replaceHabilitations()`, y filtra automáticamente cualquier habilitación cuya licencia se haya deseleccionado en el mismo guardado (para no violar la FK compuesta).
- La sección "Licenses" (chips planos) no cambió — sigue siendo un concepto legítimamente plano.

---

## 11. Cambios en ofertas

`app/company/offers/new.tsx` y `edit.tsx`: nueva tarjeta "Exact habilitations (optional)" bajo "Required aircraft types", sin tocar el resto del formulario. Cada fila añadida muestra categoría + habilitación + nivel (Mandatory/Preferred) + nota opcional, con botón de borrado individual. Al guardar, se envían junto con los requisitos generales existentes mediante `offerRepository.create()`/`replaceRequirements()`.

---

## 12. Cambios en matching

`src/utils/offerMatchExplain.ts` — `calculateOfferTechnicianMatch(offer, technician)` reescrita por completo, misma firma que antes (cero cambios en los ~10 call sites existentes):

- **Con requisitos exactos** (`offer.requiredHabilitations.length > 0`): cada requisito se evalúa contra las filas de habilitación del técnico que comparten `licenseCode` — nunca contra `technician.licenses` de forma independiente para la parte de aeronave. Niveles: `exact` (misma licencia + mismo rating), `related` (misma licencia + rating relacionado por familia, o habilitación legacy general que cubre la aeronave), `not_met`.
- **Sin requisitos exactos**: si la oferta pide licencia y aeronave a la vez, ambas deben resolverse desde **la misma fila** de `technician_habilitations` (`evaluateLegacyBroadMatch`) — ya no se puntúa "tiene la licencia en algún sitio" + "tiene la aeronave en algún sitio" por separado.
- `mandatoryMissing` se rellena para cualquier requisito `mandatory` cuyo resultado no sea `exact` (incluye `related`, no solo `not_met`) — un requisito obligatorio con motorización distinta se marca como no cumplido exactamente, sin excluir al técnico.
- Nada excluye nunca a un técnico de la función — siempre devuelve un `MatchScore`; la única "exclusión" es de etiqueta/orden, nunca de disponibilidad para aplicar o para chatear.

---

## 13. Compatibilidad legacy

- Ninguna fila existente de `technician_habilitations`/`offer_required_licenses`/`offer_required_aircraft_types`/`offer_required_technician_types` fue modificada, eliminada ni reinterpretada.
- `requirement_level` en las 4 tablas usa `DEFAULT 'preferred'` — ninguna oferta existente pasa a comportarse como filtro duro.
- `technician_habilitations.aircraft_type_code` sigue siendo legible tal cual para todas las filas legacy; `replaceHabilitations()` nunca toca esas filas.
- Las ofertas que solo usan `requiredLicenses`/`requiredAircraftTypes` (sin `requiredHabilitations`) siguen funcionando exactamente igual que antes en términos de "qué se puede requerir", solo que ahora el matching las evalúa correctamente en conjunto en vez de por separado.

---

## 14. Catálogo inicial añadido

**Motores (12)**: CFM56, V2500, LEAP_1A, PW1100G, CF6, TRENT_700, GE90, PW4000, TRENT_800, PT6, ARRIEL_1, PW210 (los dos últimos sembrados como catálogo disponible aunque ninguna habilitación inicial los usa todavía, por si una futura solicitud de catálogo los necesita).

**Habilitaciones (12)**: A320_FAMILY_CFM56, A320_FAMILY_V2500, A320_FAMILY_LEAP_1A, A320_FAMILY_PW1100G, A330_CF6, A330_TRENT_700, B737_NG_CFM56, B777_GE90, B777_PW4000, B777_TRENT_800, AW139_PT6, B412_AB412_PT6 — exactamente la lista mínima pedida en el encargo, usando únicamente aeronaves ya presentes en `aircraft_types` (A318, A319, A320, A321, A330, B737, B777, AW139, B412). No se añadió ninguna aeronave nueva al catálogo.

---

## 15. Tests añadidos

`scripts/testMatching.ts` — 8 tests, ejecutables sin conexión a base de datos (importan directamente la función pura, sin tocar Supabase). Comando: `npm run test:matching`. Los 8 casos pedidos en el encargo están cubiertos uno a uno (combinación correcta, categoría distinta sin deducción falsa, mismo family/motor distinto, varias motorizaciones simultáneas, falso positivo legacy, preferido no cumplido, obligatorio no cumplido, solicitud pendiente sin efecto en el matching). Resultado actual: **8/8 PASS**.

`scripts/validateSeeds.js` ampliado con: motor inexistente en una habilitación (vía catálogo), rating relacionado con aeronave inexistente, código duplicado (motores y habilitaciones), habilitación de técnico con rating inexistente, requisito de oferta con rating inexistente, solicitud de catálogo con referencias inválidas.

---

## 16. Resultado exacto de cada comando ejecutado

**`npm run test:matching`**
```
PASS — Case 1 — exact category+rating match
PASS — Case 2 — no false combination across categories
PASS — Case 3 — same family, different engine => related + clarification
PASS — Case 4 — technician can hold several engine variants of one family at once
PASS — Case 5 — legacy broad requirement does not combine independent license/aircraft rows
PASS — Case 6 — preferred requirement mismatch stays related, never excluded
PASS — Case 7 — mandatory requirement mismatch is flagged but the profile still surfaces as related
PASS — Case 8 — pending catalog request codes are not resolvable ratings

8 passed, 0 failed
```

**`node scripts/validateSeeds.js`**
```
=== SEED VALIDATION REPORT ===
... (46 habilitations, 30 licenses, 3 OfferRequiredHabilitations, 1 CatalogRequests,
     12 EngineTypeCatalogCodes, 12 AircraftRatingCatalogCodes, ...)
Warnings: 0
Errors: 0
RESULT: PASS
```

**`npm run ts`** (`tsc --noEmit`)
```
(sin salida — 0 errores)
```
Nota: en la primera pasada aparecieron 6 errores, todos derivados de hacer `aircraftTypeCode` opcional (3 sitios que hacían `.map(h => h.aircraftTypeCode)` sin filtrar `undefined`, más un estilo `textarea` no declarado). Todos corregidos — ver sección 3 y hallazgo 2.

**`npx expo install --check`**
```
The following packages should be updated for best compatibility with the installed expo version:
  expo@54.0.34 - expected version: ~54.0.35
  expo-file-system@19.0.22 - expected version: ~19.0.23
  expo-router@6.0.23 - expected version: ~6.0.24
Found outdated dependencies
```
Este desfase de versiones **es preexistente** — no se tocó ninguna versión de dependencia en esta fase (solo se añadió el script `test:matching` a `package.json`). No forma parte del alcance de este encargo corregirlo, y no está relacionado con el modelo Part-66.

**`npx expo export --platform web`**
```
Web Bundled 9628ms node_modules\expo-router\entry.js (2639 modules)
› Static routes (51): ... (todas las rutas existentes, incluidas las 4 pantallas de detalle
  modificadas y /technician/profile, /company/offers/new, /company/offers/edit)
Exported: dist
```
Sin errores de bundling.

---

## 17. Casos que requieren QA manual

1. **Guardar el perfil técnico con varias licencias y habilitaciones normalizadas** — abrir `/technician/profile`, añadir 2 licencias (p. ej. B1.1 y B2), añadir 2-3 habilitaciones bajo distintas categorías, guardar, recargar, y confirmar que cada habilitación conserva su categoría correcta (no se puede verificar sin una base de datos Supabase real conectada).
2. **Quitar una licencia que tiene habilitaciones asociadas** — confirmar que el guardado no falla por la FK compuesta y que las habilitaciones huérfanas se descartan silenciosamente (comportamiento implementado, no ejercitado contra una base real).
3. **Crear una oferta con habilitación exacta obligatoria y ver el resultado en la pantalla de aplicaciones/ofertas directas** — confirmar visualmente que `MatchExplanation` muestra "Mandatory requirements not met exactly" cuando corresponde, y que nunca oculta al técnico de la lista.
4. **Enviar una solicitud de catálogo ("Can't find your habilitation?")** y confirmar en Supabase que la fila queda con `status='pending'` sin importar qué se haya intentado enviar.
5. **Validar la constraint `fk_technician_habilitations_license` como `NOT VALID`** ejecutando la consulta de diagnóstico de la sección 6 contra los datos reales antes de considerar `VALIDATE CONSTRAINT`.
6. **Revisar RLS con `get_advisors`** una vez la migración esté aplicada en un proyecto real — no se pudo ejecutar desde este entorno.
7. **Verificar visualmente en móvil** (no solo web) que la nueva sección de habilitaciones y el panel de solicitud de catálogo no rompen el layout en pantallas estrechas — solo se verificó el bundling, no el render visual.

---

## 18. Riesgos pendientes

- La migración no se ha aplicado ni probado contra una base de datos real; puede haber diferencias de comportamiento entre lo escrito y lo que Postgres/PostgREST acepten en la práctica (p. ej. el índice único parcial, la FK compuesta `NOT VALID`).
- `evaluateLegacyBroadMatch` y `evaluateHabilitationRequirement` (en `offerMatchExplain.ts`) son nuevas y solo se han probado con los 8 casos exigidos por el encargo más los que ya cubrían los componentes de disponibilidad/experiencia/ubicación (sin cambios) — un conjunto más amplio de combinaciones reales podría revelar casos no contemplados.
- El campo `notes` de `offer_required_habilitations` no se muestra todavía en ninguna pantalla de detalle para el técnico (solo se captura en el formulario de la empresa) — pendiente de decidir si debe mostrarse.
- El panel "Request a catalog addition" en el perfil técnico es el único punto de entrada implementado; no existe un equivalente en el lado empresa (el encargo solo pedía la UI del lado técnico, sección 13).

---

## 19. Elementos expresamente pospuestos a la Fase 2

Tal como delimita el encargo (sección 4): cursos de tipo, OJT, experiencia line/base, última fecha trabajada, recencia regulatoria, número y autoridad de la licencia, extracción automática de documentos/OCR, catálogo EASA completo, grupos y subgrupos regulatorios, sistemas B2L, subcategorías L, B1.E, chat asistido, rediseño completo del perfil, panel de administración de `catalog_requests` (aprobar/rechazar/fusionar solicitudes).
