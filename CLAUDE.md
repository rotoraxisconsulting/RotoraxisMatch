# RotoraxisMatch — Claude Context

> **V2 is the source of truth.** RotoraxisMatch V2 is now the active product definition.
> Read `docs/PRODUCT_CONTEXT_V2.md`, `docs/DATA_MODEL_V2.md`, `docs/USER_FLOWS_V2.md`,
> `docs/SUPABASE_PLAN_V2.md`, and `docs/IMPLEMENTATION_PHASES_V2.md` before any major work.

RotoraxisMatch is a cross-platform aviation technician matching app.

## Product

RotoraxisMatch connects verified aviation mechanics/technicians with aviation companies, MROs, operators, airlines, contractors and recruiters.

The app must run on:
- Web
- Android
- iOS

## Stack

- Expo
- React Native
- TypeScript
- Expo Router
- AsyncStorage
- JSON seed data
- Architecture prepared for future Supabase migration

Do not use yet:
- Supabase
- Firebase
- Stripe
- Paddle
- real auth
- external backend

## Core concept

Technicians create profiles with licenses, aircraft types, specialties, location, coordinates and availability.

Companies search technicians by:
- license
- aircraft type
- specialty
- location
- availability
- verification status
- experience

Technician identity is private by default.

Companies can only see:
- anonymousCode
- country
- city
- baseAirport
- licenses
- aircraftTypes
- specialties
- availability
- yearsExperience
- verificationStatus
- matchingScore

Companies must NOT see:
- fullName
- email
- phone

Identity is revealed only when:

matchRequest.status === "accepted"
AND identityRevealed === true

## Architecture rules

Use a clean architecture:

screens/components
→ stores/hooks/usecases
→ repositories
→ storage adapter

Current storage:
- JSON seed data
- AsyncStorage local persistence

Future storage:
- Supabase Auth
- Supabase Postgres
- Supabase Storage

Do not couple UI directly to AsyncStorage.

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