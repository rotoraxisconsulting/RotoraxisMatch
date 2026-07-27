-- ============================================================
-- AviationJobTalent V2 — Migration 027: needs_review flag for
-- unresolvable legacy habilitations + normalized-habilitation
-- uniqueness guard
-- ============================================================
-- Created: 2026-07-27
-- Source: Fase 5.2 (docs/PHASE5_INVENTORY.md item a), approved 2026-07-27
-- alongside the checkpoint 5.1 decisions.
--
-- SCHEMA ONLY — this migration does not touch a single row of data. The
-- actual legacy-code resolution (which existing rows get
-- aircraft_type_rating_id backfilled vs. flagged needs_review) is done by
-- scripts/backfillLegacyAircraftRatings.ts (extended in this same change
-- to also write needs_review), never by SQL logic here — that script
-- already exists, is already unit-tested (planLegacyAircraftRatingBackfill,
-- src/utils/aircraftRatingBackfillPlan.ts, Fase 3b), and is the
-- established, re-runnable pattern for this exact operation (see its own
-- header comment: "the backfill is a repeatable, explicit, re-runnable
-- operation instead of something baked into a one-time migration").
-- Re-implementing the alias-matching logic as a second copy in raw SQL
-- here would risk exactly the kind of drift this mission has spent this
-- whole hardening pass closing off.
--
-- Written generically/idempotently even though the live inventory
-- (docs/PHASE5_INVENTORY.md item a, verified 2026-07-26) found ZERO rows
-- in rotoaxismatch-dev today with aircraft_type_rating_id IS NULL AND
-- aircraft_type_code IS NOT NULL — this schema must still support the
-- general case for any other environment with real legacy-only rows.
--
--   A. needs_review column — see COMMENT ON COLUMN below for the exact
--      semantics. Defaults to false; only ever set true by the backfill
--      script (or a future save path) when a legacy code resolves to zero
--      or multiple catalog ratings, never guessed to a single winner.
--      Matching (offerMatchExplain.ts, Fase 5.3) will treat a
--      needs_review row the same as any other legacy/approximate (T3)
--      match, just explicitly labeled instead of silently trusted — not
--      wired here, this migration only adds the column.
--
--   B. Partial unique index on normalized habilitations — found during
--      the 5.1 inventory: technician_habilitations' only UNIQUE
--      constraint (technician_habilitations_technician_id_license_code_aircraf_key,
--      migration 001) covers (technician_id, license_code,
--      aircraft_type_code) — for a normalized row aircraft_type_code is
--      NULL, and Postgres does not enforce uniqueness across NULLs, so
--      nothing at the database level prevented two identical normalized
--      rows (technician_id, license_code, aircraft_type_rating_id) from
--      existing. Not an active bug — HabilitationsEditor.tsx already
--      blocks the duplicate client-side (same pattern
--      TypeRatingRequirementsEditor.tsx uses on the offer side) — this is
--      defense-in-depth, enforcing the same invariant the client already
--      enforces, at the layer that can't be bypassed by a different
--      client.
--
-- NOT included (per the 2026-07-27 checkpoint decisions — do not
-- re-introduce without a fresh explicit OK):
--   - No aircraft_type_code audit-trail column/log for migrated rows. The
--     only 2 rows carrying a legacy code today belong to an
--     already-deleted technician account (TF0E8866C8) — no live audit
--     need for data whose owning account no longer exists. If a future
--     environment's inventory finds real legacy rows under active
--     accounts, revisit this then rather than building unused machinery
--     now.
--   - No offer_required_aircraft_types resolution step — migration 022
--     already completed this (the column stores family keys, not legacy
--     codes, confirmed still true in the 5.1 inventory).
--   - No availability status -> immediately migration. VOID per the
--     checkpoint 5.1 decision on docs/PHASE5_INVENTORY.md item f — the
--     3-state availability filter is an active Fase 3b product feature,
--     not legacy.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ── A. needs_review column ────────────────────────────────────────────

ALTER TABLE technician_habilitations
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN technician_habilitations.needs_review IS
  'True when a legacy aircraft_type_code could not be resolved to exactly one aircraft_type_ratings row via commercialAliases matching (scripts/backfillLegacyAircraftRatings.ts / planLegacyAircraftRatingBackfill) — zero matches (no_match) or more than one (ambiguous), never guessed to a single winner. aircraft_type_rating_id stays NULL on a needs_review row. Matching treats this the same as any other legacy/approximate match, explicitly labeled rather than silently trusted (Fase 5.3, not wired by this migration).';


-- ── B. Partial unique index — normalized habilitations ────────────────

CREATE UNIQUE INDEX IF NOT EXISTS uq_technician_habilitations_normalized
  ON technician_habilitations (technician_id, license_code, aircraft_type_rating_id)
  WHERE aircraft_type_rating_id IS NOT NULL;
