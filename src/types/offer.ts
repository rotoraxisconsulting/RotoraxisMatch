import { TechnicianTypeCode, LicenseCode, ContractTypeCode, RequirementLevel } from './catalog';
import { OfferStatus } from './enums';

// An exact category+rating requirement row (offer_required_habilitations).
// Unlike requiredLicenses/requiredAircraftTypes (independent sets), each row
// here pairs a single licenseCode with a single aircraftTypeRatingId — the
// offer-side equivalent of technician_habilitations.
export interface OfferRequiredHabilitation {
  offerId: string;
  licenseCode: LicenseCode;
  aircraftTypeRatingId: string;
  requirementLevel: RequirementLevel;
  notes?: string;
  createdAt: string;
}

export interface Offer {
  id: string;
  companyId: string;
  title: string;
  description: string;
  contractType: ContractTypeCode;
  locationCityId: string;
  // Controlled snapshot copied from the canonical location catalog at create/update time.
  locationCountry: string;
  locationCity: string;
  locationBaseAirport?: string;
  minYearsExperience: number;
  status: OfferStatus;
  visible: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OfferWithRequirements extends Offer {
  requiredTechnicianTypes: TechnicianTypeCode[];
  requiredLicenses: LicenseCode[];
  requiredAircraftTypes: string[];
  // Optional exact category+rating requirements. Empty for offers that only
  // use the broad requirement sets above (legacy or intentionally general).
  requiredHabilitations: OfferRequiredHabilitation[];
}
