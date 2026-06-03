import { useState, useEffect, useCallback } from 'react';
import { SafeTechnicianView } from '../types';
import { MapFilters } from '../types/filters';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../repositories/v2/offerApplicationRepository';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { canRevealIdentity, getUnlockedTechnicianView } from '../utils/privacyV2';
import {
  v2SafePreviewToSafeView,
  v2UnlockedViewToSafeView,
} from '../utils/v2CompatAdapters';
import { useCompanySession } from './SessionContext';

interface UseMapTechniciansReturn {
  technicians: SafeTechnicianView[];
  loading: boolean;
}

function selectedValues(values?: string[], legacyValue?: string): string[] {
  if (values && values.length > 0) return values;
  return legacyValue ? [legacyValue] : [];
}

function matchesAny(selected: string[], values: string[]): boolean {
  return selected.length === 0 || selected.some((value) => values.includes(value));
}

// Internal filter-relevance score used for result ordering only.
// Never displayed in the UI — not an offer match score.
function scoreMapMatch(technician: SafeTechnicianView, filters: {
  licenses: string[];
  aircraft: string[];
  verification: string[];
  availability: string[];
}): number {
  let score = 0;
  if (filters.licenses.length > 0 && matchesAny(filters.licenses, technician.licenseCategories)) score += 30;
  if (filters.aircraft.length > 0 && matchesAny(filters.aircraft, technician.aircraftTypes)) score += 30;
  if (filters.availability.length > 0 && filters.availability.includes(technician.availability.status ?? 'unavailable')) score += 15;
  if (filters.verification.length > 0 && filters.verification.includes(technician.verificationStatus)) score += 15;
  if (technician.verificationStatus === 'verified') score += 10;
  return score;
}

export function useMapTechnicians(filters: MapFilters): UseMapTechniciansReturn {
  const { companyId } = useCompanySession();
  const [technicians, setTechnicians] = useState<SafeTechnicianView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const selected = {
      licenses: selectedValues(filters.licenseCategories, filters.licenseCategory),
      aircraft: selectedValues(filters.aircraftTypes, filters.aircraftType),
      verification: selectedValues(filters.verificationStatuses, filters.verificationStatus),
      availability: selectedValues(filters.availabilityStatuses, filters.availabilityStatus),
    };
    const [previews, offerRequests, offerApplications] = await Promise.all([
      technicianRepositoryV2.search({}),
      offerRequestRepository.getForCompany(companyId),
      offerApplicationRepository.getForCompany(companyId),
    ]);

    const views = await Promise.all(
      previews.map(async (preview) => {
        const accepted = canRevealIdentity({
          companyId,
          technicianId: preview.id,
          offerRequests,
          offerApplications,
        });

        if (!accepted) return v2SafePreviewToSafeView(preview);

        const [withRelations, documents] = await Promise.all([
          technicianRepositoryV2.getWithRelations(preview.id),
          documentRepositoryV2.getVerifiedForTechnician(preview.id),
        ]);

        if (!withRelations) return v2SafePreviewToSafeView(preview);
        return v2UnlockedViewToSafeView(getUnlockedTechnicianView(withRelations, documents));
      }),
    );

    const filtered = views
      .filter((technician) => {
        if (!matchesAny(selected.licenses, technician.licenseCategories)) return false;
        if (!matchesAny(selected.aircraft, technician.aircraftTypes)) return false;
        if (selected.verification.length > 0 && !selected.verification.includes(technician.verificationStatus)) return false;
        if (selected.availability.length > 0 && !selected.availability.includes(technician.availability.status ?? 'unavailable')) return false;
        return true;
      })
      .map((technician) => ({
        ...technician,
        matchingScore: scoreMapMatch(technician, selected),
      }))
      .sort((a, b) => (b.matchingScore ?? 0) - (a.matchingScore ?? 0));
    setTechnicians(filtered);
    setLoading(false);
  }, [
    filters.licenseCategory,
    filters.aircraftType,
    filters.verificationStatus,
    filters.availabilityStatus,
    filters.licenseCategories,
    filters.aircraftTypes,
    filters.verificationStatuses,
    filters.availabilityStatuses,
    companyId,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return { technicians, loading };
}
