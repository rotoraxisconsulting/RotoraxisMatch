export const VERIFICATION_STATUSES = [
  { code: 'verified', label: 'Verified', color: 'success' },
  { code: 'pending', label: 'Pending Review', color: 'warning' },
  { code: 'unverified', label: 'Unverified', color: 'error' },
] as const;

export type VerificationStatusCode = (typeof VERIFICATION_STATUSES)[number]['code'];
