import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';
import { VerificationStatus } from './enums';

// --- V2 types ---

export interface TechnicianSearchFilters {
  technicianTypes?: TechnicianTypeCode[];
  licenses?: LicenseCode[];
  aircraftTypes?: string[];
  contractTypes?: ContractTypeCode[];
  country?: string;
  city?: string;
  verifiedOnly?: boolean;
  availableImmediately?: boolean;
  minYearsExperience?: number;
}

export interface OfferSearchFilters {
  contractTypes?: ContractTypeCode[];
  requiredLicenses?: LicenseCode[];
  requiredAircraftTypes?: string[];
  technicianTypes?: TechnicianTypeCode[];
  country?: string;
  city?: string;
}

// --- V1 compat types — remove after V2-1d ---

/** @deprecated use TechnicianSearchFilters instead */
export interface TechnicianFilters {
  licenseCategory?: string;
  aircraftType?: string;
  specialty?: string;
  availabilityStatus?: string;
  verificationStatus?: string;
  minYearsExperience?: number;
  country?: string;
  city?: string;
  baseAirport?: string;
  contractType?: string;
  availableFrom?: string;
}

/** @deprecated use TechnicianSearchFilters instead */
export interface MapFilters {
  licenseCategory?: string;
  aircraftType?: string;
  verificationStatus?: string;
}
