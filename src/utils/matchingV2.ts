import { OfferWithRequirements } from '../types/offer';
import { TechnicianWithRelations } from '../types/technician';
import { MatchScore, MatchLabel } from '../types/matching';
import { offerRepository } from '../repositories/v2/offerRepository';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { SafeTechnicianPreview } from '../types/privacy';

// A match score is always computed for a specific offer + technician pair.
// Never store this value on a technician_profile row.
export function calculateOfferTechnicianMatch(
  offer: OfferWithRequirements,
  technician: TechnicianWithRelations,
): MatchScore {
  let verified = 0;
  let habilitation = 0;
  let license = 0;
  let availability = 0;
  let experience = 0;
  let location = 0;

  if (technician.verificationStatus === 'verified') verified = 25;

  if (offer.requiredAircraftTypes.length === 0) {
    habilitation = 25;
  } else if (technician.habilitations.some((h) => offer.requiredAircraftTypes.includes(h.aircraftTypeCode))) {
    habilitation = 25;
  }

  if (offer.requiredLicenses.length === 0) {
    license = 20;
  } else {
    const techLicenseCodes = technician.licenses.map((l) => l.licenseCode as string);
    if (offer.requiredLicenses.some((code) => techLicenseCodes.includes(code))) {
      license = 20;
    }
  }

  const techContractTypes = technician.availability.contractTypes as string[];
  if (techContractTypes.includes(offer.contractType)) availability = 15;

  const totalYears = technician.aircraftExperience.reduce((sum, e) => {
    return sum + (e.unit === 'years' ? e.value : e.value / 2000);
  }, 0);
  if (totalYears >= offer.minYearsExperience) experience = 10;

  if (
    technician.city?.toLowerCase() === offer.locationCity?.toLowerCase() ||
    (technician.baseAirport && offer.locationBaseAirport && technician.baseAirport === offer.locationBaseAirport)
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
  };
}

export function getMatchLabel(total: number): MatchLabel {
  if (total >= 80) return 'Excellent match';
  if (total >= 60) return 'Strong match';
  if (total >= 40) return 'Partial match';
  return 'Low match';
}

export interface TechnicianMatchResult {
  technician: SafeTechnicianPreview;
  score: MatchScore;
}

export interface OfferMatchResult {
  offer: OfferWithRequirements;
  score: MatchScore;
}

// Returns all verified technicians ranked by match % for a specific offer.
export async function getTechnicianMatchesForOffer(offerId: string): Promise<TechnicianMatchResult[]> {
  const offer = await offerRepository.getWithRequirements(offerId);
  if (!offer) return [];

  const profiles = await technicianRepositoryV2.getAll();
  const results: TechnicianMatchResult[] = [];

  for (const profile of profiles) {
    const full = await technicianRepositoryV2.getWithRelations(profile.id);
    if (!full) continue;
    const safeView = await technicianRepositoryV2.getSafeView(profile.id);
    if (!safeView) continue;
    const score = calculateOfferTechnicianMatch(offer, full);
    results.push({ technician: safeView, score });
  }

  return results.sort((a, b) => b.score.total - a.score.total);
}

// Returns all published offers ranked by match % for a specific technician.
export async function getOfferMatchesForTechnician(technicianId: string): Promise<OfferMatchResult[]> {
  const full = await technicianRepositoryV2.getWithRelations(technicianId);
  if (!full) return [];

  const offers = await offerRepository.getPublishedWithRequirements();
  const results: OfferMatchResult[] = [];

  for (const offer of offers) {
    const score = calculateOfferTechnicianMatch(offer, full);
    results.push({ offer, score });
  }

  return results.sort((a, b) => b.score.total - a.score.total);
}
