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
// preference gap. Two mechanisms enforce this, applied after the raw
// breakdown is summed:
//   - an unmet MANDATORY exact-habilitation requirement caps the total at
//     MANDATORY_UNMET_CAP (stays in the "Partial" label range at most);
//   - a qualification-requiring offer where the technician's habilitation
//     score is zero caps the total further, at ZERO_QUALIFICATION_CAP
//     (stays "Weak" — verified/availability/experience/location alone can
//     never manufacture a "Partial" result out of zero real qualification).
//
// ratingIndex: the caller loads the aircraft_type_ratings catalog (via
// catalogRepository/useAircraftTypeRatingsCatalog) and builds the index with
// buildAircraftRatingIndex() BEFORE calling this function — matching never
// queries Supabase directly. An id missing from the index (e.g. a pending
// catalog request, never a real catalog row) simply resolves to no match,
// never a crash.
import { OfferRequiredHabilitation, OfferWithRequirements } from '../types/offer';
import { TechnicianHabilitation, TechnicianLicense, TechnicianWithRelations } from '../types/technician';
import { MatchScore, MatchLabel, MatchLevel, VigenciaNotice } from '../types/matching';
import { resolveLocationSnapshot } from '../constants/locationCities';
import { AircraftRatingIndex, areRatingsRelated, getAircraftTypeRatingLabel, getAircraftFamilyKey, resolveLegacyCodeToFamilyKeys } from '../constants/aircraftTypeRatings';
import { localDateToIso } from './dateField';

// Qualification (habilitation + license) dominates the score whenever the
// offer actually specifies one — the whole point of this rebalance. When an
// offer specifies NO qualification requirement at all, there is nothing to
// award those 55 points for; NO_REQUIREMENTS_WEIGHTS redistributes the
// remaining signals (verified/availability/experience/location) onto a
// scale that tops out at 75 — "Strong match" at best, deliberately never
// reaching "Excellent" (>=80) from profile quality alone, since nothing
// here confirms the technician actually fits THIS offer's requirements.
const QUALIFICATION_WEIGHTS = { verified: 15, habilitation: 35, license: 20, availability: 15, experience: 10, location: 5 } as const;
// habilitation/license are always 0 here (never awarded, never penalized —
// see the no-requirements branch below) — kept as explicit fields rather
// than omitted so `weights` stays a single consistent shape instead of a
// union, which is both simpler to read and avoids TypeScript narrowing
// gymnastics at every access site.
const NO_REQUIREMENTS_WEIGHTS = { verified: 25, habilitation: 0, license: 0, availability: 25, experience: 15, location: 10 } as const;

export interface MatchScoreWeights {
  verified: number;
  habilitation: number;
  license: number;
  availability: number;
  experience: number;
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
    offer.requiredHabilitations.length > 0 || offer.requiredLicenses.length > 0 || offer.requiredAircraftTypes.length > 0;
  return hasQualificationRequirements ? QUALIFICATION_WEIGHTS : NO_REQUIREMENTS_WEIGHTS;
}

// Within the habilitation budget: T1 (exact) gets the full amount; T2
// (same family, different engine) and T3 (legacy code match, no engine on
// record) get progressively smaller fractions — still real, still surfaced
// as a clarification, never silently equal to an exact match.
const HABILITATION_TIER_FRACTIONS = { exact: 1, related_family: 0.57, related_legacy: 0.29, not_met: 0 } as const;

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
const BROAD_ONLY_CAP = 79;
const MANDATORY_UNMET_CAP = 59;
const ZERO_QUALIFICATION_CAP = 39;

// Single place the whole ceiling ladder is combined — see the comment
// above for what each one means and why "most restrictive wins" needs no
// special-casing (Math.min chains regardless of which flags are true, or
// how many). Exported for direct testing of the combination itself,
// independent of whether today's branch structure can produce every
// combination in practice (see scripts/testMatching.ts).
export function applyScoreCeilings(
  total: number,
  flags: { isBroadOnlyMatch: boolean; hasMandatoryUnmet: boolean; isZeroQualification: boolean },
): number {
  let capped = total;
  if (flags.isBroadOnlyMatch) capped = Math.min(capped, BROAD_ONLY_CAP);
  if (flags.hasMandatoryUnmet) capped = Math.min(capped, MANDATORY_UNMET_CAP);
  if (flags.isZeroQualification) capped = Math.min(capped, ZERO_QUALIFICATION_CAP);
  return capped;
}

type HabilitationTier = 'exact' | 'related_family' | 'related_legacy' | 'not_met';

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
// match (T1/T2/T3), plus the technician's own TechnicianLicense row for the
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

  // T3 — related_legacy: same license, legacy aircraft_type_code that
  // resolves (inclusively — see resolveLegacyCodeToFamilyKeys) to the SAME
  // FAMILY as the required rating, but no specific engine on record — a
  // weaker, approximate signal than T2. Family-based since migration 022
  // (2026-07-22): a code no longer has to be a literal alias of THIS EXACT
  // rating row (same engine too) — that was stricter than the "weaker than
  // T2, family-level" signal this tier was always meant to be.
  const requiredFamilyKey = rating ? getAircraftFamilyKey(rating) : undefined;
  const legacyRow = requiredFamilyKey
    ? sameLicenseRows.find(
        (h) => h.aircraftTypeCode && resolveLegacyCodeToFamilyKeys(h.aircraftTypeCode, ratingIndex).has(requiredFamilyKey),
      )
    : undefined;
  if (legacyRow) {
    const vigencia = evaluateVigencia(legacyRow, license, req.licenseCode, `general habilitation in ${legacyRow.aircraftTypeCode}`, today);
    // Fase 5.3 — label only, no score change: migration 027's needs_review
    // flag (set by scripts/backfillLegacyAircraftRatings.ts when this exact
    // code resolved to zero or multiple ratings) is surfaced explicitly
    // when true, instead of the clarification reading identically whether
    // the row has been checked or not.
    const reviewNote = legacyRow.needsReview
      ? ' Flagged for review — no catalog rating could be confirmed automatically for this code.'
      : '';
    return {
      tier: 'related_legacy',
      clarificationText: `Approximate match without engine data: general habilitation in ${legacyRow.aircraftTypeCode} under ${req.licenseCode}.${reviewNote}`,
      vigenciaDegraded: vigencia.degraded,
      vigenciaNotice: vigencia.notice,
    };
  }

  // T4 — not_met.
  return { tier: 'not_met' };
}

// Fase 5.3 (2026-07-27, checkpoint-confirmed): this used to be a flat
// 'legacy' | 'not_met' outcome, scored at FULL habilitation+license credit
// whenever ANY sub-case matched — the exact "scores like an exact match"
// bug the mission's own confirmed-facts list flagged. Now split by
// evidence strength:
//   - 'legacy_aircraft_confirmed': a REAL technician_habilitations row
//     covers the required aircraft family — whether or not a license was
//     also required (both the "license+aircraft same row" and
//     "aircraft only" sub-cases below confirm a real row for that
//     aircraft). Scored at the same fraction as T2 (related_family, 0.57)
//     — same-row/real-row evidence, still never as strong as a confirmed
//     exact rating.
//   - 'legacy_category_only': the offer asked for a license category with
//     NO aircraft requirement at all — nothing here confirms the
//     technician has ANY relevant aircraft experience, only that they
//     hold the license. Weaker evidence, scored at the T3 fraction
//     (related_legacy, 0.29), with its own clarification saying so.
//   - 'not_met': no evidence at all.
interface BroadOutcome {
  tier: 'legacy_aircraft_confirmed' | 'legacy_category_only' | 'not_met';
  matchText?: string;
  clarificationText?: string;
}

// Legacy broad requirements (offer_required_licenses / offer_required_aircraft_types)
// are two independent sets on the OFFER side, but they must never be checked
// independently against the TECHNICIAN's data. When an offer requires both a
// license and an aircraft type, only a single technician_habilitations row
// that satisfies both at once counts as a match.
//
// offer.requiredAircraftTypes holds FAMILY KEYS since migration 022
// (2026-07-22) — "<manufacturer>::<aircraftFamily>" from the 606-row
// aircraft_type_ratings catalog (see getAircraftFamilyKey), never a legacy
// aircraft_types(code) value anymore. The ApproximateFilterSection picker
// sources its options from getFamilies() over that same catalog, so the
// values it writes always match this shape.
function evaluateLegacyBroadMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
): BroadOutcome {
  const needsLicense = offer.requiredLicenses.length > 0;
  const needsAircraft = offer.requiredAircraftTypes.length > 0;
  const APPROXIMATE_NOTE = 'Approximate requirement — engine not specified.';

  // A habilitation covers a required family key either via its resolved
  // rating (exact family match) or, for rows that only ever recorded a
  // bare legacy code, via inclusive code->family resolution (see
  // resolveLegacyCodeToFamilyKeys — a code that aliases several families
  // counts for all of them, never a guessed single one).
  function habilitationCoversFamilyKey(h: TechnicianHabilitation, familyKey: string): boolean {
    if (h.aircraftTypeRatingId) {
      const rating = ratingIndex.get(h.aircraftTypeRatingId);
      if (rating && getAircraftFamilyKey(rating) === familyKey) return true;
    }
    if (h.aircraftTypeCode && resolveLegacyCodeToFamilyKeys(h.aircraftTypeCode, ratingIndex).has(familyKey)) return true;
    return false;
  }

  if (needsLicense && needsAircraft) {
    const row = technician.habilitations.find((h) => {
      if (!offer.requiredLicenses.includes(h.licenseCode)) return false;
      return offer.requiredAircraftTypes.some((key) => habilitationCoversFamilyKey(h, key));
    });
    return row
      ? {
          tier: 'legacy_aircraft_confirmed',
          matchText: `${row.licenseCode} + required aircraft in the same habilitation`,
          clarificationText: APPROXIMATE_NOTE,
        }
      : { tier: 'not_met' };
  }

  if (needsAircraft) {
    // technician.aircraftExperience (TechnicianAircraftExperience) only
    // ever carries a bare legacy aircraft_type_code with no rating link at
    // all — unlike a habilitation row, there is nothing here to resolve a
    // family from without guessing, so it can no longer contribute
    // evidence for a family-keyed requirement (migration 022, 2026-07-22;
    // documented in docs/MISSION_PART66.md). Only technician_habilitations
    // rows (which carry either a rating id or a legacy code this file can
    // inclusively resolve) satisfy this branch now.
    const covers = technician.habilitations.some((h) =>
      offer.requiredAircraftTypes.some((key) => habilitationCoversFamilyKey(h, key)),
    );
    return covers
      ? { tier: 'legacy_aircraft_confirmed', matchText: 'Required aircraft present in profile', clarificationText: APPROXIMATE_NOTE }
      : { tier: 'not_met' };
  }

  if (needsLicense) {
    // License-only: the offer never asked for a specific aircraft, so
    // there is nothing here to confirm beyond the license category itself
    // — the technician could hold this license with zero aircraft
    // experience on record. Weaker than the two cases above, which both
    // require a real technician_habilitations row for a specific family.
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

  return { tier: 'not_met' };
}

const TIER_RANK: Record<HabilitationTier, number> = { not_met: 0, related_legacy: 1, related_family: 2, exact: 3 };

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
    offer.requiredHabilitations.length > 0 || offer.requiredLicenses.length > 0 || offer.requiredAircraftTypes.length > 0;
  const weights = getMatchScoreWeights(offer);
  const today = localDateToIso(now);

  let verified = 0;
  let habilitation = 0;
  let license = 0;
  let availability = 0;
  let experience = 0;
  let location = 0;

  const matches: string[] = [];
  const clarifications: string[] = [];
  const vigenciaNotices: VigenciaNotice[] = [];
  const mandatoryMissing: string[] = [];
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
    // same "always show, only the best one scores" pattern T2/T3
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
      if ((outcome.tier === 'related_family' || outcome.tier === 'related_legacy') && outcome.clarificationText) {
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
    // No exact requirements — fall back to the broad (legacy-compatible)
    // requirement sets, still resolved through a single joint habilitation
    // row whenever both a license and an aircraft are required together.
    const broad = evaluateLegacyBroadMatch(offer, technician, ratingIndex);
    if (broad.tier !== 'not_met') {
      level = 'legacy';
      isBroadOnlyMatch = true;
      if (broad.matchText) matches.push(broad.matchText);
      if (broad.clarificationText) clarifications.push(broad.clarificationText);
      // Never full/exact credit (Fase 5.3 fix) — a broad match is real
      // evidence but never a confirmed exact rating. 'legacy_aircraft_
      // confirmed' (a real technician_habilitations row for the required
      // family) scores at the same fraction as T2; 'legacy_category_only'
      // (license held, no aircraft ever asked for or confirmed) is weaker,
      // same fraction as T3. See applyScoreCeilings() for the label
      // ceiling this also imposes (never "Excellent").
      const fraction = broad.tier === 'legacy_aircraft_confirmed'
        ? HABILITATION_TIER_FRACTIONS.related_family
        : HABILITATION_TIER_FRACTIONS.related_legacy;
      habilitation = Math.round(weights.habilitation * fraction);
      license = weights.license;
    } else {
      level = 'not_met';
      habilitation = 0;
      license = 0;
      if (offer.requiredLicenses.length > 0 && offer.requiredAircraftTypes.length > 0) {
        mandatoryMissing.push(`${offer.requiredLicenses.join('/')} + ${offer.requiredAircraftTypes.join('/')}`);
        clarifications.push('No technician habilitation was found that combines the required license and aircraft in the same row.');
      } else if (offer.requiredLicenses.length > 0) {
        mandatoryMissing.push(`Required license: ${offer.requiredLicenses.join(', ')}`);
      } else if (offer.requiredAircraftTypes.length > 0) {
        mandatoryMissing.push(`Required aircraft: ${offer.requiredAircraftTypes.join(', ')}`);
      }
    }
  } else {
    // The offer specifies no qualification requirement at all — habilitation
    // and license simply never enter the score (not awarded, not
    // penalized). weights here is NO_REQUIREMENTS_WEIGHTS, so the other
    // four components already sum to at most 75.
    level = 'legacy';
    matches.push('The offer does not require a specific license or aircraft');
  }

  const techContractTypes = technician.availability.contractTypes as string[];
  if (techContractTypes.includes(offer.contractType)) availability = weights.availability;

  const totalYears = technician.aircraftExperience.reduce((sum, e) => {
    return sum + (e.unit === 'years' ? e.value : e.value / 2000);
  }, 0);
  if (totalYears >= offer.minYearsExperience) experience = weights.experience;

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

  const rawTotal = verified + habilitation + license + availability + experience + location;

  // Every score ceiling is applied in one place — see applyScoreCeilings()
  // and the ladder documented above it. Most restrictive always wins,
  // however many apply at once.
  const total = applyScoreCeilings(rawTotal, {
    isBroadOnlyMatch,
    hasMandatoryUnmet: mandatoryMissing.length > 0,
    isZeroQualification: hasQualificationRequirements && habilitation === 0,
  });

  return {
    offerId: offer.id,
    technicianId: technician.id,
    total,
    label: getMatchLabel(total),
    breakdown: { verified, habilitation, license, availability, experience, location },
    level,
    matches,
    clarifications,
    vigenciaNotices,
    mandatoryMissing,
  };
}

export function getMatchLabel(total: number): MatchLabel {
  if (total >= 80) return 'Excellent match';
  if (total >= 60) return 'Strong match';
  if (total >= 40) return 'Partial match';
  return 'Weak match';
}
