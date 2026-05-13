import { useState, useEffect, useCallback } from 'react';
import {
  Technician,
  Company,
  TechnicianDocument,
  MatchRequest,
  VerificationStatus,
  DocumentStatus,
} from '../types';
import { technicianRepository } from '../repositories/technicianRepository';
import { companyRepository } from '../repositories/companyRepository';
import { documentRepository } from '../repositories/documentRepository';
import { matchRequestRepository } from '../repositories/matchRequestRepository';

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
}

interface UseAdminDashboardReturn {
  technicians: Technician[];
  companies: Company[];
  documents: TechnicianDocument[];
  requests: MatchRequest[];
  metrics: AdminMetrics;
  loading: boolean;
  refresh: () => Promise<void>;
  updateTechnicianVerification: (id: string, status: VerificationStatus) => Promise<void>;
  updateCompanyVerification: (id: string, status: VerificationStatus) => Promise<void>;
  updateDocumentStatus: (id: string, status: DocumentStatus) => Promise<void>;
  technicianMap: Record<string, Technician>;
  companyMap: Record<string, Company>;
}

export function useAdminDashboard(): UseAdminDashboardReturn {
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [documents, setDocuments] = useState<TechnicianDocument[]>([]);
  const [requests, setRequests] = useState<MatchRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [techs, comps, docs, reqs] = await Promise.all([
      technicianRepository.getAll(),
      companyRepository.getAll(),
      documentRepository.getAll(),
      matchRequestRepository.getAll(),
    ]);
    setTechnicians(techs);
    setCompanies(comps);
    setDocuments(docs);
    setRequests(reqs);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const updateTechnicianVerification = useCallback(
    async (id: string, status: VerificationStatus) => {
      await technicianRepository.update(id, { verificationStatus: status });
      setTechnicians((prev) =>
        prev.map((t) => (t.id === id ? { ...t, verificationStatus: status } : t)),
      );
    },
    [],
  );

  const updateCompanyVerification = useCallback(
    async (id: string, status: VerificationStatus) => {
      await companyRepository.update(id, { verificationStatus: status });
      setCompanies((prev) =>
        prev.map((c) => (c.id === id ? { ...c, verificationStatus: status } : c)),
      );
    },
    [],
  );

  const updateDocumentStatus = useCallback(async (id: string, status: DocumentStatus) => {
    await documentRepository.updateStatus(id, status);
    setDocuments((prev) => prev.map((d) => (d.id === id ? { ...d, status } : d)));
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
  };

  const technicianMap: Record<string, Technician> = {};
  for (const t of technicians) technicianMap[t.id] = t;

  const companyMap: Record<string, Company> = {};
  for (const c of companies) companyMap[c.id] = c;

  return {
    technicians,
    companies,
    documents,
    requests,
    metrics,
    loading,
    refresh: load,
    updateTechnicianVerification,
    updateCompanyVerification,
    updateDocumentStatus,
    technicianMap,
    companyMap,
  };
}
