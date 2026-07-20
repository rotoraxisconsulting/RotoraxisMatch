// Pure, offer+technician matching logic — no Supabase/repository imports so
// it can be unit-tested without a database connection (see
// scripts/testMatching.ts).
//
// Core rule (fixes the false-combination bug): a category (license) and an
// aircraft/rating are only ever considered "matched together" when they come
// from the SAME technician_habilitations row. Holding a license and having
// some unrelated habilitation never counts as holding that license for that
// aircraft. See docs/PART66_AIRCRAFT_MODEL_ANALYSIS.md section 6 for the
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
import { TechnicianHabilitation, TechnicianWithRelations } from '../types/technician';
import { MatchScore, MatchLabel, MatchLevel } from '../types/matching';
import { resolveLocationSnapshot } from '../constants/locationCities';
import { AircraftRatingIndex, areRatingsRelated, getAircraftTypeRatingLabel, ratingMatchesLegacyCode } from '../constants/aircraftTypeRatings';

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

// A mandatory exact-habilitation requirement that isn't met at T1 caps the
// total here, regardless of how high the raw sum would otherwise be.
const MANDATORY_UNMET_CAP = 59;
// An offer that specifies real qualification requirements (exact
// habilitations OR the broad license/aircraft sets) where the technician's
// habilitation score came out to zero caps further — stricter than the
// mandatory cap above, and applies even for a preferred-only mismatch,
// because "verified + available + experienced + co-located" must never by
// itself read as "Partial match" when the technician holds none of the
// qualification the offer actually asked for.
const ZERO_QUALIFICATION_CAP = 39;

type HabilitationTier = 'exact' | 'related_family' | 'related_legacy' | 'not_met';

interface RequirementOutcome {
  tier: HabilitationTier;
  matchText?: string;
  clarificationText?: string;
}

function evaluateHabilitationRequirement(
  req: Pick<OfferRequiredHabilitation, 'licenseCode' | 'aircraftTypeRatingId'>,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
): RequirementOutcome {
  const reqLabel = getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex);
  const rating = ratingIndex.get(req.aircraftTypeRatingId);
  const sameLicenseRows = technician.habilitations.filter((h) => h.licenseCode === req.licenseCode);

  // T1 — exact: same license, same rating, in the same row. Deliberately
  // does not look at experienceYears/isCurrent — those are optional,
  // per-rating declarations (wired up in a later phase); their absence is
  // neutral, never a penalty. A rating endorsed with no declared experience
  // is still a full, legally valid match.
  //
  // TODO(open regulatory question, see mission brief): EASA AMC 66.A.45
  // may record some B2 endorsements without an engine designation. Not
  // special-cased here — would affect this tier and T2 below, and the
  // category pre-filter planned for a later phase.
  if (sameLicenseRows.some((h) => h.aircraftTypeRatingId === req.aircraftTypeRatingId)) {
    return { tier: 'exact', matchText: `${req.licenseCode} + ${reqLabel}` };
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
    return {
      tier: 'related_family',
      clarificationText: `Misma familia, distinto motor: ${reqLabel} vs ${heldLabel}.`,
    };
  }

  // T3 — related_legacy: same license, legacy aircraft_type_code that is
  // one of the required rating's known aliases, but no specific engine on
  // record — a weaker, approximate signal than T2.
  const legacyRow = sameLicenseRows.find(
    (h) => h.aircraftTypeCode && rating && ratingMatchesLegacyCode(rating, h.aircraftTypeCode),
  );
  if (legacyRow) {
    return {
      tier: 'related_legacy',
      clarificationText: `Coincidencia aproximada sin motorización: habilitación general en ${legacyRow.aircraftTypeCode} bajo ${req.licenseCode}.`,
    };
  }

  // T4 — not_met.
  return { tier: 'not_met' };
}

interface BroadOutcome {
  tier: 'legacy' | 'not_met';
  matchText?: string;
}

// Legacy broad requirements (offer_required_licenses / offer_required_aircraft_types)
// are two independent sets on the OFFER side, but they must never be checked
// independently against the TECHNICIAN's data. When an offer requires both a
// license and an aircraft type, only a single technician_habilitations row
// that satisfies both at once counts as a match.
function evaluateLegacyBroadMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
): BroadOutcome {
  const needsLicense = offer.requiredLicenses.length > 0;
  const needsAircraft = offer.requiredAircraftTypes.length > 0;

  function habilitationCoversAircraftCode(h: TechnicianHabilitation, code: string): boolean {
    if (h.aircraftTypeCode === code) return true;
    if (!h.aircraftTypeRatingId) return false;
    const rating = ratingIndex.get(h.aircraftTypeRatingId);
    return Boolean(rating) && ratingMatchesLegacyCode(rating!, code);
  }

  if (needsLicense && needsAircraft) {
    const row = technician.habilitations.find((h) => {
      if (!offer.requiredLicenses.includes(h.licenseCode)) return false;
      return offer.requiredAircraftTypes.some((code) => habilitationCoversAircraftCode(h, code));
    });
    return row
      ? { tier: 'legacy', matchText: `${row.licenseCode} + aeronave requerida en la misma habilitación` }
      : { tier: 'not_met' };
  }

  if (needsLicense) {
    const holds =
      technician.licenses.some((l) => offer.requiredLicenses.includes(l.licenseCode)) ||
      technician.habilitations.some((h) => offer.requiredLicenses.includes(h.licenseCode));
    return holds ? { tier: 'legacy', matchText: 'Categoría requerida presente en el perfil' } : { tier: 'not_met' };
  }

  if (needsAircraft) {
    const covers =
      technician.habilitations.some((h) => offer.requiredAircraftTypes.some((code) => habilitationCoversAircraftCode(h, code))) ||
      technician.aircraftExperience.some((e) => offer.requiredAircraftTypes.includes(e.aircraftTypeCode));
    return covers ? { tier: 'legacy', matchText: 'Aeronave requerida presente en el perfil o la experiencia' } : { tier: 'not_met' };
  }

  return { tier: 'not_met' };
}

const TIER_RANK: Record<HabilitationTier, number> = { not_met: 0, related_legacy: 1, related_family: 2, exact: 3 };

function upgradeTier(current: HabilitationTier, next: HabilitationTier): HabilitationTier {
  return TIER_RANK[next] > TIER_RANK[current] ? next : current;
}

// A match score is always computed for a specific offer + technician pair.
// Never store this value on a technician_profile row.
export function calculateOfferTechnicianMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
): MatchScore {
  const hasQualificationRequirements =
    offer.requiredHabilitations.length > 0 || offer.requiredLicenses.length > 0 || offer.requiredAircraftTypes.length > 0;
  const weights = getMatchScoreWeights(offer);

  let verified = 0;
  let habilitation = 0;
  let license = 0;
  let availability = 0;
  let experience = 0;
  let location = 0;

  const matches: string[] = [];
  const clarifications: string[] = [];
  const mandatoryMissing: string[] = [];
  let level: MatchLevel = 'not_met';

  if (technician.verificationStatus === 'verified') {
    verified = weights.verified;
    matches.push('Perfil verificado');
  }

  if (offer.requiredHabilitations.length > 0) {
    // Exact category+rating requirements exist — every requirement is
    // evaluated against the technician's own habilitation rows, never by
    // combining an independent license check with an independent aircraft
    // check.
    let bestTier: HabilitationTier = 'not_met';
    let everyMandatoryExact = true;
    let licenseHeldForAll = true;

    for (const req of offer.requiredHabilitations) {
      const outcome = evaluateHabilitationRequirement(req, technician, ratingIndex);
      bestTier = upgradeTier(bestTier, outcome.tier);

      if (outcome.tier === 'exact' && outcome.matchText) matches.push(outcome.matchText);
      if ((outcome.tier === 'related_family' || outcome.tier === 'related_legacy') && outcome.clarificationText) {
        clarifications.push(outcome.clarificationText);
      }

      const licenseLabel = `${req.licenseCode} + ${getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex)}`;
      if (req.requirementLevel === 'mandatory') {
        // Anything short of an exact (T1) match means the mandatory
        // requirement was not met exactly — surfaced so the technician can
        // still appear as "related" without ever being presented as a full
        // match, and so the mandatory cap below has a reason to point to.
        if (outcome.tier !== 'exact') {
          everyMandatoryExact = false;
          mandatoryMissing.push(licenseLabel);
        }
      } else if (outcome.tier === 'not_met') {
        clarifications.push(`La oferta prefiere ${licenseLabel}; no consta en el perfil`);
      }

      const licenseHeld =
        technician.licenses.some((l) => l.licenseCode === req.licenseCode) ||
        technician.habilitations.some((h) => h.licenseCode === req.licenseCode);
      if (!licenseHeld) licenseHeldForAll = false;
    }

    level = bestTier === 'exact' && everyMandatoryExact ? 'exact' : bestTier !== 'not_met' ? 'related' : 'not_met';
    habilitation = Math.round(weights.habilitation * HABILITATION_TIER_FRACTIONS[bestTier]);
    license = licenseHeldForAll ? weights.license : 0;
  } else if (hasQualificationRequirements) {
    // No exact requirements — fall back to the broad (legacy-compatible)
    // requirement sets, still resolved through a single joint habilitation
    // row whenever both a license and an aircraft are required together.
    const broad = evaluateLegacyBroadMatch(offer, technician, ratingIndex);
    if (broad.tier === 'legacy') {
      level = 'legacy';
      if (broad.matchText) matches.push(broad.matchText);
      habilitation = weights.habilitation;
      license = weights.license;
    } else {
      level = 'not_met';
      habilitation = 0;
      license = 0;
      if (offer.requiredLicenses.length > 0 && offer.requiredAircraftTypes.length > 0) {
        mandatoryMissing.push(`${offer.requiredLicenses.join('/')} + ${offer.requiredAircraftTypes.join('/')}`);
        clarifications.push('No se encontró una habilitación del técnico que combine la categoría y la aeronave solicitadas en la misma fila.');
      } else if (offer.requiredLicenses.length > 0) {
        mandatoryMissing.push(`Categoría requerida: ${offer.requiredLicenses.join(', ')}`);
      } else if (offer.requiredAircraftTypes.length > 0) {
        mandatoryMissing.push(`Aeronave requerida: ${offer.requiredAircraftTypes.join(', ')}`);
      }
    }
  } else {
    // The offer specifies no qualification requirement at all — habilitation
    // and license simply never enter the score (not awarded, not
    // penalized). weights here is NO_REQUIREMENTS_WEIGHTS, so the other
    // four components already sum to at most 75.
    level = 'legacy';
    matches.push('La oferta no exige categoría ni aeronave concretas');
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

  let total = verified + habilitation + license + availability + experience + location;

  // Mandatory-as-ceiling: an unmet mandatory exact-habilitation requirement
  // caps the total, regardless of how high the rest of the profile scored.
  // Checked before the stricter zero-qualification cap so the stricter one
  // wins when both apply (e.g. a mandatory requirement met at T4/not_met).
  if (mandatoryMissing.length > 0) {
    total = Math.min(total, MANDATORY_UNMET_CAP);
  }
  // Zero-qualification ceiling: an offer that asks for real qualification
  // (exact habilitations or the broad license/aircraft sets) where the
  // technician's habilitation score is zero can never read as "Partial" —
  // verified + available + experienced + co-located must not manufacture
  // that impression on their own.
  if (hasQualificationRequirements && habilitation === 0) {
    total = Math.min(total, ZERO_QUALIFICATION_CAP);
  }

  return {
    offerId: offer.id,
    technicianId: technician.id,
    total,
    label: getMatchLabel(total),
    breakdown: { verified, habilitation, license, availability, experience, location },
    level,
    matches,
    clarifications,
    mandatoryMissing,
  };
}

export function getMatchLabel(total: number): MatchLabel {
  if (total >= 80) return 'Excellent match';
  if (total >= 60) return 'Strong match';
  if (total >= 40) return 'Partial match';
  return 'Weak match';
}
