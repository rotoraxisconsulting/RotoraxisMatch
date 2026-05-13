import { useState, useEffect, useCallback } from 'react';
import { Company, MatchRequest, SafeTechnicianView } from '../types';
import { companyRepository } from '../repositories/companyRepository';
import { matchRequestRepository } from '../repositories/matchRequestRepository';
import { technicianRepository } from '../repositories/technicianRepository';

// Demo: Delta Air Lines is the active company for the company role
export const DEMO_COMPANY_ID = 'comp-001';

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

async function buildTechnicianMap(
  reqs: MatchRequest[],
): Promise<Record<string, SafeTechnicianView>> {
  const map: Record<string, SafeTechnicianView> = {};
  await Promise.all(
    reqs.map(async (req) => {
      const view = await technicianRepository.getSafeViewForCompany(
        req.technicianId,
        DEMO_COMPANY_ID,
        reqs,
      );
      if (view) map[req.technicianId] = view;
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
    const [comp, reqs] = await Promise.all([
      companyRepository.getById(DEMO_COMPANY_ID),
      matchRequestRepository.getByCompany(DEMO_COMPANY_ID),
    ]);
    setCompany(comp);
    setRequests(reqs);
    setTechnicianMap(await buildTechnicianMap(reqs));
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const sendRequest = useCallback(
    async (technicianId: string, message: string): Promise<MatchRequest[]> => {
      await matchRequestRepository.create({
        companyId: DEMO_COMPANY_ID,
        technicianId,
        status: 'sent',
        identityRevealed: false,
        message,
      });
      const reqs = await matchRequestRepository.getByCompany(DEMO_COMPANY_ID);
      setRequests(reqs);
      setTechnicianMap(await buildTechnicianMap(reqs));
      return reqs;
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
