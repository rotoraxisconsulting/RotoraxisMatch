import { useState, useEffect, useCallback } from 'react';
import {
  Technician,
  Company,
  CompanyProfileView,
  Document,
  TechnicianDocument,
  TechnicianWithRelations,
  MatchRequest,
  VerificationStatus,
  DocumentStatus,
} from '../types';
import { OfferWithRequirements } from '../types/offer';
import { OfferRequest, OfferApplication } from '../types/offerRequest';
import { OfferStatus } from '../types/enums';
import { supabase } from '../lib/supabase';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
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
  technicianDetailsMap: Record<string, TechnicianWithRelations>;
  companies: Company[];
  companyProfileMap: Record<string, CompanyProfileView>;
  companyMemberCounts: Record<string, number>;
  documents: TechnicianDocument[];
  documentDetailsMap: Record<string, Document>;
  requests: MatchRequest[];
  offers: OfferWithRequirements[];
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
  const [technicianDetails, setTechnicianDetails] = useState<TechnicianWithRelations[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyProfiles, setCompanyProfiles] = useState<CompanyProfileView[]>([]);
  const [companyMemberCounts, setCompanyMemberCounts] = useState<Record<string, number>>({});
  const [documents, setDocuments] = useState<TechnicianDocument[]>([]);
  const [documentDetails, setDocumentDetails] = useState<Document[]>([]);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [offers, setOffers] = useState<OfferWithRequirements[]>([]);
  const [offerRequestsV2, setOfferRequestsV2] = useState<OfferRequest[]>([]);
  const [offerApplicationsV2, setOfferApplicationsV2] = useState<OfferApplication[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);

    const [profiles, v2Docs, v2Requests, v2Offers, v2Applications, companiesRes, membersRes] =
      await Promise.all([
        technicianRepositoryV2.getAll(),
        documentRepositoryV2.getAll(),
        offerRequestRepository.getAll(),
        offerRepository.getAllWithRequirements(),
        offerApplicationRepository.getAll(),
        supabase
          .from('companies')
          .select(`
            id, name, location_city_id, phone, email, company_type,
            verification_status, created_at, updated_at,
            location_airports ( country_name, city, iata, icao, latitude, longitude )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('company_members')
          .select('id, company_id, user_id, role, created_at'),
      ]);

    // Load relations for each technician so admin can see licenseCategories, etc.
    const withRelationsAll = await Promise.all(
      profiles.map((p) => technicianRepositoryV2.getWithRelations(p.id)),
    );
    const technicianDetailsResult = withRelationsAll.filter(
      (t): t is NonNullable<typeof t> => t !== null,
    );
    setTechnicianDetails(technicianDetailsResult);
    setTechnicians(technicianDetailsResult.map(v2TechnicianToV1));

    // Map Supabase companies rows → CompanyProfileView (camelCase + resolved location)
    const companyProfilesResult: CompanyProfileView[] = (companiesRes.data ?? []).map((row) => {
      // PostgREST returns the joined table as an object or array depending on cardinality
      const loc = Array.isArray(row.location_airports)
        ? row.location_airports[0]
        : row.location_airports;
      return {
        id: row.id,
        name: row.name,
        locationCityId: row.location_city_id,
        phone: row.phone ?? undefined,
        email: row.email,
        companyType: row.company_type,
        verificationStatus: row.verification_status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        country: loc?.country_name ?? '',
        city: loc?.city ?? '',
        baseAirport: loc?.iata ?? loc?.icao ?? undefined,
        latitude: loc?.latitude ?? undefined,
        longitude: loc?.longitude ?? undefined,
      } as CompanyProfileView;
    });

    // Build member-count map from the flat members list (one query instead of N)
    const memberCountMap: Record<string, number> = {};
    for (const m of (membersRes.data ?? [])) {
      memberCountMap[m.company_id] = (memberCountMap[m.company_id] ?? 0) + 1;
    }

    setCompanyProfiles(companyProfilesResult);
    setCompanyMemberCounts(memberCountMap);
    setCompanies(companyProfilesResult.map(v2CompanyToV1));
    setDocumentDetails(v2Docs);
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
      const { error } = await supabase.rpc('admin_update_technician_verification', {
        p_technician_id: id,
        p_status: status,
      });
      if (error) throw new Error(`Could not update technician verification: ${error.message}`);
      await load();
    },
    [load],
  );

  const updateCompanyVerification = useCallback(
    async (id: string, status: VerificationStatus) => {
      const { error } = await supabase.rpc('admin_update_company_verification', {
        p_company_id: id,
        p_status: status,
      });
      if (error) throw new Error(`Could not update company verification: ${error.message}`);
      await load();
    },
    [load],
  );

  const updateDocumentStatus = useCallback(async (id: string, status: DocumentStatus) => {
    const updated = await documentRepositoryV2.updateStatus(id, status);
    if (!updated) return;
    // Update both the V1 compat list (for status badge / actions) and the V2 detail map
    // (for reviewedAt and rejectionReason displayed in the card).
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status: updated.status } : d)));
    setDocumentDetails((prev) => prev.map((d) => (d.id === id ? updated : d)));
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

  const technicianDetailsMap: Record<string, TechnicianWithRelations> = {};
  for (const t of technicianDetails) technicianDetailsMap[t.id] = t;

  const companyMap: Record<string, Company> = {};
  for (const c of companies) companyMap[c.id] = c;

  const companyProfileMap: Record<string, CompanyProfileView> = {};
  for (const c of companyProfiles) companyProfileMap[c.id] = c;

  const documentDetailsMap: Record<string, Document> = {};
  for (const d of documentDetails) documentDetailsMap[d.id] = d;

  const offerTitleMap: Record<string, string> = {};
  for (const o of offers) offerTitleMap[o.id] = o.title;

  return {
    technicians,
    technicianDetailsMap,
    companies,
    companyProfileMap,
    companyMemberCounts,
    documents,
    documentDetailsMap,
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
