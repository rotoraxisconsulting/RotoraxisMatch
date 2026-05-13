import { Technician, SafeTechnicianView, MatchRequest } from '../types';

export interface MatchCriteria {
  licenseCategory?: string;
  aircraftType?: string;
  specialty?: string;
  availableDate?: string;
  minYearsExperience?: number;
  baseAirport?: string;
}

export function computeMatchScore(technician: Technician, criteria: MatchCriteria): number {
  let score = 0;

  if (criteria.licenseCategory && technician.licenseCategories.includes(criteria.licenseCategory)) {
    score += 30;
  }
  if (criteria.aircraftType && technician.aircraftTypes.includes(criteria.aircraftType)) {
    score += 30;
  }
  if (criteria.specialty && technician.specialties.includes(criteria.specialty)) {
    score += 15;
  }
  if (criteria.availableDate && technician.availability.status !== 'unavailable') {
    const availableFrom = technician.availability.availableFrom;
    if (!availableFrom || availableFrom <= criteria.availableDate) {
      score += 15;
    }
  }
  if (technician.verificationStatus === 'verified') {
    score += 10;
  }
  if (criteria.minYearsExperience !== undefined && technician.yearsExperience >= criteria.minYearsExperience) {
    score += 10;
  }
  if (criteria.baseAirport && technician.baseAirport === criteria.baseAirport) {
    score += 5;
  }

  return score;
}

export function getMatchLabel(score: number): string {
  if (score >= 80) return 'Excellent match';
  if (score >= 60) return 'Strong match';
  if (score >= 40) return 'Partial match';
  return 'Low match';
}

export function canCompanyViewTechnicianIdentity(
  companyId: string,
  technicianId: string,
  matchRequests: MatchRequest[],
): boolean {
  return matchRequests.some(
    (r) =>
      r.companyId === companyId &&
      r.technicianId === technicianId &&
      r.status === 'accepted' &&
      r.identityRevealed,
  );
}

export function getSafeTechnicianView(
  technician: Technician,
  canRevealIdentity: boolean,
  matchingScore?: number,
): SafeTechnicianView {
  const { fullName, email, phone, ...safeFields } = technician;
  const view: SafeTechnicianView = { ...safeFields, matchingScore };
  if (canRevealIdentity) {
    return { ...view, fullName, email, phone };
  }
  return view;
}
