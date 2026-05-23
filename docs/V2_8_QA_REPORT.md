# V2-8 QA Report — Admin V2

**Date:** 2026-05-23  
**Phase:** V2-8 — Admin V2: Offer moderation, combined requests/applications, richer metrics

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Routes added (1)

| Route | Description |
|---|---|
| `/admin/offers` | Offer moderation — list all offers, filter by status, change status via Alert |

**Total routes: 36** (was 35 after V2-7)

---

## Files created

- `app/admin/offers.tsx` — Offer moderation screen (list, filter, status change)

---

## Files modified

- `src/state/useAdminDashboard.ts` — Added `offers`, `offerRequestsV2`, `offerApplicationsV2` state; `updateOfferStatus`; new metrics (`totalOffers`, `publishedOffers`, `totalDirectOffers`, `totalApplicationsV2`); removed redundant secondary useEffect; added `offerTitleMap`
- `app/admin/requests.tsx` — Rewritten: V2-native combined OfferRequest + OfferApplication view with kind filter, identity/docs flags, technician real name
- `app/admin/index.tsx` — Added Offers NavCard; expanded metrics grid to 9 cells (was 6); updated Requests NavCard subtitle and badge

---

## useAdminDashboard changes

### New state
- `offers: Offer[]` — all 12 offers (V2 native, not compat-adapted)
- `offerRequestsV2: OfferRequest[]` — all 12 direct offers (V2 native)
- `offerApplicationsV2: OfferApplication[]` — all 8 applications (V2 native)

### New method
- `updateOfferStatus(id, status)` — calls `offerRepository.updateStatus()` + updates local state

### New metrics fields
| Field | Description |
|---|---|
| `totalOffers` | Total offer count (12) |
| `activeOffers` | Published offers (was redundant side effect, now in main load) |
| `totalDirectOffers` | Total OfferRequests (12) |
| `totalApplicationsV2` | Total OfferApplications (8) |

### New return field
- `offerTitleMap: Record<string, string>` — offer id → title, for lookup in requests screen

### Consolidation
- Removed redundant secondary `useEffect` that re-fetched offerRequests, offerApplications, and offers after load. All data now loaded in a single `Promise.all` in `load()`.

---

## app/admin/offers.tsx

New screen. Lists all offers with:
- Status filter tabs: All / Published / Draft / Closed / Expired
- Sorted: published → draft → closed → expired, then newest first
- OfferCard: title, company name (from companyMap), location, contractType, minYearsExperience, status pill, created date
- Tap to moderate via Alert — allowed transitions:
  - `draft` → published, expired
  - `published` → closed, expired
  - `closed` → expired
  - `expired` → no actions
- Uses `updateOfferStatus` from hook

---

## app/admin/requests.tsx

Full rewrite replacing V1 `MatchRequest` with V2-native `OfferInboxRecord[]`.

### Combined list
- `offerRequestsV2` (12 direct offers) + `offerApplicationsV2` (8 applications) merged into `OfferInboxRecord[]`
- Discriminated by `kind` field (`direct_offer` | `application`)
- Sorted: pending → accepted → rejected → expired → withdrawn, then newest first

### Filters
- Status tabs: All / Pending / Accepted / Rejected
- Kind chips (horizontal scroll): All types / 📩 Direct offers / 📝 Applications

### Summary strip
- Pending (all kinds) | Accepted (all kinds) | Direct offers total | Applications total

### RecordCard
- Kind badge (colored: blue for direct offer, cyan for application)
- Status pill
- Company name (from companyMap)
- Technician: anonymous code + real name (admin sees both — privacy gate bypassed)
- Offer title if linked (from offerTitleMap)
- Message/cover note if present (italic, muted)
- Identity Revealed flag chip (✓ green / – gray)
- Documents Unlocked flag chip (✓ green / – gray)
- Created date

---

## app/admin/index.tsx

### Metrics grid (expanded from 6 to 9 cells)
| Cell | Color | Highlight |
|---|---|---|
| Technicians (total) | blue | — |
| Verified techs | success | — |
| Tech pending | warning | if > 0 |
| Companies | cyan | — |
| Docs pending | warning/success | if > 0 |
| Offers (total) | navy | — |
| Published | success | — |
| Direct pend. | warning | if > 0 |
| Apps pend. | warning | if > 0 |

### NavCards (updated)
- Added: 📋 **Offers** — `${totalOffers} total · ${activeOffers} published` → `/admin/offers`
- Updated: 🔀 **Requests** — `${totalDirectOffers} direct · ${totalApplicationsV2} applications`; badge = pending direct offers + pending applications

---

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Admin dashboard uses V2 metrics | PASS |
| 2 | Admin can manage technician verification | PASS (unchanged, was V2 already) |
| 3 | Admin can manage company verification | PASS (unchanged, was V2 already) |
| 4 | Admin can review document metadata | PASS (unchanged, was V2 already) |
| 5 | Admin can update document status | PASS (unchanged) |
| 6 | Admin can view/moderate offers | PASS (`/admin/offers` new screen) |
| 7 | Admin can view direct offers and applications | PASS (requests screen rewritten) |
| 8 | Admin can block/suspend users | SKIPPED — `TechnicianProfile`/`CompanyProfile` have no `userStatus` field; TODO added for V2-9 |
| 9 | TypeScript check passes | PASS — 0 errors |
| 10 | Seed validation passes | PASS — 0 errors |
| 11 | Expo export passes | PASS — 36 routes |
| 12 | App still starts | PASS |
| 13 | No Supabase added | PASS |
| 14 | No real auth added | PASS |

---

## TODOs left for V2-9

- User blocking/suspension: `TechnicianProfile` and `CompanyProfile` currently have no `userStatus` field — add to schema + Supabase table before implementing
- `canManageOffers` guards on offer edit/publish/close in `/company/offers/[id]` (deferred from V2-7)
- All permission checks marked `// TODO: enforce via Supabase RLS in V2-9`

---

## Regression check

| Screen | Status |
|---|---|
| `/admin/technicians` | Untouched — still uses useAdminDashboard V1 compat output |
| `/admin/companies` | Untouched — still uses useAdminDashboard V1 compat output |
| `/admin/documents` | Untouched |
| `/company/*` | Untouched |
| `/technician/*` | Untouched |

---

## Issues found / fixed

None — clean implementation. The redundant secondary useEffect in `useAdminDashboard` was loading offers/requests/applications a second time after `loading` changed; consolidated into the single `load()` function.

---

## Ready for V2-9

Yes. V2-8 is complete. Suggested next phase: V2-9 — Supabase migration (auth, Postgres, RLS enforcement).
