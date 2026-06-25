# Migration from Demo (V1) to V2 — AviationJobTalent

This document maps current V1 demo code to the V2 data model, identifies what changes, and provides a practical guide for the implementation team.

---

## Current V1 state (demo baseline)

The current app uses:
- JSON seed files in `src/data/`
- AsyncStorage for persistence
- Repositories in `src/repositories/`
- TypeScript types in `src/types/`
- No auth, no backend, no Supabase

V1 entities:
- `Technician` — flat object with `fullName`, `licenseCategories[]`, `aircraftTypes[]`, `specialties[]`
- `Company` — flat object with `companyName`, `contactEmail`, `website`
- `MatchRequest` — simple request with `sent | accepted | rejected` status
- `TechnicianDocument` — `verified | pending | rejected` statuses (no `expired`)
- `Availability` — `status: available | open_to_offers | unavailable` + `contractTypes[]`
- `ContractType` — `permanent | contract | temporary | freelance`

---

## Entity mapping: V1 → V2

### Technician → technician_profiles

| V1 field | V2 field | Change |
|----------|----------|--------|
| `id` | `id` | unchanged |
| `anonymousCode` | `anonymous_code` | snake_case |
| `fullName` | `first_name` + `last_name` | **split** |
| `email` | `email` | unchanged (now private) |
| `phone` | `phone` | unchanged (now private) |
| — | `birth_date` | **new required field** |
| — | `technician_type` | **new required field** (replaces implicit specialties) |
| `country` + `city` + `baseAirport` | `location_city_id` | resolve against `location_airports` catalog |
| `latitude` / `longitude` | derived | coordinates come from `location_airports` |
| `licenseCategories[]` | `technician_licenses` (relation table) | **normalized** |
| `aircraftTypes[]` | `technician_habilitations` (relation table) | **split from experience** |
| `specialties[]` | **removed** | replaced by `technician_type` + `habilitations` |
| `availability.status` | `availability.immediately` (boolean) | **restructured** |
| `availability.contractTypes` | `availability.contract_types` | snake_case |
| `availability.availableFrom` | `availability.available_from` | snake_case |
| `verificationStatus` | `verification_status` | snake_case, same values |
| `profileCompleteness` | `profile_completeness` | snake_case |
| `yearsExperience` | `technician_aircraft_experience` (relation table) | **replaced by per-aircraft experience** |
| — | `social_links` | **new optional field** |

**Key changes:**
- `fullName` is split. V1 seed data must be parsed to produce `first_name` / `last_name`.
- `licenseCategories: string[]` is replaced by a proper relation table `technician_licenses`.
- `aircraftTypes: string[]` is replaced by `technician_habilitations` (tied to a license) and `technician_aircraft_experience` (standalone experience).
- `specialties: string[]` is removed. It is replaced by `technician_type` (which type of technician they are) and `habilitations` (which specific aircraft).
- `yearsExperience: number` (total) is replaced by per-aircraft experience. V1 seeds can map total experience to a default aircraft type, or migrate as a single entry with `unit: 'years'`.
- `availability.status` (`available | open_to_offers | unavailable`) is replaced by `immediately: boolean`. `unavailable` becomes `immediately: false` with no `available_from`.

### License categories: V1 → V2

V1 license codes:
```
A, B1.1, B1.2, B1.3, B1.4, B2, C, D1
```

V2 license codes:
```
A1, A2, A3, A4, B1.1, B1.2, B1.3, B1.4, B2, B2L, B3, L, C
```

**Differences:**
- V1 `A` (generic line maintenance) → V2 splits into `A1`, `A2`, `A3`, `A4`. Seed data using `A` should be migrated to the most appropriate specific code, or default to `A1`.
- V1 `D1` (NDT) is **removed** from V2 license list. NDT technicians should use the appropriate `technician_type` + specialist tag if needed later.
- V2 adds: `B2L`, `B3`, `L`.

### ContractType: V1 → V2

| V1 | V2 |
|----|-----|
| `permanent` | `permanent` |
| `contract` | `long_term` |
| `temporary` | `short_term` |
| `freelance` | `short_term` (closest mapping) |

### Company → companies

| V1 field | V2 field | Change |
|----------|----------|--------|
| `id` | `id` | unchanged |
| `companyName` | `name` | **renamed** |
| `country` + `city` | `location_city_id` | company stores only the catalog FK |
| `website` | **removed** | not in V2 model (can be added later) |
| `companyType` | `company_type` | type values updated (see below) |
| `verificationStatus` | `verification_status` | unchanged values |
| `contactEmail` | `email` | **renamed** |
| — | `phone` | **new optional field** |

**Company type values: V1 → V2**

| V1 | V2 |
|----|-----|
| `airline` | `airline` |
| `mro` | `MRO` (uppercase) |
| `operator` | `helicopter_operator` (closest) or `other` |
| `contractor` | `other` |
| `recruiter` | `recruitment_agency` |

### MatchRequest → offer_requests

V1 `MatchRequest` maps directly to V2 `offer_requests` (company → technician flow).

| V1 field | V2 field | Change |
|----------|----------|--------|
| `id` | `id` | unchanged |
| `companyId` | `company_id` | snake_case |
| `technicianId` | `technician_id` | snake_case |
| `status: 'sent'` | `status: 'pending'` | **renamed** |
| `status: 'accepted'` | `status: 'accepted'` | unchanged |
| `status: 'rejected'` | `status: 'rejected'` | unchanged |
| `identityRevealed` | `identity_revealed` | snake_case |
| `message` | `message` | unchanged |
| `createdAt` | `created_at` | snake_case |
| — | `offer_id` | **new optional field** (link to a published offer) |
| — | `documents_unlocked` | **new field** (default false) |
| — | `status: 'withdrawn'` | **new status value** |
| — | `updated_at` | **new field** |

### TechnicianDocument → documents

| V1 field | V2 field | Change |
|----------|----------|--------|
| `id` | `id` | unchanged |
| `technicianId` | `technician_id` | snake_case |
| `type` | `type` | unchanged |
| `fileName` | `file_name` | snake_case |
| `status` | `status` | adds `expired` |
| `uploadedAt` | `uploaded_at` | snake_case |
| — | `storage_path` | **new** (local path for demo) |
| — | `reviewed_at` | **new optional** — set when admin changes document status |
| — | `rejection_reason` | **new optional** — set when rejected; cleared on all other transitions |
| — | `expires_at` | **new optional** |

---

## What is new in V2 (no V1 equivalent)

| New entity | Purpose |
|-----------|---------|
| `profiles` | Auth bridge (not needed until Supabase phase) |
| `technician_types` catalog | Catalog table for technician type codes |
| `license_categories` catalog | Catalog table replacing hardcoded list |
| `aircraft_types` catalog | Catalog table replacing `aircraftTypes[]` constant |
| `company_types` / `contract_types` | Catalog tables |
| `company_members` | Multi-user company support; MVP keeps one company membership per company user |
| `offers` | Job offers published by companies (new entity) |
| `offer_required_*` tables | Requirements for offers — composite PKs `(offer_id, code)`; local demo rows include a human-readable `id` field that is not in the Supabase schema |
| `offer_applications` | Technician applies to an offer (new flow) |
| `chat_rooms` | Opened on acceptance (new feature) |
| `chat_messages` | Messages in chat room (new feature) |
| `technician_habilitations` | Aircraft type ratings tied to licenses |
| `technician_aircraft_experience` | Per-aircraft experience (replaces `yearsExperience`) |
| `technician_licenses` (table) | Normalized licenses (replaces `licenseCategories[]`) |

---

## What can be kept from the current Expo app

| What | Keep | Notes |
|------|------|-------|
| Expo + Expo Router structure | ✓ | No change needed |
| Theme / colors / typography | ✓ | No change |
| `asyncStorageAdapter.ts` | ✓ | Still used until Supabase phase |
| `localDatabase.ts` | partially | Must be updated for new seed shapes |
| `companyRepository.ts` | partially | Interface kept, implementation updated |
| `technicianRepository.ts` | partially | Interface kept, major field changes |
| `matchRequestRepository.ts` | refactor | Rename to `offerRequestRepository`, update fields |
| `documentRepository.ts` | partially | Add `expired` status, `storagePath` |
| `demoSessionRepository.ts` | ✓ | Unchanged |
| `useTechnicianSearch.ts` hook | partially | Update for new filter shape |
| `useCompanyDashboard.ts` hook | partially | Update for new data shape |
| `useTechnicianDashboard.ts` hook | partially | Update for new data shape |
| `useAdminDashboard.ts` hook | partially | Update for V2 entities |
| `matching.ts` utils | refactor | New scoring algorithm |
| Home screen | ✓ | No change needed |
| Onboarding screen | update | Add technician type selection |
| Admin panel screens | update | V2-8 phase |
| Map screen | ✓ | Minor filter updates |
| UI components | ✓ | Largely reusable |

---

## What must be replaced or added

| What | Action | Phase |
|------|--------|-------|
| `src/types/technician.ts` | Rewrite | V2-1 |
| `src/types/company.ts` | Rewrite | V2-1 |
| `src/types/matchRequest.ts` | Replace with offerRequest.ts | V2-1 |
| `src/types/document.ts` | Update statuses | V2-1 |
| `src/constants/licenses.ts` | Replace with catalog constants | V2-1 |
| `src/constants/aircraftTypes.ts` | Replace with catalog | V2-1 |
| `src/constants/specialties.ts` | Remove | V2-1 |
| `src/data/technicians.json` | Regenerate seeds | V2-1 |
| `src/data/companies.json` | Regenerate seeds | V2-1 |
| `src/data/matchRequests.json` | Regenerate as offerRequests | V2-1 |
| `src/utils/matching.ts` | Update scoring algorithm | V2-1 |
| Add `src/types/offer.ts` | New | V2-1 |
| Add `src/types/chat.ts` | New | V2-1 |
| Add `src/types/catalog.ts` | New | V2-1 |
| Add `src/repositories/offerRepository.ts` | New | V2-2 |
| Add `src/repositories/offerApplicationRepository.ts` | New | V2-3 |
| Add `src/repositories/chatRepository.ts` | New | V2-6 |
| Add `src/repositories/companyMemberRepository.ts` | New | V2-7 |

---

## Seed data migration guide

> **Important:** Local demo seeds (`src/data/seeds/*.json`) are for local AsyncStorage/demo mode only. They use human-readable IDs (`tech-001`, `comp-001`, `prof-t001`, etc.) that are NOT valid Supabase UUIDs. **Do not insert local demo seeds directly into Supabase.** Supabase starts clean — catalog tables only. Real users register via Supabase Auth and get UUID-based IDs from Postgres.

When regenerating JSON seed data for V2:

**Technicians (src/data/technicians.json)**
- Split `fullName` into `firstName` + `lastName`
- Add `birthDate` (invent realistic dates for demo ages 25–55)
- Add `technicianType` based on current licenses/specialties
- Convert `licenseCategories: string[]` to `licenses: TechnicianLicense[]`
- Convert `aircraftTypes: string[]` to `habilitations: TechnicianHabilitation[]`
- Add `aircraftExperience: AircraftExperienceEntry[]` entries
- Map `availability.status` to `availability.immediately` boolean
- Remove `specialties[]`
- Map `ContractType` values (permanent→permanent, contract→long_term, temporary/freelance→short_term)

**Companies (src/data/companies.json)**
- Rename `companyName` → `name`
- Rename `contactEmail` → `email`
- Remove `website`
- Update `companyType` values (mro→MRO, recruiter→recruitment_agency, etc.)

**MatchRequests (src/data/matchRequests.json)**
- Rename to `offerRequests`
- Rename status `sent` → `pending`
- Add `documentsUnlocked: false`

---

## Screens that must change in later phases

| Screen | Change needed | Phase |
|--------|--------------|-------|
| Onboarding | Add technician type selection | V2-1 |
| Technician profile | Add habilitations, experience, birthDate, social links | V2-1 |
| Company search | Update filters for new model | V2-1 |
| Sent requests (company) | Rename to "My Offers Sent" | V2-4 |
| Received requests (technician) | Rename to "Received Offers" | V2-4 |
| Technician detail (post-acceptance) | Show full identity + documents | V2-5 |
| Documents tab | Show locked/unlocked state | V2-5 |
| Add: Job Offers (company) | New screen | V2-2 |
| Add: Browse Offers (technician) | New screen | V2-3 |
| Add: Chat | New screen | V2-6 |
| Add: Company Team | New screen | V2-7 |
| Admin: documents | Add expired status | V2-8 |
| Admin: offers moderation | New section | V2-8 |

---

## Implementation order (Phase V2-1 specific)

Within Phase V2-1 (data model refactor), recommended order to avoid breaking the running app:

1. Add new types files without deleting old ones yet.
2. Update constants (licenses, aircraft types, contract types).
3. Update JSON seed files.
4. Update `localDatabase.ts` to load new seed shapes.
5. Update repositories one at a time.
6. Update privacy utils and matching algorithm.
7. Delete old type files and fix all remaining TypeScript errors.
8. Verify app still launches and demo mode still works.
