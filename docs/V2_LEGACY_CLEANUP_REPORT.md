# V2 Legacy Cleanup Report

**Date:** 2026-05-24  
**Phase:** V2-10c — Controlled V1/compat reference cleanup

---

## Summary

Removed the most visible V1 concepts from the company dashboard and legacy request screens. Documented remaining V1 compat so future contributors know what stays, what must go, and why.

---

## Changes made

### Company dashboard (`app/company/index.tsx`)

**Removed:**
- "Sent Requests" NavCard (→ `/company/requests`)
- "Recent Requests" section with `MatchRequestCard` and `SectionHeader`
- `sentCount`, `acceptedCount`, `recentRequests` V1 computed variables
- `MatchRequestCard` and `SectionHeader` imports
- `requests`, `technicianMap` from `useCompanyDashboard()` destructure

**Added:**
- `offerRequestRepository` import
- `pendingDirectOffers` state (loaded from `offerRequestRepository.getForCompany()`)
- Metrics row now shows V2 data: **Pending apps** / **Direct offers** / **Active chats**

**Unchanged:**
- `company` from `useCompanyDashboard()` still used for the company header card (V1 compat shape; acceptable until company profile is migrated)
- All 7 remaining NavCards (Search, Profile, Job Offers, Applications, Chats, Team, Map)

---

### Legacy redirect screens

**`app/company/requests.tsx`** — replaced with a redirect screen:
- No longer renders `MatchRequestCard` or consumes `useCompanyDashboard`
- Shows a message and two buttons: "View Applications" → `/company/applications`, "View Job Offers" → `/company/offers`
- Route is retained so old deep links don't 404
- TODO comment: remove when confirmed no deep links remain

**`app/technician/requests.tsx`** — replaced with a redirect screen:
- No longer renders `IncomingRequestCard` or consumes `useTechnicianDashboard`
- Shows a message and two buttons: "View Direct Offers" → `/technician/direct-offers`, "Browse Job Offers" → `/technician/offers`
- Route is retained; TODO comment added

---

### Type annotations (`src/types/matchRequest.ts`)

Added `@deprecated` JSDoc to `MatchRequestStatus` and `MatchRequest` with migration notes pointing to `OfferRequest`.

---

### TODO comment (`src/state/useMapTechnicians.ts`)

Added comment explaining why `matchRequestRepository` and `technicianRepository` (V1) are still used and what migration looks like.

---

### Copy updates

| File | Old text | New text |
|---|---|---|
| `app/onboarding.tsx` | "Receive contact requests" | "Receive direct offers & apply to jobs" |
| `app/onboarding.tsx` | "Send contact requests" | "Post offers & send direct offers" |
| `src/components/IncomingRequestCard.tsx` | "Decline the contact request from…" | "Decline the direct offer from…" |
| `src/components/TechnicianMapLeafletImpl.tsx` | "Use Search to send a contact request." | "Use Search to send a direct offer." |
| `src/components/TechnicianMap.native.tsx` (popup HTML) | "Use Search to send a contact request." | "Use Search to send a direct offer." |
| `src/components/intro/IntroExperience.web.tsx` | "…accepts a contact request" | "…accepts a direct offer" |

---

## What was intentionally left in place

These V1 structures must stay until their consumers are migrated:

| Artifact | Remaining consumers | Safe to remove when |
|---|---|---|
| `MatchRequest` / `MatchRequestStatus` | `useCompanyDashboard`, `useTechnicianDashboard`, `useAdminDashboard`, `company/search`, `company/profile`, admin screens | `company/search` migrated to V2 `OfferRequest` type |
| `v2CompatAdapters.ts` functions | All three dashboard hooks, `company/profile` | All consumers removed |
| `SafeTechnicianView` | `company/search`, map, `TechnicianCard`, `RequestContactModal` | Search + map migrated to `SafeTechnicianPreview` |
| `matchRequestRepository` | `useMapTechnicians` only | Map screen migrated to V2 |
| `useMapTechnicians` | `app/map.tsx` | Map screen migrated to V2 |
| V1 `Company` shape (`companyName`, `contactEmail`) | `company/profile`, `IncomingRequestCard` | Those screens migrated to `CompanyProfile` |

### `app/company/profile.tsx` — intentionally unchanged

This screen uses `company.companyName`, `sentCount` (V1), `acceptedCount` (V1). Rewriting it would risk breaking the company profile view, which is outside the scope of this cleanup pass. Its V1 metrics are cosmetically misleading (shows sent/accepted counts) — acceptable for demo, fix before production.

### `app/company/search.tsx` — intentionally unchanged

This screen passes V1 `requests: MatchRequest[]` to `useTechnicianSearch.search()`. Migrating it requires rewriting the search hook to accept V2 `OfferRequest[]`. Marked as RISKY in the inspection — left for a dedicated migration.

### Admin screens — intentionally unchanged

`app/admin/requests.tsx` uses V2 `offerRequestsV2` and `offerApplicationsV2` natively. The minor V1 compat in `useAdminDashboard` (returns `requests: MatchRequest[]` for the dashboard count) does not affect admin functionality.

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Acceptance criteria — verification

| # | Criterion | Status |
|---|---|---|
| 1 | No dual "Contact Requests" + "Direct Offers" on technician dashboard | PASS — technician nav only shows Direct Offers and Browse Offers |
| 2 | No obsolete V1 request concepts on company dashboard | PASS — "Sent Requests" NavCard and "Recent Requests" section removed |
| 3 | V2 screens don't use V1 MatchRequest as source of truth | PASS — company/requests and technician/requests are now redirects |
| 4 | No V2 repository uses status 'sent' | PASS — only compat adapter `v2OfferRequestToMatchRequest()` maps pending→sent |
| 5 | Obsolete V1 routes hidden/redirected/marked legacy | PASS — both legacy routes redirect to V2 screens |
| 6 | Remaining V1 compat documented | PASS — this report + HANDOFF_SUMMARY V1 compat table |
| 7 | Typecheck passes | PASS |
| 8 | Seed validation passes | PASS |
| 9 | Expo export passes | PASS |
| 10 | No Supabase added | PASS |
| 11 | No real auth added | PASS |
| 12 | App remains runnable | PASS |
