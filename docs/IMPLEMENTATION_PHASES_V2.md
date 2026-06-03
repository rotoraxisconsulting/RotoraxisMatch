# Implementation Phases V2 — RotoraxisMatch

Build V2 incrementally on top of the existing V1 demo base.
Keep the app runnable at the end of every phase.

---

## Phase status

| Phase | Description | Status |
|-------|-------------|--------|
| V2-1a | TypeScript types + constants | ✅ Complete |
| V2-1b | V2 seed data | ✅ Complete |
| V2-1c | V2 repositories | ✅ Complete |
| V2-1d | Hooks + privacy utils migration | ✅ Complete |
| V2-1e | Data layer QA | ✅ Complete |
| V2-2 | Company offer management UI | ✅ Complete |
| V2-3 | Technician offer browsing + apply | ✅ Complete |
| V2-4 | Company application review | ✅ Complete |
| V2-5 | Chat / messaging | ✅ Complete |
| V2-6 | Technician direct offers | ✅ Complete |
| V2-7 | Multi-user company team | ✅ Complete |
| V2-8 | Admin V2 | ✅ Complete |
| V2-9 | Full local end-to-end QA | ✅ Complete |
| V2-10 | Pre-flight fixes + activity badges + V1 cleanup | ✅ Complete |
| V2-11 | UI/UX polish (dashboards, scores, chat) | ✅ Complete |
| V2-12 | Company area premium UI redesign | ✅ Complete |
| V2-13 | Admin area premium UI redesign | ✅ Complete |
| V2-docs | Documentation cleanup + alignment | ✅ Complete |
| **V2-S1** | **Supabase / Auth MVP** | ⏳ Next |

---

## Phase V2-1 — Data model refactor

**Goal:** Update the local data layer to match V2 model. No UI screen changes. App must stay runnable after each subphase.

---

### V2-1a — Types and constants

**Goal:** Replace V1 TypeScript types with V2 types. No runtime changes yet.

Tasks:
- Add `src/types/enums.ts` — all V2 status and role types. Add `'expired'` to `OfferRequestStatus`.
- Add `src/types/catalog.ts` — `TechnicianTypeCode`, `LicenseCode`, `ContractTypeCode`, `CompanyTypeCode`, catalog interfaces.
- Rewrite `src/types/technician.ts` — split `fullName` → `firstName`/`lastName`, add `birthDate`, `technicianType`, `TechnicianLicense`, `TechnicianHabilitation`, `TechnicianAircraftExperience`, `Availability` with `contractTypes`.
- Rewrite `src/types/company.ts` — rename `companyName` → `name`, rename `contactEmail` → `email`, add `phone`, update `CompanyType` values, add `CompanyMember`.
- Rewrite `src/types/document.ts` — add `'expired'` to `DocumentStatus`, add `storagePath`, `reviewedAt`, `rejectionReason`, `expiresAt`. (MVP document review model: no `verifiedAt`/`verifiedBy` — admin sets status only.)
- Add `src/types/offer.ts` — `Offer`, `OfferWithRequirements`.
- Add `src/types/offerRequest.ts` — `OfferRequest` with `kind: 'direct_offer'`, `OfferApplication` with `kind: 'application'`, `OfferInboxRecord` union, `isDirectOffer`/`isApplication` helpers. Mark `identityRevealed` and `documentsUnlocked` as READ-ONLY in comments.
- Add `src/types/chat.ts` — `ChatRoom`, `ChatMessage`.
- Add `src/types/privacy.ts` — `SafeTechnicianPreview`, `UnlockedTechnicianView`, `isUnlocked`.
- Add `src/types/filters.ts` — `TechnicianSearchFilters`, `OfferSearchFilters`.
- Add `src/types/matching.ts` — `MatchScore`, `MatchLabel`.
- Update `src/types/index.ts` barrel.
- Rewrite `src/constants/licenses.ts` — full Part-66 list (A1–C). Remove V1 generic `A` and `D1`.
- Rewrite `src/constants/aircraftTypes.ts` — expand to match SQL seed (~30 types with code + label).
- Update `src/constants/contractTypes.ts` — values: `permanent`, `long_term`, `short_term`.
- Delete `src/constants/specialties.ts`.

**Exit check:** `npx tsc --noEmit` passes (or all type errors are in files not yet updated, not in the new types).

---

### V2-1b — Seed data

**Goal:** Regenerate JSON seeds to match V2 type shapes.

Tasks:
- Rewrite `src/data/technicians.json`:
  - Split `fullName` → `firstName` + `lastName`.
  - Add `birthDate` for each seed technician (realistic ages 28–52).
  - Add `technicianType` from current license/specialty info.
  - Convert `licenseCategories: string[]` → `licenses: TechnicianLicense[]` array.
  - Convert `aircraftTypes: string[]` → `habilitations: TechnicianHabilitation[]` array.
  - Add `aircraftExperience: TechnicianAircraftExperience[]` entries (use existing `yearsExperience` as a fallback value on the primary aircraft).
  - Convert `availability.status` → `availability.immediately` boolean.
  - Map contract types: `contract→long_term`, `temporary/freelance→short_term`.
  - Remove `specialties[]`.
- Rewrite `src/data/companies.json`:
  - Rename `companyName` → `name`, `contactEmail` → `email`.
  - Remove `website`.
  - Update `companyType` values: `mro→MRO`, `recruiter→recruitment_agency`, `operator→helicopter_operator`, `contractor→other`.
- Rename `src/data/matchRequests.json` → `src/data/offerRequests.json`:
  - Status `'sent'` → `'pending'`.
  - Add `documentsUnlocked: false`.
  - Add `kind: 'direct_offer'` to each record.
- Add `src/data/offers.json` with 3–5 sample job offers in draft and published states.
- Add `src/data/offerApplications.json` with 2–3 sample applications.
- Update `src/storage/localDatabase.ts` to load all new seed files.

**Exit check:** App launches, demo mode works, no JSON parse errors.

---

### V2-1c — Repositories

**Goal:** Update existing repositories and add new ones to match V2 entities.

Tasks:
- Update `src/repositories/technicianRepository.ts`:
  - Queries use new field names.
  - `getSafeTechnicianView` returns `SafeTechnicianPreview` (age derived, `birthDate` never returned).
  - Privacy function: never return `firstName`, `lastName`, `email`, `phone`, `birthDate` unless identity is revealed.
- Update `src/repositories/companyRepository.ts`:
  - Field names updated to V2 shape.
- Rename `src/repositories/matchRequestRepository.ts` → `offerRequestRepository.ts`:
  - Rename all references from `MatchRequest` to `OfferRequest`.
  - Update status values.
  - Add `kind: 'direct_offer'` to returned records.
  - `identityRevealed`/`documentsUnlocked` are never written directly — acceptance logic sets them in `acceptOfferRequest()`.
- Update `src/repositories/documentRepository.ts`:
  - Add `storagePath` field (use `fileName` as fallback for demo).
  - Add `expired` status support.
- Add `src/repositories/offerRepository.ts` — CRUD for `Offer` (load from `offers.json`).
- Add `src/repositories/offerApplicationRepository.ts` — CRUD for `OfferApplication`, with `kind: 'application'`.
- Add `src/repositories/chatRepository.ts` — CRUD for `ChatRoom` and `ChatMessage` (in-memory or AsyncStorage).
- Add `src/repositories/companyMemberRepository.ts` — read-only for now (no multi-user UI yet).
- Add `src/utils/matchingV2.ts` — `calculateOfferTechnicianMatch(offer, technician): MatchScore` (pure function). Add `getTechnicianMatchesForOffer(offerId)` and `getOfferMatchesForTechnician(technicianId)` async helpers. **Never store or read matchScore from technician_profile — always compute for an offer+technician pair.**

**Exit check:** No TypeScript errors in repositories. Demo flows still work.

---

### V2-1d — UI adaptation (hooks and privacy utils only)

**Goal:** Update hooks and privacy utilities to consume V2 data. No screen redesigns.

Tasks:
- Update `src/state/useTechnicianSearch.ts` — use `TechnicianSearchFilters`, updated matching score.
- Update `src/state/useCompanyDashboard.ts` — consume V2 company and offer shapes.
- Update `src/state/useTechnicianDashboard.ts` — consume V2 technician shape.
- Update `src/state/useAdminDashboard.ts` — consume V2 entities.
- Privacy utils: `canRevealIdentity(record: OfferInboxRecord)`, `canAccessDocuments(record)`, `canOpenChat(record)` all check `record.status === 'accepted'` — never check frontend-written booleans directly.
- Any screen currently showing `fullName` should show `firstName + ' ' + lastName`.
- Any screen showing V1 contract types should map to V2 values.
- Keep all existing screens functional — this is not a redesign step.

**Exit check:** App runs end-to-end in demo mode. All existing screens render without errors.

---

### V2-1e — QA

**Goal:** Verify the refactored data layer is correct and complete.

Checklist:
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] App launches on web.
- [ ] Demo mode initializes without console errors.
- [ ] Technician dashboard loads technician data.
- [ ] Company search returns technician results.
- [ ] Matching score uses V2 algorithm (verified=+25 is highest).
- [ ] Company search does NOT expose `firstName`, `lastName`, `email`, `phone` on non-accepted profiles.
- [ ] Accepting an offer_request sets `identityRevealed: true` and `documentsUnlocked: true` in local state (simulating server-side behavior for demo).
- [ ] `OfferInboxRecord.kind` is present on all records in the inbox.
- [ ] No remaining references to `fullName`, `companyName`, `contactEmail`, `matchRequest`, `specialties`, `yearsExperience` (flat).
- [ ] Seed data loads cleanly for all new entities.

---

---

## Phase V2-2 — Job offer management (company)

**Goal:** Companies can create, edit, publish, and close job offers.

Screens:
- `Company Job Offers` list (drafts + published)
- `Create / Edit Job Offer` form
- `Job Offer Detail` (company view) — shows applications + **ranked technician list using `getTechnicianMatchesForOffer(offerId)`**

Matching UX rule:
- Each technician card inside an offer shows **"X% match for this offer"** (score is offer-specific).
- Technician list in the general search (no offer selected) must NOT show a match %. Show **"Select an offer to calculate match"** instead.

Components:
- `JobOfferCard`
- `JobOfferForm`
- `OfferStatusBadge`

---

## Phase V2-3 — Technician job offer browsing and application

**Goal:** Technicians can browse published offers and apply.

Screens:
- `Browse Offers` (technician feed with filters) — each offer card shows **"X% match with your profile"** via `getOfferMatchesForTechnician(technicianId)`
- `Job Offer Detail` (technician view) — shows match score prominently: **"X% match for this offer"**
- `Apply to Offer` (cover note + confirm)
- `My Applications` (sent applications list)

Matching UX rule:
- Every displayed match % must be sourced from a `MatchScore` that carries `offerId` + `technicianId`.
- Never display a match % without showing or knowing which offer it belongs to.

Components:
- `OfferListCard` (shows per-offer match score)
- `ApplicationStatusBadge`

Filters:
- contractType
- requiredLicenses
- requiredAircraftTypes
- location

---

## Phase V2-4 — Direct offer flow refactor

**Goal:** Migrate V1 contact request flow to V2 OfferRequest model.

Tasks:
- Replace `MatchRequest` with `OfferRequest` throughout.
- Company can attach an existing `JobOffer` when sending a direct offer.
- Company "Send Offer" screen: optional message, optional job offer link.
- Technician "Received Offers" screen: shows OfferRequests.
- Merge technician "My Offers" into a single inbox: received direct offers + sent applications.

---

## Phase V2-5 — Acceptance and unlock flow

**Goal:** Acceptance unlocks identity, documents, and chat atomically.

Tasks:
- On acceptance: set `identityRevealed`, `documentsUnlocked`, create `ChatRoom`.
- Privacy utils enforce document and identity access.
- Company technician detail screen: shows full identity post-acceptance, anonymous view pre-acceptance.
- Technician documents tab: locked state (pre-acceptance) vs unlocked state (post-acceptance).
- In-app notification on acceptance or rejection.

---

## Phase V2-6 — Chat

**Goal:** Basic in-app messaging after offer acceptance.

Screens:
- `Chat` screen (message thread)
- `Chat List` (company and technician inbox of open chats)

Components:
- `ChatBubble`
- `ChatInput`

Rules:
- Chat tab/button only appears when `status === 'accepted'`.
- Company viewers cannot send messages.
- Messages stored in local ChatRepository for now; Supabase Realtime later.

---

## Phase V2-7 — Multi-user company

**Goal:** Companies can have multiple users with different roles.

Tasks:
- Add `CompanyMember` model and repository.
- Company admin screen: manually/demo-add members, set roles, remove members. No self-service invite links, invite tokens, or email invite flow in MVP.
- Role enforcement: recruiter can send offers; viewer is read-only.
- Demo seeds: one company with admin + recruiter + viewer member.

---

## Phase V2-8 — Admin V2

**Goal:** Admin panel updated for V2 entities and flows.

Additions:
- Document status management: verified / rejected / expired.
- View and moderate JobOffers.
- View all OfferRequests and OfferApplications (read-only).
- Block users (technicians, companies).
- Pilot type visible in admin but marked "standby — not live".

---

## Phase V2-S1 — Supabase / Auth MVP

**Goal:** Replace local AsyncStorage repositories with Supabase. Repository interfaces do not change — only the adapter underneath is swapped.

**Clean-start policy:**

Supabase does NOT receive local demo data. The local `src/data/seeds/*.json` files use human-readable IDs (`tech-001`, `comp-001`, `prof-t001`) that are not valid UUIDs. Supabase uses `gen_random_uuid()` for all PKs; `profiles.id` = `auth.users.id`.

The first Supabase deployment contains:
1. Enums + all domain tables (`docs/SUPABASE_SCHEMA_V2.sql`)
2. Catalog INSERTs: `technician_types`, `license_categories`, `aircraft_types`, `company_types`, `contract_types`
3. First admin profile row (`docs/V2_S1_ADMIN_BOOTSTRAP_SQL.sql`)
4. No marketplace rows — real users register and create their own data

**Recommended order:**

1. Supabase project setup — create project, configure `.env` with `SUPABASE_URL` and `SUPABASE_ANON_KEY`.
2. Auth — email/password sign-in/sign-up where needed. Role stored in `profiles`; company users/members are provisioned manually for the MVP.
3. Bootstrap core tables — `profiles`, `technician_profiles`, `companies`, `company_members`, with one company membership per company user.
4. Replace demo constants — swap `DEMO_COMPANY_ID`, `DEMO_TECHNICIAN_ID`, `DEMO_COMPANY_USER_ID` with real session context from `auth.uid()`.
5. Migrate repositories one at a time — start with read-heavy entities (technicians, companies) before write-heavy ones (offer_requests, offer_applications).
6. RLS policies — apply per `docs/RLS_PLAN_V2.md` before exposing any data to real users.
7. Offers and offer relations — `offers`, `offer_requests`, `offer_applications`, plus `on_offer_accepted` trigger (unlocks identity/docs, creates chat room).
8. Activity events — `activity_events` + `activity_reads` (server-side inserts via SECURITY DEFINER trigger).
9. Documents and Storage — `documents` table, then `technician-documents` private bucket with signed-URL access.
10. Remove AsyncStorage layer once all entities are live.

**Future scope (not required for V2-S1):**
- Supabase Realtime (real-time badge updates)
- Email notifications via Resend
- `expire_offers` cron function
- Push notifications
- Self-service company invitations and invite tokens
- Multi-company membership and company switching
- Complete worldwide airport seeding

---

## Phase V2-S2 — EAS build and release prep

Tasks:
- Update `app.json` / `app.config.ts` for V2.
- Configure `eas.json` for dev / preview / production profiles.
- Store Supabase URL and keys in EAS secrets.
- End-to-end smoke test on physical device (iOS + Android).
- README with build instructions.

---

## Phase order summary

| Phase | Focus | Status |
|-------|-------|--------|
| V2-1a | Types and constants | ✅ |
| V2-1b | Seed data | ✅ |
| V2-1c | Repositories | ✅ |
| V2-1d | UI adaptation (hooks + privacy utils) | ✅ |
| V2-1e | QA / verification | ✅ |
| V2-2 | Company: publish offers | ✅ |
| V2-3 | Technician: browse + apply | ✅ |
| V2-4 | Company: application review | ✅ |
| V2-5 | Chat / messaging | ✅ |
| V2-6 | Technician: direct offers | ✅ |
| V2-7 | Multi-user company team | ✅ |
| V2-8 | Admin V2 | ✅ |
| V2-9 | Full local E2E QA | ✅ |
| V2-10 | Pre-flight fixes + activity badges + V1 cleanup | ✅ |
| V2-11 | UI/UX polish | ✅ |
| V2-12 | Company premium UI | ✅ |
| V2-13 | Admin premium UI | ✅ |
| V2-docs | Documentation cleanup | ✅ |
| **V2-S1** | **Supabase / Auth MVP** | ⏳ Next |
| V2-S2 | EAS + release | — |
