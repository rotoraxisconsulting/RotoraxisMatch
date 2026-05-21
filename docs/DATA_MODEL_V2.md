# Data Model V2 — RotoraxisMatch

This document is the technical source of truth for the V2 data model.
It explains every entity, its purpose, required vs optional fields, relationships, and design decisions.

---

## Entity overview

```
profiles (auth bridge)
├── technician_profiles
│   ├── technician_licenses        → license_categories (catalog)
│   ├── technician_habilitations   → license_categories + aircraft_types (catalog)
│   ├── technician_aircraft_experience → aircraft_types (catalog)
│   └── documents
│
└── company_members ←→ companies
                         └── offers
                               ├── offer_required_licenses        → license_categories
                               ├── offer_required_aircraft_types  → aircraft_types
                               └── offer_required_technician_types → technician_types

offer_requests (company → technician)  ──→ chat_rooms → chat_messages
offer_applications (technician → offer) ──→ chat_rooms → chat_messages
```

---

## Catalog tables

Catalog tables store reference data that must be editable without a code deployment.
They use a `code` primary key (short string) instead of integer IDs for readability in foreign keys.

### technician_types

Defines the types of aviation professional in the system.

| Field | Type | Notes |
|-------|------|-------|
| code | TEXT (PK) | e.g. `mechanic`, `avionic` |
| label | TEXT | Human-readable label |
| requires_license | BOOLEAN | true for mechanic, avionic |
| is_active | BOOLEAN | false = pilot (standby in V2) |
| sort_order | INT | Display ordering |

Seed values: `mechanic`, `avionic`, `sheet_metal_worker`, `painter`, `composite`, `pilot` (inactive).

### license_categories

EASA Part-66 license categories. Catalog table because new license types can emerge.

| Field | Type | Notes |
|-------|------|-------|
| code | TEXT (PK) | e.g. `B1.1`, `B2` |
| label | TEXT | Full description |
| category_group | TEXT | `A`, `B1`, `B2`, `B3`, `L`, `C` |
| sort_order | INT | |

Seed values: A1, A2, A3, A4, B1.1, B1.2, B1.3, B1.4, B2, B2L, B3, L, C.

### aircraft_types

Aircraft type codes. New types can be added at any time without migrations.

| Field | Type | Notes |
|-------|------|-------|
| code | TEXT (PK) | e.g. `A320`, `EC135` |
| label | TEXT | Full name |
| manufacturer | TEXT | optional |
| aircraft_family | TEXT | narrow_body / wide_body / helicopter / turboprop / piston |
| is_active | BOOLEAN | |

Seeded with ~25 common commercial and helicopter types.

### company_types

| Field | Type | Notes |
|-------|------|-------|
| code | TEXT (PK) | `MRO`, `airline`, `recruitment_agency`, `helicopter_operator`, `other` |
| label | TEXT | |
| sort_order | INT | |

### contract_types

| Field | Type | Notes |
|-------|------|-------|
| code | TEXT (PK) | `permanent`, `long_term`, `short_term` |
| label | TEXT | |
| sort_order | INT | |

---

## Core tables

### profiles

Bridge between Supabase Auth and application-level roles.
One row per authenticated user. id = auth.users.id.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | UUID = auth.users.id |
| role | ✓ | `technician` \| `company_user` \| `admin` |
| status | ✓ | user_status enum, default `pending_verification` |
| created_at | ✓ | |

**user_status values:**
- `pending_verification` — account created, awaiting admin review
- `active` — verified and fully operational
- `blocked` — permanently blocked by admin, no access
- `suspended` — temporarily suspended

**Design decision:** Separating `status` (account-level) from `verification_status` in technician/company (profile-level) allows an account to be blocked even if the profile was previously verified.

---

### technician_profiles

The technician's profile. Contains both private (identity) and public (professional) fields.

| Field | Required | Privacy | Notes |
|-------|----------|---------|-------|
| id | ✓ | — | UUID PK |
| user_id | ✓ | — | FK → profiles.id |
| anonymous_code | ✓ | public | Generated alias, e.g. `TECH-4821` |
| first_name | ✓ | **private** | Hidden until offer accepted |
| last_name | ✓ | **private** | Hidden until offer accepted |
| email | ✓ | **private** | Hidden until offer accepted |
| phone | — | **private** | Hidden until offer accepted |
| birth_date | ✓ | **private** | Date — only derived `age` is exposed |
| technician_type | ✓ | public | FK → technician_types.code |
| country | ✓ | public | |
| city | ✓ | public | |
| base_airport | — | public | ICAO code |
| latitude | — | public | For map |
| longitude | — | public | For map |
| availability | ✓ | public | JSONB (see shape below) |
| verification_status | ✓ | public | verification_status enum |
| profile_completeness | ✓ | public | 0–100 computed |
| social_links | — | private→public | JSONB, unlocked on acceptance |
| created_at | ✓ | — | |
| updated_at | ✓ | — | |

**Availability JSONB shape:**
```json
{
  "immediately": true,
  "available_from": null,
  "contract_types": ["permanent", "long_term"]
}
```

**Why JSONB for availability?** Availability is a small, always-read-together unit. Normalizing it into a separate table adds a join for no benefit in the MVP. It can be refactored later if availability slots become complex.

**Design decision — phone as optional:** Phone is collected if the technician provides it, but it is not required for the profile to be useful. Email is sufficient for initial contact after acceptance.

---

### technician_licenses

Normalized relation between a technician and their held licenses.
A technician without licenses (e.g. sheet_metal_worker) simply has no rows here.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | UUID PK |
| technician_id | ✓ | FK → technician_profiles.id |
| license_code | ✓ | FK → license_categories.code |
| issued_at | — | Date of issue |
| expires_at | — | Expiry date if applicable |
| created_at | ✓ | |

**Unique constraint:** (technician_id, license_code) — one row per license per technician.

---

### technician_habilitations

Aircraft type ratings tied to a specific license. A technician can hold a license without any habilitation.
Experience (hours/years) is stored separately — these two are independent.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| technician_id | ✓ | FK → technician_profiles.id |
| license_code | ✓ | FK → license_categories.code |
| aircraft_type_code | ✓ | FK → aircraft_types.code |
| issued_at | — | |
| expires_at | — | |
| created_at | ✓ | |

**Unique constraint:** (technician_id, license_code, aircraft_type_code).

---

### technician_aircraft_experience

Logged experience per aircraft type. Independent of licenses or habilitations.
A technician may have years of experience on an aircraft for which they hold no formal type rating.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| technician_id | ✓ | FK → technician_profiles.id |
| aircraft_type_code | ✓ | FK → aircraft_types.code |
| value | ✓ | Number (hours or years) |
| unit | ✓ | `hours` \| `years` |
| created_at | ✓ | |

**Unique constraint:** (technician_id, aircraft_type_code) — one experience row per aircraft per technician.

---

### companies

A company is an organization that hires technicians. It is public (identity not hidden).
A company can have multiple users via `company_members`.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| name | ✓ | Company display name |
| country | ✓ | |
| city | ✓ | |
| phone | — | |
| email | ✓ | Contact / admin email |
| company_type | ✓ | FK → company_types.code |
| verification_status | ✓ | verification_status enum |
| created_at | ✓ | |
| updated_at | ✓ | |

---

### company_members

Links auth users to companies with a role. One company can have many members.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| company_id | ✓ | FK → companies.id |
| user_id | ✓ | FK → profiles.id |
| role | ✓ | `admin` \| `recruiter` \| `viewer` |
| created_at | ✓ | |

**Unique constraint:** (company_id, user_id) — a user can only be a member of a company once.

**Role capabilities:**

| Action | admin | recruiter | viewer |
|--------|-------|-----------|--------|
| Browse technicians | ✓ | ✓ | ✓ |
| Browse offers | ✓ | ✓ | ✓ |
| Publish offers | ✓ | ✓ | ✗ |
| Send direct offers | ✓ | ✓ | ✗ |
| Accept/reject applications | ✓ | ✓ | ✗ |
| Send chat messages | ✓ | ✓ | ✗ |
| Manage team | ✓ | ✗ | ✗ |
| Manage company settings | ✓ | ✗ | ✗ |

---

### offers

Job offers published by companies, visible to technicians.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| company_id | ✓ | FK → companies.id |
| title | ✓ | Short title |
| description | ✓ | Full description |
| contract_type | ✓ | FK → contract_types.code |
| location_country | ✓ | |
| location_city | ✓ | |
| location_base_airport | — | |
| min_years_experience | ✓ | Default 0 |
| status | ✓ | `draft` \| `published` \| `closed` \| `expired` |
| visible | ✓ | true only when published |
| expires_at | — | If null, no expiry |
| created_at | ✓ | |
| updated_at | ✓ | |

**Required technician types, licenses, and aircraft types** are stored in three relation tables:
- `offer_required_technician_types`
- `offer_required_licenses`
- `offer_required_aircraft_types`

All three are optional (no requirements = open offer). PK = composite (offer_id + code).

---

### offer_requests

A company sends a direct offer to a specific technician.
Optionally linked to a published offer.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| company_id | ✓ | FK → companies.id |
| technician_id | ✓ | FK → technician_profiles.id |
| offer_id | — | FK → offers.id — optional link |
| status | ✓ | offer_request_status, default `pending` — frontend writes this only |
| identity_revealed | ✓ | **READ-ONLY** — set by trigger on acceptance, never by frontend |
| documents_unlocked | ✓ | **READ-ONLY** — set by trigger on acceptance, never by frontend |
| message | — | Optional note from company |
| created_at | ✓ | |
| updated_at | ✓ | |

**offer_request_status values:** `pending` \| `accepted` \| `rejected` \| `expired` \| `withdrawn`

- `expired` — set server-side when the offer or request expires without a response (never by the frontend)
- `withdrawn` — set by the initiating party (company withdraws a direct offer; technician withdraws an application)

**Design decision — no strict uniqueness on (company, technician):** A company may send a new offer after a rejection. Business logic (not a DB constraint) should prevent sending a duplicate while one is already pending.

---

### offer_applications

A technician applies to a published offer.
The company_id is denormalized for query convenience (avoids joining through offers).

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| technician_id | ✓ | FK → technician_profiles.id |
| offer_id | ✓ | FK → offers.id |
| company_id | ✓ | Denormalized from offers.company_id |
| status | ✓ | offer_request_status, default `pending` — frontend writes this only |
| identity_revealed | ✓ | **READ-ONLY** — set by trigger on acceptance, never by frontend |
| documents_unlocked | ✓ | **READ-ONLY** — set by trigger on acceptance, never by frontend |
| cover_note | — | Optional message |
| created_at | ✓ | |
| updated_at | ✓ | |

**Unique constraint:** (technician_id, offer_id) — one application per offer.

---

### chat_rooms

Created only when an offer_request or offer_application is accepted.
Linked to exactly one source: either an offer_request OR an offer_application.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| offer_request_id | one or other | Nullable FK |
| offer_application_id | one or other | Nullable FK |
| technician_id | ✓ | Denormalized for RLS |
| company_id | ✓ | Denormalized for RLS |
| created_at | ✓ | |

**Check constraint:** Exactly one of offer_request_id / offer_application_id must be non-null.
**Partial unique indexes:** Ensure one chat room per offer_request or offer_application.

---

### chat_messages

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| chat_room_id | ✓ | FK → chat_rooms.id |
| sender_id | ✓ | FK → profiles.id |
| sender_role | ✓ | `technician` \| `company` |
| body | ✓ | Message text |
| sent_at | ✓ | Timestamp |

---

### documents

Technician-uploaded documents. Locked by default — unlocked after offer acceptance.

| Field | Required | Notes |
|-------|----------|-------|
| id | ✓ | |
| technician_id | ✓ | FK → technician_profiles.id |
| type | ✓ | `license` \| `medical` \| `id` \| `training` \| `resume` \| `other` |
| file_name | ✓ | Original file name |
| storage_path | ✓ | Storage path (local for demo, Supabase Storage later) |
| status | ✓ | document_status, default `pending` |
| uploaded_at | ✓ | |
| verified_at | — | Set by admin |
| verified_by | — | FK → profiles.id (admin) |
| expires_at | — | For licenses with expiry |

---

## Status enums (Postgres)

Using Postgres enums for all status fields because they are bounded business logic values that change only with intentional schema migrations.

| Enum | Values |
|------|--------|
| user_status | pending_verification, active, blocked, suspended |
| verification_status | pending, verified, rejected |
| document_status | pending, verified, rejected, expired |
| offer_request_status | pending, accepted, rejected, expired, withdrawn |
| offer_status | draft, published, closed, expired |
| company_member_role | admin, recruiter, viewer |
| app_role | technician, company_user, admin |
| experience_unit | hours, years |
| sender_role | technician, company |

---

## Privacy rules

### Core invariant

Identity and documents are locked by default and unlocked atomically on acceptance.

```
identity_revealed = (status = 'accepted')
documents_unlocked = (status = 'accepted')
chat_room exists = (status = 'accepted')
```

These three transitions happen together, triggered by a **server-side DB trigger** (`handle_offer_accepted`).

> **Frontend rule:** The frontend only writes `status`. It never writes `identity_revealed`, `documents_unlocked`, or creates `chat_rooms`. These are set by the trigger atomically in the same transaction as the status update.

### Company query rule

> **Companies must never query `technician_profiles` directly.**
> All company-side technician queries (search, detail, inbox preview) must go through `technician_public_view`.
> This view enforces column-level privacy using CASE WHEN to expose private fields only when an accepted offer exists between the company and the technician.
> Technicians query their own profile row directly. Admin queries the base table.

### What companies see before acceptance

- anonymous_code, age (derived from birth_date), country, city, base_airport
- technician_type, licenses (codes), habilitations, aircraft experience
- availability, verification_status
- match_score **only in offer context** — computed dynamically via `calculateOfferTechnicianMatch(offer, technician)`, never stored on the profile row

### What companies see after acceptance

Everything above, plus:
- first_name, last_name, email, phone
- social_links
- All documents and their statuses

### Age derivation

`age = floor(years between birth_date and today)`

`birth_date` is never sent to clients. Age is computed server-side (or in app logic) and exposed as an integer.

---

## Matching score V2

**Rule: match scores are computed per Offer + Technician pair. They are never stored on `technician_profiles`.**

`matching_score` is NOT a column on `technician_profiles`. It is calculated dynamically:

```
calculateOfferTechnicianMatch(offer: OfferWithRequirements, technician: TechnicianWithRelations) → MatchScore
```

`MatchScore` always carries `offerId` + `technicianId` so the caller always knows which pair it belongs to.

For future caching (if needed for performance at scale), an `offer_technician_matches` table can be added.
For MVP, always compute dynamically.

### Scoring criteria

| Criterion | Points |
|-----------|--------|
| verification_status = verified | +25 |
| At least one habilitation matches required aircraft types | +25 |
| At least one license matches required licenses | +20 |
| Availability contract_types includes offer contract_type | +15 |
| Total aircraft experience years ≥ min_years_experience | +10 |
| Same city or base_airport as offer location | +5 |
| **Maximum** | **100** |

Match labels:
- 80–100: Excellent match
- 60–79: Strong match
- 40–59: Partial match
- < 40: Low match

### Helpers (src/utils/matchingV2.ts)

- `calculateOfferTechnicianMatch(offer, technician)` — pure function, no I/O
- `getTechnicianMatchesForOffer(offerId)` — all technicians ranked by score for a given offer
- `getOfferMatchesForTechnician(technicianId)` — all published offers ranked by score for a given technician

---

## MVP vs future scope

| Feature | MVP | Future |
|---------|-----|--------|
| Profile completeness calculation | ✓ | |
| Habilitation expiry tracking | ✓ (stored) | Notify on expiry |
| Document expiry | ✓ (stored) | Auto-set expired status |
| Social links visible post-acceptance | ✓ | |
| Pilot technician type | stored, inactive | Activate when ready |
| Availability slots (calendar) | JSONB simple | Normalize if needed |
| Company profile page (public) | ✓ | |
| Multi-language offers | — | i18n layer |
| Offer analytics (views, applications) | — | |
| Email notifications | — | Phase V2-9 |
| Realtime chat | — | Phase V2-9 |
