# Pre-Supabase Code Audit Report

Fecha de auditoria: 2026-05-27

Alcance: `app/`, `src/`, `docs/`, `scripts/`, `src/data/`, `src/data/seeds/`, constantes, repositorios V1/V2, hooks/state, tipos, utilidades, schema Supabase, plan RLS, validadores y logica demo local.

## 1. Executive summary

La demo local V2 esta runnable y las decisiones MVP recientes estan mayormente reflejadas en la documentacion principal: `location_airports` es catalogo curado, los miembros de compania se crean manualmente y cada usuario de compania pertenece a una sola compania en MVP.

No recomiendo empezar la implementacion de Supabase/Auth todavia sin una fase corta de fixes. El riesgo principal no es la UI local, sino que algunos documentos RLS/schema, tipos TypeScript y seeds todavia permiten decisiones ambiguas o peligrosas para Supabase:

- El plan RLS permite `SELECT` sobre `technician_profiles` para companias, aunque esa tabla contiene campos privados. En Supabase, RLS es por fila, no por columna.
- Las politicas UPDATE planificadas no restringen columnas sensibles como `profiles.role`, `profiles.status`, `identity_revealed` y `documents_unlocked`.
- Los seeds locales usan IDs tipo `tech-001`, `comp-001`, `offer-001`, pero el SQL usa UUID en casi todas las PK/FK.
- Hay deuda V1 aun conectada a pantallas reales: `MatchRequest`, `SafeTechnicianView`, `sent`, `fullName`, `companyName`, `contactEmail`, `specialties`, `yearsExperience`.
- El mapa muestra un `% match` sin oferta concreta, contradiciendo la regla MVP de matching.
- Hay inconsistencias entre historial de aplicaciones, duplicados permitidos en local y constraints SQL.

Resultado: **Almost**, pero con una fase de fixes antes de V2-S1 Supabase Auth.

QA ejecutada:

| Check | Resultado |
|---|---|
| `npx tsc --noEmit` | PASS |
| `node scripts/validateSeeds.js` | PASS |
| `npx expo export --platform web` | No ejecutado, porque genera/modifica artefactos de export y esta auditoria solo permite crear este reporte |

Estado actual de seeds segun `scripts/validateSeeds.js`:

| Entidad | Conteo |
|---|---:|
| Tech profiles | 18 |
| Companies | 9 |
| Profiles | 34 |
| Offers | 12, 11 published y 1 draft |
| OfferRequests | 12 |
| OfferApplications | 6 |
| Documents | 25 |
| CompanyMembers | 15 |
| ChatRooms | 4 |
| ChatMessages | 9 |
| Activities | 2 |

## 2. Critical issues

### C1. Company RLS can expose private technician columns

Severity: Critical

Archivos implicados:
- `docs/RLS_PLAN_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/MVP_ARCHITECTURE_HANDOFF.md`
- `docs/DATA_MODEL_V2.md`

Que ocurre:

El plan RLS dice que las companias nunca deben consultar `technician_profiles` directamente y que deben usar `technician_public_view`. Pero tambien define una policy `tp_select_company` que permite a usuarios de compania hacer `SELECT` sobre filas verificadas de `technician_profiles`.

Por que importa:

`technician_profiles` contiene `first_name`, `last_name`, `email`, `phone`, `birth_date` y `social_links`. En Supabase, una policy RLS de `SELECT` sobre la tabla base no oculta columnas. Si el cliente autenticado tiene acceso REST a la tabla base, podria leer datos privados antes de `accepted`.

Recomendacion:

Antes de implementar Supabase, decidir y documentar una de estas estrategias:

- No dar `SELECT` de `technician_profiles` base a `authenticated` para usuarios de compania.
- Exponer solo `technician_public_view` o RPCs con columnas seguras.
- Revisar GRANTs/privileges explicitamente, no confiar solo en RLS.

Tipo: corregir diseno tecnico/RLS. No requiere decision de producto.

### C2. UPDATE policies do not protect sensitive columns

Severity: Critical

Archivos implicados:
- `docs/RLS_PLAN_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `src/types/offerRequest.ts`
- `src/repositories/v2/offerRequestRepository.ts`
- `src/repositories/v2/offerApplicationRepository.ts`

Que ocurre:

El plan RLS tiene policies tipo:

- `profiles_update_own`: permite al owner actualizar su fila de `profiles`.
- `tp_update_own`: permite al tecnico actualizar su `technician_profiles`.
- `or_update_company`, `or_update_technician`, `oa_update_company`, `oa_update_technician`: permiten updates sobre rows completos.

Los docs dicen que `role`, `status`, `verification_status`, `identity_revealed`, `documents_unlocked`, chat creation y activity creation no deben ser escritos por frontend. Pero las policies no muestran restricciones de columnas, RPC obligatorio, triggers de rechazo, ni grants por columna.

Por que importa:

Un cliente podria intentar:

- Cambiar `profiles.role` o `profiles.status`.
- Cambiar su `verification_status`.
- Forzar `identity_revealed` o `documents_unlocked`.
- Cambiar campos ajenos al status durante una transicion.

Recomendacion:

Antes de Supabase:

- Usar RPCs de transicion para `offer_requests` y `offer_applications`.
- Revocar updates directos de columnas sensibles o usar triggers que rechacen cambios no autorizados.
- Separar updates de perfil editables de campos admin/server-owned.
- Documentar grants/column privileges junto al RLS plan.

Tipo: corregir diseno tecnico/RLS. No requiere decision de producto.

### C3. Local seed IDs are not UUID-compatible with the SQL schema

Severity: Critical

Archivos implicados:
- `src/data/seeds/*.json`
- `src/storage/localDatabase.ts`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/MIGRATION_FROM_DEMO_TO_V2.md`

Que ocurre:

Los seeds locales usan IDs legibles:

- `prof-t001`, `tech-001`, `comp-001`, `cm-001`
- `offer-001`, `oreq-001`, `oapp-002`
- `room-seed-001`, `msg-seed-001`, `act-001`

El SQL usa UUID para `profiles.id`, `technician_profiles.id`, `companies.id`, `company_members.id`, `offers.id`, `offer_requests.id`, `offer_applications.id`, `chat_rooms.id`, `chat_messages.id`, `activity_events.id`, etc.

Por que importa:

Los seeds no se pueden insertar directamente en Supabase. Tambien `profiles.id` debe mapearse a `auth.users.id`, no a `prof-*`.

Recomendacion:

Crear una estrategia explicita antes de migrar:

- Generar UUIDs y un mapping `legacy_id -> uuid`.
- O mantener IDs demo solo en local y crear seeds Supabase separados.
- No mezclar IDs demo con IDs Auth reales.

Tipo: correccion tecnica. Requiere decision tecnica, no producto.

## 3. High priority inconsistencies

### H1. `VerificationStatus` TS permite `unverified`, pero SQL/docs V2 no

Severity: High

Archivos implicados:
- `src/types/enums.ts`
- `src/constants/verificationStatuses.ts`
- `app/admin/technicians.tsx`
- `app/admin/companies.tsx`
- `app/admin/index.tsx`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/TYPESCRIPT_TYPES_V2.md`
- `docs/DATA_MODEL_V2.md`

Que ocurre:

TypeScript y constantes mantienen `unverified` por compat V1. SQL define `verification_status` solo como `pending | verified | rejected`.

Por que importa:

Si una pantalla admin escribe `unverified`, Supabase rechazara el valor. Ademas las pantallas admin normalizan `unverified` a `rejected`, lo que oculta la inconsistencia.

Recomendacion:

Eliminar `unverified` de los tipos vivos antes de Supabase, o aislarlo estrictamente en tipos V1 deprecated que no puedan llegar a repos V2.

Tipo: corregir codigo/tipos.

### H2. `locationCityId` es opcional en TS, pero requerido en SQL y docs canonicos

Severity: High

Archivos implicados:
- `src/types/technician.ts`
- `src/types/company.ts`
- `src/types/privacy.ts`
- `docs/TYPESCRIPT_TYPES_V2.md`
- `docs/DATA_MODEL_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`

Que ocurre:

`TechnicianProfile.locationCityId`, `CompanyProfile.locationCityId` y `SafeTechnicianPreview.locationCityId` aparecen como opcionales en TS. En SQL, `technician_profiles.location_city_id`, `companies.location_city_id` y `offers.location_city_id` son `NOT NULL`.

Por que importa:

La app puede compilar y escribir estados imposibles en Supabase. La UI local tambien permite temporalmente `locationCityId: undefined` durante edicion.

Recomendacion:

Hacer requerido el campo en los tipos V2 persistidos. Si se necesita estado incompleto de formulario, usar tipos de form separados.

Tipo: corregir codigo/tipos.

### H3. `SUPABASE_PLAN_V2.md` mezcla nombres camelCase con columnas SQL snake_case

Severity: High

Archivos implicados:
- `docs/SUPABASE_PLAN_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/DATA_MODEL_V2.md`
- `docs/TYPESCRIPT_TYPES_V2.md`

Que ocurre:

`SUPABASE_PLAN_V2.md` lista columnas como `userId`, `anonymousCode`, `locationCityId`, `offerRequestId`, `chatRoomId`, `senderUserId`, etc. El SQL y `DATA_MODEL_V2.md` usan snake_case: `user_id`, `anonymous_code`, `location_city_id`, `offer_request_id`, `chat_room_id`, `sender_user_id`.

Por que importa:

Puede provocar migraciones, RLS policies o consultas Supabase con nombres incorrectos.

Recomendacion:

Elegir una regla documental:

- SQL/docs schema siempre snake_case.
- TS/client siempre camelCase.
- Los documentos de Supabase deben decir claramente si una tabla esta mostrando columna SQL o propiedad TS.

Tipo: corregir docs.

### H4. El mapa muestra `% match` sin una oferta concreta

Severity: High

Archivos implicados:
- `src/state/useMapTechnicians.ts`
- `src/components/TechnicianMapLeafletImpl.tsx`
- `app/map.tsx`
- `docs/MVP_ARCHITECTURE_HANDOFF.md`
- `docs/DATA_MODEL_V2.md`
- `docs/USER_FLOWS_V2.md`
- `docs/HANDOFF_SUMMARY.md`

Que ocurre:

`useMapTechnicians` calcula `matchingScore` con `scoreMapMatch()` usando filtros generales, sin `offerId`. `TechnicianMapLeafletImpl` muestra `{matchingScore}% match`.

Por que importa:

Contradice la regla de producto: no hay matching global de tecnico y no debe mostrarse `% match` sin saber la oferta. Puede confundir a usuarios y contaminar la migracion.

Recomendacion:

Para MVP, eliminar el score global del mapa o mostrar solo scores dentro del selector de oferta especifico. Si el mapa no es central para MVP, simplificarlo.

Tipo: corregir codigo. No requiere decision de producto porque la regla ya esta definida.

### H5. Documentos desbloqueados: codigo devuelve solo documentos verificados, docs dicen todos los documentos y estados

Severity: High

Archivos implicados:
- `src/repositories/v2/technicianRepositoryV2.ts`
- `src/state/useCompanyDashboard.ts`
- `src/repositories/v2/documentRepositoryV2.ts`
- `docs/DATA_MODEL_V2.md`
- `docs/MVP_ARCHITECTURE_HANDOFF.md`
- `docs/USER_FLOWS_V2.md`

Que ocurre:

Despues de acceptance, varias rutas construyen `UnlockedTechnicianView` usando `documentRepositoryV2.getVerifiedForTechnician()`. Los docs dicen que la compania puede ver la lista de documentos y sus estados, incluyendo pending/rejected/expired, despues de `documents_unlocked`.

Por que importa:

No es fuga de privacidad, pero si una inconsistencia funcional y de modelo. Supabase/RLS podria terminar exponiendo mas que la UI local o viceversa.

Recomendacion:

Decidir MVP:

- Si compania aceptada ve todos los documentos y estados, usar `getForTechnician()` tras unlock.
- Si solo ve documentos verificados, cambiar docs y RLS para decirlo.

Tipo: decision de producto pequena o correccion de codigo/docs.

### H6. Reaplicar despues de withdrawn/expired contradice el unique SQL de `offer_applications`

Severity: High

Archivos implicados:
- `app/technician/offers/[id].tsx`
- `src/repositories/v2/offerApplicationRepository.ts`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/DATA_MODEL_V2.md`

Que ocurre:

La UI permite aplicar otra vez si la aplicacion previa esta `withdrawn` o `expired`. El repositorio local solo bloquea aplicaciones activas. Pero SQL define `UNIQUE (technician_id, offer_id)`, que bloquea cualquier segunda aplicacion para la misma oferta.

Por que importa:

La demo y Supabase tendrian reglas distintas. Tambien la alerta de UI dice "You can apply again later", lo que refuerza la regla local.

Recomendacion:

Decidir producto:

- MVP simple: una aplicacion por tecnico/oferta para siempre. Entonces cambiar UI/local a no permitir reaplicar.
- O permitir reaplicar. Entonces SQL necesita otro modelo, por ejemplo partial unique solo para estados activos o una tabla de intentos.

Tipo: decision de producto.

### H7. Historial de aplicaciones del tecnico no esta garantizado si la oferta deja de estar publicada

Severity: High

Archivos implicados:
- `app/technician/offers/index.tsx`
- `app/technician/offers/[id].tsx`
- `src/utils/matchingV2.ts`
- `src/repositories/v2/offerApplicationRepository.ts`
- `docs/DATA_MODEL_V2.md`

Que ocurre:

`offerApplicationRepository.getForTechnician()` devuelve todas las aplicaciones, pero `app/technician/offers/index.tsx` solo renderiza aplicaciones asociadas a ofertas devueltas por `getOfferMatchesForTechnician()`, que usa solo ofertas publicadas y visibles. La pantalla detalle tambien hace `not found` si la oferta no esta abierta.

Por que importa:

Los docs dicen que las aplicaciones son historicas y siempre visibles para tecnico y compania aunque cierre la oferta.

Recomendacion:

Antes de Supabase, definir una pantalla o seccion de historial de aplicaciones independiente de discovery de ofertas publicadas.

Tipo: corregir codigo/product flow.

### H8. `updateExperienceYears()` puede crear `aircraftTypeCode: 'GENERAL'`, que no existe en el catalogo

Severity: High

Archivos implicados:
- `src/repositories/v2/technicianRepositoryV2.ts`
- `src/constants/aircraftTypes.ts`
- `docs/SUPABASE_SCHEMA_V2.sql`

Que ocurre:

Si un tecnico no tiene entradas de experiencia y se actualiza `yearsExperience`, el repositorio crea una fila con `aircraftTypeCode: 'GENERAL'`. Ese codigo no existe en `aircraft_types` y fallaria la FK SQL.

Por que importa:

Puede generar datos locales que no migran a Supabase y rompe la regla de experiencia por aeronave.

Recomendacion:

No crear experiencia generica sin aircraft type. Para MVP, requerir seleccionar aeronave o dejar la experiencia vacia.

Tipo: corregir codigo.

### H9. Local join tables de offer requirements tienen `id`, SQL usa PK compuesta

Severity: High

Archivos implicados:
- `src/data/seeds/offerRequiredTechnicianTypes.json`
- `src/data/seeds/offerRequiredLicenses.json`
- `src/data/seeds/offerRequiredAircraftTypes.json`
- `src/repositories/v2/offerRepository.ts`
- `docs/SUPABASE_SCHEMA_V2.sql`

Que ocurre:

Los seeds y repositorios locales guardan `id` para cada requirement row. SQL define:

- `PRIMARY KEY (offer_id, technician_type)`
- `PRIMARY KEY (offer_id, license_code)`
- `PRIMARY KEY (offer_id, aircraft_type_code)`

Por que importa:

No es imposible de migrar, pero requiere transformar datos. Si se intenta insertar local JSON tal cual, sobran columnas y los IDs no aplican.

Recomendacion:

Documentar transformacion de seeds y validar duplicados por PK compuesta.

Tipo: correccion tecnica.

### H10. Activity local no refleja el modelo Supabase y no crea eventos de chat

Severity: High

Archivos implicados:
- `src/types/activity.ts`
- `src/repositories/v2/activityRepository.ts`
- `src/repositories/v2/chatRepository.ts`
- `src/data/seeds/activities.json`
- `docs/DATA_MODEL_V2.md`
- `docs/MVP_ARCHITECTURE_HANDOFF.md`

Que ocurre:

El modelo local usa `ActivityItem` plano con `recipientRole`, `recipientId`, `entityId`, `read`. Supabase docs usan `activity_events` + `activity_reads` con `recipient_scope`, `recipient_company_id`, `recipient_technician_id`, `actor_profile_id`, `entity_type`, `offer_id`, `metadata`.

Ademas `chatRepository.sendMessage()` no crea `chat_message_received`, aunque el enum y docs lo contemplan.

Por que importa:

Los red dots y unread-first sorting no migran 1:1. Con multiples company members, un boolean `read` por evento no sirve.

Recomendacion:

Mantener local simple si se quiere, pero crear plan de migracion claro: generar `activity_events`, generar `activity_reads` por perfil y decidir si chat crea activity en MVP o queda fuera.

Tipo: correccion tecnica/product scope.

### H11. Company search bloquea nuevos direct offers despues de estados terminales

Severity: High

Archivos implicados:
- `src/state/useCompanyDashboard.ts`
- `app/company/search.tsx`
- `docs/DATA_MODEL_V2.md`

Que ocurre:

`hasSentRequest(technicianId)` devuelve true si existe cualquier request para ese tecnico, sin mirar estado. Por eso la busqueda general puede ocultar el boton de enviar aunque el direct offer anterior este `rejected`, `expired` o `withdrawn`.

Por que importa:

Los docs dicen que se puede enviar una nueva oferta despues de un rechazo y que solo se debe bloquear duplicado activo/pending.

Recomendacion:

Cambiar la condicion a active statuses (`pending`, posiblemente `accepted`) y no a "cualquier historial".

Tipo: corregir codigo.

### H12. `USER_FLOWS_V2.md` mezcla `verificationStatus = blocked` con `profiles.status = blocked`

Severity: Medium

Archivos implicados:
- `docs/USER_FLOWS_V2.md`
- `docs/DATA_MODEL_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/RLS_PLAN_V2.md`

Que ocurre:

El flujo admin dice que puede setear `verificationStatus` a `verified`, `rejected` o `blocked`. Pero `blocked` pertenece a `profiles.status`, no a `verification_status`.

Por que importa:

Puede llevar a UI o RLS incorrecto. El enum SQL no acepta `blocked` en `verification_status`.

Recomendacion:

Actualizar docs y UI admin para diferenciar:

- `verification_status`: `pending | verified | rejected`
- `profiles.status`: `pending_verification | active | blocked | suspended`

Tipo: corregir docs y posiblemente UI admin futura.

## 4. V1 / legacy leftovers

### Restos V1 que aun existen

| Rest V1 | Donde | Afecta ahora | Recomendacion |
|---|---|---|---|
| `MatchRequest` / `MatchRequestStatus` / status `sent` | `src/types/matchRequest.ts`, `src/utils/v2CompatAdapters.ts`, dashboard hooks, algunas pantallas admin/company/technician | Si, por adapters y metricas | Aislar o migrar antes de Supabase |
| Repos V1 | `src/repositories/technicianRepository.ts`, `src/repositories/companyRepository.ts`, `src/repositories/matchRequestRepository.ts`, `src/repositories/documentRepository.ts` | Parcial | Mantener solo si hay pantallas activas, luego borrar |
| Seeds V1 | `src/data/technicians.json`, `src/data/companies.json`, `src/data/matchRequests.json`, `src/data/documents.json` | Si, `localDatabase.ts` los sigue sembrando para compat | No migrar a Supabase; usar seeds V2 o mapping |
| `SafeTechnicianView` | `src/types/technician.ts`, `app/company/search.tsx`, map, componentes legacy | Si | Migrar a `SafeTechnicianPreview` / `UnlockedTechnicianView` |
| `fullName` | `app/technician/profile.tsx`, `app/technician/index.tsx`, admin cards, compat adapter | Si | Reemplazar por `firstName` + `lastName` solo en vistas desbloqueadas/admin |
| `companyName`, `contactEmail` | `src/types/company.ts`, `app/company/index.tsx`, `app/company/profile.tsx`, admin components | Si | Usar `CompanyProfile.name` / `email` en V2 |
| `specialties` | `src/constants/specialties.ts`, `src/constants/index.ts`, `app/technician/profile.tsx`, `useTechnicianDashboard` | Si, afecta completitud/perfil | Borrar o aislar como deprecated |
| `yearsExperience` plano | `app/technician/profile.tsx`, dashboards, cards, compat adapter | Si | Sustituir por `technician_aircraft_experience` |
| `matching.ts` V1 | `src/utils/matching.ts` | Potencial | No usar en V2; marcar/eliminar |
| Rutas legacy | `app/company/requests.tsx`, `app/technician/requests.tsx`, `app/company/team.tsx` | Bajo, redirigen | Mantener temporalmente para deep links o borrar antes de produccion |
| Repair de seeds antiguos | `src/storage/localDatabase.ts` | Bajo | Mantener solo mientras haya usuarios locales con AsyncStorage viejo |

### Notas

- Los restos V1 son tolerables en demo, pero aumentan mucho el riesgo de Supabase porque mezclan estados (`sent` vs `pending`), campos privados (`fullName`) y modelos antiguos.
- `docs/HANDOFF_SUMMARY.md` reconoce deuda V1, pero algunos comentarios dicen que ciertas pantallas ya migraron cuando el codigo aun usa compat.

## 5. MVP simplification opportunities

### S1. Recortar company team para Supabase MVP

Que simplificar:

Mantener team management manual/demo local, pero no exponer en Supabase un flujo donde cualquier company admin pueda crear miembros con cualquier `user_id`.

Por que:

No hay invitaciones ni email onboarding. Lo mas simple y estable es que el admin/plataforma cree usuarios y membresias manualmente.

Recomendacion MVP:

Para V2-S1, crear company members desde admin interno, SQL seed, Supabase dashboard o script controlado. La UI de compania puede mostrar miembros y roles, pero la creacion real puede ser future/manual.

### S2. Quitar scores generales del mapa

Que simplificar:

Eliminar `matchingScore` global del mapa o esconder el mapa de MVP si no es core.

Por que:

El matching correcto es oferta + tecnico. El mapa introduce un segundo algoritmo local que no migra bien.

Recomendacion MVP:

Mapa como exploracion sin score o solo con "select offer to calculate match".

### S3. Unificar historial de aplicaciones

Que simplificar:

Separar "Browse Offers" de "My Applications".

Por que:

Discovery depende de ofertas publicadas. Historial debe sobrevivir a cierre/expiracion.

Recomendacion MVP:

Una lista simple de aplicaciones del tecnico con estados, sin automatizaciones.

### S4. No migrar Activity local tal cual

Que simplificar:

Mantener red dots basicos pero migrar directo al modelo `activity_events` + `activity_reads`.

Por que:

El boolean local `read` no funciona para company members multiples.

Recomendacion MVP:

Eventos solo para apply, direct offer, accept/reject y opcionalmente chat. Polling/manual refresh, sin Realtime.

### S5. Mantener documentos simples

Que simplificar:

No agregar `reviewed_by`, audit logs, cron, auto-expiration ni `document_reviews`.

Por que:

Los docs y codigo ya van en direccion simple. Solo falta alinear que ve la compania tras unlock.

Recomendacion MVP:

`status`, `reviewed_at`, `rejection_reason`, `expires_at` opcional. Admin cambia manualmente.

### S6. No llevar V1 seeds a Supabase

Que simplificar:

Crear seeds Supabase limpios desde V2, con UUIDs y mappings.

Por que:

V1 seeds conservan `fullName`, `companyName`, `contactEmail`, `specialties`, `yearsExperience`, `sent`.

Recomendacion MVP:

Congelar V1 solo para demo local y no incluirlo en scripts Supabase.

## 6. Supabase migration blockers

| Blocker | Archivo(s) | Decision/fix requerido |
|---|---|---|
| Privacidad de `technician_profiles` base | `docs/RLS_PLAN_V2.md`, `docs/SUPABASE_SCHEMA_V2.sql` | Quitar acceso de companias a tabla base o documentar GRANTs/view-only |
| Columnas server-owned no protegidas | `docs/RLS_PLAN_V2.md` | RPC/triggers/grants para `role`, `status`, `verification_status`, `identity_revealed`, `documents_unlocked` |
| IDs demo no UUID | `src/data/seeds/*.json`, `docs/SUPABASE_SCHEMA_V2.sql` | Mapping `legacy_id -> uuid` o seeds Supabase nuevos |
| `profiles.id` debe ser `auth.users.id` | `src/data/seeds/profiles.json`, SQL schema | Plan de creacion de auth users y perfiles |
| `VerificationStatus` incluye `unverified` en codigo | `src/types/enums.ts`, `src/constants/verificationStatuses.ts` | Eliminar o aislar fuera de V2 persistido |
| `locationCityId` opcional en TS | `src/types/technician.ts`, `src/types/company.ts`, `src/types/privacy.ts` | Requerirlo en persisted types o usar form drafts separados |
| `GENERAL` aircraft code invalido | `src/repositories/v2/technicianRepositoryV2.ts` | No escribir codigos fuera de catalogo |
| Reapply local vs SQL unique | `app/technician/offers/[id].tsx`, `offerApplicationRepository.ts`, SQL | Decidir una aplicacion por oferta o partial unique/modelo de intentos |
| Offer requirement rows con `id` | requirement seed JSON, SQL | Transformar a PK compuesta y validar duplicados |
| Activity local incompatible | `src/types/activity.ts`, `activityRepository.ts`, docs | Migrar a `activity_events` + `activity_reads` |
| Company member creation manual vs RLS admin insert | `CompanyTeamManagement.tsx`, `companyRepositoryV2.ts`, `docs/RLS_PLAN_V2.md` | Decidir si company admin crea miembros en app o solo admin/plataforma |
| Chat repository permite room sin source si se llama mal | `src/repositories/v2/chatRepository.ts` | Enforce exactly-one source en tipo/repositorio/RPC |
| `SUPABASE_PLAN_V2.md` nombres camelCase como columnas | `docs/SUPABASE_PLAN_V2.md` | Alinear docs Supabase a snake_case |
| Historial tecnico de aplicaciones a ofertas cerradas | `app/technician/offers/index.tsx`, `[id].tsx` | Crear vista historica independiente de ofertas publicadas |

## 7. Validation gaps

`scripts/validateSeeds.js` pasa, pero no cubre todo lo necesario para Supabase. Tambien existe `src/utils/seedValidator.ts`, que valida algunas cosas adicionales, pero el script CLI sigue incompleto.

Gaps recomendados:

- Validar `visible === (status === 'published')` en offers.
- Validar duplicados por PK compuesta para `offer_required_technician_types`, `offer_required_licenses`, `offer_required_aircraft_types`.
- Validar duplicados por `(technician_id, license_code)`, `(technician_id, license_code, aircraft_type_code)`, `(technician_id, aircraft_type_code)`.
- Validar decision de aplicaciones: duplicado absoluto `(technicianId, offerId)` o duplicado activo, segun producto.
- Validar `company_members` one-company-per-user.
- Validar que `company_members.userId` apunte a `profiles.role = company_user`.
- Validar que cada compania tenga al menos un admin.
- Validar que no se pueda borrar/demotar el ultimo admin en seed state.
- Validar que `profiles.role = technician` tenga `technician_profiles` correspondiente y que company users tengan membership.
- Validar que no existan valores TS-only contra SQL enums, especialmente `unverified`.
- Validar catalogos TS vs SQL para `aircraft_types`, `license_categories`, `technician_types`, `company_types`, `contract_types`.
- Validar que ningun runtime repository pueda escribir codigos fuera de catalogo, por ejemplo `GENERAL`.
- Validar que todos los IDs destinados a Supabase son UUID o que hay mapping registrado.
- Validar que `scripts/validateSeeds.js` cubre `offerRequiredTechnicianTypes` y `offerRequiredLicenses`; hoy valida fuerte aircraft requirements, pero no todo el set como el validator TS.
- Validar chat rooms con exactamente una source. El script ya lo hace, pero falta validar duplicado por source.
- Validar que `chat_messages.senderUserId` exista y tenga rol compatible. `src/utils/seedValidator.ts` lo hace; el script CLI deberia hacerlo tambien.
- Validar activity coverage: existe activity para apply/direct offer/accepted/rejected esperados, no solo que las 2 activities actuales apunten a entidades existentes.
- Validar `activity_events` futuro: `entity_type`, `offer_id`, `actor_profile_id`, recipient scope y per-profile reads.
- Validar pending direct offers con oferta cerrada segun regla de visibilidad.
- Validar que accepted records tienen chat y rejected/expired/withdrawn no desbloquean documentos. Esto ya esta parcialmente cubierto y debe mantenerse.

## 8. Recommended fix order

1. Bloquear el diseno de privacidad Supabase: tabla base `technician_profiles`, view/RPC, grants y column restrictions.
2. Definir estrategia de IDs UUID y seeds Supabase separados o mapping desde IDs demo.
3. Alinear TS enums y required fields con SQL: `VerificationStatus`, `locationCityId`, `CompanyProfile`, `TechnicianProfile`.
4. Decidir la regla de reapply en `offer_applications` y ajustar SQL/local docs.
5. Corregir matching global del mapa para no mostrar `% match` sin offer.
6. Corregir historial de aplicaciones del tecnico para que no dependa de ofertas publicadas.
7. Alinear documentos desbloqueados: todos los documentos y estados vs solo verificados.
8. Eliminar escritura de `GENERAL` y otros codigos fuera de catalogo.
9. Migrar o aislar restos V1 que aun influyen en pantallas activas: `MatchRequest`, `SafeTechnicianView`, `fullName`, `companyName`, `contactEmail`, `specialties`, `yearsExperience`.
10. Alinear `SUPABASE_PLAN_V2.md` y reports antiguos con schema real, nombres snake_case y conteos actuales.
11. Fortalecer `scripts/validateSeeds.js` con los gaps anteriores.
12. Recien despues, iniciar V2-S1 Supabase Auth con un alcance minimo.

## 9. Decisions needed from product owner

1. Despues de `accepted`, la compania ve todos los documentos y estados, o solo documentos verificados?
2. Un tecnico puede reaplicar a la misma oferta despues de `withdrawn` o `expired`, o MVP permite una sola aplicacion por oferta?
3. En Supabase MVP, los miembros de compania se crean solo por admin/plataforma, o un company admin puede crear miembros desde la UI si ya conoce un `user_id`?
4. El mapa es MVP core? Si no lo es, conviene simplificarlo para no bloquear Supabase.
5. `chat_message_received` entra en activity MVP o se deja fuera hasta una fase posterior?

## 10. Ready for Supabase?

Respuesta: **Almost, but not yet.**

La app local esta runnable y los flujos principales V2 existen, pero recomiendo una fase de fixes antes de empezar Supabase/Auth.

Falta exactamente:

- Cerrar los riesgos RLS criticos de privacidad y columnas server-owned.
- Definir mapping/estrategia UUID para seeds y auth users.
- Alinear TypeScript, SQL y docs en enums, required fields y nombres de columnas.
- Resolver inconsistencias de matching, aplicaciones historicas, reapply y documentos desbloqueados.
- Reducir o aislar la deuda V1 que aun afecta pantallas activas.
- Fortalecer validacion de seeds para que falle antes de migrar datos no compatibles.

## Files inspected

Principales archivos inspeccionados directamente o mediante busquedas `rg`:

- `app/company/search.tsx`
- `app/company/index.tsx`
- `app/company/profile.tsx`
- `app/company/team.tsx`
- `app/company/requests.tsx`
- `app/company/offers/index.tsx`
- `app/company/offers/[id].tsx`
- `app/company/offers/new.tsx`
- `app/company/offers/edit.tsx`
- `app/company/applications/index.tsx`
- `app/company/applications/[id].tsx`
- `app/company/chats/index.tsx`
- `app/company/chats/[id].tsx`
- `app/technician/index.tsx`
- `app/technician/profile.tsx`
- `app/technician/documents.tsx`
- `app/technician/requests.tsx`
- `app/technician/offers/index.tsx`
- `app/technician/offers/[id].tsx`
- `app/technician/direct-offers/index.tsx`
- `app/technician/direct-offers/[id].tsx`
- `app/technician/chats/index.tsx`
- `app/technician/chats/[id].tsx`
- `app/admin/index.tsx`
- `app/admin/technicians.tsx`
- `app/admin/companies.tsx`
- `app/admin/documents.tsx`
- `app/admin/offers.tsx`
- `app/admin/requests.tsx`
- `app/map.tsx`
- `app/settings.tsx`
- `src/storage/localDatabase.ts`
- `src/state/SessionContext.tsx`
- `src/state/useCompanyDashboard.ts`
- `src/state/useTechnicianDashboard.ts`
- `src/state/useAdminDashboard.ts`
- `src/state/useTechnicianSearch.ts`
- `src/state/useMapTechnicians.ts`
- `src/repositories/v2/companyRepositoryV2.ts`
- `src/repositories/v2/technicianRepositoryV2.ts`
- `src/repositories/v2/offerRepository.ts`
- `src/repositories/v2/offerRequestRepository.ts`
- `src/repositories/v2/offerApplicationRepository.ts`
- `src/repositories/v2/documentRepositoryV2.ts`
- `src/repositories/v2/chatRepository.ts`
- `src/repositories/v2/activityRepository.ts`
- `src/repositories/technicianRepository.ts`
- `src/repositories/companyRepository.ts`
- `src/repositories/matchRequestRepository.ts`
- `src/types/enums.ts`
- `src/types/technician.ts`
- `src/types/company.ts`
- `src/types/offer.ts`
- `src/types/offerRequest.ts`
- `src/types/privacy.ts`
- `src/types/document.ts`
- `src/types/chat.ts`
- `src/types/activity.ts`
- `src/types/catalog.ts`
- `src/types/matchRequest.ts`
- `src/constants/locationCities.ts`
- `src/constants/aircraftTypes.ts`
- `src/constants/licenses.ts`
- `src/constants/technicianTypes.ts`
- `src/constants/companyTypes.ts`
- `src/constants/contractTypes.ts`
- `src/constants/verificationStatuses.ts`
- `src/constants/specialties.ts`
- `src/utils/privacyV2.ts`
- `src/utils/matchingV2.ts`
- `src/utils/matching.ts`
- `src/utils/v2CompatAdapters.ts`
- `src/utils/offerRelationStateMachine.ts`
- `src/utils/companyPermissionsV2.ts`
- `src/utils/seedValidator.ts`
- `src/components/company/CompanyTeamManagement.tsx`
- `src/components/TechnicianMapLeafletImpl.tsx`
- `src/components/TechnicianCard.tsx`
- `src/components/IncomingRequestCard.tsx`
- `src/components/MatchRequestCard.tsx`
- `src/components/AdminDocumentCard.tsx`
- `src/data/seeds/*.json`
- `src/data/*.json`
- `scripts/validateSeeds.js`
- `docs/MVP_ARCHITECTURE_HANDOFF.md`
- `docs/HANDOFF_SUMMARY.md`
- `docs/DATA_MODEL_V2.md`
- `docs/SUPABASE_PLAN_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/RLS_PLAN_V2.md`
- `docs/IMPLEMENTATION_PHASES_V2.md`
- `docs/USER_FLOWS_V2.md`
- `docs/TYPESCRIPT_TYPES_V2.md`
- `docs/MIGRATION_FROM_DEMO_TO_V2.md`
- `docs/PRODUCT_CONTEXT_V2.md`
- QA/report docs under `docs/V2_*`

## Issue count

| Severity | Count |
|---|---:|
| Critical | 3 |
| High | 11 |
| Medium | 9 |
| Low | 6 |

Recomendacion final: hacer una fase de fixes antes de Supabase. No empezar V2-S1 Auth hasta resolver los 3 Critical y, como minimo, los High que afectan schema/tipos/seeds/privacy/matching.
