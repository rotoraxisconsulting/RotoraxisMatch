# Optional gross remuneration on offers

First phase: create/edit forms and company/technician offer lists and details.
All amounts are gross. Extended to the shared offer map detail sheet, including
each offer in a grouped marker. Map marker salary labels are still a proposal.
No salary filters, conversions, matching changes, dashboard, application or
direct-offer UI changes are included.

## Contract

- `Offer.salary`: optional `{ amount, currency, period }`, or `null`.
- Periods: `hour`, `day`, `week`, `month`, `year`.
- Currency shortcuts: EUR (form default), GBP, USD, CHF, CAD, AUD, AED, SAR,
  NOK, SEK, DKK, PLN, CZK. Other reveals a manual three-letter code field,
  e.g. JPY or MXN, independent of the offer country. Codes are trimmed and
  uppercased before saving. Validation checks the format, not membership in
  an external currency catalog. Other itself is never stored as the currency.
- Amount: greater than zero, at most 999999999.99, up to two decimal places.
- Form input accepts a decimal dot or comma, without thousands separators.
  Ambiguous input such as `3.500` is rejected instead of being guessed.
- Remuneration starts disabled. When enabled, all fields must be complete,
  including an explicitly selected period. The form previews the gross amount.
- Editing can add, change or remove remuneration. `undefined` in a repository
  patch leaves it unchanged; `null` clears all three database columns.
- Lists omit absent remuneration; details say it is not specified.
- UI copy follows the application's existing English language.

## Database

Apply `supabase/migrations/062_offer_salary.sql` before deploying the code.
Then apply `063_offer_other_currency.sql` to allow manual currency codes.
It adds three nullable columns to `public.offers`: `salary_amount` (NUMERIC),
`salary_currency` (TEXT), `salary_period` (TEXT). Existing offers remain null.
`chk_offers_salary` enforces the complete-or-absent rule, amount bounds,
precision, uppercase three-letter currency codes and supported periods.
RLS policies remain in force. Editing an unlisted currency reopens Other
with its saved code; selecting a preset uses that code instead.

## Validation

- `npm run ts`
- `npx expo export --platform web --output-dir .tmp-salary-web`: successful.
- `npm run test:offer-salary`: input/formatting, all currencies and periods,
  real repository and mapper with a fake transport for create/read/edit/remove,
  missing salary on old offers and rejected writes.
- Migration exercised twice on a temporary PostgreSQL instance: idempotence,
  existing offers, accepted values, removal and invalid combinations.
- Applied to the app's configured Supabase project; the installed constraint
  was exercised in a rolled-back temporary table and PostgREST returned 200
  for the new salary projection. No user offers were altered by these checks.
- Shared form checked in a browser at 390px and 1280px: optional submission,
  decimal comma, currency/annual selection, validation, removal and overflow.
- Other currency tested at both widths: required manual input, lowercase and
  space normalization, switching to/from presets, saving and removal. Migration
  063 passed PostgreSQL checks and was applied to the app's Supabase project.

Manual acceptance in the app: create an offer with and without remuneration,
reopen it, edit the amount/currency/period, remove it, and verify the company
and technician offer views after reloading. Native device testing remains
part of that acceptance pass.
