# RotoraxisMatch MVP Architecture & Data Model — Clean Handoff

**Date:** 2026-05-27  
**Status:** Local demo complete. Next phase: Supabase/Auth (V2-S1).  
**Audience:** Architect drawing the final MVP schema and relationship diagram.

---

## 1. MVP Product Summary

- **Aviation marketplace.** Connects verified aviation technicians (mechanics, avionics, specialists) with companies (MROs, airlines, helicopter operators, recruiters).
- **Bidirectional matching.** Two independent paths to the same acceptance flow: (A) technicians browse published offers and apply; (B) companies search anonymous profiles and send direct offers.
- **Offer-based matching.** Match scores are always computed for a specific Offer + Technician pair. No global profile score exists. Same technician scores differently for different offers.
- **Privacy by default.** Technician identity (name, email, phone, documents) is locked until an offer is accepted. Before acceptance, companies see only an anonymous profile.
- **Acceptance unlocks atomically.** When either side accepts: identity revealed, documents unlocked, chat room created — all in the same server-side transaction. The frontend only writes `status`; the server does the rest.
- **Chat only after acceptance.** No messaging path exists before an acceptance event. Chat is always tied to an accepted `offer_request` or `offer_application`.
- **Multi-user companies.** A company has multiple users with distinct roles: `admin`, `recruiter`, `viewer`. Role enforcement protects write operations. In the MVP, each company user belongs to one company only; multi-company membership is future scope.
- **Admin is manual.** Admin verifies technicians, companies, and documents manually. No automation for moderation or document review in MVP.

---

## 2. Core Roles

### Technician
Creates a professional profile (licenses, habilitations, aircraft experience, availability). Browses published offers, applies, and receives direct offers from companies. Identity is private by default.

### Company Member
Belongs to a company organization. Publishes job offers, searches anonymous technician profiles, sends direct offers, reviews applications, and accepts or rejects. Company visibility is public.

**Company member roles:**

| Role | Capabilities |
|------|-------------|
| `admin` | All actions + manage team + manage company settings |
| `recruiter` | Browse, publish offers, send direct offers, accept/reject applications, send chat messages |
| `viewer` | Browse only. Cannot publish, send offers, accept/reject, or send chat messages |

### Admin
Platform-level role. Manually verifies technician profiles, company profiles, and uploaded documents. Can block or suspend any user. Has read access to all records. No separate admin table — admin is a `profiles.role` value.

---

## 3. Core User Flows

### A) Technician applies to a published offer

| | |
|---|---|
| **Actor** | Technician |
| **Trigger** | Technician opens a published offer and taps Apply |
| **Records created** | `offer_applications` (status: `pending`) |
| **Final state** | Company sees a new application in their inbox; technician sees "Applied — pending" on the offer card |

### B) Company reviews an application

| | |
|---|---|
| **Actor** | Company (admin or recruiter) |
| **Trigger** | Company opens application detail and taps Accept or Reject |
| **On accept** | `offer_applications.status → accepted`; server trigger sets `identity_revealed = true`, `documents_unlocked = true`; `chat_rooms` row created; `activity_events` row created for technician |
| **On reject** | `offer_applications.status → rejected`; `activity_events` row created for technician; identity and documents stay locked |
| **Final state** | Accepted: identity + admin-verified documents visible to company, chat tab accessible to both. Rejected: technician notified, no change to data access. |

### C) Company sends a direct offer

| | |
|---|---|
| **Actor** | Company (admin or recruiter) |
| **Trigger** | Company finds an anonymous technician in search and sends a direct offer (with optional message and optional linked job offer) |
| **Records created** | `offer_requests` (status: `pending`) |
| **Final state** | Technician sees the offer in their Direct Offers inbox |

### D) Technician accepts or rejects a direct offer

| | |
|---|---|
| **Actor** | Technician |
| **Trigger** | Technician opens direct offer detail and taps Accept or Reject |
| **On accept** | `offer_requests.status → accepted`; server trigger sets `identity_revealed = true`, `documents_unlocked = true`; `chat_rooms` row created; `activity_events` row created for company |
| **On reject** | `offer_requests.status → rejected`; `activity_events` row created for company |
| **Final state** | Accepted: same as flow B outcome. Rejected: company notified, identity locked. |

### E) Chat opens after acceptance

| | |
|---|---|
| **Actor** | Both parties |
| **Trigger** | Either acceptance flow (B or D) completing |
| **Records created** | `chat_rooms` (linked to `offer_applications.id` or `offer_requests.id`); `chat_messages` as parties write |
| **Final state** | Chat tab visible and functional for both parties. Company viewers cannot send messages. |

### F) Admin verifies technicians, companies, and documents

| | |
|---|---|
| **Actor** | Admin |
| **Trigger** | Manual review in admin panel |
| **Records updated** | `technician_profiles.verification_status`, `companies.verification_status`, `documents.status` + `documents.reviewed_at` / `documents.rejection_reason` |
| **Final state** | Verified technician appears in company search. Verified company can publish offers and search. Verified/rejected document status visible to technician and company (when unlocked). |

---

## 4. MVP Tables / Entities

### Auth / Identity

#### `profiles`
**Purpose:** Bridge between Supabase Auth and app roles. One row per authenticated user.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | = `auth.users.id` |
| `role` | enum | `technician` \| `company_user` \| `admin` |
| `status` | enum | `pending_verification` \| `active` \| `blocked` \| `suspended` |
| `created_at` | timestamptz | |

**Relationships:** `1 ── 0..1` `technician_profiles` (if role = technician); `1 ── 0..1` `company_members` in the MVP (if role = company_user).  
**MVP note:** Admin is identified by `role = 'admin'`. No separate admin table. Profile status (`blocked`/`suspended`) cuts off all data access via `is_active_user()` RLS helper.

---

### Technician

#### `technician_profiles`
**Purpose:** Full technician profile. Contains both private identity fields (locked by default) and public professional fields.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `user_id` | UUID FK → profiles.id | |
| `anonymous_code` | TEXT | Generated alias e.g. `TECH-4821`. Always public. |
| `first_name` | TEXT | **Private** — revealed only after acceptance |
| `last_name` | TEXT | **Private** — revealed only after acceptance |
| `email` | TEXT | **Private** — revealed only after acceptance |
| `phone` | TEXT | Optional. **Private** — revealed only after acceptance |
| `birth_date` | DATE | **Private** — only derived `age` (integer) is ever exposed |
| `technician_type` | TEXT FK → technician_types.code | Public |
| `location_city_id` | TEXT FK → location_airports.id | Public. Country, city, base airport, coordinates derived from catalog. |
| `availability` | JSONB | Public. Shape: `{ immediately, available_from, contract_types[] }` |
| `verification_status` | enum | `pending` \| `verified` \| `rejected`. Public. |
| `profile_completeness` | INT | 0–100. Computed. Public. |
| `social_links` | JSONB | Optional. Private → unlocked post-acceptance. |
| `created_at` / `updated_at` | timestamptz | |

**Relationships:** FK to `profiles`, `technician_types`, `location_airports`. Has-many `technician_licenses`, `technician_habilitations`, `technician_aircraft_experience`, `documents`.  
**MVP note:** Companies must never query this table directly. All company-side lookups go through `technician_public_view` (a Postgres view that gates private columns behind `offer_accepted_between()`).

---

#### `technician_licenses`
**Purpose:** Which EASA Part-66 licenses the technician holds.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `technician_id` | UUID FK → technician_profiles.id | |
| `license_code` | TEXT FK → license_categories.code | |
| `issued_at` | DATE | Optional |
| `expires_at` | DATE | Optional |
| `created_at` | timestamptz | |

**Unique constraint:** `(technician_id, license_code)`.

---

#### `technician_habilitations`
**Purpose:** Aircraft type ratings tied to a specific license. Separate from raw experience. A technician can hold a license without any habilitation.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `technician_id` | UUID FK → technician_profiles.id | |
| `license_code` | TEXT FK → license_categories.code | |
| `aircraft_type_code` | TEXT FK → aircraft_types.code | |
| `issued_at` / `expires_at` | DATE | Optional |
| `created_at` | timestamptz | |

**Unique constraint:** `(technician_id, license_code, aircraft_type_code)`.

---

#### `technician_aircraft_experience`
**Purpose:** Logged flight/maintenance experience per aircraft type. Independent of licenses and habilitations.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `technician_id` | UUID FK → technician_profiles.id | |
| `aircraft_type_code` | TEXT FK → aircraft_types.code | |
| `value` | FLOAT | Amount |
| `unit` | enum | `hours` \| `years` |
| `created_at` | timestamptz | |

**Unique constraint:** `(technician_id, aircraft_type_code)`.

---

#### `documents`
**Purpose:** Technician-uploaded verification documents. Locked by default; accessible to companies only after an accepted offer.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `technician_id` | UUID FK → technician_profiles.id | |
| `type` | TEXT | `license` \| `medical` \| `id` \| `training` \| `resume` \| `other` |
| `file_name` | TEXT | Original file name |
| `storage_path` | TEXT | Supabase Storage path: `{technicianId}/{documentId}/{fileName}` |
| `status` | enum | `pending` \| `verified` \| `rejected` \| `expired` |
| `uploaded_at` | timestamptz | |
| `reviewed_at` | timestamptz | Set by admin when changing status; cleared on reset to pending |
| `rejection_reason` | TEXT | Set when status = rejected; cleared on all other transitions |
| `expires_at` | timestamptz | Optional. Stored but not auto-expired in MVP. |

**MVP note:** Admin manually sets status. No `reviewed_by`, no audit log table, no automatic expiration for MVP.

---

### Company

#### `companies`
**Purpose:** Company organization. Public entity — identity is not hidden.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `name` | TEXT | Company display name |
| `location_city_id` | TEXT FK → location_airports.id | Country/city/coordinates derived from catalog |
| `phone` | TEXT | Optional |
| `email` | TEXT | Contact email |
| `company_type` | TEXT FK → company_types.code | |
| `verification_status` | enum | `pending` \| `verified` \| `rejected` |
| `created_at` / `updated_at` | timestamptz | |

**MVP note:** Do not persist duplicate location text fields. Country/city/base airport are read models derived by joining `location_airports`.

---

#### `company_members`
**Purpose:** Links auth users to a company with a role. Company members are created manually for the MVP; there are no self-service invitations, invite links, invitation tokens, or email invite flows.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `company_id` | UUID FK → companies.id | |
| `user_id` | UUID FK → profiles.id | |
| `role` | enum | `admin` \| `recruiter` \| `viewer` |
| `created_at` | timestamptz | |

**Unique constraints:** `(company_id, user_id)` and, for the MVP, `(user_id)` — one membership per user and one company per company user. Multi-company membership is future scope.

---

### Marketplace

#### `offers`
**Purpose:** Job opportunities published by companies. Technicians browse and apply. Companies use them as context for ranking and direct offers.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `company_id` | UUID FK → companies.id | |
| `title` | TEXT | |
| `description` | TEXT | |
| `contract_type` | TEXT FK → contract_types.code | |
| `location_city_id` | TEXT FK → location_airports.id | Canonical FK |
| `location_country` | TEXT | Controlled snapshot from `location_airports` |
| `location_city` | TEXT | Controlled snapshot from `location_airports` |
| `location_base_airport` | TEXT | Controlled snapshot — IATA preferred, falls back to ICAO |
| `min_years_experience` | INT | Default 0 |
| `status` | enum | `draft` \| `published` \| `closed` \| `expired` |
| `visible` | BOOLEAN | true only when published |
| `expires_at` | timestamptz | Optional. Not auto-expired in MVP. |
| `created_at` / `updated_at` | timestamptz | |

**MVP note:** Location snapshot is generated from `location_airports` on create/update. Never edited independently. The snapshot preserves the advertised location if the airport catalog entry ever changes.

---

#### `offer_required_technician_types`
**Purpose:** Which technician types an offer requires (zero rows = any type accepted).

| Field | Notes |
|---|---|
| `offer_id` UUID FK | |
| `technician_type_code` TEXT FK → technician_types.code | |

**PK:** composite `(offer_id, technician_type_code)`.

---

#### `offer_required_licenses`
**Purpose:** Which EASA licenses an offer requires (zero rows = any license accepted).

| Field | Notes |
|---|---|
| `offer_id` UUID FK | |
| `license_code` TEXT FK → license_categories.code | |

**PK:** composite `(offer_id, license_code)`.

---

#### `offer_required_aircraft_types`
**Purpose:** Which aircraft types an offer requires (zero rows = any type accepted).

| Field | Notes |
|---|---|
| `offer_id` UUID FK | |
| `aircraft_type_code` TEXT FK → aircraft_types.code | |

**PK:** composite `(offer_id, aircraft_type_code)`.

---

#### `offer_applications`
**Purpose:** Technician applies to a published offer. One per technician per offer.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `technician_id` | UUID FK → technician_profiles.id | |
| `offer_id` | UUID FK → offers.id | Required |
| `company_id` | UUID | Denormalized from `offers.company_id` for query convenience |
| `status` | enum | `pending` \| `accepted` \| `rejected` \| `expired` \| `withdrawn` |
| `identity_revealed` | BOOLEAN | **READ-ONLY** — set by server trigger on acceptance |
| `documents_unlocked` | BOOLEAN | **READ-ONLY** — set by server trigger on acceptance |
| `cover_note` | TEXT | Optional |
| `created_at` / `updated_at` | timestamptz | |

**Unique constraint:** `(technician_id, offer_id)` — one application per offer, regardless of status. Reapplication after withdrawn/rejected/expired is out of scope for MVP.

---

#### `offer_requests`
**Purpose:** Company sends a direct offer to a specific technician. Optionally linked to a published offer.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `company_id` | UUID FK → companies.id | |
| `technician_id` | UUID FK → technician_profiles.id | |
| `offer_id` | UUID FK → offers.id | Optional — link to a published offer |
| `status` | enum | `pending` \| `accepted` \| `rejected` \| `expired` \| `withdrawn` |
| `identity_revealed` | BOOLEAN | **READ-ONLY** — set by server trigger on acceptance |
| `documents_unlocked` | BOOLEAN | **READ-ONLY** — set by server trigger on acceptance |
| `message` | TEXT | Optional note from company |
| `created_at` / `updated_at` | timestamptz | |

**H11 MVP rule — direct offer duplicate:** Block only active duplicates (status = `pending` or `accepted`) for the same `(company_id, technician_id, offer_id)`. A company may send a new direct offer after `rejected`, `expired`, or `withdrawn`. Do not use a global UNIQUE constraint — use active-only RPC/repository validation. If a partial unique index is added later: `WHERE status IN ('pending', 'accepted')`.

---

### Communication

#### `chat_rooms`
**Purpose:** Created atomically on acceptance. Linked to exactly one source: either an `offer_request` or an `offer_application`.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `offer_request_id` | UUID FK → offer_requests.id | Nullable |
| `offer_application_id` | UUID FK → offer_applications.id | Nullable |
| `technician_id` | UUID FK | Denormalized for RLS |
| `company_id` | UUID FK | Denormalized for RLS |
| `created_at` | timestamptz | |

**Check constraint:** Exactly one of `offer_request_id` / `offer_application_id` must be non-null.  
**Partial unique indexes:** One room per `offer_request_id`, one room per `offer_application_id`.  
**Critical note:** `offer_requests` and `offer_applications` do NOT have a `chat_room_id` column. The FK direction is `chat_rooms → offer_requests/offer_applications`. The room is always found by querying `chat_rooms WHERE offer_request_id = ?` or `WHERE offer_application_id = ?`.

---

#### `chat_messages`
**Purpose:** Messages in a chat room.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `chat_room_id` | UUID FK → chat_rooms.id | |
| `sender_user_id` | UUID FK → profiles.id | The authenticated user — never a company_id or technician_id |
| `sender_company_member_id` | UUID FK → company_members.id | Optional. Present for company messages; null for technician messages |
| `sender_role` | enum | `technician` \| `company` |
| `body` | TEXT | |
| `sent_at` | timestamptz | |

---

### Activity

#### `activity_events`
**Purpose:** Server-created records of significant events. Power red dot badges and unread-first sorting. One event, multiple per-user read records.

| Field | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `type` | enum | See Activity Types in Section 6 |
| `recipient_scope` | enum | `technician` \| `company` |
| `recipient_technician_id` | UUID FK | Set when scope = technician |
| `recipient_company_id` | UUID FK | Set when scope = company |
| `actor_profile_id` | UUID FK → profiles.id | Optional — user that caused the event |
| `entity_type` | enum | `offer_request` \| `offer_application` \| `chat_message` |
| `entity_id` | UUID | ID of the source entity |
| `offer_id` | UUID FK → offers.id | Optional — for offer-grouped badges |
| `metadata` | JSONB | Small display payload. Default `{}` |
| `created_at` | timestamptz | |

**MVP note:** Events are created by server-side SECURITY DEFINER triggers, never by direct client INSERT.

---

#### `activity_reads`
**Purpose:** Marks one event as read by one profile. Keeps read state per-user even when multiple company members share a workspace.

| Field | Type | Notes |
|---|---|---|
| `activity_event_id` | UUID FK → activity_events.id | Composite PK |
| `profile_id` | UUID FK → profiles.id | Composite PK |
| `read_at` | timestamptz | |

---

### Catalogs

All catalog tables use a `code` TEXT primary key for readability in foreign keys. New rows can be added at any time without schema migrations.

#### `technician_types`
Codes: `mechanic`, `avionic`, `sheet_metal_worker`, `painter`, `composite`, `pilot` (stored, inactive in MVP UI).  
Fields: `code` (PK), `label`, `requires_license` (BOOLEAN), `is_active` (BOOLEAN), `sort_order` (INT).

#### `license_categories`
EASA Part-66 codes: `A1`, `A2`, `A3`, `A4`, `B1.1`, `B1.2`, `B1.3`, `B1.4`, `B2`, `B2L`, `B3`, `L`, `C`.  
Fields: `code` (PK), `label`, `category_group` (`A` | `B1` | `B2` | `B3` | `L` | `C`), `sort_order` (INT).

#### `aircraft_types`
33-type MVP catalog: 24 airplanes + 9 helicopters.  
- Airplanes: A220, A318, A319, A320, A321, A330, A340, A350, A380, B737, B747, B757, B767, B777, B787, ATR42, ATR72, Q400, CRJ200, CRJ700, CRJ900, E175, E190, E195  
- Helicopters: H125, H135, H145, S76, S92, B407, B412, AW139, R44  

Fields: `code` (PK), `label`, `manufacturer`, `aircraft_family`, `aircraft_category` (CHECK: `airplane` | `helicopter`), `is_active` (BOOLEAN).

#### `company_types`
Codes: `MRO`, `airline`, `recruitment_agency`, `helicopter_operator`, `other`.  
Fields: `code` (PK), `label`, `sort_order`.

#### `contract_types`
Codes: `permanent`, `long_term`, `short_term`.  
Fields: `code` (PK), `label`, `sort_order`.

#### `location_airports`
**Purpose:** Canonical location catalog. All entities that store a location reference this table via `location_city_id` FK. Country, city, base airport, and coordinates are derived from this catalog — never stored as duplicate free-text on other tables (except for the controlled snapshot on `offers`).

**MVP catalog rule:** Seed/use a curated initial catalog of relevant aviation hubs. This is intentionally not a complete worldwide airport database. New airports can be added later without schema changes.

| Field | Notes |
|---|---|
| `id` TEXT PK | Stable FK e.g. `airport:LEVC` |
| `country_name` TEXT | Display country |
| `city` TEXT | Display city |
| `airport` TEXT | Airport display name |
| `icao` TEXT | Unique ICAO code |
| `iata` TEXT | Optional IATA code |
| `latitude` / `longitude` FLOAT | Map marker coordinates |
| `is_active` BOOLEAN | Allows hiding entries without breaking old FKs |

---

## 5. Relationship Map

```
profiles 1 ── 0..1 technician_profiles
profiles 1 ── 0..1 company_members (MVP)

companies 1 ── N company_members
companies 1 ── N offers
companies 1 ── N offer_requests

technician_profiles 1 ── N technician_licenses
technician_profiles 1 ── N technician_habilitations
technician_profiles 1 ── N technician_aircraft_experience
technician_profiles 1 ── N documents
technician_profiles 1 ── N offer_applications
technician_profiles 1 ── N offer_requests

offers 1 ── N offer_required_technician_types
offers 1 ── N offer_required_licenses
offers 1 ── N offer_required_aircraft_types
offers 1 ── N offer_applications
offers 0..1 ── N offer_requests           (offer_id is optional on offer_requests)

offer_applications 1 ── 0..1 chat_rooms   (chat_rooms.offer_application_id FK)
offer_requests     1 ── 0..1 chat_rooms   (chat_rooms.offer_request_id FK)

chat_rooms 1 ── N chat_messages

offer_applications 1 ── N activity_events (entity_type = 'offer_application')
offer_requests     1 ── N activity_events (entity_type = 'offer_request')
chat_messages      1 ── N activity_events (entity_type = 'chat_message')

activity_events 1 ── N activity_reads

technician_types  ←── technician_profiles.technician_type
technician_types  ←── offer_required_technician_types.technician_type_code
license_categories ←── technician_licenses.license_code
license_categories ←── technician_habilitations.license_code
license_categories ←── offer_required_licenses.license_code
aircraft_types    ←── technician_habilitations.aircraft_type_code
aircraft_types    ←── technician_aircraft_experience.aircraft_type_code
aircraft_types    ←── offer_required_aircraft_types.aircraft_type_code
company_types     ←── companies.company_type
contract_types    ←── offers.contract_type
location_airports ←── technician_profiles.location_city_id
location_airports ←── companies.location_city_id
location_airports ←── offers.location_city_id
```

**FK direction for chat rooms** (critical for diagram):  
`chat_rooms.offer_request_id → offer_requests.id`  
`chat_rooms.offer_application_id → offer_applications.id`  
NOT the reverse. `offer_requests` and `offer_applications` have no `chat_room_id` column.

---

## 6. Status Models

### `user_status` (on `profiles`)
| Value | Meaning |
|---|---|
| `pending_verification` | Account created, awaiting admin review |
| `active` | Fully operational |
| `blocked` | Permanently blocked — all data access denied |
| `suspended` | Temporarily suspended — all data access denied |

### `verification_status` (on `technician_profiles`, `companies`)
| Value | Meaning |
|---|---|
| `pending` | Awaiting admin review |
| `verified` | Approved — technician appears in company search; company can publish offers |
| `rejected` | Rejected by admin |

### `document_status` (on `documents`)
| Value | Meaning |
|---|---|
| `pending` | Uploaded, awaiting admin review |
| `verified` | Confirmed valid by admin |
| `rejected` | Rejected by admin (reason stored in `rejection_reason`) |
| `expired` | Manually marked expired by admin (not auto-set in MVP) |

### `offer_status` (on `offers`)
| Value | Meaning |
|---|---|
| `draft` | Not visible to technicians |
| `published` | Visible to technicians (`visible = true`) |
| `closed` | Manually closed by company; no longer discoverable |
| `expired` | Past `expires_at`; handled manually in MVP |

### `offer_request_status` (shared by `offer_requests` and `offer_applications`)
| Value | Meaning | Allowed next states |
|---|---|---|
| `pending` | Awaiting response | accepted, rejected, expired, withdrawn |
| `accepted` | Terminal — unlocks identity, documents, chat | — |
| `rejected` | Terminal — counterparty notified, data stays locked | — |
| `expired` | Terminal — set server-side (manual in MVP) | — |
| `withdrawn` | Terminal — voluntary cancellation by initiating party | — |

`expired` and `withdrawn` do NOT create a `rejected` activity event.

### `company_member_role` (on `company_members`)
| Value | Write access |
|---|---|
| `admin` | Full — team, settings, offers, acceptance, chat |
| `recruiter` | Offers, send direct offers, accept/reject, chat |
| `viewer` | Read only — no write actions |

### Activity event types (`activity_events.type`)
| Type | Recipient |
|---|---|
| `application_received` | Company |
| `application_accepted` | Technician |
| `application_rejected` | Technician |
| `direct_offer_received` | Technician |
| `direct_offer_accepted` | Company |
| `direct_offer_rejected` | Company |
| `chat_message_received` | Both (one event per recipient scope) — **local demo only; not Phase 1 Supabase MVP** |

---

## 7. Privacy Rules

### Before acceptance
Company sees (via `technician_public_view`):
- `anonymous_code` — generated alias, never the real name
- `age` — derived integer, never raw `birth_date`
- `country`, `city`, `base_airport` — derived from `location_airports`
- `technician_type`, `licenses`, `habilitations`, `aircraft_experience`, `availability`
- `verification_status`
- Match score — only when computing `calculateOfferTechnicianMatch(offer, technician)` in an offer context

Company does NOT see:
- `first_name`, `last_name`, `email`, `phone`, `birth_date`, `social_links`
- Documents (list or file URLs)

### After acceptance
Automatically unlocked (server-side, atomically):
- Full identity: `first_name`, `last_name`, `email`, `phone`, `social_links`
- Admin-verified documents only (status = `verified`). Pending, rejected, and expired documents are not included.
- Chat room and chat messages

### Source of truth for unlock

```
identity_revealed = (status = 'accepted')
documents_unlocked = (status = 'accepted')
chat_room exists = (status = 'accepted')
```

The `identity_revealed` and `documents_unlocked` boolean fields on `offer_requests` / `offer_applications` exist as convenience read columns. They are set exclusively by the server-side trigger `handle_offer_relation_status_transition()` and must never be written directly by the frontend.

**RLS must enforce this independently.** The privacy gate in application code (`isUnlocked()`, `canRevealIdentity()`) is not a substitute for RLS and column-level view enforcement.

### Company query rule
Companies must never query `technician_profiles` directly. All company-side technician queries go through the Postgres view `technician_public_view`, which uses `CASE WHEN offer_accepted_between(my_company_id(), tp.id)` to expose private fields conditionally. Bypassing the view is a privacy violation.

### Frontend DTO boundary

The React/Expo code uses TypeScript DTO types to prevent accidental private-field access. These types are **not** the security boundary — they are a compile-time developer guardrail.

| DTO type | Maps to Supabase | Private fields? |
|---|---|---|
| `SafeTechnicianPreview` / `TechnicianPublicPreviewDTO` | `technician_public_view` row | None — excluded by view |
| `UnlockedTechnicianView` / `TechnicianUnlockedDTO` | `get_unlocked_technician()` RPC result | Identity + docs — only after acceptance |
| `TechnicianProfile` / `TechnicianWithRelations` | Direct SELECT on `technician_profiles` | All fields — technician owner + admin only |

**Rule: Frontend DTOs are not the security boundary. Supabase view/RPC/RLS is the security boundary. DTOs only prevent accidental misuse in React code.**

Company-facing screens must only consume the DTO types — never `TechnicianProfile` or `TechnicianWithRelations`. The single entry-point is `technicianRepositoryV2.getViewForCompany()` (local demo) or `get_unlocked_technician()` RPC (Supabase).

### Server-owned fields

The following fields must **never** be written directly by ordinary frontend users (technician or company). They are either set by auth triggers, admin-only RLS, or server-side SECURITY DEFINER triggers:

| Field | Table | Set by | Notes |
|-------|-------|--------|-------|
| `role` | `profiles` | Auth trigger on registration | Admin may change via admin-only UPDATE policy |
| `status` | `profiles` | Admin block/suspend flows | Not user-editable |
| `verification_status` | `technician_profiles` | Admin only | Covered by `is_admin()` RLS — no RPC needed |
| `verification_status` | `companies` | Admin only | Covered by `is_admin()` RLS — no RPC needed |
| `identity_revealed` | `offer_requests` / `offer_applications` | `handle_offer_relation_status_transition()` trigger | Frontend only writes `status` via RPC |
| `documents_unlocked` | `offer_requests` / `offer_applications` | Same trigger | Same boundary |
| `chat_rooms` (creation) | `chat_rooms` | Same trigger | No client INSERT policy |
| `activity_events` (creation) | `activity_events` | SECURITY DEFINER trigger functions | No client INSERT policy |

**Local demo behavior:** In the local demo, `useAdminDashboard` writes `verificationStatus` directly via `technicianRepositoryV2.update()` — this is intentional admin-only behavior. When Supabase is live, this write is protected by the `is_admin()` RLS policy.

---

## 8. Matching Rules

- **No global technician score.** `matching_score` is not a column on `technician_profiles`. It is never stored.
- **Match score is always Offer + Technician.** Computed dynamically: `calculateOfferTechnicianMatch(offer, technician) → MatchScore`. The `MatchScore` always carries `offerId` + `technicianId` so its context is explicit.
- **Same technician, different scores.** A technician can score 90% for one offer and 30% for another.

### Scoring criteria (maximum 100 points)

| Criterion | Points |
|---|---|
| `verification_status = verified` | +25 |
| At least one habilitation matches required aircraft types | +25 |
| At least one license matches required licenses | +20 |
| Availability `contract_types` includes offer's `contract_type` | +15 |
| Total aircraft experience years ≥ `min_years_experience` | +10 |
| Same `location_city_id`, city, or base airport as offer | +5 |

Match labels: 80–100 Excellent · 60–79 Strong · 40–59 Partial · <40 Low.

### UX labels
- Company (offer-centric): **"X% match for this offer"**
- Technician (browsing offers): **"X% match with your profile"**
- Company (general search, no offer selected): **"Select an offer to calculate match"** — no score shown

**Rule: never display a match % without knowing which offer it belongs to.**

---

## 9. Offer Visibility vs History

**Core principle:** Offer visibility controls discovery, not history.

| Scenario | Rule |
|---|---|
| Technician browses offers | Only `status = published` AND `visible = true` offers appear |
| Offer closes or expires | Existing `offer_applications` and `offer_requests` are NOT deleted or hidden |
| Application status | Always visible to technician and company regardless of offer lifecycle |
| Accepted application | Chat room and identity access persist even if the linked offer closes |
| Pending direct offer + offer now closed | Hidden from actionable technician list; shows "Offer closed" banner in detail view; Accept disabled |
| Accepted direct offer + offer now closed | Always shown — the accepted relationship (identity, documents, chat) is established and must persist |
| Admin / company history | Always returns all records via `getAll` / `getForCompany` |

**Implementation boundary:**
- `offer.visible = true AND offer.status = 'published'` → discoverable
- `offer_requests.getForTechnician()` → hides only `pending` requests whose linked offer is inactive
- `offer_applications.getForTechnician()` → returns all applications regardless of offer status
- Records are never physically deleted

**Technician screens by purpose:**
- `/technician/offers` (Browse Offers) — discovery only; calls `getOfferMatchesForTechnician()` which returns published/visible offers ranked by match
- `/technician/applications` (My Applications) — history; calls `getForTechnician()` which returns all applications regardless of offer status; a closed offer does not remove this record

---

## 10. Document Review — MVP

### Fields

| Field | Set when | Cleared when |
|---|---|---|
| `status` | Admin changes it | — |
| `uploaded_at` | Document created | — |
| `reviewed_at` | Admin changes status | Reset to pending |
| `rejection_reason` | Status becomes rejected | All other transitions |
| `expires_at` | Stored at upload (for licenses) | — (not auto-cleared) |

### MVP constraints
- Admin manually changes `status` from the admin panel.
- **No automatic expiration** — `expires_at` is stored but the status is not changed automatically in MVP.
- **No `reviewed_by`** — reviewer identity is not tracked in MVP.
- **No audit log** — no `document_reviews` table in MVP.
- **No `document_reviews` table** in MVP.
- Technicians can read their own documents including `rejection_reason`.
- Companies can read **only verified** document metadata and file URLs (`status = 'verified'`) when `documents_unlocked = true` in an accepted offer record. Pending, rejected, and expired documents remain technician/admin-only.
- Storage: Supabase private bucket `technician-documents`. Path: `{technicianId}/{documentId}/{fileName}`. Signed URLs generated server-side only when access is authorized.

---

## 11. Activity / Unread — MVP

### Model

Two tables:
- **`activity_events`** — what happened. One canonical event per occurrence.
- **`activity_reads`** — which `profile_id` has seen it. Separate from the event so multiple company members each get their own read state.

### No notification center in MVP
Only red dot badges (count of unread events). Implemented by querying `activity_events` minus rows present in `activity_reads` for the current `auth.uid()`.

```sql
-- Unread events for current user
SELECT ae.*
FROM activity_events ae
LEFT JOIN activity_reads ar
  ON ar.activity_event_id = ae.id AND ar.profile_id = auth.uid()
WHERE ar.activity_event_id IS NULL
  AND (
    (ae.recipient_scope = 'technician' AND ae.recipient_technician_id = my_technician_id())
    OR
    (ae.recipient_scope = 'company' AND ae.recipient_company_id = my_company_id())
  );
```

### Required events for MVP

| Event type | Created by | Recipient |
|---|---|---|
| `application_received` | Technician applying | Company |
| `application_accepted` | Company accepting | Technician |
| `application_rejected` | Company rejecting | Technician |
| `direct_offer_received` | Company sending offer | Technician |
| `direct_offer_accepted` | Technician accepting | Company |
| `direct_offer_rejected` | Technician rejecting | Company |
| `chat_message_received` | Either party sending | Other party — **future scope; not Phase 1** |

All events are created by server-side SECURITY DEFINER triggers — never by direct client INSERT.

### Local demo compatibility
The demo uses a simplified `ActivityItem` (flat record with `read: boolean`). Supabase MVP replaces this with `activity_events` + `activity_reads`.

**Local ActivityItem is demo-only.** The Supabase model is `activity_events` + `activity_reads`. The local `read: boolean` field is not the production model — production uses per-profile read state in `activity_reads` so that multiple company members each have independent read state.

### MVP Phase 1 event types
These are the only activity events required for the first Supabase migration:
- `application_received`, `application_accepted`, `application_rejected`
- `direct_offer_received`, `direct_offer_accepted`, `direct_offer_rejected`

`chat_message_received` is local-demo-only and future scope. Replace with Supabase Realtime or a polling mechanism post-launch. No notification center in MVP — only red-dot badges computed from unread event counts.

---

## 12. RLS Summary

Full SQL policies are in `docs/RLS_PLAN_V2.md`. These are the high-level rules.

**Default:** All tables have RLS enabled. Default deny. No implicit access.

**Blocking:** A `blocked` or `suspended` profile fails `is_active_user()`. All policies requiring this function deny access automatically.

| Table | Technician | Company (active, verified) | Admin |
|---|---|---|---|
| `profiles` | Read/update own | — | Read/update all |
| `technician_profiles` (public fields) | Read/update own | Read via `technician_public_view` | Read all |
| `technician_profiles` (private fields) | Read own | Only after accepted offer via view | Read all |
| `technician_licenses` / `habilitations` / `aircraft_experience` | Read/write own | Read | Read all |
| `documents` | Read/write own (all statuses) | Only **verified** docs if `documents_unlocked = true` in accepted offer | Read/update all |
| `companies` | — | Read verified companies | Read/update all |
| `company_members` | — | Read own company; admin: write | Read/update all |
| `offers` | Read published | Read published + own drafts; admin/recruiter: write | Read/update all |
| `offer_requests` | Read/update own (accept/reject) | Read/write own company's | Read all |
| `offer_applications` | Read/write own | Read/update own company's | Read all |
| `chat_rooms` | Read own | Read own company's | Read all |
| `chat_messages` | Read/write own rooms | Read own; recruiter/admin: write | Read all |
| `activity_events` | Read own recipient events | Read own company events | Read all |
| `activity_reads` | Read/write own markers | Read/write own markers | Read all |

**Server-side-only writes (frontend must never write these directly):**
- `offer_requests.identity_revealed` and `documents_unlocked` — trigger only
- `offer_applications.identity_revealed` and `documents_unlocked` — trigger only
- `chat_rooms` (all fields) — trigger creates the room on acceptance
- `activity_events` (all fields) — SECURITY DEFINER function/trigger

**RPC pattern:** The frontend calls `transition_offer_request_status(id, next_status)` or `transition_offer_application_status(id, next_status)`. The RPC validates the transition, updates `status`, and atomically triggers all side effects (identity reveal, document unlock, chat room creation, activity event) in the same transaction.

**Key Postgres view required:**
```sql
-- technician_public_view
-- Used by all company-side technician queries.
-- Exposes private fields only when offer_accepted_between(my_company_id(), tp.id) is true.
```

---

## 13. MVP Out of Scope

These features are explicitly excluded from V2-S1 (first Supabase release). Do not implement or block on them.

| Feature | Why deferred |
|---|---|
| Supabase Realtime (live badge updates) | Polling `activity_events` is sufficient for MVP |
| Push notifications | Mobile infra complexity; add post-launch |
| Email notifications | Resend/SMTP integration; add after user validation |
| Automatic offer expiration (`expire_offers` cron) | Manual admin close is sufficient for MVP scale |
| Automatic document expiration | Same — admin sets `expired` status manually |
| Advanced audit logs | No `document_reviews` table, no `reviewed_by` field |
| Payments / billing | Out of product scope for V1 |
| Advanced analytics (views, applications per offer) | Post-launch instrumentation |
| `pilot` technician type (active in UI) | Type stored, marked inactive — activate when product is ready |
| Company invitation flow (self-service) | Members are created manually; invite links/tokens/email deferred |
| Multi-company membership | One company per company user in MVP; company switching/context selector deferred |
| Complete worldwide airport database | Curated `location_airports` catalog is enough for MVP; add airports on demand |
| Document file preview in-app | Signed URLs for download are sufficient for MVP |
| Supabase Realtime for chat | Polling or manual refresh for MVP chat |

---

## 14. Confirmed MVP Decisions

### 1. Company member creation for Supabase
**Confirmed MVP choice:** Company members are created manually with a `user_id` and `role`. No self-service invite flow. No invite links, invitation tokens, Resend/email invite flow, or self-service company member onboarding.  
**Why:** Invite links require token generation, email sending, and link validation — significant scope. Manual member creation is simpler and adequate for early clients.

### 2. One company per company user
**Confirmed MVP choice:** One company per company user/admin. The RLS helper `my_company_id()` may assume one primary company and use `LIMIT 1`.  
**Why:** Multi-company membership complicates RLS, session context, and UI (which company am I acting as?). Multi-company membership and company switching are future scope.

### 3. Location catalog seeding scope
**Confirmed MVP choice:** Seed/use a curated initial `location_airports` catalog covering relevant aviation hubs. It is intentionally not a complete global airport database.  
**Why:** Full world coverage is thousands of rows. Curated catalog is faster to seed, cheaper to maintain, and sufficient for early users. Add on demand.

### 6. Local demo seeds are NOT Supabase seeds
**Confirmed MVP choice:** The local demo JSON files (`src/data/seeds/*.json`) are for local AsyncStorage/demo mode only. They use human-readable IDs (`tech-001`, `comp-001`, `prof-t001`, etc.) that are intentionally not UUIDs.

**Supabase starts clean:**
- Run `docs/SUPABASE_SCHEMA_V2.sql` (enums + domain tables + catalog INSERTs only)
- Run `docs/V2_S1_ADMIN_BOOTSTRAP_SQL.sql` to create the first admin profile row
- All real user IDs come from `auth.users.id` (Postgres-generated UUIDs)
- Never import or replay the local JSON demo seeds into Supabase

**Why:** Local seeds are designed for readability during local development. Their non-UUID IDs would violate Postgres UUID column constraints. Supabase users register via Auth and get proper UUID-based IDs from day one. The `DEMO_*` constants (`DEMO_COMPANY_ID`, `DEMO_TECHNICIAN_ID`, `DEMO_COMPANY_USER_ID`) are replaced with `auth.uid()` session values during migration.

### 4. Offer requirement tables: composite PK vs. surrogate PK
**Decision:** `offer_required_*` tables use composite PKs `(offer_id, code)` or a separate UUID PK.  
**Recommended MVP choice:** Composite PK `(offer_id, code)`.  
**Why:** These are pure join tables with no independent lifecycle. Composite PK avoids a meaningless surrogate key, enforces uniqueness naturally, and simplifies RLS inheritance from the parent offer.

### 5. Profile completeness calculation
**Decision:** Where and how is `profile_completeness` (0–100) computed on `technician_profiles`?  
**Recommended MVP choice:** Simple server-side function triggered on UPDATE of `technician_profiles`. Checks: technician_type set, location set, at least one license, at least one habilitation, at least one document uploaded, availability set.  
**Why:** The field is displayed in admin and company views. Computing it on-the-fly at query time is expensive if many technicians are returned. Storing as a column with a trigger is simpler for MVP than a materialized view.

---

## 15. Final MVP Architecture Summary

### Core tables (must exist at launch)
`profiles`, `technician_profiles`, `technician_licenses`, `technician_habilitations`, `technician_aircraft_experience`, `documents`, `companies`, `company_members`, `offers`, `offer_required_technician_types`, `offer_required_licenses`, `offer_required_aircraft_types`, `offer_applications`, `offer_requests`, `chat_rooms`, `chat_messages`, `activity_events`, `activity_reads`, `location_airports` + 5 catalog tables.

### What is automated (server-side triggers / SECURITY DEFINER RPCs)
| Automation | Mechanism |
|---|---|
| Acceptance unlocks identity + documents | `handle_offer_relation_status_transition` BEFORE UPDATE trigger |
| Acceptance creates chat room | Same trigger, same transaction |
| Acceptance/rejection creates activity event | SECURITY DEFINER function called by trigger |
| Privacy gate on technician data | `technician_public_view` + `offer_accepted_between()` helper |
| Status transition validation | `assert_offer_relation_transition()` in trigger |
| Duplicate application prevention | DB unique constraint `(technician_id, offer_id)` on `offer_applications` |
| Blocking enforcement | `is_active_user()` RLS helper — returns false for blocked/suspended |

### What stays manual (admin UI)
- Technician profile verification
- Company verification
- Document status review (verified / rejected / expired)
- Offer moderation (close/unpublish offers violating policy)
- User blocking / suspension
- Operational cleanup (expired offers, orphaned records if any)

### What must be protected by RLS (non-negotiable)
- Column-level privacy on `technician_profiles` via `technician_public_view`
- Document access gated on `documents_unlocked = true` in an accepted offer record AND `documents.status = 'verified'`
- Chat room and message access restricted to participants of the accepted relationship
- Activity events restricted to the intended recipient scope
- `identity_revealed`, `documents_unlocked`, `chat_rooms` INSERT — server-side only, no client policies

### What comes after MVP (V2-S2+)
- Supabase Realtime for live chat and badge updates
- Email notifications (offer accepted, profile verified)
- Automatic offer expiration cron (`expire_offers`)
- Company self-service invitation links
- `pilot` technician type activated
- Advanced document audit log
- Match score caching table (`offer_technician_matches`) if query performance requires it
- EAS build + App Store / Play Store release

---

## Ready for Architecture Diagram?

| Check | Status | Notes |
|---|---|---|
| All tables defined | ✅ | 22 domain tables + 6 catalog tables + 1 view |
| All relationships defined | ✅ | Section 5 — including FK direction for chat_rooms |
| All status values defined | ✅ | Section 6 |
| Privacy rules clear | ✅ | Section 7 — view-based, not just boolean flags |
| Matching rules clear | ✅ | Section 8 — no stored score, always Offer+Technician |
| Automated vs manual boundary clear | ✅ | Section 15 |
| Out-of-scope clearly separated | ✅ | Section 13 |
| MVP decisions confirmed | ✅ | Section 14 — three MVP scope decisions are resolved |

**Ready: Yes.**  
**Blocker status before Supabase implementation:** No blocker remains for company member creation, one-company-per-user scope, or `location_airports` seeding scope.
