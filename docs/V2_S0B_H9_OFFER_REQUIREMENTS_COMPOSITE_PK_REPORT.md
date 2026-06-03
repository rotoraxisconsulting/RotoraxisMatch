# V2-S0B H9 — Offer Requirements Composite PK Report

**Date:** 2026-05-31  
**Finding:** H9 — Local offer requirement seeds contain a local `id` field not present in the Supabase schema (which uses composite PKs). `validateSeeds.js` only validated `offerRequiredAircraftTypes`; the other two requirement tables had no validation at all. The SQL schema had a column name inconsistency: `technician_type` instead of `technician_type_code`.  
**Status:** Resolved. Local `id` fields stay (they are used by the local repository). Validator now covers all three tables with FK and composite-key checks. SQL schema inconsistency fixed. Docs updated.

---

## 1. Problem Summary

The Supabase schema defines composite PKs for all three offer requirement tables:

```sql
-- No surrogate id column — composite PKs only
PRIMARY KEY (offer_id, technician_type_code)
PRIMARY KEY (offer_id, license_code)
PRIMARY KEY (offer_id, aircraft_type_code)
```

The local seed rows contain a human-readable `id` field (`ort-001`, `orl-001`, `orat-001`) that doesn't exist in the Supabase schema. This is fine for the local demo but must be dropped on Supabase import.

Additionally, the SQL schema had an inconsistency: `offer_required_technician_types` used `technician_type` as the column name, while all other docs (`DATA_MODEL_V2.md`, `MVP_ARCHITECTURE_HANDOFF.md`, `SUPABASE_PLAN_V2.md`, TypeScript types) used `technician_type_code`.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/data/seeds/offerRequiredTechnicianTypes.json` | 13 rows, all have local `id` fields. Zero duplicate composite keys. Codes: mechanic, composite, avionic, sheet_metal_worker, painter. ✅ Clean. |
| `src/data/seeds/offerRequiredLicenses.json` | 12 rows, all have local `id` fields. Zero duplicate composite keys. Codes: B1.1, B2, B1.3, C. ✅ Clean. |
| `src/data/seeds/offerRequiredAircraftTypes.json` | 16 rows, all have local `id` fields. Zero duplicate composite keys. Codes: all valid catalog entries. ✅ Clean. |
| `src/repositories/v2/offerRepository.ts` | Local interfaces define `id: string` on all three requirement types. `replaceRequirements()` generates IDs like `${offerId}-type-${i}`. Local `id` is actively used for demo. **Keep as is.** |
| `scripts/validateSeeds.js` | Only loaded/validated `offerRequiredAircraftTypes`. `offerRequiredTechnicianTypes` and `offerRequiredLicenses` not loaded or validated. `offerRequiredAircraftTypes` had no composite-key duplicate check. **Required additions.** |
| `docs/SUPABASE_SCHEMA_V2.sql` | Column `technician_type` in `offer_required_technician_types` — inconsistent with all other docs that use `technician_type_code`. **Required fix.** |
| `docs/DATA_MODEL_V2.md` | Composite PK mentioned but no note about local id field. **Updated.** |
| `docs/MIGRATION_FROM_DEMO_TO_V2.md` | `offer_required_*` entry lacked note about composite PK and local id drop. **Updated.** |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Already uses `technician_type_code`. ✅ No change needed. |
| `docs/SUPABASE_PLAN_V2.md` | Already uses `technician_type_code`. ✅ No change needed. |

---

## 3. Local ID Fields — Stay or Go?

**Decision: Keep local `id` fields in seeds and repository.**

The local repository (`offerRepository.ts`) actively generates and uses these IDs:
```typescript
interface OfferRequiredTechnicianType { id: string; offerId: string; technicianTypeCode: TechnicianTypeCode; }
...
const newTypes = requirements.technicianTypes.map((code, i) => ({
  id: `${offerId}-type-${i}`,  // used for internal storage
  offerId,
  technicianTypeCode: code,
}));
```

The `id` field is used for storage addressing in the local AsyncStorage layer. Removing it would require changes to the local demo that are out of scope for this fix.

**Supabase migration rule:** When importing offer requirement rows to Supabase:
1. Drop the local `id` field
2. Insert `(offer_id, code)` pairs only
3. Reject any pair with a duplicate composite key

---

## 4. Files Modified

| File | Change |
|------|--------|
| `scripts/validateSeeds.js` | Added `offerRequiredTechnicianTypes.json` and `offerRequiredLicenses.json` to file reads; added `VALID_TECHNICIAN_TYPE_CODES` constant; added validation loops for all three requirement tables with FK checks and composite-key duplicate detection; updated summary output |
| `docs/SUPABASE_SCHEMA_V2.sql` | Fixed column name `technician_type` → `technician_type_code` in `offer_required_technician_types`; added comments about composite PKs and local id field transformation |
| `docs/DATA_MODEL_V2.md` | Added explicit composite key breakdown and local demo note for offer requirement tables |
| `docs/MIGRATION_FROM_DEMO_TO_V2.md` | Updated `offer_required_*` row to mention composite PKs and local id drop |

---

## 5. Validator Changes Detail

**Before (only `offerRequiredAircraftTypes` validated, no composite-key duplicate check):**
```javascript
const offerRequiredAircraftTypes = read('offerRequiredAircraftTypes.json');
// ...
for (const orat of offerRequiredAircraftTypes) {
  if (!offerIds.has(orat.offerId)) errors.push(...);
  if (!VALID_AIRCRAFT_TYPE_CODES.has(orat.aircraftTypeCode)) errors.push(...);
  // NO duplicate key check
}
```

**After (all three tables validated, composite-key duplicates detected):**
```javascript
// New reads
const offerRequiredTechnicianTypes = read('offerRequiredTechnicianTypes.json');
const offerRequiredLicenses = read('offerRequiredLicenses.json');
// New constant
const VALID_TECHNICIAN_TYPE_CODES = new Set(['mechanic', 'avionic', ...]);

// offerRequiredTechnicianTypes
const seenTypePairs = new Set();
for (const ort of offerRequiredTechnicianTypes) {
  // FK: offerId exists, technicianTypeCode valid
  // Composite key: no duplicate (offerId, technicianTypeCode)
}

// offerRequiredLicenses
const seenLicPairs = new Set();
for (const orl of offerRequiredLicenses) {
  // FK: offerId exists, licenseCode valid
  // Composite key: no duplicate (offerId, licenseCode)
}

// offerRequiredAircraftTypes (strengthened)
const seenAcftPairs = new Set();
for (const orat of offerRequiredAircraftTypes) {
  // FK: offerId exists, aircraftTypeCode valid (existing)
  // Composite key: no duplicate (offerId, aircraftTypeCode) — NEW
}
```

---

## 6. Supabase Transformation Rule

When migrating offer requirement rows to Supabase:

```sql
-- DO NOT run local demo seeds directly into Supabase.
-- Transform each row: drop the local 'id' field, use composite key columns only.
--
-- Example (offerRequiredTechnicianTypes):
-- Local row: { "id": "ort-001", "offerId": "offer-001", "technicianTypeCode": "mechanic" }
-- Supabase:  INSERT INTO offer_required_technician_types (offer_id, technician_type_code) VALUES (uuid, 'mechanic');
--
-- Reject any row where (offer_id, code) already exists in the table.
```

---

## 7. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| Local repository generates ids like `offer-001-type-0` which are human-readable, not UUIDs | This is fine for local demo. On Supabase migration, these ids are dropped; the Supabase schema has no `id` column on these tables. |
| If a future developer adds a local `id`-based lookup for requirement rows | The repository currently only queries by `offerId` (`filter((t) => t.offerId === id)`) — id fields are not used for filtering. Safe. |

---

## 8. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Supabase docs clearly use composite PKs for offer requirement tables | ✅ PASS — SQL schema fixed; all docs consistent |
| 2 | Local `id` fields, if still present, are documented as local-only | ✅ PASS — documented in DATA_MODEL_V2.md, MIGRATION doc, and SQL comments |
| 3 | `validateSeeds.js` catches duplicate offer requirement composite keys | ✅ PASS — all three tables have composite-key duplicate detection |
| 4 | `validateSeeds.js` catches invalid requirement catalog references | ✅ PASS — FK checks added for all three tables |
| 5 | Local demo still works | ✅ PASS — no code changes to local repository or seeds |
| 6 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 7 | `node scripts/validateSeeds.js` passes | ✅ PASS — 0 errors, 0 warnings |
| 8 | `npx expo export --platform web` builds all routes | ✅ PASS — 37 routes exported |

**H9 is fully resolved.**
