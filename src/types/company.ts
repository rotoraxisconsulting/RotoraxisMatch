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
  country: string;
  city: string;
  phone?: string;
  email: string;
  companyType: CompanyTypeCode;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string;
  role: CompanyMemberRole;
  createdAt: string;
}
