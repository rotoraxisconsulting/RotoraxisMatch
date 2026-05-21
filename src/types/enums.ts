export type AppRole = 'technician' | 'company_user' | 'admin';

export type UserStatus =
  | 'pending_verification'
  | 'active'
  | 'blocked'
  | 'suspended';

// V1 compat: includes 'unverified' — remove after V2-1b seed data migration
export type VerificationStatus = 'pending' | 'verified' | 'rejected' | 'unverified';

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type OfferRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type OfferStatus = 'draft' | 'published' | 'closed' | 'expired';

export type CompanyMemberRole = 'admin' | 'recruiter' | 'viewer';

export type ExperienceUnit = 'hours' | 'years';

export type SenderRole = 'technician' | 'company';
