import { VerificationStatus, CompanyMemberRole } from './enums'; // owned by enums.ts — not re-exported here
import { CompanyTypeCode } from './catalog'; // owned by catalog.ts — not re-exported here

// --- V1 compat types — remove after V2-1d ---

/** @deprecated use CompanyTypeCode from catalog.ts instead */
export type CompanyType =
  | 'airline'
  | 'mro'
  | 'operator'
  | 'contractor'
  | 'recruiter'
  // V2 values added for forward compat
  | 'MRO'
  | 'recruitment_agency'
  | 'helicopter_operator'
  | 'other';

/** @deprecated use CompanyProfile instead */
export interface Company {
  id: string;
  companyName: string;
  locationCityId?: string;
  country: string;
  city: string;
  website: string;
  companyType: CompanyType;
  verificationStatus: VerificationStatus;
  contactEmail: string;
}

// --- V2 types ---

export interface CompanyProfile {
  id: string;
  name: string;
  // Required: every persisted company must reference a valid location_airports entry.
  locationCityId: string;
  phone?: string;
  email: string;
  companyType: CompanyTypeCode;
  /** ADMIN-ONLY in Supabase — company cannot write this field; set via admin-only RLS policy */
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyProfileView extends CompanyProfile {
  country: string;
  city: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: CompanyMemberRole;
  /** Set by company admin. Fallback display order: displayName → email → 'Unnamed member' */
  displayName?: string;
  /** Populated via profiles JOIN; absent until migration 004 is applied */
  email?: string;
  createdAt: string;
}
