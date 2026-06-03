// V2 canonical — matches SQL `verification_status` enum (pending | verified | rejected)
export const VERIFICATION_STATUSES = [
  { code: 'verified',   label: 'Verified',      color: 'success' },
  { code: 'pending',    label: 'Pending Review', color: 'warning' },
  { code: 'rejected',   label: 'Rejected',       color: 'error' },
] as const;

export type VerificationStatusCode = (typeof VERIFICATION_STATUSES)[number]['code'];
