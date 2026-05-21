// V2 contract types
export const CONTRACT_TYPES = [
  { code: 'permanent',  label: 'Permanent',  sortOrder: 1 },
  { code: 'long_term',  label: 'Long-term',  sortOrder: 2 },
  { code: 'short_term', label: 'Short-term', sortOrder: 3 },
] as const;

export type ContractTypeCode = (typeof CONTRACT_TYPES)[number]['code'];

export const CONTRACT_TYPE_CODES = CONTRACT_TYPES.map((c) => c.code);

// V1 compat — old codes for any seed data or legacy logic still using them
// @deprecated remove after V2-1b seed data migration
export const LEGACY_CONTRACT_TYPES = [
  { code: 'permanent', label: 'Permanent' },
  { code: 'contract',  label: 'Contract' },
  { code: 'temporary', label: 'Temporary' },
  { code: 'freelance', label: 'Freelance' },
] as const;
