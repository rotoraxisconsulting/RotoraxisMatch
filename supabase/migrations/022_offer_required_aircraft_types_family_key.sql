-- ============================================================
-- AviationJobTalent V2 — Migration 022: broad aircraft-type filter
-- switches to a family key from the 606-row aircraft_type_ratings
-- catalog, instead of a code from the legacy 33-row aircraft_types table
-- ============================================================
-- Created: 2026-07-22
-- Applied: 2026-07-22 against rotoaxismatch-dev, approved by the user.
-- Post-apply verification: all 3 rows show a populated family_key, the
-- aircraft_types(code) FK is gone, and ApproximateFilterSection resolves
-- the real values to their family display names correctly.
--
-- Problem being fixed:
--   offer_required_aircraft_types.aircraft_type_code carried a live FK to
--   aircraft_types(code) — the 33-row legacy catalog. The Fase 3b "Required
--   aircraft types" approximate filter (ApproximateFilterSection.tsx) is
--   moving off that table entirely, onto family groups derived from the
--   606-row aircraft_type_ratings catalog via getFamilies() (see
--   src/constants/aircraftTypeRatingViews.ts) — the same catalog the
--   primary "Type rating requirements" section already uses. aircraft_types
--   itself is on the Fase 5 deletion list (see docs/MISSION_PART66.md);
--   this migration is the one piece of that removal that had to happen
--   now, because keeping the FK meant the new picker could never save a
--   selection that wasn't also one of the 33 legacy codes.
--
-- What changes:
--   - Drops the aircraft_types(code) FK on
--     offer_required_aircraft_types.aircraft_type_code. The column keeps
--     its name (renaming every reader of a field that's leaving entirely
--     in Fase 5 is out of scope for this fix) but now holds a family key —
--     "<manufacturer>::<aircraft_family>", the exact string
--     getAircraftFamilyKey()/getFamilies() produce on the TS side — never
--     a bare model code again.
--   - Backfills the rows that exist today: each legacy code is resolved
--     INCLUSIVELY against aircraft_type_ratings.commercial_aliases — a
--     code that is an alias under more than one family (e.g. a bare
--     "A320" that could mean an A320ceo-family or A320neo-family rating)
--     expands into ONE row per distinct family, never a guessed single
--     winner. This mirrors resolveLegacyCodeToFamilyKeys() in
--     src/constants/aircraftTypeRatings.ts, which the matching engine
--     (offerMatchExplain.ts) now uses for the same lookup at runtime — the
--     broad/approximate filter is deliberately coarse, so widening on
--     ambiguity is correct, not a compromise (confirmed with the user
--     2026-07-22).
--   - A legacy code with NO matching alias anywhere in the catalog is left
--     completely untouched (old row stays, in its old format) — surfaced
--     via a NOTICE at the end, never silently dropped.
--
-- Verified live against rotoaxismatch-dev before writing this file: all 3
-- existing rows resolve cleanly, none are left unmatched —
--   offer 922c1206-c9b2-4bb5-bc35-068dd94cfc9f:
--     'S76'  -> 'Sikorsky::S-76C'
--     'H125' -> 'Airbus Helicopters::AS350/H125'
--     'H135' -> 'Airbus Helicopters::EC135/H135'  (2 ratings — PW206 and
--               Arrius 2B engines — collapse into this 1 family key)
--
-- What is explicitly NOT done here:
--   - technician_habilitations.aircraft_type_code and its FK to
--     aircraft_types are untouched — that column's removal is Fase 5's own
--     job (see docs/MISSION_PART66.md), tracked separately from this one.
--     The T3 (related_legacy) tier in offerMatchExplain.ts now resolves
--     that column's value to a family the same inclusive way, but the
--     column and its FK stay exactly as they are.
--   - aircraft_types the table, and its TS mirror
--     src/constants/aircraftTypes.ts, are NOT dropped here — both stay on
--     the Fase 5 deletion list (see docs/MISSION_PART66.md); this
--     migration only removes the one FK that was blocking Fase 3b screen 1.
-- ============================================================


-- ============================================================
-- 1. Drop the legacy FK
-- ============================================================
ALTER TABLE offer_required_aircraft_types
  DROP CONSTRAINT IF EXISTS offer_required_aircraft_types_aircraft_type_code_fkey;

COMMENT ON COLUMN offer_required_aircraft_types.aircraft_type_code IS
  'Family key ("<manufacturer>::<aircraft_family>" from aircraft_type_ratings), not an aircraft_types(code) value since migration 022. Column name kept as-is; the whole approximate-filter path is removed in Fase 5.';


-- ============================================================
-- 2. Backfill existing rows: legacy code -> every matching family
-- ============================================================
-- Idempotent: re-running finds nothing left in the old (non "::") format
-- once everything resolvable has already been converted.

-- 2a. Insert one row per (offer_id, resolved family key), for every
-- existing row whose code still looks like a legacy code (no "::") and
-- matches at least one active rating's alias. A code resolving to more
-- than one family (or a rerun against an already-migrated table) would
-- otherwise collide on the (offer_id, aircraft_type_code) primary key —
-- ON CONFLICT keeps the row, upgrading to 'mandatory' if either the
-- existing row or the new one asked for it (never silently downgrading a
-- requirement level on merge).
INSERT INTO offer_required_aircraft_types (offer_id, aircraft_type_code, requirement_level)
SELECT DISTINCT o.offer_id, r.manufacturer || '::' || r.aircraft_family, o.requirement_level
FROM offer_required_aircraft_types o
JOIN aircraft_type_ratings r
  ON r.is_active = true
 AND EXISTS (
       SELECT 1 FROM unnest(r.commercial_aliases) a
       WHERE lower(trim(a)) = lower(trim(o.aircraft_type_code))
     )
WHERE o.aircraft_type_code NOT LIKE '%::%'
ON CONFLICT (offer_id, aircraft_type_code) DO UPDATE
  SET requirement_level = 'mandatory'
  WHERE offer_required_aircraft_types.requirement_level = 'preferred'
    AND excluded.requirement_level = 'mandatory';

-- 2b. Now that every resolvable row has its family-key replacement in
-- place, delete the old-format rows that were actually resolved. Never
-- deletes a legacy row with zero catalog matches — that would be silent
-- data loss for a code nothing in step 2a could replace.
DELETE FROM offer_required_aircraft_types o
WHERE o.aircraft_type_code NOT LIKE '%::%'
  AND EXISTS (
    SELECT 1 FROM aircraft_type_ratings r
    WHERE r.is_active = true
      AND EXISTS (
        SELECT 1 FROM unnest(r.commercial_aliases) a
        WHERE lower(trim(a)) = lower(trim(o.aircraft_type_code))
      )
  );

-- 2c. Surface anything left in the old format (zero catalog matches) —
-- informational only, never auto-deleted. None expected against
-- rotoaxismatch-dev as of this writing (see the verified list above).
DO $$
DECLARE
  leftover_count INT;
BEGIN
  SELECT count(*) INTO leftover_count
  FROM offer_required_aircraft_types
  WHERE aircraft_type_code NOT LIKE '%::%';
  IF leftover_count > 0 THEN
    RAISE NOTICE 'offer_required_aircraft_types: % row(s) still in legacy-code format — no catalog alias matched. Review manually.', leftover_count;
  END IF;
END $$;
