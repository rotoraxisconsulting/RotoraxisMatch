import { storageAdapter } from '../storage/asyncStorageAdapter';
import { DB_KEYS } from '../storage/localDatabase';
import { Technician, SafeTechnicianView, MatchRequest } from '../types';
import { TechnicianFilters } from '../types/filters';
import {
  canCompanyViewTechnicianIdentity,
  getSafeTechnicianView,
  computeMatchScore,
  MatchCriteria,
} from '../utils/matching';

export const technicianRepository = {
  async getAll(): Promise<Technician[]> {
    const data = await storageAdapter.get<Technician[]>(DB_KEYS.technicians);
    return data ?? [];
  },

  async getById(id: string): Promise<Technician | null> {
    const all = await this.getAll();
    return all.find((t) => t.id === id) ?? null;
  },

  async getSafeViewForCompany(
    technicianId: string,
    companyId: string,
    matchRequests: MatchRequest[],
    criteria?: MatchCriteria,
  ): Promise<SafeTechnicianView | null> {
    const tech = await this.getById(technicianId);
    if (!tech) return null;
    const canReveal = canCompanyViewTechnicianIdentity(companyId, technicianId, matchRequests);
    const score = criteria ? computeMatchScore(tech, criteria) : undefined;
    return getSafeTechnicianView(tech, canReveal, score);
  },

  async search(
    filters: TechnicianFilters,
    companyId?: string,
    matchRequests: MatchRequest[] = [],
  ): Promise<SafeTechnicianView[]> {
    const all = await this.getAll();

    const filtered = all.filter((t) => {
      if (filters.licenseCategory && !t.licenseCategories.includes(filters.licenseCategory)) return false;
      if (filters.aircraftType && !t.aircraftTypes.includes(filters.aircraftType)) return false;
      if (filters.specialty && !t.specialties.includes(filters.specialty)) return false;
      if (filters.availabilityStatus && t.availability.status !== filters.availabilityStatus) return false;
      if (filters.verificationStatus && t.verificationStatus !== filters.verificationStatus) return false;
      if (filters.minYearsExperience !== undefined && t.yearsExperience < filters.minYearsExperience) return false;
      if (filters.country && t.country.toLowerCase() !== filters.country.toLowerCase()) return false;
      if (filters.city && t.city.toLowerCase() !== filters.city.toLowerCase()) return false;
      if (filters.baseAirport && t.baseAirport.toUpperCase() !== filters.baseAirport.toUpperCase()) return false;
      if (filters.contractType && !t.availability.contractTypes.includes(filters.contractType as any)) return false;
      if (filters.availableFrom) {
        if (t.availability.status === 'unavailable') return false;
        const techFrom = t.availability.availableFrom;
        if (techFrom && techFrom > filters.availableFrom) return false;
      }
      return true;
    });

    const criteria: MatchCriteria = {
      licenseCategory: filters.licenseCategory,
      aircraftType: filters.aircraftType,
      specialty: filters.specialty,
      minYearsExperience: filters.minYearsExperience,
      baseAirport: filters.baseAirport,
      availableDate: filters.availableFrom,
    };

    return filtered
      .map((t) => {
        const canReveal = companyId
          ? canCompanyViewTechnicianIdentity(companyId, t.id, matchRequests)
          : false;
        const score = computeMatchScore(t, criteria);
        return getSafeTechnicianView(t, canReveal, score);
      })
      .sort((a, b) => (b.matchingScore ?? 0) - (a.matchingScore ?? 0));
  },

  async update(id: string, patch: Partial<Technician>): Promise<Technician | null> {
    const all = await this.getAll();
    const index = all.findIndex((t) => t.id === id);
    if (index === -1) return null;
    const updated = { ...all[index], ...patch };
    all[index] = updated;
    await storageAdapter.set(DB_KEYS.technicians, all);
    return updated;
  },
};
