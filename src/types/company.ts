import { VerificationStatus } from './technician';

export type CompanyType = 'airline' | 'mro' | 'operator' | 'contractor' | 'recruiter';

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
