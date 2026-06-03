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

export type AircraftCategory = 'airplane' | 'helicopter';

export interface AircraftTypeCatalog {
  code: string;
  label: string;
  manufacturer?: string;
  aircraftFamily?: string;
  aircraftCategory: AircraftCategory;
  isActive: boolean;
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
