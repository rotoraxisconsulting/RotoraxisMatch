import { TechnicianTypeCode, LicenseCode } from './catalog';
import { VerificationStatus } from './enums';
import {
  TechnicianHabilitation,
  TechnicianAircraftExperience,
  Availability,
  SocialLinks,
} from './technician';
import { Document } from './document';

// What a company sees BEFORE offer acceptance.
// No real identity, no documents, age derived (not birthDate).
export interface SafeTechnicianPreview {
  id: string;
  anonymousCode: string;
  age: number; // derived from birthDate
  technicianType: TechnicianTypeCode;
  country: string;
  city: string;
  baseAirport?: string;
  licenses: LicenseCode[];
  habilitations: TechnicianHabilitation[];
  aircraftExperience: TechnicianAircraftExperience[];
  availability: Availability;
  verificationStatus: VerificationStatus;
  // matchingScore is NOT stored here — use calculateOfferTechnicianMatch(offer, technician) instead.
  // A score only exists in the context of a specific offer+technician pair.
}

// What a company sees AFTER offer acceptance.
// Full identity + documents unlocked.
export interface UnlockedTechnicianView extends SafeTechnicianPreview {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  socialLinks?: SocialLinks;
  documents: Document[];
}

export type TechnicianView = SafeTechnicianPreview | UnlockedTechnicianView;

export function isUnlocked(view: TechnicianView): view is UnlockedTechnicianView {
  return 'firstName' in view;
}
