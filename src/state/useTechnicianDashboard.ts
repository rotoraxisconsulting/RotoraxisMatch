import { useState, useEffect, useCallback } from 'react';
import { Technician, MatchRequest, TechnicianDocument, Company } from '../types';
import { technicianRepository } from '../repositories/technicianRepository';
import { matchRequestRepository } from '../repositories/matchRequestRepository';
import { documentRepository } from '../repositories/documentRepository';
import { companyRepository } from '../repositories/companyRepository';

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
    const [tech, reqs, docs, companies] = await Promise.all([
      technicianRepository.getById(DEMO_TECHNICIAN_ID),
      matchRequestRepository.getByTechnician(DEMO_TECHNICIAN_ID),
      documentRepository.getByTechnician(DEMO_TECHNICIAN_ID),
      companyRepository.getAll(),
    ]);
    setTechnician(tech);
    setRequests(
      [...reqs].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      ),
    );
    setDocuments(docs);
    const map: Record<string, Company> = {};
    companies.forEach((c) => {
      map[c.id] = c;
    });
    setCompanyMap(map);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const acceptRequest = useCallback(
    async (requestId: string) => {
      await matchRequestRepository.updateStatus(requestId, 'accepted', true);
      await loadData();
    },
    [loadData],
  );

  const rejectRequest = useCallback(
    async (requestId: string) => {
      await matchRequestRepository.updateStatus(requestId, 'rejected', false);
      await loadData();
    },
    [loadData],
  );

  const updateProfile = useCallback(
    async (patch: Partial<Technician>) => {
      if (!technician) return;
      const updated: Technician = { ...technician, ...patch };
      updated.profileCompleteness = computeProfileCompleteness(updated);
      await technicianRepository.update(DEMO_TECHNICIAN_ID, updated);
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
