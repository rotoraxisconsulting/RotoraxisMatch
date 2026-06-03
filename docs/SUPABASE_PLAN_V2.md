# Supabase Plan V2 — RotoraxisMatch

The local V2 demo is complete. This document is the migration target for the first Supabase/Auth phase. See the **Migration path** section at the bottom for recommended implementation order.

## Auth

Use Supabase Auth with email/password.

Each user in `auth.users` has a role in the app: `technician`, `company_user`, or `admin`.

Store role and profile reference in a `profiles` table.

MVP company users are provisioned manually. Do not add self-service company invitations, invitation tokens, email invite links, Resend emails, or member onboarding flows in V2-S1.

---

## Database tables

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | = auth.users.id |
| role | enum | technician \| company_user \| admin |
| status | enum | pending_verification \| active \| blocked \| suspended |
| createdAt | timestamptz | |

### location_airports
Curated MVP catalog for relevant aviation hubs. This is intentionally not a complete worldwide airport database; new rows can be added later without schema changes.

| Column | Type | Notes |
|--------|------|-------|
| id | text (PK) | Stable FK, e.g. `airport:LEVC` |
| countryName | text | display country |
| city | text | display city |
| airport | text | display airport |
| icao | text | unique |
| iata | text | nullable |
| latitude | float | map marker latitude |
| longitude | float | map marker longitude |
| isActive | boolean | keep false entries for historical references |

### technician_profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| userId | uuid (FK → profiles.id) | |
| anonymousCode | text | generated alias |
| firstName | text | private |
| lastName | text | private |
| email | text | private |
| phone | text | private |
| birthDate | date | private — expose age only |
| technicianType | enum | |
| locationCityId | text (FK → location_airports.id) | country/city/base/coordinates derived from catalog |
| availability | jsonb | Availability shape |
| verificationStatus | enum | |
| profileCompleteness | int | 0–100 |
| socialLinks | jsonb | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

> **Note:** Licenses are normalized in a separate `technician_licenses` relation table (FK → technician_profiles.id + license_categories.code). Do not add a `licenses` array column to this table.

### technician_habilitations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| licenseCategory | enum | |
| aircraftType | text | |
| issuedAt | date | nullable |
| expiresAt | date | nullable |

### technician_aircraft_experience
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| aircraftType | text | |
| value | float | |
| unit | enum | hours \| years |

### companies
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| name | text | |
| locationCityId | text (FK → location_airports.id) | company stores only the canonical location FK |
| phone | text | |
| email | text | |
| companyType | enum | |
| verificationStatus | enum | |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### company_members
Company members are created manually in the MVP. A company can have multiple members, but a company user belongs to only one company. Multi-company membership and company switching are future scope.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| companyId | uuid (FK → companies.id) | |
| userId | uuid (FK → profiles.id) | |
| role | enum | admin \| recruiter \| viewer |
| createdAt | timestamptz | |

MVP constraints: unique `(companyId, userId)` and unique `(userId)`.

### offers
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| companyId | uuid (FK) | |
| title | text | |
| description | text | |
| contractType | enum | |
| locationCityId | text (FK → location_airports.id) | canonical location FK |
| locationCountry | text | controlled snapshot from catalog |
| locationCity | text | controlled snapshot from catalog |
| locationBaseAirport | text | controlled snapshot from catalog |
| minYearsExperience | int | |
| status | enum | draft \| published \| closed \| expired |
| visible | boolean | |
| expiresAt | timestamptz | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

> **Note:** Required technician types, licenses, and aircraft types are stored in three relation tables: `offer_required_technician_types`, `offer_required_licenses`, `offer_required_aircraft_types`. All three are optional — no rows means the offer is open to any type.

### offer_requests
Company sends a direct offer to a technician.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| companyId | uuid (FK) | |
| technicianId | uuid (FK) | |
| offerId | uuid (FK → offers.id) | nullable — linked offer |
| status | enum | pending \| accepted \| rejected \| expired \| withdrawn |
| identityRevealed | boolean | default false |
| documentsUnlocked | boolean | default false |
| message | text | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### offer_applications
Technician applies to a published offer.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| offerId | uuid (FK → offers.id) | required |
| companyId | uuid (FK) | denormalized |
| status | enum | pending \| accepted \| rejected \| expired \| withdrawn |
| identityRevealed | boolean | default false |
| documentsUnlocked | boolean | default false |
| coverNote | text | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### documents

**MVP review model:** Admins manually set document status. No audit log, no reviewer identity (`reviewed_by`), no automatic expiration for the first Supabase version. Future: add `reviewed_by`, a document review log table, and a cron function for auto-expiration only if real users need them.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| type | text | |
| fileName | text | |
| storagePath | text | Supabase Storage path |
| status | enum | pending \| verified \| rejected \| expired |
| uploadedAt | timestamptz | |
| reviewedAt | timestamptz | nullable — set when admin changes status; cleared on reset to pending |
| rejectionReason | text | nullable — set when rejected; cleared on all other transitions |
| expiresAt | timestamptz | nullable — for licenses and time-limited certificates |

### chat_rooms
Chat rooms are created on acceptance. The `chat_rooms` table references the accepted `offer_request` or `offer_application` — not the other way around. `offer_requests` and `offer_applications` do not have a `chatRoomId` column.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| offerRequestId | uuid (FK → offer_requests.id) | nullable — set when created from a direct offer |
| offerApplicationId | uuid (FK → offer_applications.id) | nullable — set when created from an application |
| technicianId | uuid (FK) | denormalized for RLS |
| companyId | uuid (FK) | denormalized for RLS |
| createdAt | timestamptz | |

Exactly one of `offerRequestId` / `offerApplicationId` must be non-null (enforced by DB constraint). One chat room per offer_request and per offer_application (enforced by partial unique index).

### chat_messages
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| chatRoomId | uuid (FK) | |
| senderUserId | uuid (FK → profiles.id) | user/profile identity; never companyId or technicianId |
| senderCompanyMemberId | uuid (FK → company_members.id), nullable | optional audit pointer for company messages; null for technician messages |
| senderRole | enum | technician \| company |
| body | text | |
| sentAt | timestamptz | |

### activity_events
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| type | enum | **Phase 1:** application_received \| application_accepted \| application_rejected \| direct_offer_received \| direct_offer_accepted \| direct_offer_rejected. **Future scope:** chat_message_received |
| recipientScope | enum | technician \| company |
| recipientTechnicianId | uuid (FK → technician_profiles.id), nullable | set when recipientScope=technician |
| recipientCompanyId | uuid (FK → companies.id), nullable | set when recipientScope=company |
| actorProfileId | uuid (FK → profiles.id), nullable | user that caused the event |
| entityType | enum | offer_request \| offer_application \| chat_message |
| entityId | uuid | source entity id, interpreted by entityType |
| offerId | uuid (FK → offers.id), nullable | useful for grouped offer badges |
| metadata | jsonb | small display/audit payload |
| createdAt | timestamptz | |

### activity_reads
| Column | Type | Notes |
|--------|------|-------|
| activityEventId | uuid (FK → activity_events.id) | composite PK |
| profileId | uuid (FK → profiles.id) | composite PK, the user who read it |
| readAt | timestamptz | |

---

## Row Level Security (RLS)

### Key policies

**technician_profiles:**
- Technician can read/update their own row.
- Company can read only `PublicTechnicianView` fields (no firstName, lastName, email, phone, birthDate).
- Company can read full row only if an accepted offer_request or offer_application exists between them.
- Admin can read all rows.

**documents:**
- Technician can read their own documents regardless of status (including rejection_reason).
- Company can read **only verified documents** (`status = 'verified'`) when `documentsUnlocked = true` in an accepted offer record. Pending, rejected, and expired documents are not visible to companies.
- Admin can read and update all documents (sets status, reviewed_at, rejection_reason).
- Technicians cannot update status, reviewed_at, or rejection_reason — those are admin-only.

**offer_requests / offer_applications:**
- Company can read/write their own records.
- Technician can read records where `technicianId = auth.uid()`.
- Status changes go through RPC transition functions. Allowed transitions are `pending → accepted/rejected/expired/withdrawn`; all other statuses are terminal.
- Accepted transitions unlock identity/documents and create chat server-side.
- Only accepted/rejected transitions create counterparty activity events; withdrawn/expired must not be recorded as rejected.
- Admin can read all.

**chat_rooms / chat_messages:**
- Accessible only to technician and company linked to the room.
- Chat room is created only when status transitions to `accepted` (enforced via database trigger or edge function).
- Company viewer role cannot insert messages (enforced at app layer + RLS on company_members.role).

**activity_events / activity_reads:**
- Events are readable by the recipient technician or recipient company members.
- Events are inserted by trusted server-side triggers/functions, not directly by ordinary clients.
- Read state is per profile via `activity_reads`; a company member reading an event does not automatically mark it read for every member.
- Admin can read all events.

**offers:**
- Company (admin/recruiter) can insert/update their own offers.
- Any authenticated user can read published, visible offers.
- Admin can read all.

---

## Server-owned fields

The following fields must **never** be written directly by ordinary frontend users. They are protected by auth triggers, admin-only RLS policies, or SECURITY DEFINER triggers:

| Field | Table | Written by | Ordinary frontend may write? |
|-------|-------|-----------|------------------------------|
| `role` | `profiles` | Auth trigger on registration | **NO** — admin-only UPDATE after creation |
| `status` | `profiles` | Admin (block/suspend) | **NO** |
| `verification_status` | `technician_profiles` | Admin only | **NO** — `is_admin()` RLS policy |
| `verification_status` | `companies` | Admin only | **NO** — `is_admin()` RLS policy |
| `identity_revealed` | `offer_requests` / `offer_applications` | `handle_offer_relation_status_transition()` trigger | **NO** — trigger only |
| `documents_unlocked` | `offer_requests` / `offer_applications` | Same trigger | **NO** — trigger only |
| `chat_rooms` row | `chat_rooms` | Same trigger (SECURITY DEFINER) | **NO** — no client INSERT policy |
| `activity_events` row | `activity_events` | SECURITY DEFINER trigger functions | **NO** — no client INSERT policy |

**Status transitions for offers/applications** go through RPCs (`transition_offer_request_status`, `transition_offer_application_status`) that validate the transition before updating status and running side effects in the same transaction.

**Admin verification writes** (`verification_status` on technician and company) are direct UPDATEs allowed by the `is_admin()` RLS policy — no separate RPC is required for MVP.

---

## Storage

One private bucket: `technician-documents`

- Path pattern: `{technicianId}/{documentId}/{fileName}`
- Access: signed URLs generated server-side only when `documentsUnlocked = true`.
- No public access.

---

## Edge functions / triggers

**MVP (required on first Supabase migration):**

| Function | Trigger | Action |
|----------|---------|--------|
| `handle_offer_accepted` | BEFORE UPDATE on offer_requests / offer_applications | Set identity_revealed, documents_unlocked, create chat_room atomically on acceptance |
| `create_activity_event` | SECURITY DEFINER function called by trigger | Insert activity_events rows when an offer is accepted or rejected (marketplace events only). Chat message activity is future scope — not Phase 1. |
| `transition_offer_request_status` | RPC | Validate status transition, then call handle_offer_accepted side effects |
| `transition_offer_application_status` | RPC | Validate status transition, then call handle_offer_accepted side effects |

**Future scope (do not implement in first Supabase migration):**

| Function | When |
|----------|------|
| `expire_offers` | After real users — daily cron to auto-expire offers past expiresAt |
| `notify_offer_status` | After Phase 1 stable — push notification on status change |
| Chat message activity (`chat_message_received`) | Post-launch — replace local demo mechanism with Realtime or polling-based read state |

---

## Notifications

**MVP:** Activity badges (red dots) are computed by querying `activity_events` for the current user's scope and subtracting rows present in `activity_reads` for `auth.uid()`. No Realtime subscription or email integration is required for the first Supabase migration.

**MVP activity scope:** Phase 1 covers marketplace events only:
- `application_received`, `application_accepted`, `application_rejected`
- `direct_offer_received`, `direct_offer_accepted`, `direct_offer_rejected`

`chat_message_received` is future scope — the local demo emits this type for chat unread dots, but Phase 1 Supabase does not need to. No notification center in MVP — red-dot badges only. Polling/manual refresh is acceptable.

```sql
-- Unread event count (used for red dot badges)
SELECT count(*)
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

**Future scope (do not implement in first Supabase migration):**
- Supabase Realtime: subscribe to `activity_events` for real-time badge updates without polling. Implement after the polling model proves insufficient at scale.
- Email notifications (e.g. via Resend): offer accepted, account verified/rejected. Implement after real user onboarding confirms the value.
- Push notifications: mobile push via Expo Notifications. Implement post-launch.
- Self-service company invitations, invite tokens, and email invite links.
- Multi-company membership, company switching, and company context selectors.
- Complete worldwide airport catalog seeding; add `location_airports` rows on demand instead.

---

## Supabase clean-start policy

The local demo (AsyncStorage + JSON seeds) and the Supabase database are **completely separate** data environments.

| | Local demo | Supabase |
|---|---|---|
| ID format | Human-readable strings (`tech-001`, `comp-001`, `prof-t001`) | Real UUIDs generated by Postgres (`gen_random_uuid()`). `profiles.id` = `auth.users.id`. |
| Seed data | `src/data/seeds/*.json` — loaded into AsyncStorage by `localDatabase.ts` | Catalog-only INSERTs: `technician_types`, `license_categories`, `aircraft_types`, `company_types`, `contract_types` |
| Marketplace data | 18 demo technicians, 9 companies, 12 offers, 25 docs, etc. | **None** — real users register and create their own data |
| Validator | `scripts/validateSeeds.js` — checks local demo integrity only; does NOT check UUID format | Postgres constraints + RLS |

**Local demo seeds must NOT be inserted into Supabase.** They are designed for local readability only and contain intentionally non-UUID IDs.

**Supabase starts with:**
1. Enums and all `CREATE TABLE` statements from `docs/SUPABASE_SCHEMA_V2.sql`
2. Catalog data (5 catalog tables) from the same file
3. First admin profile row from `docs/V2_S1_ADMIN_BOOTSTRAP_SQL.sql`
4. No marketplace rows — real users register via Supabase Auth

---

## Migration path from local storage

The local V2 demo is complete (V2-1 through V2-13). All repository interfaces are stable. The Supabase migration swaps only the adapter underneath — screens and hooks do not change.

**Recommended migration order:**

1. Supabase project setup (create project, configure environment variables)
2. Auth: email/password sign-in/sign-up where needed, role stored in `profiles` table. Company users/members are provisioned manually for the MVP.
3. Bootstrap `profiles`, `technician_profiles`, `companies`, `company_members` tables, including one company membership per company user
4. Replace `DEMO_COMPANY_ID`, `DEMO_TECHNICIAN_ID`, and `DEMO_COMPANY_USER_ID` with real session context from `auth.uid()`
5. Migrate repositories one entity at a time (start with read-only entities — technicians, companies — before write entities)
6. Apply RLS policies per `docs/RLS_PLAN_V2.md` — verify before exposing to real users
7. Supabase Storage: `technician-documents` private bucket (after documents table is live)
8. Realtime, email notifications, cron, self-service invitations, and multi-company switching are **future scope** — do not block the first migration on them

**Key invariant:** Repository interfaces (`TechnicianRepository`, `OfferRepository`, etc.) do not change between local and Supabase adapters. Only the storage layer is swapped.
