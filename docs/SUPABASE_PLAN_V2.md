# Supabase Plan V2 — RotoraxisMatch

Do not implement Supabase yet. This document describes the planned migration target for V2.

## Auth

Use Supabase Auth with email/password.

Each user in `auth.users` has a role in the app: `technician`, `company_user`, or `admin`.

Store role and profile reference in a `profiles` table.

---

## Database tables

### profiles
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | = auth.users.id |
| role | enum | technician \| company_user \| admin |
| createdAt | timestamptz | |

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
| country | text | |
| city | text | |
| baseAirport | text | nullable |
| latitude | float | nullable |
| longitude | float | nullable |
| licenses | text[] | LicenseCategory values |
| availability | jsonb | Availability shape |
| verificationStatus | enum | |
| profileCompleteness | int | 0–100 |
| socialLinks | jsonb | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### technician_habilitations
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| licenseCategory | enum | |
| aircraftType | text | |
| issuedAt | date | nullable |
| expiresAt | date | nullable |

### aircraft_experience
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
| country | text | |
| city | text | |
| phone | text | |
| email | text | |
| companyType | enum | |
| verificationStatus | enum | |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### company_users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| companyId | uuid (FK → companies.id) | |
| userId | uuid (FK → profiles.id) | |
| role | enum | admin \| recruiter \| viewer |
| createdAt | timestamptz | |

### job_offers
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| companyId | uuid (FK) | |
| title | text | |
| description | text | |
| contractType | enum | |
| locationCountry | text | |
| locationCity | text | |
| locationBaseAirport | text | nullable |
| requiredTechnicianTypes | text[] | |
| requiredLicenses | text[] | |
| requiredAircraftTypes | text[] | |
| minYearsExperience | int | |
| status | enum | draft \| published \| closed \| expired |
| visible | boolean | |
| expiresAt | timestamptz | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### offer_requests
Company sends a direct offer to a technician.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| companyId | uuid (FK) | |
| technicianId | uuid (FK) | |
| jobOfferId | uuid (FK) | nullable — linked offer |
| status | enum | pending \| accepted \| rejected \| withdrawn |
| identityRevealed | boolean | default false |
| documentsUnlocked | boolean | default false |
| chatRoomId | uuid | nullable — set on acceptance |
| message | text | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### offer_applications
Technician applies to a published offer.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| jobOfferId | uuid (FK) | |
| companyId | uuid (FK) | denormalized |
| status | enum | pending \| accepted \| rejected \| withdrawn |
| identityRevealed | boolean | default false |
| documentsUnlocked | boolean | default false |
| chatRoomId | uuid | nullable |
| coverNote | text | nullable |
| createdAt | timestamptz | |
| updatedAt | timestamptz | |

### technician_documents
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| technicianId | uuid (FK) | |
| type | text | |
| fileName | text | |
| storagePath | text | Supabase Storage path |
| status | enum | pending \| verified \| rejected \| expired |
| uploadedAt | timestamptz | |
| verifiedAt | timestamptz | nullable |
| expiresAt | timestamptz | nullable |

### chat_rooms
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| offerRequestId | uuid | nullable |
| offerApplicationId | uuid | nullable |
| technicianId | uuid (FK) | |
| companyId | uuid (FK) | |
| createdAt | timestamptz | |

### chat_messages
| Column | Type | Notes |
|--------|------|-------|
| id | uuid (PK) | |
| chatRoomId | uuid (FK) | |
| senderId | uuid (FK → profiles.id) | |
| senderRole | enum | technician \| company |
| body | text | |
| sentAt | timestamptz | |

---

## Row Level Security (RLS)

### Key policies

**technician_profiles:**
- Technician can read/update their own row.
- Company can read only `PublicTechnicianView` fields (no firstName, lastName, email, phone, birthDate).
- Company can read full row only if an accepted offer_request or offer_application exists between them.
- Admin can read all rows.

**technician_documents:**
- Technician can read/write their own documents.
- Company can read documents only if `documentsUnlocked = true` in the relevant offer record.
- Admin can read all documents.

**offer_requests / offer_applications:**
- Company can read/write their own records.
- Technician can read records where `technicianId = auth.uid()`.
- Technician can update `status` on their own received requests (accept/reject).
- Admin can read all.

**chat_rooms / chat_messages:**
- Accessible only to technician and company linked to the room.
- Chat room is created only when status transitions to `accepted` (enforced via database trigger or edge function).
- Company viewer role cannot insert messages (enforced at app layer + RLS on company_users.role).

**job_offers:**
- Company (admin/recruiter) can insert/update their own offers.
- Any authenticated user can read `visible = true` offers.
- Admin can read all.

---

## Storage

One private bucket: `technician-documents`

- Path pattern: `{technicianId}/{documentId}/{fileName}`
- Access: signed URLs generated server-side only when `documentsUnlocked = true`.
- No public access.

---

## Edge functions / triggers

| Function | Trigger | Action |
|----------|---------|--------|
| `on_offer_accepted` | offer_requests or offer_applications status → accepted | Set identityRevealed=true, documentsUnlocked=true, create chat_room |
| `notify_offer_status` | status change on either table | Send in-app notification to counter-party |
| `expire_job_offers` | cron (daily) | Set status=expired where expiresAt < now() |

---

## Notifications

Use Supabase Realtime for in-app notifications on:
- New offer received (technician)
- New application received (company)
- Offer accepted / rejected
- New chat message

Email notifications (via Resend or similar) for critical events:
- Offer accepted
- Account verified / rejected by admin

---

## Migration path from local storage

1. Replace `AsyncStorage` repositories with Supabase repositories one entity at a time.
2. Keep the same repository interface — UI and hooks do not change.
3. Order of migration: profiles → offers → requests/applications → documents → chat.
4. Run local seed data as Supabase insert scripts during development.
