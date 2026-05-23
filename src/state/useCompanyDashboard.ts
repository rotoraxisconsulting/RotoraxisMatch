import { useState, useEffect, useCallback } from 'react';
import { Company, MatchRequest, SafeTechnicianView } from '../types';
import { CompanyMemberRole } from '../types/enums';
import { companyRepositoryV2 } from '../repositories/v2/companyRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../repositories/v2/offerApplicationRepository';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { OfferRequest } from '../types/offerRequest';
import { canRevealIdentity } from '../utils/privacyV2';
import { getUnlockedTechnicianView } from '../utils/privacyV2';
import {
  v2CompanyToV1,
  v2OfferRequestToMatchRequest,
  v2SafePreviewToSafeView,
  v2UnlockedViewToSafeView,
} from '../utils/v2CompatAdapters';

// Demo: Delta Air Lines is the active company for the company role
export const DEMO_COMPANY_ID = 'comp-001';
// Demo: first admin member of comp-001 (userId=prof-c001a, role=admin, memberId=cm-001)
// TODO: replace with real auth context in V2-9 Supabase phase
export const DEMO_COMPANY_USER_ID = 'prof-c001a';
export const DEMO_COMPANY_MEMBER_ID = 'cm-001';
// Static role constant for demo-mode permission checks in company screens.
// TODO: replace with dynamic role loaded from auth context in V2-9 Supabase phase.
export const DEMO_COMPANY_MEMBER_ROLE: CompanyMemberRole = 'admin';

interface CompanyDashboardState {
  company: Company | null;
  requests: MatchRequest[];
  technicianMap: Record<string, SafeTechnicianView>;
  loading: boolean;
  sendRequest: (technicianId: string, message: string) => Promise<MatchRequest[]>;
  hasSentRequest: (technicianId: string) => boolean;
  getRequestForTechnician: (technicianId: string) => MatchRequest | undefined;
  refresh: () => Promise<void>;
}

/**
 * Build a technicianId → SafeTechnicianView map for the company's offer requests.
 * Applies the privacy gate: pending → anonymous view, accepted → unlocked view.
 */
async function buildTechnicianMapV2(
  offerRequests: OfferRequest[],
  allOfferRequests: OfferRequest[],
): Promise<Record<string, SafeTechnicianView>> {
  const map: Record<string, SafeTechnicianView> = {};
  const allApplications = await offerApplicationRepository.getForCompany(DEMO_COMPANY_ID);

  await Promise.all(
    offerRequests.map(async (req) => {
      const techId = req.technicianId;

      const accepted = canRevealIdentity({
        companyId: DEMO_COMPANY_ID,
        technicianId: techId,
        offerRequests: allOfferRequests,
        offerApplications: allApplications,
      });

      if (!accepted) {
        const preview = await technicianRepositoryV2.getSafeView(techId);
        if (preview) map[techId] = v2SafePreviewToSafeView(preview);
        return;
      }

      const [withRelations, documents] = await Promise.all([
        technicianRepositoryV2.getWithRelations(techId),
        documentRepositoryV2.getVerifiedForTechnician(techId),
      ]);
      if (withRelations) {
        map[techId] = v2UnlockedViewToSafeView(
          getUnlockedTechnicianView(withRelations, documents),
        );
      }
    }),
  );

  return map;
}

export function useCompanyDashboard(): CompanyDashboardState {
  const [company, setCompany] = useState<Company | null>(null);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [technicianMap, setTechnicianMap] = useState<Record<string, SafeTechnicianView>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [companyProfile, v2Requests] = await Promise.all([
      companyRepositoryV2.getById(DEMO_COMPANY_ID),
      offerRequestRepository.getForCompany(DEMO_COMPANY_ID),
    ]);

    setCompany(companyProfile ? v2CompanyToV1(companyProfile) : null);

    // Build V1 compat MatchRequest[] — maps V2 'pending' → V1 'sent'
    // TODO: remove status mapping once screens are migrated to V2 OfferRequest type
    const compatRequests = v2Requests.map(v2OfferRequestToMatchRequest);
    setRequests(compatRequests);

    setTechnicianMap(await buildTechnicianMapV2(v2Requests, v2Requests));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sendRequest = useCallback(
    async (technicianId: string, message: string): Promise<MatchRequest[]> => {
      await offerRequestRepository.create({
        companyId: DEMO_COMPANY_ID,
        technicianId,
        message,
      });
      const v2Requests = await offerRequestRepository.getForCompany(DEMO_COMPANY_ID);
      const compatRequests = v2Requests.map(v2OfferRequestToMatchRequest);
      setRequests(compatRequests);
      setTechnicianMap(await buildTechnicianMapV2(v2Requests, v2Requests));
      return compatRequests;
    },
    [],
  );

  const hasSentRequest = useCallback(
    (technicianId: string) => requests.some((r) => r.technicianId === technicianId),
    [requests],
  );

  const getRequestForTechnician = useCallback(
    (technicianId: string) => requests.find((r) => r.technicianId === technicianId),
    [requests],
  );

  return {
    company,
    requests,
    technicianMap,
    loading,
    sendRequest,
    hasSentRequest,
    getRequestForTechnician,
    refresh: loadData,
  };
}
