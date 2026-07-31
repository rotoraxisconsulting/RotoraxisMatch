import { useState, useEffect, useCallback } from 'react';
import { SafeTechnicianView } from '../types';
import { MapFilters } from '../types/filters';
import { AvailabilityStatus, TechnicianHabilitation } from '../types/technician';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../repositories/v2/offerApplicationRepository';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { catalogRepository } from '../repositories/v2/catalogRepository';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import { canRevealIdentity, getUnlockedTechnicianView } from '../utils/privacyV2';
import {
  v2SafePreviewToSafeView,
  v2UnlockedViewToSafeView,
} from '../utils/v2CompatAdapters';
import { useCompanySession } from './SessionContext';

interface UseMapTechniciansReturn {
  technicians: SafeTechnicianView[];
  loading: boolean;
  // Raw habilitations per technician (from the same server-filtered
  // preview fetch, before the V1-compat flattening) — the map component
  // resolves these to catalog displayName ("Type ratings") itself, same
  // as search.tsx's TechnicianResultCard, instead of the flattened
  // technician.aircraftTypes family/legacy-code strings.
  habilitationsById: Record<string, TechnicianHabilitation[]>;
}

function selectedValues(values?: string[], legacyValue?: string): string[] {
  if (values && values.length > 0) return values;
  return legacyValue ? [legacyValue] : [];
}

// Internal filter-relevance score used for result ordering only. Never
// displayed in the UI — not an offer match score. Every technician
// reaching this point already satisfies every ACTIVE filter dimension
// (filtering now happens server-side, technicianRepositoryV2.search() —
// see the Fase 3b screen 4 fix, 2026-07-22), so "does it match" is no
// longer the question for an active dimension, it's guaranteed; this only
// weights how many dimensions were actively narrowed plus a flat verified
// bonus, same ordering intent the old client-side-matchesAny version had.
function scoreMapMatch(technician: SafeTechnicianView, filters: {
  licenses: string[];
  aircraft: string[];
  verification: string[];
  availability: string[];
}): number {
  let score = 0;
  if (filters.licenses.length > 0) score += 30;
  if (filters.aircraft.length > 0) score += 30;
  if (filters.availability.length > 0) score += 15;
  if (filters.verification.length > 0) score += 15;
  if (technician.verificationStatus === 'verified') score += 10;
  return score;
}

export function useMapTechnicians(filters: MapFilters): UseMapTechniciansReturn {
  const companySession = useCompanySession();
  const companyId = companySession?.companyId;
  const [technicians, setTechnicians] = useState<SafeTechnicianView[]>([]);
  const [habilitationsById, setHabilitationsById] = useState<Record<string, TechnicianHabilitation[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    // companyId hydrates asynchronously in SessionContext (a separate
    // company_members fetch, independent of the auth guard the layout
    // waits for) — reading it before that resolves calls getForCompany('')
    // and crashes on the Postgres UUID cast. Same guard as
    // app/company/offers/index.tsx and [id].tsx; loading stays true until
    // companyId arrives and this callback (recreated via the companyId
    // dependency below) reruns automatically.
    if (!companyId) return;
    setLoading(true);
    const selected = {
      licenses: selectedValues(filters.licenseCategories, filters.licenseCategory),
      aircraft: selectedValues(filters.aircraftFamilyKeys, undefined),
      verification: selectedValues(filters.verificationStatuses, filters.verificationStatus),
      availability: selectedValues(filters.availabilityStatuses, filters.availabilityStatus),
    };

    // Real server-side filtering (technicianRepositoryV2.search()) — this
    // used to call search({}) (everything, unfiltered) and post-filter
    // client-side, the same decorative-filter bug the search screen had
    // (Fase 3b screen 3 fix, 2026-07-22). Also benefits from migration 024
    // for free: deleted/blocked/suspended technicians are excluded by
    // technician_public_view itself, before this hook ever sees them.
    const [previews, offerRequests, offerApplications, ratings] = await Promise.all([
      technicianRepositoryV2.search({
        licenseCodes: selected.licenses.length ? selected.licenses : undefined,
        aircraftFamilyKeys: selected.aircraft.length ? selected.aircraft : undefined,
        verificationStatuses: selected.verification.length ? selected.verification : undefined,
        availabilityStatuses: selected.availability.length ? (selected.availability as AvailabilityStatus[]) : undefined,
      }),
      offerRequestRepository.getForCompany(companyId),
      offerApplicationRepository.getForCompany(companyId),
      catalogRepository.getAircraftTypeRatings(),
    ]);
    const ratingIndex = buildAircraftRatingIndex(ratings);

    const nextHabilitationsById: Record<string, TechnicianHabilitation[]> = {};
    previews.forEach((preview) => {
      nextHabilitationsById[preview.id] = preview.habilitations;
    });

    const views = await Promise.all(
      previews.map(async (preview) => {
        const accepted = canRevealIdentity({
          companyId,
          technicianId: preview.id,
          offerRequests,
          offerApplications,
        });

        if (!accepted) return v2SafePreviewToSafeView(preview, ratingIndex);

        const [withRelations, documents] = await Promise.all([
          technicianRepositoryV2.getWithRelations(preview.id),
          documentRepositoryV2.getVerifiedForTechnician(preview.id),
        ]);

        if (!withRelations) return v2SafePreviewToSafeView(preview, ratingIndex);
        return v2UnlockedViewToSafeView(getUnlockedTechnicianView(withRelations, documents), ratingIndex);
      }),
    );

    const scored = views
      .map((technician) => ({
        ...technician,
        matchingScore: scoreMapMatch(technician, selected),
      }))
      .sort((a, b) => (b.matchingScore ?? 0) - (a.matchingScore ?? 0));
    setTechnicians(scored);
    setHabilitationsById(nextHabilitationsById);
    setLoading(false);
  }, [
    filters.licenseCategory,
    filters.verificationStatus,
    filters.availabilityStatus,
    filters.licenseCategories,
    filters.aircraftFamilyKeys,
    filters.verificationStatuses,
    filters.availabilityStatuses,
    companyId,
  ]);

  useEffect(() => {
    load();
  }, [load]);

  return { technicians, loading, habilitationsById };
}
