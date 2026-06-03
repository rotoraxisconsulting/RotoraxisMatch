# V2-S0B H1 — `unverified` Verification Status Cleanup Report

**Date:** 2026-05-31  
**Finding:** H1 — `VerificationStatus` TypeScript type permitted `unverified`, but SQL schema and V2 docs never included it. If written to Supabase, it would be rejected by the `verification_status` enum constraint.  
**Status:** Resolved. `unverified` removed from all live V2 types and filter options. Legacy mapping added for runtime safety.

---

## 1. Problem Summary

`src/types/enums.ts` defined:
```typescript
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'unverified';
```

The SQL schema and V2 docs defined:
```sql
CREATE TYPE verification_status AS ENUM ('pending', 'verified', 'rejected');
```

The mismatch created two risks:
1. An admin screen could write `unverified` to Supabase, which would be rejected by the DB constraint.
2. The existing `unverified → rejected` mappings in admin screens were semantically wrong: `rejected` means "admin reviewed and rejected"; `pending` means "not yet reviewed" — the correct V2 equivalent of `unverified`.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/types/enums.ts` | `VerificationStatus` included `unverified` — **MUST FIX** |
| `src/constants/verificationStatuses.ts` | `VERIFICATION_STATUSES` array included `unverified` entry — **MUST FIX** |
| `app/admin/technicians.tsx` | `normalizedStatus` mapped `unverified → rejected` — wrong mapping |
| `app/admin/companies.tsx` | Same — wrong mapping |
| `app/admin/index.tsx` | Counted `unverified` alongside `rejected` in dashboard metrics |
| `src/components/AdminTechnicianCard.tsx` | `normalizedStatus` mapped `unverified → rejected` — wrong mapping |
| `src/components/AdminCompanyCard.tsx` | Same — wrong mapping |
| `src/components/TechnicianFilters.tsx` | Offered `unverified` as a filter chip option |
| `src/components/TechnicianMap.native.tsx` | Used `unverified` as a VERIF color key and filter option |
| `src/components/TechnicianMapLeafletImpl.tsx` | Offered `unverified` as a filter option |
| `app/technician/index.tsx` | Had dead branch: `if (status === 'unverified') return 'Unverified'` |
| `src/repositories/v2/technicianRepositoryV2.ts` | ✅ CLEAN — never writes `unverified` |
| `src/repositories/v2/companyRepositoryV2.ts` | ✅ CLEAN — never writes `unverified` |
| `src/utils/v2CompatAdapters.ts` | ✅ CLEAN — passes `verificationStatus` through without writing `unverified` |
| `src/data/seeds/*.json` | ✅ CLEAN — no `unverified` in any V2 seed |
| `src/data/*.json` | ✅ CLEAN — no `unverified` in any V1 seed |
| `scripts/validateSeeds.js` | `VALID_VER_STATUSES` already excluded `unverified` but had no explicit message — **IMPROVED** |
| `docs/TYPESCRIPT_TYPES_V2.md` | Already correct (`'pending' | 'verified' | 'rejected'`) — added clarifying note |
| `docs/DATA_MODEL_V2.md` | ✅ CLEAN — never mentioned `unverified` |
| `docs/SUPABASE_SCHEMA_V2.sql` | ✅ CLEAN — SQL enum never included `unverified` |

---

## 3. Final V2 Verification Status Values

```
pending   — Not yet reviewed by admin (replaces legacy 'unverified')
verified  — Admin approved
rejected  — Admin reviewed and rejected
```

`unverified` is NOT a valid V2 `VerificationStatus`. It will never appear in V2 seeds, repositories, admin actions, or Supabase writes.

---

## 4. Legacy Mapping Rule

```
unverified → pending
```

Rationale: `pending` means "not yet reviewed" — the correct semantic equivalent of the old `unverified` (account exists but admin has not acted). Mapping to `rejected` would be incorrect because `rejected` means "admin reviewed and explicitly rejected".

---

## 5. Files Modified

### Core types and constants

| File | Change |
|------|--------|
| `src/types/enums.ts` | Removed `unverified` from `VerificationStatus`. Added `LegacyVerificationStatus = VerificationStatus \| 'unverified'` and `mapLegacyVerificationStatusToV2()` (maps `unverified → pending`) |
| `src/constants/verificationStatuses.ts` | Removed `unverified` entry from `VERIFICATION_STATUSES` array |

### Admin screens (wrong mapping corrected)

| File | Change |
|------|--------|
| `app/admin/technicians.tsx` | Changed import from `VerificationStatus` to `LegacyVerificationStatus`; fixed `normalizedStatus` mapping: `unverified → pending` (was `rejected`) |
| `app/admin/companies.tsx` | Same |
| `app/admin/index.tsx` | Removed `|| verificationStatus === 'unverified'` from rejected-count filter (no longer needed) |

### Admin components (wrong mapping corrected)

| File | Change |
|------|--------|
| `src/components/AdminTechnicianCard.tsx` | Added `LegacyVerificationStatus` import; fixed `normalizedStatus`: `unverified → pending` (was `rejected`) |
| `src/components/AdminCompanyCard.tsx` | Same |

### Filter options (unverified removed)

| File | Change |
|------|--------|
| `src/components/TechnicianFilters.tsx` | Replaced `'unverified'` with `'rejected'` in `VERIFICATION_OPTIONS` |
| `src/components/TechnicianMap.native.tsx` | Removed `unverified` from `VERIF` color map; added `rejected` color entry; changed fallback from `VERIF.unverified` to `VERIF.pending`; replaced `unverified` filter option with `rejected` |
| `src/components/TechnicianMapLeafletImpl.tsx` | Replaced `{ value: 'unverified', label: 'Unverified' }` with `{ value: 'rejected', label: 'Rejected' }` in `VERIFICATION_OPTIONS` |

### Technician screen

| File | Change |
|------|--------|
| `app/technician/index.tsx` | Removed dead branch `if (status === 'unverified') return 'Unverified'` from `statusLabel()` |

### Seed validator

| File | Change |
|------|--------|
| `scripts/validateSeeds.js` | Added explicit `unverified` check in both `techProfiles` and `companies` loops; error message names the fix ("migrate to pending") |

### Docs

| File | Change |
|------|--------|
| `docs/TYPESCRIPT_TYPES_V2.md` | Added clarifying comment after `VerificationStatus` that `unverified` is not V2 and maps to `pending` via `mapLegacyVerificationStatusToV2()` |

---

## 6. Does `unverified` Remain Anywhere?

Yes — in three controlled places only:

| Location | Why it remains | Safe? |
|----------|---------------|-------|
| `src/types/enums.ts` — `LegacyVerificationStatus` type | Deprecated type alias for runtime guards; never used in V2 repo writes | ✅ Safe — clearly marked `@deprecated`, not on the write path |
| `src/types/enums.ts` — `mapLegacyVerificationStatusToV2()` | Maps `unverified → pending` for any old persisted AsyncStorage data | ✅ Safe — read-only mapping, output is always `VerificationStatus` |
| Admin/card `normalizedStatus` functions | Accept `LegacyVerificationStatus` for runtime safety; return `VerificationStatus` | ✅ Safe — display-only, `unverified` input returns `pending` |

`unverified` does **NOT** appear in:
- `VerificationStatus` (the live V2 type)
- `VERIFICATION_STATUSES` constant
- Any V2 seed file
- Any repository write path
- Any admin action (verify / set pending / reject)
- Any filter chip (replaced by `rejected`)
- Any SQL schema

---

## 7. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | V2 `VerificationStatus` does not include `unverified` | ✅ PASS |
| 2 | V2 repositories do not write `unverified` | ✅ PASS — repos unchanged; never wrote it |
| 3 | Admin screens do not write `unverified` | ✅ PASS — ACTIONS arrays only have `verified`, `pending`, `rejected` |
| 4 | Legacy `unverified`, if encountered, maps to `pending` | ✅ PASS — `mapLegacyVerificationStatusToV2()` + `normalizedStatus` functions |
| 5 | Seed validator catches `unverified` in V2 seeds | ✅ PASS — explicit check added with clear error message |
| 6 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 7 | `node scripts/validateSeeds.js` passes with zero errors | ✅ PASS — 0 errors, 0 warnings |
| 8 | `npx expo export --platform web` builds all routes | ✅ PASS — 36 routes exported |

**H1 is fully resolved.**
