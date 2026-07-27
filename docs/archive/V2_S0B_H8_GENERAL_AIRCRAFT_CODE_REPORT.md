# V2-S0B H8 — Remove Invalid GENERAL Aircraft Experience Code Report

**Date:** 2026-05-31  
**Finding:** H8 — `technicianRepositoryV2.updateExperienceYears()` could create a `technician_aircraft_experience` row with `aircraftTypeCode: 'GENERAL'` when a technician had no existing experience entries. `GENERAL` is not in the `aircraft_types` catalog and would fail the `REFERENCES aircraft_types(code)` FK constraint on Supabase.  
**Status:** Resolved. `GENERAL` write path removed. Validator check added. Docs updated.

---

## 1. Problem Summary

`updateExperienceYears()` had this branch:

```typescript
if (entries.length === 0) {
  const created: TechnicianAircraftExperience = {
    ...
    aircraftTypeCode: 'GENERAL',  // NOT in aircraft_types catalog
    ...
  };
  await storageAdapter.set(...);
  return;
}
```

`GENERAL` was never added to `aircraft_types` or `SUPABASE_SCHEMA_V2.sql`. Running this code path against a live Supabase database would fail with a FK violation on `technician_aircraft_experience.aircraft_type_code → aircraft_types.code`.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/repositories/v2/technicianRepositoryV2.ts` | `updateExperienceYears()` line 293: creates `aircraftTypeCode: 'GENERAL'`. **Required fix.** |
| `src/state/useTechnicianDashboard.ts` | Calls `updateExperienceYears(technicianId, patch.yearsExperience)` when profile is saved with `yearsExperience` patch. **No change needed — the repository fix is sufficient.** |
| `app/technician/profile.tsx` | Has a flat `yearsExperience` input field (V1 compat). Saving calls `updateProfile({ yearsExperience: n })`. **No change needed — when existing experience entries are present (all demo techs), the repository updates them correctly. When none exist, the repository now does nothing safely.** |
| `src/constants/aircraftTypes.ts` | `GENERAL` is not in the catalog. ✅ Correct — do not add it. |
| `src/data/seeds/technicianAircraftExperience.json` | 53 entries, all with real aircraft codes (B737, B757, etc.). Zero GENERAL entries. ✅ Already clean. |
| `src/data/seeds/*.json` | No `GENERAL` in any seed file. ✅ Clean. |
| `scripts/validateSeeds.js` | Already checked `!VALID_AIRCRAFT_TYPE_CODES.has(e.aircraftTypeCode)` (would catch GENERAL indirectly). **Strengthened with explicit GENERAL check.** |
| `docs/DATA_MODEL_V2.md` | No explicit GENERAL warning. **Updated.** |
| `docs/TYPESCRIPT_TYPES_V2.md` | No explicit GENERAL warning. **Updated.** |
| `docs/SUPABASE_SCHEMA_V2.sql` | FK comment not explicit. **Updated.** |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | No change needed — already states aircraft_type_code FK requirement. |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/repositories/v2/technicianRepositoryV2.ts` | Removed `GENERAL` creation path in `updateExperienceYears()`; replaced with no-op + explanatory comment |
| `scripts/validateSeeds.js` | Added explicit `GENERAL` check in the aircraft experience loop |
| `docs/DATA_MODEL_V2.md` | Added catalog constraint note to `technician_aircraft_experience` section |
| `docs/TYPESCRIPT_TYPES_V2.md` | Added comment to `TechnicianAircraftExperience.aircraftTypeCode` about catalog requirement |
| `docs/SUPABASE_SCHEMA_V2.sql` | Added inline SQL comment on `aircraft_type_code` column |

---

## 4. Repository Change Detail

**Before:**
```typescript
if (entries.length === 0) {
  // Created aircraftTypeCode: 'GENERAL' — invalid FK reference
  await storageAdapter.set(...);
  return;
}
```

**After:**
```typescript
if (entries.length === 0) {
  // No per-aircraft experience rows exist for this technician.
  // Do NOT create a fallback row with a non-catalog code such as 'GENERAL'.
  // Flat yearsExperience is a V1/demo display adapter — it cannot create new V2 experience rows.
  // To add aircraft experience, use a V2 experience editor with a real aircraftTypeCode from the catalog.
  // Future Supabase: technician_aircraft_experience.aircraft_type_code has a FK → aircraft_types.code.
  return;
}
```

**Effect:**
- When a technician has **existing** experience entries (all demo technicians): behavior unchanged. The function correctly updates the highest-value entry to the new year count.
- When a technician has **no** experience entries: the function is now a no-op instead of creating an invalid `GENERAL` row.

---

## 5. Flat `yearsExperience` — V1 Compatibility Note

The V1 `Technician` type has `yearsExperience: number`. It is computed from V2 `aircraftExperience` via `computeYearsExperience()` for display. The technician profile edit form reads and writes this flat number via the V1 compatibility layer.

**This is display-only:**
- `yearsExperience` is derived on read from V2 data; it is not stored as a field in V2.
- On write, `updateExperienceYears()` updates the existing V2 experience entries proportionally.
- It must NOT create new V2 experience rows without a real aircraft type code.
- When migrating to Supabase, this V1 path must be replaced with a per-aircraft experience editor.

---

## 6. Seed Validator Change

**Before (already caught GENERAL indirectly):**
```javascript
if (!VALID_AIRCRAFT_TYPE_CODES.has(e.aircraftTypeCode))
  errors.push('exp ' + e.id + ': invalid aircraftTypeCode ' + e.aircraftTypeCode);
```

**After (explicit GENERAL check with clear message):**
```javascript
if (e.aircraftTypeCode === 'GENERAL')
  errors.push('exp ... : aircraftTypeCode "GENERAL" is not a valid catalog code — create per-aircraft entries with real codes');
else if (!VALID_AIRCRAFT_TYPE_CODES.has(e.aircraftTypeCode))
  errors.push('exp ... : invalid aircraftTypeCode ...');
```

---

## 7. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| A technician with no V2 experience entries edits their flat `yearsExperience` in the profile form | The update is now a no-op (saves the V1 display value but doesn't write to V2 experience storage). The technician needs to use a proper V2 experience editor (future scope). |
| Old AsyncStorage data from a pre-H8 session may still have a GENERAL row | `validateSeeds.js` only validates seeds, not live AsyncStorage. A `repairV2DemoData()`-style cleanup would be needed for live sessions, but this is a demo concern only — no real user has saved GENERAL data. |

---

## 8. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No V2 code path creates `technician_aircraft_experience` with `aircraftTypeCode GENERAL` | ✅ PASS — write path removed |
| 2 | GENERAL is not added to `aircraft_types` | ✅ PASS — never was in catalog |
| 3 | Flat `yearsExperience` is not migrated into V2 experience as GENERAL | ✅ PASS — `updateExperienceYears` is now a no-op when no entries exist |
| 4 | `validateSeeds.js` catches GENERAL if it appears | ✅ PASS — explicit check added |
| 5 | All aircraft experience rows reference valid `aircraft_types` | ✅ PASS — seeds confirmed, validator confirmed |
| 6 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 7 | `node scripts/validateSeeds.js` passes | ✅ PASS — 0 errors, 0 warnings |
| 8 | `npx expo export --platform web` builds all routes | ✅ PASS — 37 routes exported |

**H8 is fully resolved.**
