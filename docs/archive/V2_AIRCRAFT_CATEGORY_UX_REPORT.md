# V2 Aircraft Category UX Report

**Date:** 2026-05-27  
**Scope:** Aircraft catalog alignment + airplane/helicopter category differentiation across all UI screens

---

## Problem

Aircraft types were mixed together everywhere in the app — airplanes and helicopters shared the same unordered chip lists with no visual distinction. The SQL schema used granular codes (`B737CL`, `B737NG`, `DH8D`, `EC135`) that did not match the TypeScript constants (`B737`, `Q400`, `H135`).

---

## Catalog alignment

All files now share one canonical 33-type MVP catalog:

| Category | Count | Types |
|---|---|---|
| Airplanes | 24 | A220, A318, A319, A320, A321, A330, A340, A350, A380, B737, B747, B757, B767, B777, B787, ATR42, ATR72, Q400, CRJ200, CRJ700, CRJ900, E175, E190, E195 |
| Helicopters | 9 | H125, H135, H145, S76, S92, B407, B412, AW139, R44 |

---

## Files modified

### Constants / types

| File | Change |
|---|---|
| `src/constants/aircraftTypes.ts` | Added `aircraftCategory: 'airplane' | 'helicopter'` to every catalog entry; exported `AIRPLANES`, `HELICOPTERS`, `getAircraftCategory`, `isAirplaneType`, `isHelicopterType`, `getAircraftCategoriesForCodes`, `inferAircraftCategory` |
| `src/types/catalog.ts` | Added `AircraftCategory` type; added `aircraftCategory: AircraftCategory` to `AircraftTypeCatalog` interface |

### UI screens

| File | Change |
|---|---|
| `app/company/offers/new.tsx` | Aircraft chip list replaced with Airplanes/Helicopters tabs; tab state defaults to `'airplane'`; cross-tab selection count shown |
| `app/company/offers/edit.tsx` | Same as new.tsx; tab auto-inferred from existing `requiredAircraftTypes` on load |
| `app/technician/profile.tsx` | Aircraft section restructured from manufacturer groups to Airplanes / Helicopters sections |
| `app/technician/offers/index.tsx` | Added aircraft category filter row (All aircraft / Airplanes / Helicopters); added Airplane/Helicopter/Mixed badge on offer cards |
| `app/company/search.tsx` | Replaced per-code aircraft chips with category filter (Any / Airplanes / Helicopters); added category badge on technician result cards; post-filters `results` array |

### Validation

| File | Change |
|---|---|
| `scripts/validateSeeds.js` | Parses `aircraftCategory` from `aircraftTypes.ts`; validates every catalog entry has a category; warns if an offer mixes airplane + helicopter required types |

### Docs

| File | Change |
|---|---|
| `docs/DATA_MODEL_V2.md` | Added `aircraft_category` column to `aircraft_types` table; updated MVP catalog listing to split by category |
| `docs/TYPESCRIPT_TYPES_V2.md` | Added `AircraftCategory` type; added `aircraftCategory` field to `AircraftTypeCatalog` interface |
| `docs/SUPABASE_SCHEMA_V2.sql` | Added `aircraft_category TEXT NOT NULL CHECK (...)` column to `aircraft_types` table; updated INSERT to include `aircraft_category` value for all 33 rows |
| `docs/HANDOFF_SUMMARY.md` | Updated current state description; added V2-cat phase entry |

---

## Helper functions added (`src/constants/aircraftTypes.ts`)

| Function | Returns | Purpose |
|---|---|---|
| `getAircraftCategory(code)` | `AircraftCategory \| null` | Look up category for one code |
| `isAirplaneType(code)` | `boolean` | Guard: is this an airplane? |
| `isHelicopterType(code)` | `boolean` | Guard: is this a helicopter? |
| `getAircraftCategoriesForCodes(codes)` | `Set<AircraftCategory>` | Unique categories across multiple codes |
| `inferAircraftCategory(codes)` | `'airplane' \| 'helicopter' \| 'mixed' \| null` | Infer dominant category; null if empty |

Exported arrays:
- `AIRPLANES` — all catalog entries with `aircraftCategory === 'airplane'`
- `HELICOPTERS` — all catalog entries with `aircraftCategory === 'helicopter'`

---

## QA results

| Check | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `node scripts/validateSeeds.js` | NO ERRORS FOUND — 0 warnings |
| `npx expo export --platform web` | 36 routes bundled |

---

## Matching safety

`inferAircraftCategory` is used for **display and filtering only** — never inside `calculateOfferTechnicianMatch` or `getOfferMatchesForTechnician`. Matching criteria and scores are unchanged.
