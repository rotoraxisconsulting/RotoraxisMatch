# V2-S0B H2 — `locationCityId` Required Report

**Date:** 2026-05-31  
**Finding:** H2 — `TechnicianProfile`, `CompanyProfile`, and `SafeTechnicianPreview` had `locationCityId?: string` (optional) in TypeScript, while the SQL schema and V2 docs require `location_city_id NOT NULL`. This misalignment means a TypeScript object without `locationCityId` would pass type-checking but fail a Supabase INSERT.  
**Status:** Resolved. `locationCityId` is now required in all persisted V2 types. All seeds already had it. No seed changes were needed.

---

## 1. Files Inspected

| File | Finding |
|------|---------|
| `src/types/technician.ts` | `TechnicianProfile.locationCityId?: string` — **MUST FIX** |
| `src/types/company.ts` | `CompanyProfile.locationCityId?: string` — **MUST FIX** |
| `src/types/privacy.ts` | `SafeTechnicianPreview.locationCityId?: string` — **MUST FIX** |
| `src/types/offer.ts` | `Offer.locationCityId: string` — ✅ already required |
| `src/repositories/v2/technicianRepositoryV2.ts` | `location?.locationCityId ?? profile.locationCityId` — resolves to `string` after type fix ✅ |
| `src/repositories/v2/companyRepositoryV2.ts` | `location?.locationCityId ?? company.locationCityId` — resolves to `string` after type fix ✅ |
| `src/repositories/v2/offerRepository.ts` | `locationCityId: string` already in `Offer` — ✅ clean |
| `src/utils/v2CompatAdapters.ts` | `compatLocation` accepts `locationCityId?: string` for V1/V2 union — correct (compat layer) |
| `src/utils/privacyV2.ts` | `location?.locationCityId ?? technician.locationCityId` — resolves to `string` ✅ |
| `src/utils/matchingV2.ts` | Uses `offer.locationCityId` (already required) — ✅ clean |
| `app/technician/profile.tsx` | Uses `Partial<Technician>` (V1 type) for form state — optional locationCityId is correct |
| `app/company/profile.tsx` | Had dead-code `profile.locationCityId ?? ''` — cleaned up |
| `app/company/offers/new.tsx` | Form state `locationCityId: string` — ✅ already required at form level; validated before submit |
| `app/company/offers/edit.tsx` | Had dead-code `o.locationCityId ?? ''` — cleaned up |
| `src/data/seeds/technicianProfiles.json` | ✅ All 18 seeds have `locationCityId` |
| `src/data/seeds/companies.json` | ✅ All 9 seeds have `locationCityId` |
| `src/data/seeds/offers.json` | ✅ All 12 seeds have `locationCityId` |
| `scripts/validateSeeds.js` | ✅ Already checks `!t.locationCityId`, `!c.locationCityId`, `!o.locationCityId` and catalog membership — no changes needed |
| `docs/TYPESCRIPT_TYPES_V2.md` | Three optional `locationCityId?: string` entries — **updated** |
| `docs/DATA_MODEL_V2.md` | ✅ Already shows `location_city_id` as required (✓) — no change |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | ✅ Already shows `location_city_id` as required in all table definitions — no change |
| `docs/SUPABASE_SCHEMA_V2.sql` | ✅ Column `location_city_id TEXT NOT NULL` in all three tables — no change |

---

## 2. Types Updated

| Type | Before | After |
|------|--------|-------|
| `TechnicianProfile.locationCityId` | `?: string` | `: string` (required) |
| `CompanyProfile.locationCityId` | `?: string` | `: string` (required) |
| `SafeTechnicianPreview.locationCityId` | `?: string` | `: string` (required) |
| `Offer.locationCityId` | `: string` | `: string` — no change (already required) |

**V1 compat types left unchanged (intentionally optional):**
- `Technician.locationCityId?: string` — deprecated V1 type; V1 seeds may lack it
- `Company.locationCityId?: string` — deprecated V1 type; same reason

---

## 3. Seed Data

All V2 seeds already had valid `locationCityId` values:

| Entity | Count | Missing locationCityId |
|--------|-------|----------------------|
| TechnicianProfiles | 18 | 0 |
| Companies | 9 | 0 |
| Offers | 12 | 0 |

No seed changes were required.

---

## 4. Validator Status

`scripts/validateSeeds.js` already enforced `locationCityId` completeness before this fix:

| Check | Present before H2 fix |
|-------|-----------------------|
| TechnicianProfile: `!t.locationCityId` → error | ✅ Yes |
| TechnicianProfile: `locationCityId` in catalog | ✅ Yes |
| Company: `!c.locationCityId` → error | ✅ Yes |
| Company: `locationCityId` in catalog | ✅ Yes |
| Offer: `!o.locationCityId` → error | ✅ Yes |
| Offer: `locationCityId` in catalog | ✅ Yes |

No validator changes were needed. The existing checks are sufficient.

---

## 5. Files Modified

| File | Change |
|------|--------|
| `src/types/technician.ts` | `TechnicianProfile.locationCityId: string` (removed `?`); added required note |
| `src/types/company.ts` | `CompanyProfile.locationCityId: string` (removed `?`); added required note |
| `src/types/privacy.ts` | `SafeTechnicianPreview.locationCityId: string` (removed `?`); added required note |
| `app/company/profile.tsx` | Removed dead-code `?? ''` fallback (now unnecessary, `locationCityId` always string) |
| `app/company/offers/edit.tsx` | Removed dead-code `?? ''` fallback (same reason) |
| `docs/TYPESCRIPT_TYPES_V2.md` | Updated all three type blocks to show `locationCityId: string` (required) |

---

## 6. Type Safety Impact

After this change:
- Any code that reads `.locationCityId` from a `TechnicianProfile`, `CompanyProfile`, or `SafeTechnicianPreview` gets `string`, not `string | undefined`. No need for null-coalescing at call sites.
- Repository methods that build these types from storage data: all `?? profile.locationCityId` fallbacks resolve to `string` because `profile.locationCityId` is now guaranteed to be a string.
- The V1 compat layer (`v2CompatAdapters.ts`, `Technician`, `Company`) retains optional `locationCityId` — those types represent legacy/transitional data that may genuinely lack it.

---

## 7. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| Old AsyncStorage data (pre-H2) may lack `locationCityId` for a technician or company | Seed validator would catch this at dev time; `normalizeProfile` uses `??` fallback which returns `string` from stored data; in practice all seeds have always had `locationCityId` |
| A future form lets users save without selecting a location | Both offer forms (`new.tsx`, `edit.tsx`) validate `!form.locationCityId` before submit; company profile form validates `!form.locationCityId`; technician profile currently uses V1 types (optional) |

---

## 8. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | `TechnicianProfile.locationCityId` is required | ✅ PASS |
| 2 | `CompanyProfile.locationCityId` is required | ✅ PASS |
| 3 | `Offer.locationCityId` is required | ✅ PASS — was already required |
| 4 | No V2 persisted type allows missing `locationCityId` | ✅ PASS — `SafeTechnicianPreview` also fixed |
| 5 | All V2 seeds have valid `locationCityId` | ✅ PASS — confirmed by inspection and validator |
| 6 | `validateSeeds.js` fails if V2 records miss `locationCityId` or use unknown location | ✅ PASS — checks already existed |
| 7 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 8 | `node scripts/validateSeeds.js` passes with zero errors | ✅ PASS — 0 errors, 0 warnings |
| 9 | `npx expo export --platform web` builds all routes | ✅ PASS — 36 routes exported |

**H2 is fully resolved.**
