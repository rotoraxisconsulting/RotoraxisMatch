export const CONTRACT_TYPES = [
  { code: 'permanent', label: 'Permanent' },
  { code: 'contract', label: 'Contract' },
  { code: 'temporary', label: 'Temporary' },
  { code: 'freelance', label: 'Freelance' },
] as const;

export type ContractTypeCode = (typeof CONTRACT_TYPES)[number]['code'];
