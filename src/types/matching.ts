// A match score is ALWAYS tied to a specific offer + technician pair.
// It is never a global score on a technician_profile row.
//
// `level` / `matches` / `clarifications` / `mandatoryMissing` make the score
// explainable instead of an opaque percentage:
//   - 'exact'    every required habilitation matches license+rating exactly
//                (tier T1 in offerMatchExplain.ts).
//   - 'related'  same category + a related rating in the same aircraft
//                family, different engine (tier T2) — needs a human to
//                confirm the detail (engine, recency, etc).
//                Fase 5.3 (2026-07-28): this used to also cover T3 (a legacy
//                general habilitation with no engine on record). T3 is gone
//                with the pre-Part-66 aircraft_types catalog, so 'related'
//                now means T2 and only T2.
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
  // Sub-fase de experiencia (2026-07-28): `experience` ya no está aquí. Los
  // años de experiencia no puntúan — informan y filtran (filtro duro
  // server-side por offer.minYearsExperience). "La cualificación puntúa, la
  // experiencia informa."
  breakdown: {
    verified: number;
    habilitation: number;
    license: number;
    // Renombrada desde `availability` (2026-07-29): esta fila NUNCA midió
    // disponibilidad, mide coincidencia de TIPO DE CONTRATO. La disponibilidad
    // real es binaria y va como filtro/etiqueta, no como puntos. Conjunto
    // vacío de contract_types = abierto a cualquiera = puntúa completo.
    contractFit: number;
    location: number;
  };
  level: MatchLevel;
  matches: string[];          // human-readable confirmed matches
  clarifications: string[];   // human-readable points that need confirming
  vigenciaNotices: VigenciaNotice[]; // expired / not-current — informational, never excludes (see VigenciaNotice)
  mandatoryMissing: string[]; // mandatory requirements not met exactly
}

export type MatchLabel = 'Excellent match' | 'Strong match' | 'Partial match' | 'Weak match';
