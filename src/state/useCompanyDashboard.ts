/**
 * useCompanyDashboard — dashboard metrics and direct-offer (match-request) state.
 *
 * Privacy contract:
 *   technicianMap values are SafeTechnicianView — anonymous before acceptance, identity
 *   revealed after. buildTechnicianMapV2() applies canRevealIdentity() per technician.
 *   Private fields are never present in the map for locked technicians.
 *
 * Future Supabase: technicianMap will be built from technician_public_view rows returned
 *   by the offer_requests query (joined or separately fetched). The same DTO shape applies.
 */
import { useState, useEffect, useCallback } from 'react';
import { Company, MatchRequest, SafeTechnicianView } from '../types';
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
import { useCompanySession } from './SessionContext';

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
  companyId: string,
  offerRequests: OfferRequest[],
  allOfferRequests: OfferRequest[],
): Promise<Record<string, SafeTechnicianView>> {
  const map: Record<string, SafeTechnicianView> = {};
  const allApplications = await offerApplicationRepository.getForCompany(companyId);

  await Promise.all(
    offerRequests.map(async (req) => {
      const techId = req.technicianId;

      const accepted = canRevealIdentity({
        companyId,
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
  const { companyId } = useCompanySession();
  const [company, setCompany] = useState<Company | null>(null);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [technicianMap, setTechnicianMap] = useState<Record<string, SafeTechnicianView>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    setLoading(true);
    const [companyProfile, v2Requests] = await Promise.all([
      companyRepositoryV2.getById(companyId),
      offerRequestRepository.getForCompany(companyId),
    ]);

    setCompany(companyProfile ? v2CompanyToV1(companyProfile) : null);

    // Build V1 compat MatchRequest[] — maps V2 'pending' → V1 'sent'
    // TODO: remove status mapping once screens are migrated to V2 OfferRequest type
    const compatRequests = v2Requests.map(v2OfferRequestToMatchRequest);
    setRequests(compatRequests);

    setTechnicianMap(await buildTechnicianMapV2(companyId, v2Requests, v2Requests));
    setLoading(false);
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sendRequest = useCallback(
    async (technicianId: string, message: string): Promise<MatchRequest[]> => {
      await offerRequestRepository.create({
        companyId,
        technicianId,
        message,
      });
      const v2Requests = await offerRequestRepository.getForCompany(companyId);
      const compatRequests = v2Requests.map(v2OfferRequestToMatchRequest);
      setRequests(compatRequests);
      setTechnicianMap(await buildTechnicianMapV2(companyId, v2Requests, v2Requests));
      return compatRequests;
    },
    [companyId],
  );

  // Only active (sent=pending, accepted) requests block sending a new direct offer.
  // Rejected, expired, and withdrawn are historical records and must not block new sends.
  const hasSentRequest = useCallback(
    (technicianId: string) => requests.some(
      (r) => r.technicianId === technicianId && (r.status === 'sent' || r.status === 'accepted'),
    ),
    [requests],
  );

  // Return the active request if one exists, otherwise the most recent historical one.
  const getRequestForTechnician = useCallback(
    (technicianId: string) => {
      const active = requests.find(
        (r) => r.technicianId === technicianId && (r.status === 'sent' || r.status === 'accepted'),
      );
      return active ?? requests.find((r) => r.technicianId === technicianId);
    },
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
