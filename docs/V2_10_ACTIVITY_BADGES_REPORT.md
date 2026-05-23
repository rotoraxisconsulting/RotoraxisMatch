# V2-10 Activity Badges Report

**Date:** 2026-05-23  
**Phase:** V2-10 — Lightweight local unread/activity indicator system

---

## Summary

Added a lightweight local unread/activity indicator system: red dots on dashboard NavCards when something needs attention, red dots on individual item cards, unread items sorted to the top of their lists, and mark-as-read when a detail screen is opened. No notification center was created.

---

## Parts implemented

### Part 1 — Remove V1 "Contact Requests" NavCard from technician dashboard

**File:** `app/technician/index.tsx`

- Removed the "Contact Requests" NavCard (pointing to `/technician/requests`)
- Removed the "Recent Requests" section at the bottom of the screen (used `IncomingRequestCard` + V1 `requests` from `useTechnicianDashboard`)
- Removed `SectionHeader`, `IncomingRequestCard` imports
- Removed `requests, companyMap, acceptRequest, rejectRequest` from `useTechnicianDashboard` destructure
- Updated metrics row: now shows `pendingDirectOffers` (V2), `pendingApplications` (V2), and `documents.length`
- `app/technician/requests.tsx` is retained (route still exists for backward navigation); the NavCard entry point to it is removed

---

### Part 2 — ActivityItem type + activityRepository + seed data + DB key

**Files created:**
- `src/types/activity.ts` — `ActivityType` union + `ActivityItem` interface
- `src/repositories/v2/activityRepository.ts` — `create`, `getUnreadCount`, `getUnreadEntityIds`, `markRead`
- `src/data/seeds/activities.json` — 2 seed activity items (see below)

**File modified:** `src/storage/localDatabase.ts`
- Added `v2Activities: 'db:v2:activities'` to `DB_KEYS`
- Added `import v2Activities from '../data/seeds/activities.json'`
- Added `await storageAdapter.set(DB_KEYS.v2Activities, v2Activities)` to `seedV2Data()`

**ActivityType values:**
| Type | Recipient | Trigger |
|---|---|---|
| `application_received` | company | Technician submits application |
| `application_accepted` | technician | Company accepts application |
| `application_rejected` | technician | Company rejects application |
| `direct_offer_received` | technician | Company sends direct offer |
| `direct_offer_accepted` | company | Technician accepts direct offer |
| `direct_offer_rejected` | company | Technician rejects direct offer |

**Seed activities (pre-seeded, unread):**
| ID | Type | Recipient | EntityId |
|---|---|---|---|
| act-001 | `direct_offer_received` | tech-001 | oreq-001 |
| act-002 | `application_received` | comp-001 | oapp-009 |

---

### Part 3 — Wire activity creation into repositories

**`src/repositories/v2/offerApplicationRepository.ts`:**
- `create()` → creates `application_received` for company after saving
- `updateStatus()` → creates `application_accepted` or `application_rejected` for technician after updating

**`src/repositories/v2/offerRequestRepository.ts`:**
- `create()` → creates `direct_offer_received` for technician after saving
- `updateStatus()` → creates `direct_offer_accepted` or `direct_offer_rejected` for company after updating

Repository logic (chat room creation, identity unlock) is unchanged.

---

### Part 4 — Dashboard NavCard badges

**`app/technician/index.tsx`:**
- Loads `unreadDirectOffers` (`direct_offer_received`) and `unreadBrowseOffers` (`application_accepted | application_rejected`) from `activityRepository.getUnreadCount()`
- "Direct Offers" NavCard: badge shows `unreadDirectOffers`; accent color = error (red) when unread, warning when only pending, blue otherwise
- "Browse Offers" NavCard: badge shows `unreadBrowseOffers`; accent color = error when unread, success otherwise

**`app/company/index.tsx`:**
- Loads `unreadApplications` (`application_received`) and `unreadJobOffers` (`direct_offer_accepted | direct_offer_rejected`)
- "Applications" NavCard: badge shows `unreadApplications`; accent = error when unread
- "Job Offers" NavCard: badge shows `unreadJobOffers`; accent = error when unread

---

### Part 5 — Item-level red dots + unread sorting

All three list screens load unread entity ID sets from `activityRepository.getUnreadEntityIds()` and sort unread items first.

**`app/technician/direct-offers/index.tsx`:**
- Loads `unreadIds` for types `direct_offer_received | direct_offer_accepted | direct_offer_rejected`
- Sort: unread first → STATUS_ORDER → createdAt DESC
- Card: red border + red dot in top-right corner when unread

**`app/company/applications/index.tsx`:**
- Loads `unreadIds` for type `application_received`
- Sort: unread first → status order → createdAt DESC
- Card: red border + red dot in top-right corner when unread

**`app/technician/offers/index.tsx`:**
- Loads `unreadAppIds` (application IDs) for types `application_accepted | application_rejected`
- Maps: offer → application → check if application.id is in unreadAppIds
- Sort: unread first → score.total DESC
- Card: red border + red dot in top-right corner when unread

---

### Part 6 — Mark-as-read on detail screen open

Each detail screen calls `activityRepository.markRead()` inside `load()` after successfully loading the entity.

| Screen | Mark-as-read call |
|---|---|
| `app/technician/direct-offers/[id].tsx` | `markRead('technician', DEMO_TECHNICIAN_ID, id)` |
| `app/company/applications/[id].tsx` | `markRead('company', DEMO_COMPANY_ID, id)` |
| `app/technician/offers/[id].tsx` | `markRead('technician', DEMO_TECHNICIAN_ID, app.id)` when app exists |

The mark-as-read is fire-and-forget inside `load()` — it does not block or change any displayed state. The red dot disappears the next time the list is opened (useFocusEffect re-runs load).

---

### Part 7 — validateSeeds.js update

Added activity seed validation to `scripts/validateSeeds.js`:
- Validates `type` against `ActivityType` union
- Validates `recipientRole` is `technician` or `company`
- Cross-checks `recipientId` against `technicianProfiles` (for technician) or `companies` (for company)
- Cross-checks `entityId` against `offerRequests` (for `direct_offer_*`) or `offerApplications` (for `application_*`)
- Adds `Activities:` line to summary output

---

## Files changed

| File | Change |
|---|---|
| `src/types/activity.ts` | **Created** — ActivityType + ActivityItem |
| `src/repositories/v2/activityRepository.ts` | **Created** — create, getUnreadCount, getUnreadEntityIds, markRead |
| `src/data/seeds/activities.json` | **Created** — 2 seed activity items |
| `src/storage/localDatabase.ts` | Added `v2Activities` key + import + seedV2Data call |
| `src/repositories/v2/offerApplicationRepository.ts` | Wire activity creation on create + updateStatus |
| `src/repositories/v2/offerRequestRepository.ts` | Wire activity creation on create + updateStatus |
| `app/technician/index.tsx` | Remove V1 NavCard/section, add unread badge state |
| `app/company/index.tsx` | Add unread badge state for Applications + Job Offers |
| `app/technician/direct-offers/index.tsx` | Unread sort + red dot on cards |
| `app/company/applications/index.tsx` | Unread sort + red dot on cards |
| `app/technician/offers/index.tsx` | Unread sort + red dot on cards |
| `app/technician/direct-offers/[id].tsx` | markRead on open |
| `app/company/applications/[id].tsx` | markRead on open |
| `app/technician/offers/[id].tsx` | markRead on open (when app exists) |
| `scripts/validateSeeds.js` | Activity seed validation block |

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors; Activities: 2 (unread:2) |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Manual tests

Reset demo data before each test sequence.

### Red dots visible from start

1. Press **Reset demo data** → navigate to Technician dashboard
2. "Direct Offers" NavCard: shows red badge (1) — act-001 for oreq-001
3. Navigate to Technician → Direct Offers: oreq-001 card has red border + red dot, sorted first
4. Open oreq-001 detail → red dot clears on next list visit
5. Press **Reset demo data** → navigate to Company dashboard
6. "Applications" NavCard: shows red badge (1) — act-002 for oapp-009
7. Navigate to Company → Applications: oapp-009 card has red border + red dot, sorted first
8. Open oapp-009 detail → red dot clears on next list visit

### New activity flow (direct offer)

1. Press **Reset demo data**. Go to Company → Job Offers → open any published offer → Send Direct Offer to a technician
2. Go to Technician dashboard → "Direct Offers" NavCard shows red badge
3. Navigate to Direct Offers list → new entry has red dot, appears at top
4. Open the detail → mark-as-read fires; navigate back → red dot gone

### New activity flow (application accept/reject)

1. Press **Reset demo data**. Go to Technician → Browse Offers → apply to any offer
2. Go to Company → Applications → accept/reject the application
3. Go to Technician dashboard → "Browse Offers" NavCard shows red badge (1 for accepted or rejected)
4. Navigate to Browse Offers list → applied offer has red dot, sorted first
5. Open offer detail → mark-as-read fires; navigate back → red dot gone

### Contact Requests NavCard removed

1. On Technician dashboard, verify no "Contact Requests" NavCard exists
2. Verify no "Recent Requests" section at bottom of Technician dashboard
3. Verify `/technician/requests` route still accessible (direct navigation)

---

## What was NOT added

Per constraints:
- No push notifications
- No emails
- No notifications panel / notifications screen
- No notification center
- No new_message activity type (would require wiring chatRepository.sendMessage — out of scope)
- No real-time badge updates (badges refresh on useFocusEffect, i.e., when navigating back to a screen)

---

## Remaining risks

| Risk | Description |
|---|---|
| Badge count goes stale on same screen | Dashboard loads badges once on mount (useEffect). If activity is created while on dashboard, count won't update until re-mount. Acceptable for demo. |
| `withdraw` creates no activity | Technician withdrawing an application does not notify the company — no activity type defined for this. |
| Activities accumulate without cleanup | No pruning of old read activities. For demo scale, harmless. |
