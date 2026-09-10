import { OfferSalary, PresetSalaryCurrency, SalaryCurrency, SalaryPeriod, SALARY_CURRENCIES, SALARY_PERIODS } from '../types/offerSalary';

export interface SalaryFormValue {
  enabled: boolean;
  amount: string;
  currency: PresetSalaryCurrency | 'other';
  customCurrency: string;
  period: SalaryPeriod | '';
}

export function salaryFormFromValue(salary?: OfferSalary | null): SalaryFormValue {
  const currency = salary?.currency ?? 'EUR';
  const isPreset = SALARY_CURRENCIES.some((preset) => preset === currency);
  return {
    enabled: !!salary,
    amount: salary ? String(salary.amount) : '',
    currency: isPreset ? currency as PresetSalaryCurrency : 'other',
    customCurrency: isPreset ? '' : currency,
    period: salary?.period ?? '',
  };
}

export function normalizeSalaryCurrency(value: string): string {
  return value.trim().toUpperCase();
}

function formCurrency(value: SalaryFormValue): string {
  return normalizeSalaryCurrency(value.currency === 'other' ? value.customCurrency : value.currency);
}

// Accept either decimal separator, but never guess whether 3.500 means 3.5
// or 3500. The form explicitly asks for amounts without thousands separators.
export function parseSalaryAmount(value: string): number | null {
  const text = value.trim();
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
  const amount = Number(text.replace(',', '.'));
  return amount > 0 && amount <= 999999999.99 ? amount : null;
}

export function salaryFormError(value: SalaryFormValue): string | undefined {
  if (!value.enabled) return undefined;
  if (parseSalaryAmount(value.amount) === null) {
    return 'Enter an amount greater than 0, up to 999999999.99, with at most 2 decimals and no thousands separators.';
  }
  if (!/^[A-Z]{3}$/.test(formCurrency(value))) return 'Enter a three-letter currency code, e.g. JPY or MXN.';
  if (!SALARY_PERIODS.some((p) => p.code === value.period)) return 'Select per hour, day, week, month or year.';
  return undefined;
}

export function salaryFromForm(value: SalaryFormValue): OfferSalary | null {
  if (!value.enabled) return null;
  const error = salaryFormError(value);
  if (error) throw new Error(error);
  return { amount: parseSalaryAmount(value.amount)!, currency: formCurrency(value), period: value.period as SalaryPeriod };
}

/** undefined = leave unchanged, null = explicitly remove all salary columns. */
export function salaryColumns(salary: OfferSalary | null | undefined): Record<string, unknown> {
  if (salary === undefined) return {};
  if (salary === null) return { salary_amount: null, salary_currency: null, salary_period: null };
  if (typeof salary.amount !== 'number' || !Number.isFinite(salary.amount)
    || parseSalaryAmount(String(salary.amount)) === null
    || typeof salary.currency !== 'string' || !/^[A-Z]{3}$/.test(normalizeSalaryCurrency(salary.currency))
    || !SALARY_PERIODS.some((p) => p.code === salary.period)) {
    throw new Error('Enter a valid gross amount, currency and time unit.');
  }
  return { salary_amount: salary.amount, salary_currency: normalizeSalaryCurrency(salary.currency), salary_period: salary.period };
}

export function salaryFromRow(row: Record<string, unknown>): OfferSalary | null {
  if (row.salary_amount == null && row.salary_currency == null && row.salary_period == null) return null;
  const salary = {
    amount: Number(row.salary_amount),
    currency: row.salary_currency as SalaryCurrency,
    period: row.salary_period as SalaryPeriod,
  };
  salaryColumns(salary);
  return salary;
}

export function formatOfferSalary(salary?: OfferSalary | null): string | null {
  if (!salary) return null;
  return `${formatOfferSalaryAmount(salary)} / ${salary.period} · gross`;
}

export function formatOfferSalaryAmount(salary: OfferSalary): string {
  const amount = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(salary.amount);
  return `${amount} ${salary.currency}`;
}
