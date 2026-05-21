import { useState, useEffect, useCallback } from 'react';
import { Technician, MatchRequest, TechnicianDocument, Company } from '../types';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { companyRepositoryV2 } from '../repositories/v2/companyRepositoryV2';
import {
  v2TechnicianToV1,
  v2OfferRequestToMatchRequest,
  v2DocumentToV1,
  v2CompanyToV1,
  applyV1PatchToV2Profile,
} from '../utils/v2CompatAdapters';

export const DEMO_TECHNICIAN_ID = 'tech-001';

export function computeProfileCompleteness(t: Technician): number {
  let score = 0;
  if (t.fullName?.trim()) score += 10;
  if (t.email?.trim()) score += 10;
  if (t.phone?.trim()) score += 5;
  if (t.city?.trim()) score += 5;
  if (t.country?.trim()) score += 5;
  if (t.baseAirport?.trim()) score += 5;
  if (t.licenseCategories.length > 0) score += 20;
  if (t.aircraftTypes.length > 0) score += 15;
  if (t.specialties.length > 0) score += 10;
  if (t.availability.status !== 'unavailable') score += 5;
  if (t.yearsExperience > 0) score += 10;
  return Math.min(score, 100);
}

interface TechnicianDashboardState {
  technician: Technician | null;
  requests: MatchRequest[];
  documents: TechnicianDocument[];
  companyMap: Record<string, Company>;
  loading: boolean;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  updateProfile: (patch: Partial<Technician>) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTechnicianDashboard(): TechnicianDashboardState {
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [documents, setDocuments] = useState<TechnicianDocument[]>([]);
  const [companyMap, setCompanyMap] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [withRelations, v2Requests, v2Docs, companies] = await Promise.all([
      technicianRepositoryV2.getWithRelations(DEMO_TECHNICIAN_ID),
      offerRequestRepository.getForTechnician(DEMO_TECHNICIAN_ID),
      documentRepositoryV2.getForTechnician(DEMO_TECHNICIAN_ID),
      companyRepositoryV2.getAll(),
    ]);

    if (withRelations) setTechnician(v2TechnicianToV1(withRelations));

    // Technician sees their direct offer requests as MatchRequest[] (V1 compat)
    // Maps V2 'pending' → V1 'sent'; 'expired'/'withdrawn' → 'rejected'
    // TODO: remove mapping once technician screens are migrated to V2 OfferRequest type
    const compatRequests = [...v2Requests]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(v2OfferRequestToMatchRequest);
    setRequests(compatRequests);

    setDocuments(v2Docs.map(v2DocumentToV1));

    const map: Record<string, Company> = {};
    companies.forEach((c) => {
      map[c.id] = v2CompanyToV1(c);
    });
    setCompanyMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await offerRequestRepository.updateStatus(requestId, 'accepted');
      await loadData();
    },
    [loadData],
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      await offerRequestRepository.updateStatus(requestId, 'rejected');
      await loadData();
    },
    [loadData],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Technician>) => {
      if (!technician) return;

      // Apply patch to V1 compat object to compute profileCompleteness
      const updatedV1: Technician = { ...technician, ...patch };
      updatedV1.profileCompleteness = computeProfileCompleteness(updatedV1);

      // Load the V2 profile to get reference fields (needed for firstName/lastName split)
      const existingProfile = await technicianRepositoryV2.getById(DEMO_TECHNICIAN_ID);
      if (!existingProfile) return;

      const v2Patch = applyV1PatchToV2Profile(
        { ...patch, profileCompleteness: updatedV1.profileCompleteness },
        existingProfile,
      );
      await technicianRepositoryV2.update(DEMO_TECHNICIAN_ID, v2Patch);
      await loadData();
    },
    [technician, loadData],
  );

  return {
    technician,
    requests,
    documents,
    companyMap,
    loading,
    acceptRequest,
    rejectRequest,
    updateProfile,
    refresh: loadData,
  };
}
