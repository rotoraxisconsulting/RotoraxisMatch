# V2-9 QA Report — Full Local End-to-End Audit

**Date:** 2026-05-23  
**Phase:** V2-9 — Pre-Supabase local QA: privacy, matching, all flows, seed consistency

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors (5 chat rooms, all invariants pass) |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Flows audited

### Flow 1 — Company offer creation and management

**Files:** `app/company/offers/index.tsx`, `app/company/offers/[id].tsx`, `app/company/offers/new.tsx`, `app/company/offers/edit.tsx`

**Result: PASS**

- Offers list shows draft/published/closed with status pills; NavCard on dashboard
- Create form validates required fields; saves as draft
- Publish / close transitions via Alert, validated against allowed moves (draft→published→closed)
- Offer detail shows ranked technician list via `getTechnicianMatchesForOffer(offerId)`; each card shows "X% match for this offer" — always offer-scoped
- Send direct offer uses `offerRequestRepository.create()`; duplicate prevention via `pendingRequestForTech()` / `acceptedRequestForTech()` checks
- Permission guard: `canManageOffers(DEMO_COMPANY_MEMBER_ROLE)` wraps publish/close/edit actions

---

### Flow 2 — Technician offer browsing and application

**Files:** `app/technician/offers/index.tsx`, `app/technician/offers/[id].tsx`

**Result: PASS**

- Browse feed uses `getOfferMatchesForTechnician(DEMO_TECHNICIAN_ID)` — every card carries `offerId + technicianId` in the MatchScore
- Match % only displayed with offer context; never shown without `offerId`
- Contract / license / aircraft filters applied correctly
- Apply modal asks for cover note; calls `offerApplicationRepository.create()`; duplicate prevention check
- Detail screen shows score hero with breakdown bars, linked offer requirements, withdraw action

---

### Flow 3 — Company application review

**Files:** `app/company/applications/index.tsx`, `app/company/applications/[id].tsx`

**Result: PASS**

- Application list filter: all / pending / accepted / rejected
- Detail uses `isUnlocked(techView)` gate; pre-acceptance shows anonymousCode only, post-acceptance shows firstName + lastName
- Accept calls `offerApplicationRepository.updateStatus('accepted')` which sets identityRevealed + documentsUnlocked + creates chat room (local simulation)
- Chat button appears only when `app.status === 'accepted'` and chatRoom is found
- Documents section only rendered when `isUnlocked(techView) === true`
- Permission guard: `canReviewApplications(DEMO_COMPANY_MEMBER_ROLE)` wraps accept/reject

---

### Flow 4 — Technician direct offers

**Files:** `app/technician/direct-offers/index.tsx`, `app/technician/direct-offers/[id].tsx`

**Result: PASS**

- List loads `offerRequestRepository.getForTechnician(DEMO_TECHNICIAN_ID)` and enriches with company / offer / match score
- Match % only shown when there is a linked `offerId`; no linked offer → no score displayed
- Accept shows confirmation explaining identity + documents will be revealed
- Reject handled with confirmation
- Accepted state shows "Open chat →" button that navigates to `/technician/chats/{chatRoom.id}`; chat room found by `offerRequestId` lookup
- Expired / withdrawn states render informational note, no actions

---

### Flow 5 — Chat (company and technician)

**Files:** `app/company/chats/index.tsx`, `app/company/chats/[id].tsx`, `app/technician/chats/index.tsx`, `app/technician/chats/[id].tsx`

**Result: PASS**

- Chat detail re-checks `req/app.status === 'accepted'` on every load — chat is locked if status changed
- Company chat resolves technician display name via `isUnlocked(techView)` — shows `firstName lastName` when unlocked, `anonymousCode` otherwise
- `canSendChatMessages(DEMO_COMPANY_MEMBER_ROLE)` guard wraps Send button (viewer role cannot send)
- Technician chat sends as `senderRole: 'technician'`, company as `senderRole: 'company'` — bubble alignment driven by `senderRole`, not `senderId`
- Chat list on both dashboards shows rooms with last-message preview
- "Open chat" deep links from accepted application detail and accepted direct offer detail work correctly

---

### Flow 6 — Company team management

**Files:** `app/company/team.tsx`, `src/utils/companyPermissionsV2.ts`

**Result: PASS**

- `canManageCompanyMembers()` gate — admin only; recruiters and viewers see read-only hint
- Add member Alert picks role, generates `demo-user-{timestamp}` userId
- Change role: lists alternative roles, calls `companyRepositoryV2.updateMemberRole()`
- Remove member: blocked when `isLastAdmin || isCurrentUser`; safeguard prevents removing yourself or last admin
- "You" label on current user card; current user row highlighted

---

### Flow 7 — Admin V2

**Files:** `app/admin/index.tsx`, `app/admin/offers.tsx`, `app/admin/requests.tsx`, `app/admin/technicians.tsx`, `app/admin/companies.tsx`, `app/admin/documents.tsx`

**Result: PASS**

- Dashboard: 9-cell metrics grid (totalTechnicians, verifiedTechnicians, pendingTechnicians, totalCompanies, pendingDocuments, totalOffers, activeOffers, pendingOfferRequests, pendingApplications)
- 5 NavCards: Technicians, Companies, Documents, Offers, Requests
- Offer moderation: status filter tabs, correct transition map (`draft→published/expired`, `published→closed/expired`, `closed→expired`), `expired→` no actions
- Combined requests screen: V2-native `OfferInboxRecord[]`, kind filter chips, summary strip, `RecordCard` shows real technician name (privacy gate bypassed for admin)
- Admin correctly uses `offerTitleMap` for offer title lookup in combined requests view

---

### Flow 8 — Privacy gate

**Files:** `src/types/privacy.ts`, `src/utils/privacyV2.ts`, `src/state/useTechnicianSearch.ts`, `src/state/useCompanyDashboard.ts`

**Result: PASS**

- `SafeTechnicianPreview` never contains `firstName`, `lastName`, `email`, `phone`, `birthDate`
- `UnlockedTechnicianView` extends `SafeTechnicianPreview` — adds identity fields only
- `isUnlocked(view)` checks `'firstName' in view` — type-safe guard
- `canRevealIdentity(record)` checks `record.status === 'accepted'` — never relies on boolean flags alone
- `v2SafePreviewToSafeView` does not expose private fields
- `v2UnlockedViewToSafeView` only called after `canRevealIdentity()` returns true
- `TechnicianCard` in general search: `matchingScore` is `undefined` on `SafeTechnicianView` → match % never shown outside offer context

---

### Flow 9 — Matching

**Files:** `src/utils/matchingV2.ts`, `src/types/matching.ts`

**Result: PASS**

- `calculateOfferTechnicianMatch(offer, technician): MatchScore` is a pure function; always returns `{offerId, technicianId, total, label, breakdown}`
- `MatchScore` carries `offerId + technicianId` in every result
- `getTechnicianMatchesForOffer(offerId)` and `getOfferMatchesForTechnician(technicianId)` are the only public score-generation functions
- No `matchingScore` field on `TechnicianProfile` or `SafeTechnicianPreview` — score is never persisted
- Breakdown weights: verified=25, habilitation=25, license=20, availability=15, experience=10, location=5

---

### Flow 10 — Legacy compat (map + V1 adapters)

**Files:** `app/map.tsx`, `src/state/useMapTechnicians.ts`, `src/utils/v2CompatAdapters.ts`

**Result: PASS**

- Map screen uses V1 `technicianRepository` + `matchRequestRepository` — correct; V1 seeds loaded separately in `localDatabase`
- `v2OfferRequestToMatchRequest` maps `pending → sent`, `accepted → accepted`, others → `rejected`
- V2 `pending` correctly maps to V1 `sent` throughout company dashboard and sent requests list
- Compat adapters do not expose identity fields (safe preview adapter leaves `fullName = undefined`)

---

## Bug found and fixed

### Chat room seed inconsistency

**Severity:** Medium — 3 accepted records had no chat room in `chatRooms.json`

**Root cause:** Chat room seeding was added in V2-5 for the 2 DEMO_COMPANY_ID / DEMO_TECHNICIAN_ID paths only. Three other accepted records (involving different company/technician pairs) were never seeded.

**Affected records:**
| Record | Parties | Was missing |
|---|---|---|
| oreq-003 | comp-002 ↔ tech-007 | room-seed-003 |
| oreq-011 | comp-007 ↔ tech-010 | room-seed-004 |
| oapp-008 | comp-002 ↔ tech-012 | room-seed-005 |

**Fix applied:**
1. `src/data/seeds/chatRooms.json` — Added `room-seed-003`, `room-seed-004`, `room-seed-005` with correct `offerRequestId`/`offerApplicationId`, `companyId`, `technicianId`
2. `src/data/seeds/chatMessages.json` — Added 2 seed messages per new room (msg-seed-007 through msg-seed-012)
3. `scripts/validateSeeds.js` — Added `chatRooms.json` load, chat room invariant check (every accepted offerRequest/Application must have a room), removed stale comment claiming rooms start empty

**Validator after fix:** 0 errors, ChatRooms: 5

---

## Files modified in V2-9

| File | Change |
|---|---|
| `src/data/seeds/chatRooms.json` | Added 3 missing rooms for accepted records |
| `src/data/seeds/chatMessages.json` | Added 6 seed messages for 3 new rooms |
| `scripts/validateSeeds.js` | Added chatRooms load, invariant check, removed stale comment |

---

## No new routes added

Total routes remain **36**.

---

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Privacy gate never exposes identity before acceptance | PASS |
| 2 | Match % always tied to offerId + technicianId | PASS |
| 3 | Company offer creation flow correct | PASS |
| 4 | Technician offer browsing and apply flow correct | PASS |
| 5 | Company application review + accept/reject correct | PASS |
| 6 | Technician direct offer accept/reject correct | PASS |
| 7 | Chat accessible only after acceptance, locked otherwise | PASS |
| 8 | Company viewer role cannot send chat messages | PASS |
| 9 | Team management guards (last admin, self-remove) correct | PASS |
| 10 | Admin V2 offer moderation correct | PASS |
| 11 | Admin combined requests/applications view correct | PASS |
| 12 | All accepted records have a seeded chat room | PASS (fixed) |
| 13 | validateSeeds chat room invariant check added | PASS |
| 14 | TypeScript check passes | PASS — 0 errors |
| 15 | Seed validation passes | PASS — 0 errors |
| 16 | Expo export passes | PASS — 36 routes |
| 17 | No Supabase added | PASS |
| 18 | No real auth added | PASS |
| 19 | No new features added | PASS — bug fix only |

---

## Remaining risks for Supabase migration (V2-10)

These are known limitations of the local demo that must be addressed before production:

| Risk | Description |
|---|---|
| Permission guards are frontend-only | `canManageOffers`, `canReviewApplications`, `canManageCompanyMembers`, `canSendChatMessages` are JS-only checks; no server enforcement until RLS is added |
| User blocking/suspension not implemented | `TechnicianProfile` and `CompanyProfile` have no `userStatus` field — requires schema addition before implementing |
| Chat is not real-time | Messages stored in AsyncStorage; needs Supabase Realtime subscription |
| Offer expiry is not automated | `expired` status must be set manually or by a scheduled edge function |
| Single demo user per role | Real auth will introduce per-user identity; DEMO_COMPANY_ID / DEMO_TECHNICIAN_ID constants must be replaced by session context |
| `canRevealIdentity()` sets flags locally | Acceptance side effect (identityRevealed, documentsUnlocked, chatRoom creation) simulated in repository layer — must become a Supabase Edge Function (`on_offer_accepted`) |

---

## Ready for Supabase migration

Yes. V2-9 local QA is complete. All 10 flows pass. One seed bug found and fixed. The codebase is clean and ready for V2-10: Supabase migration.
