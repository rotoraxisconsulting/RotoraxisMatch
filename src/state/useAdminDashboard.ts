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
import { OfferStatus, UserStatus } from '../types/enums';
import { supabase } from '../lib/supabase';
import { technicianRepositoryV2 } from '../repositories/v2/technicianRepositoryV2';
import { documentRepositoryV2 } from '../repositories/v2/documentRepositoryV2';
import { offerRequestRepository } from '../repositories/v2/offerRequestRepository';
import { offerApplicationRepository } from '../repositories/v2/offerApplicationRepository';
import { offerRepository } from '../repositories/v2/offerRepository';
import { catalogRepository } from '../repositories/v2/catalogRepository';
import { buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';
import {
  v2TechnicianToV1,
  v2CompanyToV1,
  v2DocumentToV1,
  v2OfferRequestToMatchRequest,
  resolveTypeRatingLabels,
} from '../utils/v2CompatAdapters';


export interface AdminMetrics {
  /** Cuentas VIVAS. Las lápidas se cuentan aparte en `deletedTechnicians`. */
  totalTechnicians: number;
  verifiedTechnicians: number;
  pendingTechnicians: number;
  /** Cuentas borradas por su dueño (profiles.status='deleted'). No son cola de trabajo. */
  deletedTechnicians: number;
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
  /** displayName completo (célula + motor) por técnico, resuelto con el catálogo ya cargado. */
  typeRatingLabelsMap: Record<string, string[]>;
  /** `profiles.status` por technician_profiles.id — distingue cuenta viva de lápida (`deleted`). */
  accountStatusMap: Record<string, UserStatus>;
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
  const [typeRatingLabels, setTypeRatingLabels] = useState<Record<string, string[]>>({});
  const [accountStatusMap, setAccountStatusMap] = useState<Record<string, UserStatus>>({});
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

    const [profiles, v2Docs, v2Requests, v2Offers, v2Applications, companiesRes, membersRes, ratings, accountsRes] =
      await Promise.all([
        technicianRepositoryV2.getAll(),
        documentRepositoryV2.getAll(),
        offerRequestRepository.getAll(),
        offerRepository.getAllWithRequirements(),
        offerApplicationRepository.getAll(),
        supabase
          .from('companies')
          .select(`
            id, name, location_city_id, phone, email, company_type, website,
            verification_status, created_at, updated_at,
            location_airports ( country_name, city, iata, icao, latitude, longitude )
          `)
          .order('created_at', { ascending: false }),
        supabase
          .from('company_members')
          .select('id, company_id, user_id, role, created_at'),
        catalogRepository.getAircraftTypeRatings(),
        // Estado de CUENTA (profiles.status), que no viaja en technician_profiles.
        // Sin esto el panel no puede distinguir un técnico vivo de una LÁPIDA
        // (cuenta borrada: PII anonimizada, status='deleted', sin usuario de
        // auth). Legible por `profiles_select_admin` (is_admin()).
        supabase.from('profiles').select('id, status'),
      ]);
    const ratingIndex = buildAircraftRatingIndex(ratings);

    // Load relations for each technician so admin can see licenseCategories, etc.
    const withRelationsAll = await Promise.all(
      profiles.map((p) => technicianRepositoryV2.getWithRelations(p.id)),
    );
    const technicianDetailsResult = withRelationsAll.filter(
      (t): t is NonNullable<typeof t> => t !== null,
    );
    setTechnicianDetails(technicianDetailsResult);
    setTechnicians(technicianDetailsResult.map((t) => v2TechnicianToV1(t, ratingIndex)));

    // Etiquetas "Type ratings" con displayName COMPLETO (célula + motor),
    // resueltas aquí porque es donde ya vive el ratingIndex — la tarjeta no
    // carga una segunda copia del catálogo (ver comentario en
    // AdminTechnicianCard). `Technician.aircraftTypes` (V1-compat) sigue
    // llevando la familia suelta y se usa para el buscador, no para mostrar.
    const labels: Record<string, string[]> = {};
    for (const t of technicianDetailsResult) {
      labels[t.id] = resolveTypeRatingLabels(t.habilitations, ratingIndex);
    }
    setTypeRatingLabels(labels);

    // profiles.status por technician_profiles.id (la tarjeta trabaja con el id
    // del perfil de técnico, no con el user_id).
    const statusByUserId = new Map<string, string>(
      (accountsRes.data ?? []).map((row: { id: string; status: string }) => [row.id, row.status]),
    );
    const accountStatus: Record<string, UserStatus> = {};
    for (const t of technicianDetailsResult) {
      const s = statusByUserId.get(t.userId);
      if (s) accountStatus[t.id] = s as UserStatus;
    }
    setAccountStatusMap(accountStatus);

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

  const updateDocumentStatus = useCallback(async (id: string, status: DocumentStatus, rejectionReason?: string) => {
    const updated = await documentRepositoryV2.updateStatus(id, status, rejectionReason);
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

  // Una lápida conserva el verification_status que tenía al borrarse, así que
  // seguía sumando en "verified" y en "pending" como si fuera oferta activa o
  // cola por revisar. Ninguna de las dos cosas es cierta: no hay técnico
  // detrás. Se separan aquí para que el total signifique "cuentas vivas".
  const livingTechnicians = technicians.filter((t) => accountStatusMap[t.id] !== 'deleted');

  const metrics: AdminMetrics = {
    totalTechnicians: livingTechnicians.length,
    verifiedTechnicians: livingTechnicians.filter((t) => t.verificationStatus === 'verified').length,
    pendingTechnicians: livingTechnicians.filter((t) => t.verificationStatus === 'pending').length,
    deletedTechnicians: technicians.length - livingTechnicians.length,
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
    typeRatingLabelsMap: typeRatingLabels,
    accountStatusMap,
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
