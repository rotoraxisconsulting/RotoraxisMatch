import { supabase } from '../../lib/supabase';
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
// — see docs/archive/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md. There is no
// TypeScript-side copy of the 80 rows anymore and no hardcoded fallback:
// a failed/empty load surfaces as an explicit state (see
// getAircraftTypeRatingsCacheStatus / useAircraftTypeRatingsCatalog), never
// a silent switch to baked-in data.
// product_type (Aeroplane/Helicopter/Gas Airship, the EASA source's own
// top-level classification) was added by migration 020, confirmed applied
// and populated for all 606 rows — see
// docs/archive/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md and
// docs/archive/EASA_FULL_CATALOG_RECONCILIATION_REPORT.md. Not consumed by any UI
// yet; reserved for a later phase's category faceting.
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
  product_type,
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

// public.aircraft_types (the legacy, coarser 33-row catalog) had a
// getAircraftTypes()/getAircraftType() pair here that queried it directly.
// Removed 2026-07-22 (migration 022): reading that table was never the
// fix — it's still a copy disconnected from the real 606-row
// aircraft_type_ratings catalog, just a database-backed one instead of a
// hardcoded one. The "Required aircraft types" broad filter now derives
// its options from getFamilies() over aircraft_type_ratings (see
// ApproximateFilterSection.tsx), and aircraft_types itself is on the
// Fase 5 deletion list alongside its TS mirror, src/constants/aircraftTypes.ts
// (see docs/MISSION_PART66.md). Nothing in src/ queries aircraft_types
// anymore.

export const catalogRepository = {
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
