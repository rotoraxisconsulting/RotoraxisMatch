import { useState, useEffect, useCallback } from 'react';
import {
  Technician,
  Company,
  TechnicianDocument,
  MatchRequest,
  VerificationStatus,
  DocumentStatus,
} from '../types';
import { Offer } from '../types/offer';
import { OfferRequest, OfferApplication } from '../types/offerRequest';
import { OfferStatus } from '../types/enums';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { companyRepositoryV2 } from '../repositories/v2/companyRepositoryV2';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../repositories/v2/offerApplicationRepository';
import { offerRepository } from '../repositories/v2/offerRepository';
import {
  v2TechnicianToV1,
  v2CompanyToV1,
  v2DocumentToV1,
  v2OfferRequestToMatchRequest,
} from '../utils/v2CompatAdapters';

export interface AdminMetrics {
  totalTechnicians: number;
  verifiedTechnicians: number;
  pendingTechnicians: number;
  totalCompanies: number;
  verifiedCompanies: number;
  pendingCompanies: number;
  totalDocuments: number;
  pendingDocuments: number;
  totalRequests: number;
  acceptedRequests: number;
  // V2-specific metrics
  pendingOfferRequests: number;
  pendingApplications: number;
  activeOffers: number;
  totalOffers: number;
  totalDirectOffers: number;
  totalApplicationsV2: number;
}

interface UseAdminDashboardReturn {
  technicians: Technician[];
  companies: Company[];
  documents: TechnicianDocument[];
  requests: MatchRequest[];
  offers: Offer[];
  offerRequestsV2: OfferRequest[];
  offerApplicationsV2: OfferApplication[];
  metrics: AdminMetrics;
  loading: boolean;
  refresh: () => Promise<void>;
  updateTechnicianVerification: (id: string, status: VerificationStatus) => Promise<void>;
  updateCompanyVerification: (id: string, status: VerificationStatus) => Promise<void>;
  updateDocumentStatus: (id: string, status: DocumentStatus) => Promise<void>;
  updateOfferStatus: (id: string, status: OfferStatus) => Promise<void>;
  technicianMap: Record<string, Technician>;
  companyMap: Record<string, Company>;
  offerTitleMap: Record<string, string>;
}

export function useAdminDashboard(): UseAdminDashboardReturn {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [documents, setDocuments] = useState<TechnicianDocument[]>([]);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [offerRequestsV2, setOfferRequestsV2] = useState<OfferRequest[]>([]);
  const [offerApplicationsV2, setOfferApplicationsV2] = useState<OfferApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [profiles, companyProfiles, v2Docs, v2Requests, v2Offers, v2Applications] =
      await Promise.all([
        technicianRepositoryV2.getAll(),
        companyRepositoryV2.getAll(),
        documentRepositoryV2.getAll(),
        offerRequestRepository.getAll(),
        offerRepository.getAll(),
        offerApplicationRepository.getAll(),
      ]);

    // Load relations for each technician so admin can see licenseCategories, etc.
    const withRelationsAll = await Promise.all(
      profiles.map((p) => technicianRepositoryV2.getWithRelations(p.id)),
    );
    setTechnicians(
      withRelationsAll
        .filter((t): t is NonNullable<typeof t> => t !== null)
        .map(v2TechnicianToV1),
    );

    setCompanies(companyProfiles.map(v2CompanyToV1));
    setDocuments(v2Docs.map(v2DocumentToV1));
    setRequests(v2Requests.map(v2OfferRequestToMatchRequest));
    setOffers(v2Offers);
    setOfferRequestsV2(v2Requests);
    setOfferApplicationsV2(v2Applications);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateTechnicianVerification = useCallback(
    async (id: string, status: VerificationStatus) => {
      await technicianRepositoryV2.update(id, { verificationStatus: status });
      setTechnicians((prev) =>
        prev.map((t) => (t.id === id ? { ...t, verificationStatus: status } : t)),
      );
    },
    [],
  );

  const updateCompanyVerification = useCallback(
    async (id: string, status: VerificationStatus) => {
      await companyRepositoryV2.update(id, { verificationStatus: status });
      setCompanies((prev) =>
        prev.map((c) => (c.id === id ? { ...c, verificationStatus: status } : c)),
      );
    },
    [],
  );

  const updateDocumentStatus = useCallback(async (id: string, status: DocumentStatus) => {
    await documentRepositoryV2.updateStatus(id, status);
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
  }, []);

  const updateOfferStatus = useCallback(async (id: string, status: OfferStatus) => {
    await offerRepository.updateStatus(id, status);
    setOffers((prev) => prev.map((o) => (o.id === id ? { ...o, status } : o)));
  }, []);

  const metrics: AdminMetrics = {
    totalTechnicians: technicians.length,
    verifiedTechnicians: technicians.filter((t) => t.verificationStatus === 'verified').length,
    pendingTechnicians: technicians.filter((t) => t.verificationStatus === 'pending').length,
    totalCompanies: companies.length,
    verifiedCompanies: companies.filter((c) => c.verificationStatus === 'verified').length,
    pendingCompanies: companies.filter((c) => c.verificationStatus === 'pending').length,
    totalDocuments: documents.length,
    pendingDocuments: documents.filter((d) => d.status === 'pending').length,
    totalRequests: requests.length,
    acceptedRequests: requests.filter((r) => r.status === 'accepted').length,
    pendingOfferRequests: offerRequestsV2.filter((r) => r.status === 'pending').length,
    pendingApplications: offerApplicationsV2.filter((a) => a.status === 'pending').length,
    activeOffers: offers.filter((o) => o.status === 'published').length,
    totalOffers: offers.length,
    totalDirectOffers: offerRequestsV2.length,
    totalApplicationsV2: offerApplicationsV2.length,
  };

  const technicianMap: Record<string, Technician> = {};
  for (const t of technicians) technicianMap[t.id] = t;

  const companyMap: Record<string, Company> = {};
  for (const c of companies) companyMap[c.id] = c;

  const offerTitleMap: Record<string, string> = {};
  for (const o of offers) offerTitleMap[o.id] = o.title;

  return {
    technicians,
    companies,
    documents,
    requests,
    offers,
    offerRequestsV2,
    offerApplicationsV2,
    metrics,
    loading,
    refresh: load,
    updateTechnicianVerification,
    updateCompanyVerification,
    updateDocumentStatus,
    updateOfferStatus,
    technicianMap,
    companyMap,
    offerTitleMap,
  };
}
