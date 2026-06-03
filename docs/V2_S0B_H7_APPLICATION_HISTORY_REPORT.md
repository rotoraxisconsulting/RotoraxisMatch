# V2-S0B H7 — Application History / Discovery Separation Report

**Date:** 2026-05-31  
**Finding:** H7 — No standalone "My Applications" screen. Technician application history depended on `getPublishedOffers()`, so applications disappeared from view when linked offers closed. Offer detail aborted on closed/expired offers, preventing historical browsing.  
**Status:** Resolved. Applications history screen added. Offer detail handles closed offers. Company side was already correct.

---

## 1. Decision Summary

**Core rule: Offer visibility controls discovery, not history.**

| Screen | Purpose | Data source | Shows closed offers? |
|--------|---------|-------------|----------------------|
| Browse Offers (`/technician/offers`) | Discovery | `getOfferMatchesForTechnician()` — published/visible only | ❌ No |
| My Applications (`/technician/applications`) | History | `getForTechnician()` — all apps regardless of offer status | ✅ Yes (as history) |
| Offer Detail (`/technician/offers/[id]`) | Detail + apply | `getWithRequirements()` — any status | ✅ Yes (historical banner) |
| Company Applications (`/company/applications`) | History | `getForCompany()` — all apps | ✅ Already correct |
| Company Job Offers (`/company/offers`) | Management | `getAllWithRequirements()` — all offers | ✅ Already correct |

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `app/technician/offers/[id].tsx` | Aborted early for closed/expired offers (`!isOfferOpenForTechnicians(o)`). Also: `canApply` didn't check offer is open. **Required fix.** |
| `app/technician/offers/index.tsx` | Browse Offers (discovery only) — correct. Shows app status badges. No change needed. |
| `app/technician/index.tsx` | Had `unreadBrowseOffers` on Browse Offers NavCard; no My Applications NavCard. **Required addition.** |
| `app/company/offers/index.tsx` | Already loads ALL company offers regardless of status. Subtitle only showed published + drafts count. Minor fix. |
| `app/company/applications/index.tsx` | Already loads ALL applications (`getForCompany()`), loads all offers regardless of status. ✅ Already correct. |
| `app/company/applications/[id].tsx` | No issues. ✅ Already correct. |
| `src/repositories/v2/offerRepository.ts` | `getById()` returns any offer. `getPublished()` returns only published. ✅ Used correctly. |
| `src/repositories/v2/offerApplicationRepository.ts` | `getForTechnician()` returns all apps regardless of offer status. ✅ Already correct. |
| `src/state/useTechnicianDashboard.ts` | Uses offer requests (direct offers). No application history logic. ✅ Not affected. |

---

## 3. Technician History — What Changed

### `app/technician/offers/[id].tsx`

**Before:** Aborted load and showed "Offer not found" for any closed/expired offer.
```typescript
if (!o || !isOfferOpenForTechnicians(o)) {
  setOffer(null);
  ...
  return;  // technician loses access to application history
}
```

**After:** Only aborts if offer doesn't exist. Shows closed offers as historical context.
```typescript
if (!o) {
  setOffer(null);  // truly not found
  ...
  return;
}
```
- Added `closedBanner` shown when `!isOfferOpenForTechnicians(offer)`: "This offer is closed/expired. Viewing as historical record."
- Fixed `canApply` to also require `isOfferOpenForTechnicians(offer)` (prevents Apply button on closed offers)

### New: `app/technician/applications/_layout.tsx`
Simple Stack layout for the new route group.

### New: `app/technician/applications/index.tsx`
My Applications screen — canonical technician application history:
- Loads all applications via `offerApplicationRepository.getForTechnician(technicianId)` — no offer status dependency
- For each application, loads offer via `offerRepository.getById()` (any status)
- Shows offer status badge when not published (e.g. "Offer closed", "Offer expired")
- Shows application status badge (Pending / Accepted / Not selected / Withdrawn / Expired)
- Filter tabs: All / Pending / Accepted / Closed
- Direct "Open chat" button for accepted applications with a chat room
- Unread dot for application_accepted / application_rejected events

### `app/technician/index.tsx`
- Added `pendingApplications` and `unreadApplications` to `ActionPanelProps`
- Added "My Applications" NavCard to both rail and normal ActionPanel layouts
- Moved application unread signals (`unreadBrowseOffers` = accepted/rejected events) to My Applications NavCard (semantically correct: these are "your application was reviewed" notifications, not "new offers to browse")
- Removed application unread count from Browse Offers NavCard (Browse Offers is discovery — it doesn't need application-review notifications)

---

## 4. Company History — What Was Already Correct

| Screen | Data source | Behavior |
|--------|------------|---------|
| Company Job Offers | `offerRepository.getAllWithRequirements()` filtered by companyId | Shows ALL offers (draft, published, closed, expired) — already correct |
| Company Applications | `offerApplicationRepository.getForCompany()` + `offerRepository.getAllWithRequirements()` | Shows ALL applications regardless of offer status — already correct |

**Only change on company side:** `app/company/offers/index.tsx` subtitle changed from  
`"X published - Y drafts"` → `"N total · X published · Y drafts"` to make closed/expired offers visible in the count.

---

## 5. Repository Changes

None required. All repositories already had correct behavior:
- `offerRepository.getById()` — returns offer regardless of status ✅
- `offerRepository.getPublished()` / `getPublishedWithRequirements()` — discovery only ✅
- `offerApplicationRepository.getForTechnician()` — all apps regardless of offer status ✅
- `offerApplicationRepository.getForCompany()` — all apps ✅

---

## 6. Files Modified

| File | Change |
|------|--------|
| `app/technician/offers/[id].tsx` | Removed closed-offer abort; added closed banner; fixed `canApply` to check offer is open |
| `app/technician/applications/_layout.tsx` | **NEW** — Stack layout for applications route |
| `app/technician/applications/index.tsx` | **NEW** — My Applications history screen |
| `app/technician/index.tsx` | Added My Applications NavCard; moved application unread signals to it |
| `app/company/offers/index.tsx` | Subtitle now shows total offer count |
| `docs/USER_FLOWS_V2.md` | Section 5 split into "5a Browse Offers (discovery)" and "5b My Applications (history)" |
| `docs/DATA_MODEL_V2.md` | Applications section clarifies My Applications as history screen |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Added technician screens by purpose table |
| `docs/HANDOFF_SUMMARY.md` | Routes updated: 36 → 37; `/technician/applications` added |

---

## 7. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| Technician navigates from Browse Offers offer card to an offer that has since closed | Offer detail now handles this — shows historical banner, no Apply button |
| Applications for offers that no longer exist (deleted, not in seeds) | `offer: null` renders "Offer unavailable" on the card; "View offer" still navigates to the detail screen which shows "Offer not found" correctly |
| Map screen's `useMapTechnicians` still uses V1 repositories | Pre-existing V1 compat issue, not introduced by H7 |

---

## 8. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Browse Offers is discovery only (published/visible) | ✅ PASS — unchanged |
| 2 | Technician has application history independent from published offers | ✅ PASS — `/technician/applications` added |
| 3 | Company applications remain visible historically | ✅ PASS — was already correct |
| 4 | Company offers remain visible historically | ✅ PASS — was already correct |
| 5 | Closed/expired offers do not appear as new opportunities | ✅ PASS — `canApply` now requires `isOfferOpenForTechnicians` |
| 6 | Existing accepted chats remain accessible | ✅ PASS — My Applications has "Open chat" CTA |
| 7 | H6 one-application rule remains intact | ✅ PASS — no change to repository duplicate check |
| 8 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 9 | `node scripts/validateSeeds.js` passes | ✅ PASS — 0 errors, 0 warnings |
| 10 | `npx expo export --platform web` builds all routes | ✅ PASS — 37 routes exported |

**H7 is fully resolved.**
