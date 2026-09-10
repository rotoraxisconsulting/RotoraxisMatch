-- Allow manually entered three-letter currency codes (e.g. JPY or MXN).
-- Preset currencies remain shortcuts; currency is independent of country.
-- Replaces only the constraint, preserving all offers and salary values.
BEGIN;

ALTER TABLE public.offers DROP CONSTRAINT IF EXISTS chk_offers_salary;
ALTER TABLE public.offers ADD CONSTRAINT chk_offers_salary CHECK (
  (salary_amount IS NULL AND salary_currency IS NULL AND salary_period IS NULL)
  OR (
    salary_amount IS NOT NULL AND salary_currency IS NOT NULL AND salary_period IS NOT NULL
    AND salary_amount > 0 AND salary_amount <= 999999999.99
    AND salary_amount = round(salary_amount, 2)
    AND salary_currency ~ '^[A-Z]{3}$'
    AND salary_period IN ('hour', 'day', 'week', 'month', 'year')
  )
);

COMMENT ON COLUMN public.offers.salary_currency IS 'Three-letter uppercase currency code, preset or manually entered. Independent of the offer country.';
NOTIFY pgrst, 'reload schema';
COMMIT;
