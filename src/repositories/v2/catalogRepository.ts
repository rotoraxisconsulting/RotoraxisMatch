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
import { ContractTypeCode, TechnicianTypeCode, CompanyTypeCode, AircraftTypeRatingCatalog, AircraftTypeCatalog } from '../../types/catalog';
import { throwIfError } from './supabaseMappers';

// public.aircraft_type_ratings is the ONLY source of truth for this catalog
// — see docs/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md. There is no
// TypeScript-side copy of the 80 rows anymore and no hardcoded fallback:
// a failed/empty load surfaces as an explicit state (see
// getAircraftTypeRatingsCacheStatus / useAircraftTypeRatingsCatalog), never
// a silent switch to baked-in data.
// product_type (Aeroplane/Helicopter/Gas Airship, the EASA source's own
// top-level classification) was added by migration 020, confirmed applied
// and populated for all 606 rows — see
// docs/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md and
// docs/EASA_FULL_CATALOG_RECONCILIATION_REPORT.md. Not consumed by any UI
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

// public.aircraft_types — the legacy, coarser (model-only, no engine)
// catalog behind offer_required_aircraft_types / technician_habilitations'
// legacy aircraft_type_code column. Fase 3b migrates this off the
// src/constants/aircraftTypes.ts hardcoded mirror (same 33 rows, confirmed
// against the live table) onto a real query — that file stays only for its
// AircraftTypeCode/inferAircraftCategory helpers until Fase 5 removes it
// entirely, per the mission doc. Simple fetch-once memoization (no TTL) is
// enough here: this table rarely changes and the whole legacy system is on
// its way out, unlike aircraft_type_ratings which needed the full cache.
let aircraftTypesPromise: Promise<AircraftTypeCatalog[]> | null = null;

async function fetchAircraftTypes(): Promise<AircraftTypeCatalog[]> {
  const { data, error } = await supabase
    .from('aircraft_types')
    .select('code, label, manufacturer, aircraft_family, aircraft_category, is_active')
    .order('manufacturer', { ascending: true })
    .order('aircraft_family', { ascending: true });
  throwIfError(error);
  return (data ?? []).map((row: any) => ({
    code: row.code as string,
    label: row.label as string,
    manufacturer: row.manufacturer ?? undefined,
    aircraftFamily: row.aircraft_family ?? undefined,
    aircraftCategory: row.aircraft_category as AircraftTypeCatalog['aircraftCategory'],
    isActive: row.is_active as boolean,
  }));
}

export const catalogRepository = {
  /** Live from Supabase (public.aircraft_types) — never a hardcoded list. */
  async getAircraftTypes(options: { forceRefresh?: boolean } = {}): Promise<AircraftTypeCatalog[]> {
    if (options.forceRefresh) aircraftTypesPromise = null;
    if (!aircraftTypesPromise) aircraftTypesPromise = fetchAircraftTypes();
    try {
      return await aircraftTypesPromise;
    } catch (err) {
      aircraftTypesPromise = null; // don't cache a failure — next call retries
      throw err;
    }
  },

  async getAircraftType(code: string): Promise<AircraftTypeCatalog | null> {
    const types = await this.getAircraftTypes();
    return types.find((a) => a.code === code) ?? null;
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
