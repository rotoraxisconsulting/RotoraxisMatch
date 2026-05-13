# RotoraxisMatch — Claude Context

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

Read these only when needed:
- docs/PRODUCT_CONTEXT.md
- docs/ARCHITECTURE.md
- docs/UI_UX_GUIDELINES.md
- docs/DATA_MODEL.md
- docs/MIGRATION_TO_SUPABASE.md
- docs/TASKS.md

## Working rules

Before major implementation:
1. Inspect relevant files.
2. Explain the plan briefly.
3. Implement in small phases.
4. Keep the app runnable.
5. Do not remove existing functionality without permission.
6. Run available checks before finishing.