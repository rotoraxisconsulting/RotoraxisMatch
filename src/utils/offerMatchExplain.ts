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

interface RequirementOutcome {
  tier: 'exact' | 'related' | 'not_met';
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

  // Exact — same license, same rating, in the same row.
  if (sameLicenseRows.some((h) => h.aircraftTypeRatingId === req.aircraftTypeRatingId)) {
    return { tier: 'exact', matchText: `${req.licenseCode} + ${reqLabel}` };
  }

  // Related — same license, a different rating in the same aircraft family
  // (same manufacturer, overlapping family), different engine.
  const relatedRow = sameLicenseRows.find(
    (h): h is TechnicianHabilitation & { aircraftTypeRatingId: string } =>
      Boolean(h.aircraftTypeRatingId) && areRatingsRelated(h.aircraftTypeRatingId as string, req.aircraftTypeRatingId, ratingIndex),
  );
  if (relatedRow) {
    return {
      tier: 'related',
      clarificationText: `La oferta solicita ${reqLabel} y el técnico tiene ${getAircraftTypeRatingLabel(relatedRow.aircraftTypeRatingId, ratingIndex)}. Coincide la familia de aeronave, pero no la motorización.`,
    };
  }

  // Related (general) — same license, legacy aircraft_type_code that is one
  // of the required rating's known aliases, but no specific engine on record.
  const legacyRow = sameLicenseRows.find(
    (h) => h.aircraftTypeCode && rating && ratingMatchesLegacyCode(rating, h.aircraftTypeCode),
  );
  if (legacyRow) {
    return {
      tier: 'related',
      clarificationText: `El técnico tiene habilitación general en ${legacyRow.aircraftTypeCode} bajo ${req.licenseCode}; motor no especificado en el perfil`,
    };
  }

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

function upgradeTier(current: 'exact' | 'related' | 'not_met', next: 'exact' | 'related' | 'not_met'): 'exact' | 'related' | 'not_met' {
  const rank = { not_met: 0, related: 1, exact: 2 } as const;
  return rank[next] > rank[current] ? next : current;
}

// A match score is always computed for a specific offer + technician pair.
// Never store this value on a technician_profile row.
export function calculateOfferTechnicianMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
  ratingIndex: AircraftRatingIndex,
): MatchScore {
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
    verified = 25;
    matches.push('Perfil verificado');
  }

  if (offer.requiredHabilitations.length > 0) {
    // Exact category+rating requirements exist — every requirement is
    // evaluated against the technician's own habilitation rows, never by
    // combining an independent license check with an independent aircraft
    // check.
    let bestTier: 'exact' | 'related' | 'not_met' = 'not_met';
    let everyMandatoryExact = true;
    let licenseHeldForAll = true;

    for (const req of offer.requiredHabilitations) {
      const outcome = evaluateHabilitationRequirement(req, technician, ratingIndex);
      bestTier = upgradeTier(bestTier, outcome.tier === 'not_met' ? 'not_met' : outcome.tier);

      if (outcome.tier === 'exact' && outcome.matchText) matches.push(outcome.matchText);
      if (outcome.tier === 'related' && outcome.clarificationText) clarifications.push(outcome.clarificationText);

      const licenseLabel = `${req.licenseCode} + ${getAircraftTypeRatingLabel(req.aircraftTypeRatingId, ratingIndex)}`;
      if (req.requirementLevel === 'mandatory') {
        // Anything short of an exact match means the mandatory requirement
        // was not met exactly — surfaced so the technician can still appear
        // as "related" without ever being presented as a full match.
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
    habilitation = bestTier === 'exact' ? 25 : bestTier === 'related' ? 12 : 0;
    license = licenseHeldForAll ? 20 : 0;
  } else {
    // No exact requirements — fall back to the broad (legacy-compatible)
    // requirement sets, still resolved through a single joint habilitation
    // row whenever both a license and an aircraft are required together.
    const needsAnything = offer.requiredLicenses.length > 0 || offer.requiredAircraftTypes.length > 0;
    if (!needsAnything) {
      level = 'legacy';
      habilitation = 25;
      license = 20;
      matches.push('La oferta no exige categoría ni aeronave concretas');
    } else {
      const broad = evaluateLegacyBroadMatch(offer, technician, ratingIndex);
      if (broad.tier === 'legacy') {
        level = 'legacy';
        if (broad.matchText) matches.push(broad.matchText);
        habilitation = 25;
        license = 20;
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
    }
  }

  const techContractTypes = technician.availability.contractTypes as string[];
  if (techContractTypes.includes(offer.contractType)) availability = 15;

  const totalYears = technician.aircraftExperience.reduce((sum, e) => {
    return sum + (e.unit === 'years' ? e.value : e.value / 2000);
  }, 0);
  if (totalYears >= offer.minYearsExperience) experience = 10;

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
    location = 5;
  }

  const total = verified + habilitation + license + availability + experience + location;

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
  return 'Low match';
}
