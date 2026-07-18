// A match score is ALWAYS tied to a specific offer + technician pair.
// It is never a global score on a technician_profile row.
//
// `level` / `matches` / `clarifications` / `mandatoryMissing` make the score
// explainable instead of an opaque percentage:
//   - 'exact'    every required habilitation matches license+rating exactly.
//   - 'related'  same category + related rating/family, or a legacy general
//                habilitation covering the required aircraft — needs a human
//                to confirm the detail (engine, recency, etc).
//   - 'legacy'   the offer only has broad (unlinked) requirements; the match
//                was resolved via a real technician_habilitations row, not by
//                combining independent license/aircraft lists.
//   - 'not_met'  no requirement could be matched at all. This never removes
//                the technician from results by itself — only an unmet
//                *mandatory* requirement is surfaced via mandatoryMissing.
export type MatchLevel = 'exact' | 'related' | 'legacy' | 'not_met';

export interface MatchScore {
  offerId: string;      // the offer this score belongs to
  technicianId: string; // the technician this score belongs to
  total: number;        // 0–100 — ordering only, never the sole explanation
  label: MatchLabel;
  breakdown: {
    verified: number;
    habilitation: number;
    license: number;
    availability: number;
    experience: number;
    location: number;
  };
  level: MatchLevel;
  matches: string[];          // human-readable confirmed matches
  clarifications: string[];   // human-readable points that need confirming
  mandatoryMissing: string[]; // mandatory requirements not met exactly
}

export type MatchLabel = 'Excellent match' | 'Strong match' | 'Partial match' | 'Low match';
