import { VerificationStatus } from './enums'; // owned by enums.ts — not re-exported here
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';

// --- V1 compat types — remove after V2-1d ---

/** @deprecated V2 uses `availability.immediately: boolean` instead */
export type AvailabilityStatus = 'available' | 'open_to_offers' | 'unavailable';

/** @deprecated use ContractTypeCode from catalog.ts instead */
export type ContractType = 'permanent' | 'contract' | 'temporary' | 'freelance';

// Merged V1/V2 shape: V1 uses `status`, V2 uses `immediately`. Both optional during migration.
export interface Availability {
  immediately?: boolean;       // V2 — will be required after V2-1b
  status?: AvailabilityStatus; // V1 compat — remove after V2-1d
  availableFrom?: string;
  contractTypes: (ContractType | ContractTypeCode)[];
}

/** @deprecated use TechnicianProfile instead */
export interface Technician {
  id: string;
  anonymousCode: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  city: string;
  baseAirport: string;
  latitude: number;
  longitude: number;
  licenseCategories: string[];
  aircraftTypes: string[];
  specialties: string[];
  availability: Availability;
  verificationStatus: VerificationStatus;
  profileCompleteness: number;
  yearsExperience: number;
}

/** @deprecated use SafeTechnicianPreview or UnlockedTechnicianView from privacy.ts instead */
export type SafeTechnicianView = Omit<Technician, 'fullName' | 'email' | 'phone'> & {
  matchingScore?: number;
  fullName?: string;
  email?: string;
  phone?: string;
};

// --- V2 types ---

export interface TechnicianLicense {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface TechnicianHabilitation {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  aircraftTypeCode: string;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface TechnicianAircraftExperience {
  id: string;
  technicianId: string;
  aircraftTypeCode: string;
  value: number;
  unit: 'hours' | 'years';
  createdAt: string;
}

export interface SocialLinks {
  linkedin?: string;
  [key: string]: string | undefined;
}

// Full technician profile — contains private fields.
// Never send to a company without the privacy filter.
export interface TechnicianProfile {
  id: string;
  userId: string;
  anonymousCode: string;

  // Private
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate: string; // ISO date — compute age, never expose raw

  // Public
  technicianType: TechnicianTypeCode;
  country: string;
  city: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;

  availability: Availability;
  verificationStatus: VerificationStatus;
  profileCompleteness: number;

  socialLinks?: SocialLinks;

  createdAt: string;
  updatedAt: string;
}

export interface TechnicianWithRelations extends TechnicianProfile {
  licenses: TechnicianLicense[];
  habilitations: TechnicianHabilitation[];
  aircraftExperience: TechnicianAircraftExperience[];
}
