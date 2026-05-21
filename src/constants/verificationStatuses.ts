// V2 — adds 'rejected'. 'unverified' kept for V1 compat — remove after V2-1b
export const VERIFICATION_STATUSES = [
  { code: 'verified',   label: 'Verified',      color: 'success' },
  { code: 'pending',    label: 'Pending Review', color: 'warning' },
  { code: 'rejected',   label: 'Rejected',       color: 'error' },
  { code: 'unverified', label: 'Unverified',      color: 'error' }, // V1 compat — remove after V2-1b
] as const;

export type VerificationStatusCode = (typeof VERIFICATION_STATUSES)[number]['code'];
