import { offerRepository } from '../repositories/v2/offerRepository';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { catalogRepository } from '../repositories/v2/catalogRepository';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import { OfferWithRequirements } from '../types/offer';
import { MatchScore } from '../types/matching';
import { SafeTechnicianPreview } from '../types/privacy';

// The actual scoring/explanation logic is a pure function with no
// Supabase/repository imports so it can be unit-tested directly — see
// src/utils/offerMatchExplain.ts and scripts/testMatching.ts. These two
// functions are the I/O boundary: load the offer/technician data AND the
// aircraft ratings catalog, then hand everything to the pure function.
export { calculateOfferTechnicianMatch, getMatchLabel, getMatchScoreWeights, getMatchDisplayLabel } from './offerMatchExplain';
export type { MatchScoreWeights } from './offerMatchExplain';
import { calculateOfferTechnicianMatch } from './offerMatchExplain';

export interface TechnicianMatchResult {
  technician: SafeTechnicianPreview;
  score: MatchScore;
}

export interface OfferMatchResult {
  offer: OfferWithRequirements;
  score: MatchScore;
}

// Returns all public technicians (active account + verified profile) ranked by match % for a specific offer.
export async function getTechnicianMatchesForOffer(offerId: string): Promise<TechnicianMatchResult[]> {
  const offer = await offerRepository.getWithRequirements(offerId);
  if (!offer) return [];

  // Filtro duro por experiencia: se aplica EN LA CONSULTA, no despues. Un
  // tecnico con años declarados por debajo del minimo de la oferta no llega
  // siquiera al scorer; el que no ha declarado nada si llega y no se le
  // penaliza (ver applyMinYearsFilter en technicianRepositoryV2).
  const [profiles, ratings] = await Promise.all([
    technicianRepositoryV2.getPublicProfiles(offer.minYearsExperience),
    catalogRepository.getAircraftTypeRatings(),
  ]);
  const ratingIndex = buildAircraftRatingIndex(ratings);
  const results: TechnicianMatchResult[] = [];

  for (const profile of profiles) {
    const full = await technicianRepositoryV2.getPublicWithRelations(profile.id);
    if (!full) continue;
    const safeView = await technicianRepositoryV2.getSafeView(profile.id);
    if (!safeView) continue;
    const score = calculateOfferTechnicianMatch(offer, full, ratingIndex);
    results.push({ technician: safeView, score });
  }

  return results.sort((a, b) => b.score.total - a.score.total);
}

// Returns all published offers ranked by match % for a specific technician.
export async function getOfferMatchesForTechnician(technicianId: string): Promise<OfferMatchResult[]> {
  const [full, offers, ratings] = await Promise.all([
    technicianRepositoryV2.getWithRelations(technicianId),
    offerRepository.getPublishedWithRequirements(),
    catalogRepository.getAircraftTypeRatings(),
  ]);
  if (!full) return [];
  const ratingIndex = buildAircraftRatingIndex(ratings);
  const results: OfferMatchResult[] = [];

  for (const offer of offers) {
    const score = calculateOfferTechnicianMatch(offer, full, ratingIndex);
    results.push({ offer, score });
  }

  return results.sort((a, b) => b.score.total - a.score.total);
}
