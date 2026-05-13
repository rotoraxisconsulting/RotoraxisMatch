import { useState, useCallback } from 'react';
import { SafeTechnicianView, MatchRequest } from '../types';
import { TechnicianFilters } from '../types/filters';
import { technicianRepository } from '../repositories/technicianRepository';
import { DEMO_COMPANY_ID } from './useCompanyDashboard';

interface UseTechnicianSearchReturn {
  results: SafeTechnicianView[];
  filters: TechnicianFilters;
  loading: boolean;
  hasSearched: boolean;
  updateFilter: <K extends keyof TechnicianFilters>(key: K, value: TechnicianFilters[K]) => void;
  clearFilters: () => void;
  search: (matchRequests?: MatchRequest[]) => Promise<void>;
}

const EMPTY_FILTERS: TechnicianFilters = {};

export function useTechnicianSearch(): UseTechnicianSearchReturn {
  const [results, setResults] = useState<SafeTechnicianView[]>([]);
  const [filters, setFilters] = useState<TechnicianFilters>(EMPTY_FILTERS);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const updateFilter = useCallback(
    <K extends keyof TechnicianFilters>(key: K, value: TechnicianFilters[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const clearFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setResults([]);
    setHasSearched(false);
  }, []);

  const search = useCallback(
    async (matchRequests: MatchRequest[] = []) => {
      setLoading(true);
      setHasSearched(true);
      const data = await technicianRepository.search(filters, DEMO_COMPANY_ID, matchRequests);
      setResults(data);
      setLoading(false);
    },
    [filters],
  );

  return { results, filters, loading, hasSearched, updateFilter, clearFilters, search };
}
