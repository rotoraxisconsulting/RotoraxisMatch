/**
 * useTechnicianSearch — company search hook.
 *
 * Privacy contract:
 *   Results are SafeTechnicianView[] (V1 compat). The `fullName` field is set ONLY
 *   when canRevealIdentity() returns true (i.e. an accepted offer record exists for
 *   the companyId + technicianId pair). Before acceptance, fullName is undefined and
 *   the card shows anonymousCode + "Identity locked" badge.
 *
 * Future Supabase: the internal search + privacy gate will be replaced by a single
 *   call to search_technicians_public(filters) RPC. The RPC returns rows from
 *   technician_public_view — private columns are NULL until offer_accepted_between().
 *   This hook's return type stays SafeTechnicianView[] (mapped from the RPC response).
 */
import { useState, useCallback } from 'react';
import { SafeTechnicianView } from '../types';
import type { AvailabilityStatus } from '../types/technician';
import { TechnicianFilters } from '../types/filters';
import { MatchRequest } from '../types/matchRequest';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../repositories/v2/offerApplicationRepository';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { canRevealIdentity } from '../utils/privacyV2';
import { getUnlockedTechnicianView } from '../utils/privacyV2';
import {
  v2SafePreviewToSafeView,
  v2UnlockedViewToSafeView,
} from '../utils/v2CompatAdapters';
import { useCompanySession } from './SessionContext';

interface UseTechnicianSearchReturn {
  results: SafeTechnicianView[];
  filters: TechnicianFilters;
  loading: boolean;
  hasSearched: boolean;
  updateFilter: <K extends keyof TechnicianFilters>(key: K, value: TechnicianFilters[K]) => void;
  clearFilters: () => void;
  // matchRequests param kept for signature compat — no longer used internally
  search: (matchRequests?: MatchRequest[]) => Promise<void>;
}

const EMPTY_FILTERS: TechnicianFilters = {};

export function useTechnicianSearch(): UseTechnicianSearchReturn {
  const { companyId } = useCompanySession();
  const [results, setResults] = useState<SafeTechnicianView[]>([]);
  const [filters, setFilters] = useState<TechnicianFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const updateFilter = useCallback(
    <K extends keyof TechnicianFilters>(key: K, value: TechnicianFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setHasSearched(false);
  }, []);

  const search = useCallback(
    // _matchRequests is kept for call-site compat but ignored — privacy gate
    // uses V2 offerRequests + offerApplications loaded fresh each search.
    async (_matchRequests: MatchRequest[] = []) => {
      setLoading(true);
      setHasSearched(true);

      // Map V1 TechnicianFilters → V2 search params
      const v2Filters = {
        licenseCode: filters.licenseCategory ?? undefined,
        aircraftTypeCode: filters.aircraftType ?? undefined,
        country: filters.country ?? undefined,
        city: filters.city ?? undefined,
        verificationStatus: filters.verificationStatus ?? undefined,
        availabilityStatus: filters.availabilityStatus as AvailabilityStatus | undefined,
      };

      // Load previews and the acceptance records in parallel
      const [previews, offerRequests, offerApplications] = await Promise.all([
        technicianRepositoryV2.search(v2Filters),
        offerRequestRepository.getForCompany(companyId),
        offerApplicationRepository.getForCompany(companyId),
      ]);

      // Apply privacy gate per technician result
      const views: SafeTechnicianView[] = await Promise.all(
        previews.map(async (preview) => {
          const accepted = canRevealIdentity({
            companyId,
            technicianId: preview.id,
            offerRequests,
            offerApplications,
          });

          if (!accepted) return v2SafePreviewToSafeView(preview);

          // Identity unlocked — load full profile + verified documents
          const [withRelations, documents] = await Promise.all([
            technicianRepositoryV2.getWithRelations(preview.id),
            documentRepositoryV2.getVerifiedForTechnician(preview.id),
          ]);
          if (!withRelations) return v2SafePreviewToSafeView(preview);

          return v2UnlockedViewToSafeView(getUnlockedTechnicianView(withRelations, documents));
        }),
      );

      setResults(views);
      setLoading(false);
    },
    [companyId, filters],
  );

  return { results, filters, loading, hasSearched, updateFilter, clearFilters, search };
}
