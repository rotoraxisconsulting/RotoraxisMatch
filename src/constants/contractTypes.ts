// V2 contract types
export const CONTRACT_TYPES = [
  { code: 'permanent', label: 'Permanent', sortOrder: 1 },
  { code: 'long_term', label: 'Long-term', sortOrder: 2 },
  { code: 'short_term', label: 'Short-term', sortOrder: 3 },
] as const;

export type ContractTypeCode = (typeof CONTRACT_TYPES)[number]['code'];

export const CONTRACT_TYPE_CODES = CONTRACT_TYPES.map((c) => c.code);
