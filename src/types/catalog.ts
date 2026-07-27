export type TechnicianTypeCode =
  | 'mechanic'
  | 'avionic'
  | 'sheet_metal_worker'
  | 'painter'
  | 'composite'
  | 'pilot'; // standby — not active in V2 UI

export type LicenseCode =
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1.1' | 'B1.2' | 'B1.3' | 'B1.4'
  | 'B2' | 'B2L' | 'B3' | 'L' | 'C';

export type ContractTypeCode = 'permanent' | 'long_term' | 'short_term';

export type CompanyTypeCode =
  | 'MRO'
  | 'airline'
  | 'recruitment_agency'
  | 'helicopter_operator'
  | 'other';

export interface TechnicianTypeCatalog {
  code: TechnicianTypeCode;
  label: string;
  requiresLicense: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface LicenseCategoryCatalog {
  code: LicenseCode;
  label: string;
  categoryGroup: string; // 'A' | 'B1' | 'B2' | 'B3' | 'L' | 'C'
  sortOrder: number;
}

export interface CompanyTypeCatalog {
  code: CompanyTypeCode;
  label: string;
  sortOrder: number;
}

export interface ContractTypeCatalog {
  code: ContractTypeCode;
  label: string;
  sortOrder: number;
}

// --- Part-66 aircraft-engine type rating catalog (EASA, 80-entry initial set) ---
//
// A rating is a real, valid aircraft+engine combination as it would appear on
// an EASA Part-66 AML (e.g. "Airbus A318/A319/A320/A321 (CFM56)"). Unlike the
// legacy aircraft_types catalog (family/model only, no engine dimension) and
// unlike the small Phase-1 engine_types/aircraft_ratings tables it replaces
// (see docs/archive/PART66_AIRCRAFT_MODEL_ANALYSIS.md and
// docs/archive/AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md), manufacturer/family/
// engine are stored directly on the row — deliberately not normalized into a
// separate reusable engine catalog, so a single table search covers
// manufacturer, family, engine and aliases without joins.
export type AircraftRatingCategory =
  | 'commercial_airplane'
  | 'regional_airplane'
  | 'regional_turboprop'
  | 'business_jet'
  | 'general_aviation'
  | 'helicopter';

export interface AircraftTypeRatingCatalog {
  id: string;
  manufacturer: string;
  aircraftFamily: string;
  engineManufacturer?: string;
  engineFamily?: string;
  /** Canonical EASA denomination — unique, the authoritative value for the catalog. */
  easaEndorsement: string;
  /** User-facing label, e.g. "Airbus A320 family — CFM56". */
  displayName: string;
  /** Search aliases: individual model codes, commercial nicknames, engine nicknames. */
  commercialAliases: string[];
  aircraftCategory: AircraftRatingCategory;
  /** Optional EASA regulatory group/subgroup — not populated for the initial 80, kept for future use. */
  easaGroup?: string;
  /** Which catalog batch/import this row came from, for future re-imports. */
  sourceRevision?: string;
  /**
   * The EASA source's own top-level classification, kept verbatim alongside
   * the (heuristic) aircraftCategory above. Not populated for the initial
   * 80 rows. Reserved for a later phase's category faceting/pre-filtering —
   * nothing reads this yet.
   */
  productType?: 'Aeroplane' | 'Helicopter' | 'Gas Airship';
  priority: number;
  isActive: boolean;
}

export type RequirementLevel = 'mandatory' | 'preferred';
