export type AppRole = 'technician' | 'company_user' | 'admin';

export type UserStatus =
  | 'pending_verification'
  | 'active'
  | 'blocked'
  | 'suspended';

// V2 canonical — matches SQL `verification_status` enum (pending | verified | rejected)
export type VerificationStatus = 'pending' | 'verified' | 'rejected';

/**
 * Legacy V1 verification status. Only for runtime guards on old persisted data.
 * Never use in V2 repository writes, admin actions, or Supabase columns.
 * @deprecated Map via mapLegacyVerificationStatusToV2()
 */
export type LegacyVerificationStatus = VerificationStatus | 'unverified';

/**
 * Maps a legacy V1 verificationStatus value to the V2 equivalent.
 * unverified → pending (semantically: not yet reviewed, not rejected)
 */
export function mapLegacyVerificationStatusToV2(status: LegacyVerificationStatus): VerificationStatus {
  if (status === 'unverified') return 'pending';
  return status;
}

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
