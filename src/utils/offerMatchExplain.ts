// Pure, offer+technician matching logic — no Supabase/repository imports so
// it can be unit-tested without a database connection (see
// scripts/testMatching.ts).
//
// Core rule (fixes the false-combination bug): a category (license) and an
// aircraft/rating are only ever considered "matched together" when they come
// from the SAME technician_habilitations row. Holding a license and having
// some unrelated habilitation never counts as holding that license for that
// aircraft. See docs/archive/PART66_AIRCRAFT_MODEL_ANALYSIS.md section 6 for the
// original bug report.
//
// Business principle (see CLAUDE.md "Backend / data model notes"): a
// technician who holds exactly what an offer requires must score clearly
// above one who does not, regardless of how good the rest of their profile
// looks — a missing mandatory qualification is a legal blocker, not a minor
// preference gap. Three mechanisms enforce this, applied after the raw
// breakdown is summed:
//   - an unmet MANDATORY exact-habilitation requirement caps the total at
//     MANDATORY_UNMET_CAP (stays in the "Partial" label range at most);
//   - a qualification-requiring offer where the technician's habilitation
//     score is zero caps the total further, at ZERO_QUALIFICATION_CAP
//     (stays "Weak" — verified/availability/location alone can
//     never manufacture a "Partial" result out of zero real qualification).
//   - a hard disqualifier (MatchScore.blockers — wrong technician type, or
//     fewer declared years than the offer's minimum) caps it lowest of all,
//     at BLOCKER_CAP. Unlike the two above this is not a statement about
//     weak qualification evidence but about the pair itself: the offer was
//     never for this technician. See the ceiling ladder below.
//
// ratingIndex: the caller loads the aircraft_type_ratings catalog (via
// catalogRepository/useAircraftTypeRatingsCatalog) and builds the index with
// buildAircraftRatingIndex() BEFORE calling this function — matching never
// queries Supabase directly. An id missing from the index (e.g. a pending
// catalog request, never a real catalog row) simply resolves to no match,
// never a crash.
import { OfferRequiredHabilitation, OfferWithRequirements } from '../types/offer';
import { TechnicianHabilitation, TechnicianLicense, TechnicianWithRelations } from '../types/technician';
import {
  MatchScore,
  MatchLabel,
  MatchLevel,
  MatchDisplayLabel,
  VigenciaNotice,
  GENERAL_COMPATIBILITY_LABEL,
} from '../types/matching';
import { resolveLocationSnapshot } from '../constants/locationCities';
import { TECHNICIAN_TYPES, offerTargetsLicensedProfiles } from '../constants/technicianTypes';
import { AircraftRatingIndex, areRatingsRelated, getAircraftTypeRatingLabel } from '../constants/aircraftTypeRatings';
import { localDateToIso } from './dateField';

// Qualification (habilitation + license) dominates the score whenever the
// offer actually specifies one — the whole point of this rebalance. When an
// offer specifies NO qualification requirement at all, there is nothing to
// award those 65 points for; NO_REQUIREMENTS_WEIGHTS redistributes the
// remaining signals (verified/availability/location) onto a scale that tops
// out at 75 — "Strong match" at best, deliberately never reaching
// "Excellent" (>=80) from profile quality alone, since nothing here
// confirms the technician actually fits THIS offer's requirements.
//
// ── Sub-fase de experiencia (2026-07-28) ──────────────────────────────
// El componente `experience` YA NO EXISTE. Principio de producto fijado por
// el usuario: **la cualificación puntúa, la experiencia informa y filtra**.
// Los años de experiencia son un dato visual y un FILTRO DURO server-side
// (offer.minYearsExperience contra technician_profiles.years_experience),
// nunca puntos.
//
// Los 10 puntos que liberaba van ÍNTEGROS a habilitación (35 → 45), no
// repartidos con licencia: el bloque de cualificación queda en 65 de
// cualquier forma, pero repartir habría reforzado la señal DÉBIL (tener la
// licencia sin el rating). Concentrarlos afila justo la discriminación que
// esta misión persigue.
const QUALIFICATION_WEIGHTS = { verified: 15, habilitation: 45, license: 20, contractFit: 15, location: 5 } as const;
// habilitation/license are always 0 here (never awarded, never penalized —
// see the no-requirements branch below) — kept as explicit fields rather
// than omitted so `weights` stays a single consistent shape instead of a
// union, which is both simpler to read and avoids TypeScript narrowing
// gymnastics at every access site.
//
// Suma 75, NO 100, y es deliberado: es el techo de la rama sin requisitos.
// Los 15 que liberaba `experience` se reparten DENTRO de ese techo
// (25/25/10 → 30/30/15), así que el máximo de esta rama no cambia.
const NO_REQUIREMENTS_WEIGHTS = { verified: 30, habilitation: 0, license: 0, contractFit: 30, location: 15 } as const;

export interface MatchScoreWeights {
  verified: number;
  habilitation: number;
  license: number;
  contractFit: number;
  location: number;
}

// Which weight set applies to a given offer, and therefore what each
// breakdown component's maximum actually is right now. Exported so UI that
// renders score.breakdown (e.g. the technician-match cards on the offer
// detail screen) can show real denominators instead of hardcoding them —
// hardcoded maximums silently drift out of sync whenever these weights
// change here.
export function getMatchScoreWeights(offer: OfferWithRequirements): MatchScoreWeights {
  const hasQualificationRequirements =
    offer.requiredHabilitations.length > 0 || offer.requiredLicenses.length > 0;
  return hasQualificationRequirements ? QUALIFICATION_WEIGHTS : NO_REQUIREMENTS_WEIGHTS;
}

// Within the habilitation budget: T1 (exact) gets the full amount; T2
// (same family, different engine) gets a smaller fraction — still real,
// still surfaced as a clarification, never silently equal to an exact
// match.
//
// Fase 5.3 (2026-07-28): T3 ('related_legacy' — a bare legacy
// aircraft_type_code resolving to the required family) is GONE with the
// pre-Part-66 aircraft_types catalog. It had exactly one input, that
// column, and migration 029 removes it; a habilitation now names an
// aircraft through the rating catalog or not at all.
const HABILITATION_TIER_FRACTIONS = { exact: 1, related_family: 0.57, not_met: 0 } as const;

// The license-category branch (evaluateLicenseCategoryMatch) keeps its own
// fraction: 0.29 when the technician holds a required license category and
// the offer never named a specific aircraft. Deliberately well below T2's
// 0.57 — holding a category confirms no aircraft experience whatsoever.
//
// Fase 5 (2026-08-04): this map used to carry a second entry,
// legacy_aircraft_confirmed (0.57), for an offer that required an aircraft
// FAMILY approximately. That requirement is gone with
// offer_required_aircraft_types, so the tier had no remaining input and was
// removed with it. 0.29 and BROAD_ONLY_CAP below are untouched.
const BROAD_TIER_FRACTIONS = { legacy_category_only: 0.29 } as const;

// Fase 3 — vigencia: a SLIGHT cut, applied on top of whichever tier fraction
// already applies, whenever the row that produced the winning match is
// expired or explicitly marked not current. Deliberately small — holding an
// expired-but-real qualification is not the same as not holding it (T1
// stays T1, mandatoryMissing is never triggered by this alone); it is a
// paperwork/renewal flag, not a disqualification.
const VIGENCIA_DEGRADATION_FRACTION = 0.1;

// Ladder of score ceilings, loosest to tightest — Fase 5.3 (2026-07-27),
// checkpoint-confirmed. Applied together via applyScoreCeilings() below,
// most-restrictive-wins by construction (sequential Math.min, order never
// matters): an exact match has no ceiling at all; anything else is capped
// at progressively lower labels the weaker the confirmed evidence is.
//
//   no ceiling      — exact (T1) match: a confirmed, same-row qualification.
//   BROAD_ONLY_CAP  — the requirement was only ever satisfied via the
//                     approximate broad license/aircraft filter
//                     (evaluateLegacyBroadMatch), never a confirmed exact
//                     rating — can never read as "Excellent" (>=80).
//   MANDATORY_UNMET_CAP — an exact MANDATORY habilitation requirement was
//                     not met at T1.
//   ZERO_QUALIFICATION_CAP — the offer asks for real qualification (exact
//                     or broad) and the technician's habilitation score
//                     came out to zero — stricter than the two above,
//                     applies even for a preferred-only mismatch.
//   BLOCKER_CAP     — a hard disqualifier applies (MatchScore.blockers):
//                     the wrong technician type, or fewer declared years
//                     than the offer's stated minimum. The tightest rung by
//                     construction, and a different KIND of statement from
//                     the three above: those all say "the qualification
//                     evidence is weak", this one says "this pair should
//                     not exist". Sits below ZERO_QUALIFICATION_CAP so a
//                     blocked pair can never outrank a merely unqualified
//                     one, and low enough that a blocked pair sinks to the
//                     bottom of any total-descending sort on its own — no
//                     special-casing in the ordering code (matchingV2.ts).
const BROAD_ONLY_CAP = 79;
const MANDATORY_UNMET_CAP = 59;
const ZERO_QUALIFICATION_CAP = 39;
const BLOCKER_CAP = 19;

// Single place the whole ceiling ladder is combined — see the comment
// above for what each one means and why "most restrictive wins" needs no
// special-casing (Math.min chains regardless of which flags are true, or
// how many). Exported for direct testing of the combination itself,
// independent of whether today's branch structure can produce every
// combination in practice (see scripts/testMatching.ts).
export function applyScoreCeilings(
  total: number,
  flags: { isBroadOnlyMatch: boolean; hasMandatoryUnmet: boolean; isZeroQualification: boolean; hasBlocker: boolean },
): number {
  let capped = total;
  if (flags.isBroadOnlyMatch) capped = Math.min(capped, BROAD_ONLY_CAP);
  if (flags.hasMandatoryUnmet) capped = Math.min(capped, MANDATORY_UNMET_CAP);
  if (flags.isZeroQualification) capped = Math.min(capped, ZERO_QUALIFICATION_CAP);
  if (flags.hasBlocker) capped = Math.min(capped, BLOCKER_CAP);
  return capped;
}

// Blocker text is read by a human (recruiter or technician), so it always
// names the type the way the rest of the product does — "Avionics
// Technician", never the raw `avionic` code. Falls back to the code only if
// a profile somehow carries a type absent from the catalog, which is a data
// problem to surface, never a reason to render nothing. `isActive` is
// deliberately not consulted: a type retired from the pickers must still
// label the rows already storing it.
function technicianTypeLabel(code: string): string {
  return TECHNICIAN_TYPES.find((t) => t.code === code)?.label ?? code;
}

type HabilitationTier = 'exact' | 'related_family' | 'not_met';

interface RequirementOutcome {
  tier: HabilitationTier;
  matchText?: string;
  clarificationText?: string;
  vigenciaDegraded?: boolean;
  vigenciaNotice?: VigenciaNotice;
}

function toYearMonth(iso: string): string {
  return iso.slice(0, 7); // 'YYYY-MM-DD' -> 'YYYY-MM'
}

// Fase 3 — vigencia. Checked against whichever row actually produced the
// match (T1/T2), plus the technician's own TechnicianLicense row for the
// same category (licenses have no isCurrent — only issued/expiresAt).
//
// Precedence (fixed by design, not incidental): an expired date ALWAYS wins
// over isCurrent, even isCurrent === true explicitly — the default true
// never rescues a rating past its expiry date. isCurrent === false only
// matters when the date is absent or still in the future (the "declared
// not current ahead of expiry" case) — its own distinct message, never
// combined with an "expired" one for the same row.
//
// A license-level expiry subsumes the row-level check entirely: it affects
// every habilitation declared under that category, and if the row is ALSO
// individually expired/not-current that would be a second, redundant
// notice about the same underlying fact — so license expiry always wins
// and produces exactly one notice, never two.
function evaluateVigencia(
  row: Pick<TechnicianHabilitation, 'expiresAt' | 'isCurrent'>,
  license: TechnicianLicense | undefined,
  licenseCode: string,
  ratingLabel: string,
  today: string,
): { degraded: boolean; notice?: VigenciaNotice } {
  const licenseExpired = Boolean(license?.expiresAt && license.expiresAt < today);
  if (licenseExpired) {
    return {
      degraded: true,
      notice: {
        label: 'Expired',
        detail: `License ${licenseCode} expired ${toYearMonth(license!.expiresAt!)} — all its ratings affected, including ${ratingLabel}.`,
      },
    };
  }

  const rowExpired = Boolean(row.expiresAt && row.expiresAt < today);
  if (rowExpired) {
    return {
      degraded: true,
      notice: { label: 'Expired', detail: `Rating expired ${toYearMonth(row.expiresAt!)}: ${ratingLabel}.` },
    };
  }

  if (row.isCurrent === false) {
    return {
      degraded: true,
      notice: { label: 'Not current', detail: `Rating marked as not current: ${ratingLabel}.` },
    };
  }

  return { degraded: false };
}

function evaluateHabilitationRequirement(
  req: Pick<OfferRequiredHabilitation, 'licenseCode' | 'aircraftTypeRatingId'>,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
  today: string,
): RequirementOutcome {
  const reqLabel = getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex);
  const rating = ratingIndex.get(req.aircraftTypeRatingId);
  const sameLicenseRows = technician.habilitations.filter((h) => h.licenseCode === req.licenseCode);
  const license = technician.licenses.find((l) => l.licenseCode === req.licenseCode);

  // T1 — exact: same license, same rating, in the same row. Deliberately
  // does not look at experienceYears — optional, informational only, never
  // a penalty (a rating endorsed with no declared experience is still a
  // full, legally valid match). isCurrent/expiresAt DO matter — see
  // evaluateVigencia — but only degrade the match slightly, never exclude
  // it: this stays tier 'exact' either way.
  //
  // TODO(open regulatory question, see mission brief): EASA AMC 66.A.45
  // may record some B2 endorsements without an engine designation. Not
  // special-cased here — would affect this tier and T2 below, and the
  // category pre-filter planned for a later phase.
  const exactRow = sameLicenseRows.find((h) => h.aircraftTypeRatingId === req.aircraftTypeRatingId);
  if (exactRow) {
    const vigencia = evaluateVigencia(exactRow, license, req.licenseCode, reqLabel, today);
    return {
      tier: 'exact',
      matchText: `${req.licenseCode} + ${reqLabel}`,
      vigenciaDegraded: vigencia.degraded,
      vigenciaNotice: vigencia.notice,
    };
  }

  // T2 — related_family: same license, a different rating in the same
  // aircraft family (same manufacturer, overlapping family), different
  // engine.
  const relatedRow = sameLicenseRows.find(
    (h): h is TechnicianHabilitation & { aircraftTypeRatingId: string } =>
      Boolean(h.aircraftTypeRatingId) && areRatingsRelated(h.aircraftTypeRatingId as string, req.aircraftTypeRatingId, ratingIndex),
  );
  if (relatedRow) {
    const heldLabel = getAircraftTypeRatingLabel(relatedRow.aircraftTypeRatingId, ratingIndex);
    const vigencia = evaluateVigencia(relatedRow, license, req.licenseCode, heldLabel, today);
    return {
      tier: 'related_family',
      clarificationText: `Same family, different engine: ${reqLabel} vs ${heldLabel}.`,
      vigenciaDegraded: vigencia.degraded,
      vigenciaNotice: vigencia.notice,
    };
  }

  // T3 used to sit here: a bare legacy aircraft_type_code resolving to the
  // required family, scored at 0.29 of the habilitation budget. Removed in
  // Fase 5.3 (2026-07-28) together with the pre-Part-66 aircraft_types
  // catalog — its only possible input was that column, which migration 029
  // drops. Nothing replaces it: a habilitation row either resolves to a
  // catalog rating (T1/T2) or contributes no aircraft evidence at all.
  //
  // NOTE for anyone reading the original Fase 5 plan: its step 3 said "T3
  // stays, only for needsReview habilitations, labeled". That step is VOID
  // — a needsReview row had a NULL rating id AND (after 029) no code, so
  // there would be nothing left for T3 to match on. The needs_review column
  // goes with it. See docs/MISSION_PART66.md.

  // T3 — not_met (was T4 before the old T3 was removed above).
  return { tier: 'not_met' };
}

// The fallback branch, used only when an offer states NO exact
// category+rating requirement. Two outcomes:
//   - 'legacy_category_only': the technician holds one of the license
//     categories the offer asks for. Nothing here confirms they have ANY
//     relevant aircraft experience, only the category — so it scores at
//     0.29 (BROAD_TIER_FRACTIONS) and carries its own clarification.
//   - 'not_met': no evidence at all.
interface BroadOutcome {
  tier: 'legacy_category_only' | 'not_met';
  matchText?: string;
  clarificationText?: string;
}

// Fase 5 (2026-08-04) — this was evaluateLegacyBroadMatch, and it evaluated
// TWO independent offer-side sets: required licenses and required aircraft
// FAMILIES (offer_required_aircraft_types, the approximate filter). Its two
// aircraft-bearing branches — "license + aircraft satisfied by the SAME
// technician_habilitations row" and "aircraft only" — both scored
// 'legacy_aircraft_confirmed' at 0.57.
//
// With the approximate filter retired, an offer can no longer express an
// aircraft requirement approximately: aircraft is stated exactly, as a
// license+rating pair in requiredHabilitations, which is evaluated by
// evaluateHabilitationRequirement above and never reaches this function.
// Both branches lost their only input and went with it, along with the
// ratingIndex parameter they needed. What remains is purely a license-
// category check, hence the name.
//
// The same-row rule the deleted branch enforced is NOT lost — it lives on
// where it actually matters, in the exact path (see the "same row" contract
// in evaluateHabilitationRequirement and CLAUDE.md). Nothing here combines
// an independent license check with an independent aircraft check, because
// there is no aircraft check left to combine.
function evaluateLicenseCategoryMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
): BroadOutcome {
  if (offer.requiredLicenses.length === 0) return { tier: 'not_met' };

  // The offer never asked for a specific aircraft, so there is nothing to
  // confirm beyond the license category itself — the technician could hold
  // this license with zero aircraft experience on record.
  const holds =
    technician.licenses.some((l) => offer.requiredLicenses.includes(l.licenseCode)) ||
    technician.habilitations.some((h) => offer.requiredLicenses.includes(h.licenseCode));

  return holds
    ? {
        tier: 'legacy_category_only',
        matchText: 'Required license category present in profile',
        clarificationText: 'Category-only match — no specific aircraft requirement to verify.',
      }
    : { tier: 'not_met' };
}

const TIER_RANK: Record<HabilitationTier, number> = { not_met: 0, related_family: 1, exact: 2 };

function upgradeTier(current: HabilitationTier, next: HabilitationTier): HabilitationTier {
  return TIER_RANK[next] > TIER_RANK[current] ? next : current;
}

// A match score is always computed for a specific offer + technician pair.
// Never store this value on a technician_profile row.
//
// now: injectable "current time" for the vigencia (expired/not-current)
// check — defaults to the real clock. Tests pass a fixed Date so expired-
// vs-future fixtures are deterministic regardless of when they run (same
// dependency-injection style as aircraftTypeRatingsCache.ts).
export function calculateOfferTechnicianMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
  now: Date = new Date(),
): MatchScore {
  const hasQualificationRequirements =
    offer.requiredHabilitations.length > 0 || offer.requiredLicenses.length > 0;
  const weights = getMatchScoreWeights(offer);
  const today = localDateToIso(now);

  let verified = 0;
  let habilitation = 0;
  let license = 0;
  let contractFit = 0;
  let location = 0;

  const matches: string[] = [];
  const clarifications: string[] = [];
  const vigenciaNotices: VigenciaNotice[] = [];
  const mandatoryMissing: string[] = [];
  const blockers: string[] = [];
  let level: MatchLevel = 'not_met';
  // True only when the qualification evidence came exclusively from the
  // approximate broad filter — never from a confirmed exact rating. Drives
  // BROAD_ONLY_CAP (see applyScoreCeilings).
  let isBroadOnlyMatch = false;

  if (technician.verificationStatus === 'verified') {
    verified = weights.verified;
    matches.push('Verified profile');
  }

  if (offer.requiredHabilitations.length > 0) {
    // Exact category+rating requirements exist — every requirement is
    // evaluated against the technician's own habilitation rows, never by
    // combining an independent license check with an independent aircraft
    // check.
    //
    // Evaluated once up front (not inline in the loop below) so the
    // vigencia degradation can be scoped correctly: only the row(s) that
    // actually produced the WINNING tier should shave points off the
    // score, even though every degraded row's notice is still surfaced —
    // same "always show, only the best one scores" pattern T2
    // clarifications already follow.
    const evaluations = offer.requiredHabilitations.map((req) => ({
      req,
      outcome: evaluateHabilitationRequirement(req, technician, ratingIndex, today),
    }));

    let bestTier: HabilitationTier = 'not_met';
    for (const { outcome } of evaluations) {
      bestTier = upgradeTier(bestTier, outcome.tier);
    }
    const vigenciaDegraded = evaluations.some(({ outcome }) => outcome.tier === bestTier && outcome.vigenciaDegraded);

    let everyMandatoryExact = true;
    let licenseHeldForAll = true;

    for (const { req, outcome } of evaluations) {
      if (outcome.tier === 'exact' && outcome.matchText) matches.push(outcome.matchText);
      if (outcome.tier === 'related_family' && outcome.clarificationText) {
        clarifications.push(outcome.clarificationText);
      }
      if (outcome.vigenciaNotice) vigenciaNotices.push(outcome.vigenciaNotice);

      const licenseLabel = `${req.licenseCode} + ${getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex)}`;
      if (req.requirementLevel === 'mandatory') {
        // Anything short of an exact (T1) match means the mandatory
        // requirement was not met exactly — surfaced so the technician can
        // still appear as "related" without ever being presented as a full
        // match, and so the mandatory cap below has a reason to point to.
        // A vigencia-degraded exact match is still tier 'exact' — degrading
        // never demotes a requirement into mandatoryMissing.
        if (outcome.tier !== 'exact') {
          everyMandatoryExact = false;
          mandatoryMissing.push(licenseLabel);
        }
      } else if (outcome.tier === 'not_met') {
        clarifications.push(`The offer prefers ${licenseLabel}; not present in the profile`);
      }

      const licenseHeld =
        technician.licenses.some((l) => l.licenseCode === req.licenseCode) ||
        technician.habilitations.some((h) => h.licenseCode === req.licenseCode);
      if (!licenseHeld) licenseHeldForAll = false;
    }

    level = bestTier === 'exact' && everyMandatoryExact ? 'exact' : bestTier !== 'not_met' ? 'related' : 'not_met';
    const vigenciaFraction = vigenciaDegraded ? 1 - VIGENCIA_DEGRADATION_FRACTION : 1;
    habilitation = Math.round(weights.habilitation * HABILITATION_TIER_FRACTIONS[bestTier] * vigenciaFraction);
    license = licenseHeldForAll ? weights.license : 0;
  } else if (hasQualificationRequirements) {
    // No exact requirements — the offer only names license categories, so
    // fall back to the category check.
    const broad = evaluateLicenseCategoryMatch(offer, technician);
    if (broad.tier !== 'not_met') {
      level = 'legacy';
      isBroadOnlyMatch = true;
      if (broad.matchText) matches.push(broad.matchText);
      if (broad.clarificationText) clarifications.push(broad.clarificationText);
      // Never full/exact credit (Fase 5.3 fix) — holding the category is
      // real evidence but never a confirmed exact rating, so it scores at
      // 0.29 (BROAD_TIER_FRACTIONS.legacy_category_only). See
      // applyScoreCeilings() for the label ceiling this also imposes
      // (never "Excellent").
      habilitation = Math.round(weights.habilitation * BROAD_TIER_FRACTIONS[broad.tier]);
      license = weights.license;
    } else {
      level = 'not_met';
      habilitation = 0;
      license = 0;
      mandatoryMissing.push(`Required license: ${offer.requiredLicenses.join(', ')}`);
    }
  } else {
    // The offer specifies no qualification requirement at all — habilitation
    // and license simply never enter the score (not awarded, not
    // penalized). weights here is NO_REQUIREMENTS_WEIGHTS, so the other
    // four components already sum to at most 75.
    level = 'legacy';
    matches.push('The offer does not require a specific license or aircraft');
  }

  // ── Contract fit (antes, mal llamada "Availability") ─────────────────
  // Esta fila NUNCA midió disponibilidad: mide si el técnico acepta el TIPO
  // DE CONTRATO de la oferta. El nombre viejo mentía, y encima la
  // disponibilidad real (immediately) no entra en el score en absoluto — es
  // filtro y etiqueta, no puntos: un estado binario no debe mover un ranking.
  //
  // REGLA DEL CONJUNTO VACÍO: no declarar tipos de contrato significa
  // "abierto a cualquiera", así que puntúa COMPLETO. Sólo saca cero quien SÍ
  // declaró y ninguno coincide. Sin esto, renombrar la fila la habría hecho
  // honesta pero habría dejado 15 puntos inalcanzables para quien no rellena
  // un campo OPCIONAL — exactamente lo que se decidió no hacer con los años
  // de experiencia ("la ausencia de dato nunca penaliza").
  const techContractTypes = technician.availability.contractTypes as string[];
  const openToAnyContract = techContractTypes.length === 0;
  if (openToAnyContract || techContractTypes.includes(offer.contractType)) {
    contractFit = weights.contractFit;
  }

  // offer.minYearsExperience SIGUE sin puntuar y sin entrar en breakdown —
  // "la cualificación puntúa, la experiencia informa" no cambia. Lo que sí
  // hace ahora es descalificar: ver la sección de blockers más abajo.

  const technicianLocation = resolveLocationSnapshot(technician);
  const offerLocation = resolveLocationSnapshot({
    locationCityId: offer.locationCityId,
    country: offer.locationCountry,
    city: offer.locationCity,
    baseAirport: offer.locationBaseAirport,
  });

  if (
    (technicianLocation?.locationCityId && offerLocation?.locationCityId && technicianLocation.locationCityId === offerLocation.locationCityId) ||
    (technicianLocation?.baseAirport && offerLocation?.baseAirport && technicianLocation.baseAirport === offerLocation.baseAirport) ||
    (technicianLocation?.city && offerLocation?.city && technicianLocation.city.toLowerCase() === offerLocation.city.toLowerCase())
  ) {
    location = weights.location;
  }

  // ── Hard blockers ────────────────────────────────────────────────────
  // Not a weak-evidence signal like mandatoryMissing — these say the offer
  // was never for this technician. They live HERE, in the pure function,
  // rather than in either matchingV2.ts wrapper on purpose: the wrappers
  // cover one direction each (company→technicians, technician→offers) and
  // a dozen screens call this function directly, so a rule implemented in a
  // wrapper would silently apply to some of the product and not the rest.
  // Neither rule touches breakdown — a blocker caps the total (BLOCKER_CAP,
  // see applyScoreCeilings), it never awards or subtracts component points.

  // Technician type. The list is an OR: the offer accepts ANY of the types
  // it names. Empty means the offer does not restrict the type at all, so
  // there is nothing to evaluate — never a blocker, and no match line
  // either (claiming a match for a requirement the offer never stated would
  // be noise).
  if (offer.requiredTechnicianTypes.length > 0) {
    if (offer.requiredTechnicianTypes.includes(technician.technicianType)) {
      matches.push(`Technician type: ${technicianTypeLabel(technician.technicianType)}`);
    } else {
      const accepted = offer.requiredTechnicianTypes.map(technicianTypeLabel).join(' or ');
      blockers.push(
        `The offer is for ${accepted}; this profile is a ${technicianTypeLabel(technician.technicianType)}.`,
      );
    }
  }

  // Minimum declared experience. `yearsExperience` absent (undefined/NULL)
  // is NOT a blocker — deliberate product rule, the same one the server-side
  // prefilter encodes as `years_experience.is.null OR >= N` (see
  // applyMinYearsFilter in technicianRepositoryV2): the ABSENCE OF DATA NEVER
  // PENALIZES. Only a value the technician actually declared, below the
  // offer's stated minimum, disqualifies. `!= null` rather than a typeof
  // check so a NULL that survives a mapper is treated as "not declared"
  // instead of comparing as 0 and blocking everyone who left the field empty.
  const declaredYears = technician.yearsExperience;
  if (offer.minYearsExperience > 0 && declaredYears != null && declaredYears < offer.minYearsExperience) {
    blockers.push(
      `The offer requires at least ${offer.minYearsExperience} years of experience; this profile declares ${declaredYears}.`,
    );
  }

  const rawTotal = verified + habilitation + license + contractFit + location;

  // Every score ceiling is applied in one place — see applyScoreCeilings()
  // and the ladder documented above it. Most restrictive always wins,
  // however many apply at once.
  const total = applyScoreCeilings(rawTotal, {
    isBroadOnlyMatch,
    hasMandatoryUnmet: mandatoryMissing.length > 0,
    isZeroQualification: hasQualificationRequirements && habilitation === 0,
    hasBlocker: blockers.length > 0,
  });

  return {
    offerId: offer.id,
    technicianId: technician.id,
    total,
    label: getMatchLabel(total),
    breakdown: { verified, habilitation, license, contractFit, location },
    level,
    matches,
    clarifications,
    vigenciaNotices,
    mandatoryMissing,
    blockers,
  };
}

export function getMatchLabel(total: number): MatchLabel {
  if (total >= 80) return 'Excellent match';
  if (total >= 60) return 'Strong match';
  if (total >= 40) return 'Partial match';
  return 'Weak match';
}

// PRESENTATION ONLY — the scoring is untouched. An offer with no
// qualification requirement already falls into NO_REQUIREMENTS_WEIGHTS on its
// own (topping out at 75, never "Excellent"); this only decides what the
// resulting number is CALLED on screen. See GENERAL_COMPATIBILITY_LABEL in
// types/matching.ts for why non-licensed offers get their own wording.
export function getMatchDisplayLabel(
  offer: Pick<OfferWithRequirements, 'requiredTechnicianTypes'>,
  score: Pick<MatchScore, 'label'>,
): MatchDisplayLabel {
  return offerTargetsLicensedProfiles(offer) ? score.label : GENERAL_COMPATIBILITY_LABEL;
}
