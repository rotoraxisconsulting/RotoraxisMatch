import { useState, useEffect, useCallback } from 'react';
import { Technician, MatchRequest, TechnicianDocument, Company } from '../types';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { companyRepositoryV2 } from '../repositories/v2/companyRepositoryV2';
import { catalogRepository } from '../repositories/v2/catalogRepository';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import {
  v2TechnicianToV1,
  v2OfferRequestToMatchRequest,
  v2DocumentToV1,
  v2CompanyToV1,
} from '../utils/v2CompatAdapters';
import { useTechnicianSession } from './SessionContext';

interface TechnicianDashboardState {
  technician: Technician | null;
  requests: MatchRequest[];
  documents: TechnicianDocument[];
  companyMap: Record<string, Company>;
  loading: boolean;
  acceptRequest: (requestId: string) => Promise<void>;
  rejectRequest: (requestId: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useTechnicianDashboard(): TechnicianDashboardState {
  const technicianSession = useTechnicianSession();
  const technicianId = technicianSession?.technicianId;
  const [technician, setTechnician] = useState<Technician | null>(null);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [documents, setDocuments] = useState<TechnicianDocument[]>([]);
  const [companyMap, setCompanyMap] = useState<Record<string, Company>>({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    // Fase 5.4 — sesión de técnico sin resolver: nada que cargar, y ninguna
    // query con un id vacío.
    if (!technicianId) {
      setTechnician(null);
      setRequests([]);
      setDocuments([]);
      setCompanyMap({});
      setLoading(false);
      return;
    }

    setLoading(true);
    const [withRelations, v2Requests, v2Docs, companies, ratings] = await Promise.all([
      technicianRepositoryV2.getWithRelations(technicianId),
      offerRequestRepository.getForTechnician(technicianId),
      documentRepositoryV2.getForTechnician(technicianId),
      companyRepositoryV2.getAll(),
      catalogRepository.getAircraftTypeRatings(),
    ]);

    if (withRelations) setTechnician(v2TechnicianToV1(withRelations, buildAircraftRatingIndex(ratings)));

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
  }, [technicianId]);

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

  return {
    technician,
    requests,
    documents,
    companyMap,
    loading,
    acceptRequest,
    rejectRequest,
    refresh: loadData,
  };
}
