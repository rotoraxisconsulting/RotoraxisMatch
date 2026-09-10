export const SALARY_PERIODS = [
  { code: 'hour', label: 'Per hour' },
  { code: 'day', label: 'Per day' },
  { code: 'week', label: 'Per week' },
  { code: 'month', label: 'Per month' },
  { code: 'year', label: 'Per year' },
] as const;

// Quick choices only; Other accepts a manually entered three-letter code.
export const SALARY_CURRENCIES = ['EUR', 'GBP', 'USD', 'CHF', 'CAD', 'AUD', 'AED', 'SAR', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK'] as const;
export type PresetSalaryCurrency = (typeof SALARY_CURRENCIES)[number];
/** Three uppercase ASCII letters, validated at the form/repository boundary. */
export type SalaryCurrency = string;
export type SalaryPeriod = (typeof SALARY_PERIODS)[number]['code'];

/** Always gross. One amount expressed in the selected currency and time unit. */
export interface OfferSalary {
  amount: number;
  currency: SalaryCurrency;
  period: SalaryPeriod;
}
