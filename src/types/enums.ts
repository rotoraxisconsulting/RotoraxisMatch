export type AppRole = 'technician' | 'company_user' | 'admin';

export type UserStatus =
  | 'pending_verification'
  | 'active'
  | 'blocked'
  | 'suspended';

// V2 canonical — matches SQL `verification_status` enum (pending | verified | rejected)
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type OfferRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'
  | 'withdrawn';

export type OfferStatus = 'draft' | 'published' | 'closed' | 'expired' | 'archived';

export type CompanyMemberRole = 'admin' | 'recruiter' | 'viewer';

export type ExperienceUnit = 'hours' | 'years';

export type SenderRole = 'technician' | 'company';
