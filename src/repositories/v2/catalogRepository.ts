import { supabase } from '../../lib/supabase';
import { AIRCRAFT_TYPE_CATALOG, AircraftTypeCode } from '../../constants/aircraftTypes';
import { LICENSE_CATEGORIES, LicenseCode } from '../../constants/licenses';
import { CONTRACT_TYPES } from '../../constants/contractTypes';
import { TECHNICIAN_TYPES } from '../../constants/technicianTypes';
import { COMPANY_TYPES } from '../../constants/companyTypes';
import {
  AircraftTypeRatingRow,
  filterAircraftTypeRatings,
  mapAircraftTypeRatingRow,
} from '../../constants/aircraftTypeRatings';
import { createAircraftTypeRatingsCache } from './aircraftTypeRatingsCache';
import { ContractTypeCode, TechnicianTypeCode, CompanyTypeCode, AircraftTypeRatingCatalog } from '../../types/catalog';
import { throwIfError } from './supabaseMappers';

// public.aircraft_type_ratings is the ONLY source of truth for this catalog
// — see docs/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md. There is no
// TypeScript-side copy of the 80 rows anymore and no hardcoded fallback:
// a failed/empty load surfaces as an explicit state (see
// getAircraftTypeRatingsCacheStatus / useAircraftTypeRatingsCatalog), never
// a silent switch to baked-in data.
const AIRCRAFT_TYPE_RATINGS_SELECT = `
  id,
  manufacturer,
  aircraft_family,
  engine_manufacturer,
  engine_family,
  easa_endorsement,
  display_name,
  commercial_aliases,
  aircraft_category,
  easa_group,
  source_revision,
  priority,
  is_active,
  created_at,
  updated_at
`;

async function fetchActiveAircraftTypeRatings(): Promise<AircraftTypeRatingCatalog[]> {
  const { data, error } = await supabase
    .from('aircraft_type_ratings')
    .select(AIRCRAFT_TYPE_RATINGS_SELECT)
    .eq('is_active', true)
    .order('priority', { ascending: false })
    .order('manufacturer', { ascending: true })
    .order('aircraft_family', { ascending: true })
    .order('engine_family', { ascending: true });
  throwIfError(error);
  return ((data ?? []) as unknown as AircraftTypeRatingRow[]).map(mapAircraftTypeRatingRow);
}

// Deliberately does NOT filter on is_active — this is the path that resolves
// display labels for ratings that were deactivated after a technician/offer
// already referenced them. Always a single .in() query, never one request
// per id (see aircraftTypeRatingsCache.getRatingsByIds).
async function fetchAircraftTypeRatingsByIds(ids: string[]): Promise<AircraftTypeRatingCatalog[]> {
  const { data, error } = await supabase
    .from('aircraft_type_ratings')
    .select(AIRCRAFT_TYPE_RATINGS_SELECT)
    .in('id', ids);
  throwIfError(error);
  return ((data ?? []) as unknown as AircraftTypeRatingRow[]).map(mapAircraftTypeRatingRow);
}

// Module-scoped singleton: one cache shared by every screen/hook in the
// running app (technician profile, offer forms, matching, search) so the
// 80-row catalog is fetched once per session (or once per TTL window), not
// once per component.
const aircraftTypeRatingsCache = createAircraftTypeRatingsCache({
  fetchActive: fetchActiveAircraftTypeRatings,
  fetchByIds: fetchAircraftTypeRatingsByIds,
});

export const catalogRepository = {
  async getAircraftTypes() {
    return [...AIRCRAFT_TYPE_CATALOG];
  },

  async getAircraftType(code: AircraftTypeCode) {
    return AIRCRAFT_TYPE_CATALOG.find((a) => a.code === code) ?? null;
  },

  async getLicenseCategories() {
    return [...LICENSE_CATEGORIES];
  },

  async getLicenseCategory(code: LicenseCode) {
    return LICENSE_CATEGORIES.find((l) => l.code === code) ?? null;
  },

  async getContractTypes() {
    return [...CONTRACT_TYPES];
  },

  async getContractType(code: ContractTypeCode) {
    return CONTRACT_TYPES.find((c) => c.code === code) ?? null;
  },

  async getTechnicianTypes() {
    return [...TECHNICIAN_TYPES];
  },

  async getTechnicianType(code: TechnicianTypeCode) {
    return TECHNICIAN_TYPES.find((t) => t.code === code) ?? null;
  },

  async getCompanyTypes() {
    return [...COMPANY_TYPES];
  },

  async getCompanyType(code: CompanyTypeCode) {
    return COMPANY_TYPES.find((c) => c.code === code) ?? null;
  },

  // --- aircraft_type_ratings — Supabase-backed, cached (see aircraftTypeRatingsCache.ts) ---

  /** Active ratings only — the list new selections are made from. */
  async getAircraftTypeRatings(options: { forceRefresh?: boolean } = {}): Promise<AircraftTypeRatingCatalog[]> {
    return aircraftTypeRatingsCache.getActiveRatings(options);
  },

  /** Resolves a single rating by id, active or not (see getAircraftTypeRatingsByIds). */
  async getAircraftTypeRatingById(id: string): Promise<AircraftTypeRatingCatalog | null> {
    const [rating] = await aircraftTypeRatingsCache.getRatingsByIds([id]);
    return rating ?? null;
  },

  /**
   * Resolves many ratings by id in a single query, active or not. Use this
   * (never one getAircraftTypeRatingById call per id) whenever labels for a
   * list of technician/offer habilitations need to be displayed.
   */
  async getAircraftTypeRatingsByIds(ids: string[]): Promise<AircraftTypeRatingCatalog[]> {
    return aircraftTypeRatingsCache.getRatingsByIds(ids);
  },

  /** In-memory search over the cached active catalog — no SQL search needed for 80 rows. */
  async searchAircraftTypeRatings(query: string, options: { forceRefresh?: boolean } = {}): Promise<AircraftTypeRatingCatalog[]> {
    const ratings = await aircraftTypeRatingsCache.getActiveRatings(options);
    return filterAircraftTypeRatings(ratings, query);
  },

  getAircraftTypeRatingsCacheStatus() {
    return aircraftTypeRatingsCache.getState();
  },

  invalidateAircraftTypeRatingsCache(): void {
    aircraftTypeRatingsCache.invalidate();
  },
};
