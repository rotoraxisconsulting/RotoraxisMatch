# AviationJobTalent — Claude Context

> **V2 is the source of truth.** AviationJobTalent V2 is now the active product definition.
> Read `docs/PRODUCT_CONTEXT_V2.md`, `docs/DATA_MODEL_V2.md`, `docs/USER_FLOWS_V2.md`,
> `docs/SUPABASE_PLAN_V2.md`, and `docs/IMPLEMENTATION_PHASES_V2.md` before any major work.

AviationJobTalent is a cross-platform aviation technician matching app.

## Product

AviationJobTalent connects verified aviation mechanics/technicians with aviation companies, MROs, operators, airlines, contractors and recruiters.

The app must run on:
- Web
- Android
- iOS

## Stack

- Expo
- React Native
- TypeScript
- Expo Router
- Supabase (Postgres + Auth + Storage + Edge Functions) — the active backend, not a future migration target. `src/repositories/v2/*` query Supabase directly (`src/lib/supabase.ts`); real Supabase Auth is wired (`AuthContext`, `/auth/*` screens); RLS is enabled on every table.
- `supabase/migrations/*.sql` — ~28 numbered, idempotent, hand-reviewed migrations (see "Backend / data model notes" below). Never edit an already-applied migration; add a new one.

`src/data/seeds/*.json` and its validator (`scripts/validateSeeds.js`) — pre-Supabase-phase legacy — were deleted 2026-07-27 (Fase 5.3, docs/MISSION_PART66.md): confirmed zero remaining consumers under `src/`/`app/`, and the validator had nothing left to validate once the JSON was gone.

Do not use yet:
- Firebase
- Stripe
- Paddle

## Core concept

Technicians create profiles with licenses, aircraft types, location, coordinates and availability.

Companies search technicians by:
- license
- aircraft type
- location
- availability
- verification status
- experience

Technician identity is private by default.

Companies can only see (contrato V2, alineado con `technician_public_view` y
`SafeTechnicianPreview` — esta lista era la de V1 y estaba desactualizada;
corregida 2026-07-29 tras la auditoría de cierre):
- anonymousCode
- technicianTypes (VARIOS desde la Fase 6 tanda A, migración 048: tabla puente
  `technician_profile_types`. La columna `technician_profiles.technician_type`
  sigue existiendo sin lectores, pendiente de retirada)
- country / city / baseAirport (+ latitude/longitude para el mapa)
- licenses
- habilitations (type ratings EASA célula+motor; el V1 `aircraftTypes` era la
  familia suelta, sin motor)
- aircraftExperience (Fase 6 tanda B, migración 050: aeronaves en las que ha
  trabajado, CON O SIN licencia. Lista separada de `habilitations` — aquélla
  dice que está autorizado a firmar el trabajo, ésta que sabe hacerlo. NO
  puntúa: el scorer no la lee hasta la Tanda E)
- availability
- yearsExperience
- verificationStatus
- matchingScore (calculado por par oferta+técnico, nunca global)

`profileCompleteness` salió de esta lista el 2026-08-10: el porcentaje de
completitud se retiró del producto entero. Un número único sobre ejes
independientes obliga a repartir pesos entre cosas que no se comparan, y
bajaba cuando el técnico declaraba una licencia. Nunca fue un gate. Si hay que
señalar que falta algo, va una lista de "te falta esto", no un porcentaje.
La columna ya no existe: la borró la migración 049.

Companies must NOT see:
- fullName
- email
- phone
- socialLinks
- birthDate
- **age** — retirada del contrato público por decisión del 2026-07-29: es
  característica protegida en normativa laboral europea y mostrarla al
  empleador durante el cribado es riesgo de discriminación, además de
  incoherente con anonimizar el nombre para reducir sesgo. No aporta al
  cribado (licencias, ratings y años de experiencia ya cubren lo relevante).
  ⚠ La vista SQL y los tipos TODAVÍA la exponen: la retirada está pendiente de
  implementación (hallazgo B2 de `docs/FINAL_AUDIT_REPORT.md`). Hasta que se
  complete, esta línea describe el destino acordado, no el estado actual.

Identity is revealed only when:

matchRequest.status === "accepted"
AND identityRevealed === true

El enforcer real es la base de datos, no el TypeScript: `technician_public_view`
anula los 5 campos de identidad con `CASE WHEN offer_accepted_between(...)`, y
RLS impide a una empresa leer `technician_profiles` directamente. El gate de
`privacyV2.ts` es una decisión de UI sobre datos que ya vienen filtrados.

## Architecture rules

Use a clean architecture:

screens/components
→ stores/hooks/usecases
→ repositories
→ storage adapter

Current storage:
- Supabase Postgres (via `src/repositories/v2/*`)
- Supabase Auth
- Supabase Storage (documents)

Do not couple UI directly to Supabase — go through a repository (`src/repositories/v2/*`), never call `src/lib/supabase.ts` from a screen/component/hook directly.

## Backend / data model notes

- **Schema first, code second (expand-contract)**: when a change needs both a migration and code, the migration is applied FIRST, then the code that reads or writes the new shape. Never the reverse. Code that `SELECT`s a column that does not exist yet fails every query against that table — in dev it is a nuisance, in a real deploy it is an outage, and the window lasts until someone remembers to run the migration. Same rule on the way out: stop reading a column in code, ship that, and only then drop it. Recorded 2026-07-29 after `companies.website` (migration 036) was written into the repository selects before the column existed.
- **Migrations**: numbered, additive, idempotent SQL files in `supabase/migrations/`. Never `DROP`/`DELETE`/`TRUNCATE` existing data in a migration; deactivate (`is_active = false`) rather than delete when a catalog row becomes obsolete. `016_part66_ratings_habilitations.sql` is the reference style for a well-commented, idempotent migration (header explaining intent/rationale, explicit backfill logic guarded against double-writes).
- **Catalog tables with a TTL cache**: `aircraft_type_ratings` (EASA Part-66 aircraft-engine type ratings) is read through `src/repositories/v2/catalogRepository.ts`, backed by a dependency-injected, unit-testable TTL cache (`src/repositories/v2/aircraftTypeRatingsCache.ts`) and a shared hook (`src/state/useAircraftTypeRatingsCatalog.ts`) with explicit `loading`/`success`/`empty`/`error` states — never a hardcoded catalog baked into a TypeScript constant. `src/constants/aircraftTypeRatings.ts` holds only types and pure functions that take the loaded catalog/index as an argument.
- **Same-row matching rule** (`src/utils/offerMatchExplain.ts`): a license category and an aircraft/engine rating only ever count as "held together" when they come from the SAME `technician_habilitations` row. Holding a license and separately having an unrelated habilitation must never be combined into a false match. This is a previously-fixed real bug — do not reintroduce it.
- **Matching's business principle**: a technician who holds exactly what an offer requires must score clearly above one who does not, regardless of how good the rest of their profile looks — a missing mandatory qualification is a legal blocker (the technician cannot sign that work), not a minor preference gap. Score design should make that unambiguous, not just directionally true.

## UI/UX rules

The app must feel like a premium B2B SaaS:
- mobile-first
- clean
- professional
- aviation-inspired
- trustworthy
- responsive on web
- cards/lists on mobile
- wider dashboards on web

Avoid generic UI.

## Important docs

V2 docs (source of truth):
- docs/PRODUCT_CONTEXT_V2.md
- docs/DATA_MODEL_V2.md
- docs/USER_FLOWS_V2.md
- docs/SUPABASE_PLAN_V2.md
- docs/IMPLEMENTATION_PHASES_V2.md
- docs/HANDOFF_SUMMARY.md

V2 technical model (read before any implementation):
- docs/TYPESCRIPT_TYPES_V2.md — canonical TypeScript types
- docs/SUPABASE_SCHEMA_V2.sql — Postgres schema with seeds
- docs/RLS_PLAN_V2.md — security / RLS policies
- docs/MIGRATION_FROM_DEMO_TO_V2.md — V1→V2 field mapping and migration guide

## Working rules

Before major implementation:
1. Inspect relevant files.
2. Explain the plan briefly.
3. Implement in small phases.
4. Keep the app runnable.
5. Do not remove existing functionality without permission.
6. Run available checks before finishing.