import { useState, useEffect, useCallback } from 'react';
import { SafeTechnicianView } from '../types';
import { MapFilters } from '../types/filters';
import { technicianRepository } from '../repositories/technicianRepository';
import { matchRequestRepository } from '../repositories/matchRequestRepository';
import { DEMO_COMPANY_ID } from './useCompanyDashboard';

interface UseMapTechniciansReturn {
  technicians: SafeTechnicianView[];
  loading: boolean;
}

export function useMapTechnicians(filters: MapFilters): UseMapTechniciansReturn {
  const [technicians, setTechnicians] = useState<SafeTechnicianView[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const matchRequests = await matchRequestRepository.getByCompany(DEMO_COMPANY_ID);
    const results = await technicianRepository.search(
      {
        licenseCategory: filters.licenseCategory,
        aircraftType: filters.aircraftType,
        verificationStatus: filters.verificationStatus,
      },
      DEMO_COMPANY_ID,
      matchRequests,
    );
    setTechnicians(results);
    setLoading(false);
  }, [filters.licenseCategory, filters.aircraftType, filters.verificationStatus]);

  useEffect(() => {
    load();
  }, [load]);

  return { technicians, loading };
}
