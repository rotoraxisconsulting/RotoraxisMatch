# V2-2 QA Report — AviationJobTalent

**Date:** 2026-05-23
**Phase:** V2-2 (Company job offer management UI)
**Status:** PASS — ready for V2-3

---

## 1. Scope of V2-2

Company users can now:
1. View all their job offers with status (list screen)
2. Create a new offer (title, description, contract type, location, experience, requirements)
3. Edit an existing offer (all fields + requirements)
4. Publish or close an offer from the detail screen
5. Open offer detail and see technicians ranked by match % for that specific offer
6. Send a direct offer to a technician from the detail screen

All new routes are under `app/company/offers/`.

---

## 2. Files created / modified

### Repository
| File | Change |
|------|--------|
| `src/repositories/v2/offerRepository.ts` | Added `create()` and `replaceRequirements()` methods |

### New screens
| File | Route |
|------|-------|
| `app/company/offers/_layout.tsx` | Stack layout for offers sub-section |
| `app/company/offers/index.tsx` | `/company/offers` — list of company offers |
| `app/company/offers/new.tsx` | `/company/offers/new` — create offer form |
| `app/company/offers/edit.tsx` | `/company/offers/edit?id=xxx` — edit offer form |
| `app/company/offers/[id].tsx` | `/company/offers/:id` — detail + ranked technicians |

### Modified screens
| File | Change |
|------|--------|
| `app/company/index.tsx` | Added "Job Offers" nav card → `/company/offers` |

---

## 3. TypeScript / lint checks

```
npx tsc --noEmit
Exit code: 0 — zero errors
```

No ESLint is configured in this project.

**Result: PASS**

---

## 4. Seed validation

```
node scripts/validateSeeds.js
```

Output: NO ERRORS FOUND — all checks passed (unchanged from V2-1e baseline).

**Result: PASS — 0 errors**

---

## 5. Expo web export

```
npx expo export --platform web
Exit code: 0
```

**Routes bundled successfully (24/24):**

| Route | Size | Status |
|-------|------|--------|
| / (index) | 32.1 kB | ✓ |
| /intro | 34 kB | ✓ |
| /onboarding | 36.3 kB | ✓ |
| /settings | 35.6 kB | ✓ |
| /map | 33.7 kB | ✓ |
| /company | 34.1 kB | ✓ |
| /company/search | 56.8 kB | ✓ |
| /company/requests | 35.4 kB | ✓ |
| /company/profile | 34.1 kB | ✓ |
| /company/offers | 35.7 kB | ✓ (new) |
| /company/offers/new | 53.6 kB | ✓ (new) |
| /company/offers/edit | 35.7 kB | ✓ (new) |
| /company/offers/[id] | 35.7 kB | ✓ (new) |
| /technician | 34.1 kB | ✓ |
| /technician/requests | 34.8 kB | ✓ |
| /technician/documents | 34.3 kB | ✓ |
| /technician/profile | 34.1 kB | ✓ |
| /admin | 34.1 kB | ✓ |
| /admin/requests | 36 kB | ✓ |
| /admin/technicians | 35.2 kB | ✓ |
| /admin/companies | 36.4 kB | ✓ |
| /admin/documents | 34.8 kB | ✓ |
| /_sitemap | 31 kB | ✓ |
| /+not-found | 31 kB | ✓ |

**Main bundle:** 1.38 MB (includes all V2 screens + offer management)
**Map bundle (web):** 187 kB (Leaflet — separate chunk)

No Metro errors, no missing module errors.

**Result: PASS**

---

## 6. Feature validation

### Offer list (`/company/offers`)
- Loads `offerRepository.getForCompany(DEMO_COMPANY_ID)` on focus (useFocusEffect) ✓
- Sorted newest first ✓
- Status-colored left border (published=green, draft=amber, closed=muted, expired=red) ✓
- Shows contract type and minimum experience as chips ✓
- Empty state with "Create offer" CTA ✓
- Pull-to-refresh supported ✓
- List refreshes when returning from create/edit screens ✓

### Create offer (`/company/offers/new`)
- Validates: title (required, min 3 chars), description, country, city ✓
- Year stepper: 0–30 ✓
- Contract type segmented control ✓
- Multi-select pills for technician types, licenses, aircraft types (empty = accept any) ✓
- "Save as draft" / "Publish" buttons → calls `offerRepository.create({ ..., status })` ✓
- Navigates back to list after save ✓

### Edit offer (`/company/offers/edit?id=xxx`)
- Pre-fills all fields from `offerRepository.getWithRequirements(id)` ✓
- Saves offer fields via `offerRepository.update()` ✓
- Saves requirements via `offerRepository.replaceRequirements()` (removes old, inserts new) ✓
- "Save & Publish" button shown only when current status is draft ✓

### Offer detail (`/company/offers/:id`)
- Shows offer title, location, description, contract type, requirements ✓
- Publish/close status buttons with loading state ✓
- "Edit offer" navigates to edit screen ✓
- Calls `getTechnicianMatchesForOffer(offerId)` — sorted by score desc ✓
- Each technician card shows score as "X% match for this offer" ✓
- Score breakdown shows per-criterion points (verified/habilitation/license/availability/experience/location) ✓
- Score color: ≥80% green, ≥60% blue, ≥40% amber, <40% muted ✓
- "Send direct offer" CTA per technician ✓
- If pending direct offer exists for this tech+offer: shows "Direct offer sent — pending" ✓
- If accepted: shows "Accepted" ✓
- Modal for message input before confirming send ✓
- Duplicate prevention: `offerRequestRepository.create()` throws if pending direct offer already exists ✓

### Privacy validation
- Technician cards in offer detail use `SafeTechnicianPreview` from `getTechnicianMatchesForOffer` ✓
- No firstName, lastName, email, phone, birthDate shown ✓
- `anonymousCode` is the only identifier ✓
- `identityRevealed` + `documentsUnlocked` fields only set on acceptance (handled by offerRequestRepository) ✓

### Match score validation
- `calculateOfferTechnicianMatch(offer, technician)` always returns `{ offerId, technicianId, total, label, breakdown }` ✓
- Score displayed as "X% match for this offer" — not as a standalone profile score ✓
- General technician search (`/company/search`) unchanged — no match score shown there ✓
- Score ring in `TechnicianCard` only renders if `t.matchingScore !== undefined` — invisible in general search ✓

### Duplicate prevention
- `offerRequestRepository.create()` checks for existing pending direct offer with same companyId + technicianId + offerId ✓
- Error message shown via `Alert.alert` ✓

---

## 7. Acceptance criteria checklist

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Company can list offers | ✅ `/company/offers` shows all company offers |
| 2 | Company can create offers | ✅ Form with all fields, saves to offerRepository |
| 3 | Company can open offer detail | ✅ `/company/offers/:id` |
| 4 | Offer detail shows technicians ranked by offer-specific match | ✅ getTechnicianMatchesForOffer(offerId) |
| 5 | Each score clearly says "match for this offer" | ✅ "X% match for this offer" label on every card |
| 6 | Company can send a direct offer to a technician | ✅ Modal with message → offerRequestRepository.create() |
| 7 | Duplicate pending direct offers are prevented | ✅ Repository throws; UI shows error alert |
| 8 | No private technician data leaks | ✅ SafeTechnicianPreview only — no names/email/phone |
| 9 | Typecheck passes | ✅ tsc --noEmit exit 0 |
| 10 | App still starts | ✅ Expo export: all 24 routes |
| 11 | No Supabase added | ✅ |

**All 11 criteria: PASS**

---

## 8. Remaining risks / known limitations

| Risk | Severity | Notes |
|------|----------|-------|
| Offer edit does not re-validate requirements on open | Low | If a requirement code was removed from the catalog, the pre-filled chip would just not appear selected. No crash. |
| Offer detail loads all 18 technicians sequentially | Low | `getTechnicianMatchesForOffer` calls `getWithRelations` per technician. At 18 techs this is fast; would slow at scale. Loading state is shown. |
| `useFocusEffect` from expo-router may not be available in older Expo SDK versions | Low | If removed in a version mismatch, fall back to `useEffect` + pull-to-refresh. |
| `company/offers/edit` uses query param `?id=` | Low | Expo Router supports `useLocalSearchParams`. Not deeply-linked from offer detail — only via router.push with query string. |
| OfferApplications not shown in technician dashboard | Medium | Unchanged from V2-1e — V2-3 scope. |

---

## 9. Decision: proceed to V2-3?

**Yes. V2-2 is complete. Company offer management UI is functional and validated.**

V2-3 scope (next phase): Technician offer browsing and application UI — technicians can browse published offers, see match score per offer, and submit applications via `offerApplicationRepository.create()`. Technician dashboard should show both received direct offers (offerRequests) and submitted applications (offerApplications).
