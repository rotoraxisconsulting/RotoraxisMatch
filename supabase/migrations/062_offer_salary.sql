-- Optional gross remuneration for job offers. Apply before the app reads it.
-- All three fields are absent, or all three describe one gross amount.
-- Unconstrained NUMERIC lets the CHECK reject excess decimals instead of
-- silently rounding a submitted salary. Existing offers remain unspecified.
BEGIN;

ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS salary_amount NUMERIC,
  ADD COLUMN IF NOT EXISTS salary_currency TEXT,
  ADD COLUMN IF NOT EXISTS salary_period TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.offers'::regclass
      AND conname = 'chk_offers_salary'
  ) THEN
    ALTER TABLE public.offers ADD CONSTRAINT chk_offers_salary CHECK (
      (salary_amount IS NULL AND salary_currency IS NULL AND salary_period IS NULL)
      OR (
        salary_amount IS NOT NULL AND salary_currency IS NOT NULL AND salary_period IS NOT NULL
        AND salary_amount > 0 AND salary_amount <= 999999999.99
        AND salary_amount = round(salary_amount, 2)
        AND salary_currency IN ('EUR', 'GBP', 'USD', 'CHF', 'CAD', 'AUD', 'AED', 'SAR', 'NOK', 'SEK', 'DKK', 'PLN', 'CZK')
        AND salary_period IN ('hour', 'day', 'week', 'month', 'year')
      )
    );
  END IF;
END $$;

COMMENT ON COLUMN public.offers.salary_amount IS 'Optional gross amount before taxes. Not used for matching.';
COMMENT ON COLUMN public.offers.salary_currency IS 'Currency of the gross amount; present exactly when salary_amount is present.';
COMMENT ON COLUMN public.offers.salary_period IS 'Unit of the gross amount, not the payment schedule: hour/day/week/month/year.';

NOTIFY pgrst, 'reload schema';
COMMIT;
