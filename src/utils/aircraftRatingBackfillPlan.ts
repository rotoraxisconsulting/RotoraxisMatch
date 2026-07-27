import { AircraftTypeRatingCatalog } from '../types/catalog';
import { ratingMatchesLegacyCode } from '../constants/aircraftTypeRatings';

// Pure planning logic for scripts/backfillLegacyAircraftRatings.ts — no
// Supabase import, so it is unit-tested directly with fabricated rows (see
// scripts/testMatching.ts). The script itself only does I/O: read real rows,
// call planLegacyAircraftRatingBackfill(), print the report, and — only with
// --apply — write the 'mapped' rows.
//
// IMPORTANT: a migration that already ran does not re-run when new legacy
// rows appear later (see docs/archive/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md
// section 10 — this corrects an incorrect claim in an earlier report). This
// module exists so the backfill is a repeatable, explicit, re-runnable
// operation instead of something baked into a one-time migration.
export interface LegacyHabilitationRow {
  id: string;
  technicianId: string;
  licenseCode: string;
  aircraftTypeCode: string;
}

export interface ExistingNormalizedHabilitation {
  technicianId: string;
  licenseCode: string;
  aircraftTypeRatingId: string;
}

export type BackfillOutcome = 'mapped' | 'ambiguous' | 'no_match' | 'collision_avoided';

export interface BackfillPlanEntry {
  row: LegacyHabilitationRow;
  outcome: BackfillOutcome;
  /** Set when outcome === 'mapped' or 'collision_avoided'. */
  ratingId?: string;
  /** Set when outcome === 'ambiguous' — how many ratings matched the code. */
  candidateIds?: string[];
}

export interface BackfillPlanSummary {
  analyzed: number;
  mapped: number;
  ambiguous: number;
  noMatch: number;
  collisionsAvoided: number;
}

// Maps a legacy aircraft_type_code to a specific aircraft_type_rating_id
// ONLY when exactly one catalog rating's aliases match it — never guesses
// among several. Never overwrites a row that already has a normalized
// rating attached elsewhere in a way that would collide with the
// (technicianId, licenseCode, aircraftTypeRatingId) uniqueness rule.
export function planLegacyAircraftRatingBackfill(
  legacyRows: LegacyHabilitationRow[],
  catalog: AircraftTypeRatingCatalog[],
  existingNormalized: ExistingNormalizedHabilitation[],
): BackfillPlanEntry[] {
  const existingKeys = new Set(
    existingNormalized.map((e) => `${e.technicianId}|${e.licenseCode}|${e.aircraftTypeRatingId}`),
  );

  return legacyRows.map((row) => {
    const candidates = catalog.filter((r) => ratingMatchesLegacyCode(r, row.aircraftTypeCode));

    if (candidates.length === 0) return { row, outcome: 'no_match' };
    if (candidates.length > 1) {
      return { row, outcome: 'ambiguous', candidateIds: candidates.map((c) => c.id) };
    }

    const rating = candidates[0];
    const key = `${row.technicianId}|${row.licenseCode}|${rating.id}`;
    if (existingKeys.has(key)) {
      return { row, outcome: 'collision_avoided', ratingId: rating.id };
    }
    return { row, outcome: 'mapped', ratingId: rating.id };
  });
}

export function summarizeBackfillPlan(plan: BackfillPlanEntry[]): BackfillPlanSummary {
  return {
    analyzed: plan.length,
    mapped: plan.filter((p) => p.outcome === 'mapped').length,
    ambiguous: plan.filter((p) => p.outcome === 'ambiguous').length,
    noMatch: plan.filter((p) => p.outcome === 'no_match').length,
    collisionsAvoided: plan.filter((p) => p.outcome === 'collision_avoided').length,
  };
}
