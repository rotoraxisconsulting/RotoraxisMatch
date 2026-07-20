// A match score is ALWAYS tied to a specific offer + technician pair.
// It is never a global score on a technician_profile row.
//
// `level` / `matches` / `clarifications` / `mandatoryMissing` make the score
// explainable instead of an opaque percentage:
//   - 'exact'    every required habilitation matches license+rating exactly
//                (tier T1 in offerMatchExplain.ts).
//   - 'related'  same category + related rating/family (T2), or a legacy
//                general habilitation covering the required aircraft with no
//                engine on record (T3) — needs a human to confirm the detail
//                (engine, recency, etc). breakdown.habilitation and the
//                specific clarification text distinguish T2 from T3; both
//                report as 'related' here to keep this a stable 4-value enum.
//   - 'legacy'   the offer only has broad (unlinked) requirements; the match
//                was resolved via a real technician_habilitations row, not by
//                combining independent license/aircraft lists. Also used for
//                offers with no qualification requirement at all (nothing to
//                confirm either way).
//   - 'not_met'  no requirement could be matched at all. This never removes
//                the technician from results by itself — only an unmet
//                *mandatory* requirement is surfaced via mandatoryMissing.
export type MatchLevel = 'exact' | 'related' | 'legacy' | 'not_met';

// A slight, non-excluding degradation signal (Fase 3 — vigencia): an
// expired date always wins over an explicit isCurrent=false (see
// offerMatchExplain.ts evaluateVigencia) so there is always at most ONE
// notice per requirement, never two contradictory ones. `label` is the
// short badge text; `detail` is the full explanation shown alongside it.
export interface VigenciaNotice {
  label: 'Expired' | 'Not current';
  detail: string;
}

export interface MatchScore {
  offerId: string;      // the offer this score belongs to
  technicianId: string; // the technician this score belongs to
  // 0–100 — ordering only, never the sole explanation. May be lower than
  // breakdown's own sum: an unmet mandatory requirement or a zero
  // habilitation score on a qualification-requiring offer caps this value
  // (see offerMatchExplain.ts MANDATORY_UNMET_CAP / ZERO_QUALIFICATION_CAP).
  // breakdown itself is never capped — compare sum(breakdown) to total to
  // detect whether (and how much) a cap applied.
  total: number;
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
  vigenciaNotices: VigenciaNotice[]; // expired / not-current — informational, never excludes (see VigenciaNotice)
  mandatoryMissing: string[]; // mandatory requirements not met exactly
}

export type MatchLabel = 'Excellent match' | 'Strong match' | 'Partial match' | 'Weak match';
