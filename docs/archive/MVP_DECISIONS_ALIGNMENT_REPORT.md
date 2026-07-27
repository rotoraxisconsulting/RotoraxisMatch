# MVP Decisions Alignment Report

**Date:** 2026-05-27

## Decisions reviewed

1. `location_airports` starts as a curated MVP catalog, not a complete worldwide airport database.
2. Company users/members are created manually in the MVP; no self-service invitations, invite links, invitation tokens, email invites, Resend, or onboarding flow.
3. Each company user/admin belongs to one company in the MVP; multi-company membership and company switching are future scope.

## Files inspected

- `docs/MVP_ARCHITECTURE_HANDOFF.md`
- `docs/HANDOFF_SUMMARY.md`
- `docs/DATA_MODEL_V2.md`
- `docs/SUPABASE_PLAN_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/RLS_PLAN_V2.md`
- `docs/IMPLEMENTATION_PHASES_V2.md`
- `docs/USER_FLOWS_V2.md`
- `docs/TYPESCRIPT_TYPES_V2.md`
- `docs/MIGRATION_FROM_DEMO_TO_V2.md`
- `docs/DOCS_CLEANUP_REPORT.md`
- `src/constants/locationCities.ts` (`locationAirports` equivalent)
- `src/storage/localDatabase.ts`
- `src/repositories/v2/companyRepositoryV2.ts`
- `src/components/company/CompanyTeamManagement.tsx`
- `app/company/team.tsx`
- `src/data/seeds/companyMembers.json`

Also searched `docs`, `src`, and `app` for: `invitation`, `invite`, `company_invitation`, `multi-company`, `my_company_id`, `location_airports`, `locationCityId`, and `company_members`.

Not present:
- `src/constants/locationAirports.ts`
- `src/data/seeds/locationAirports.json`
- `src/repositories/v2/companyMemberRepository.ts`

## Contradictions found

- `docs/MVP_ARCHITECTURE_HANDOFF.md` still described the three confirmed choices as open decisions and said invitation/location scope were blockers before Supabase.
- `docs/USER_FLOWS_V2.md` said admins can invite additional users.
- `docs/IMPLEMENTATION_PHASES_V2.md` said the company admin screen should invite users.
- Several docs described `company_members` as one row per user per company but did not state the MVP rule that a company user belongs to only one company.
- Location docs referenced the canonical catalog but did not consistently state that the MVP catalog is curated and intentionally not a complete global airport dataset.
- `companyRepositoryV2.addMember()` only rejected duplicate membership within the same company; it now rejects a user already attached to any company in the local demo path.

## Files modified

- `docs/MVP_ARCHITECTURE_HANDOFF.md`
- `docs/HANDOFF_SUMMARY.md`
- `docs/DATA_MODEL_V2.md`
- `docs/SUPABASE_PLAN_V2.md`
- `docs/SUPABASE_SCHEMA_V2.sql`
- `docs/RLS_PLAN_V2.md`
- `docs/IMPLEMENTATION_PHASES_V2.md`
- `docs/USER_FLOWS_V2.md`
- `docs/TYPESCRIPT_TYPES_V2.md`
- `docs/MIGRATION_FROM_DEMO_TO_V2.md`
- `src/constants/locationCities.ts`
- `src/repositories/v2/companyRepositoryV2.ts`
- `docs/MVP_DECISIONS_ALIGNMENT_REPORT.md`

## Final MVP rules

### `location_airports`

- Use the existing curated MVP airport catalog (`src/constants/locationCities.ts`).
- Do not seed or require all airports worldwide for MVP.
- Technicians, companies, and offers reference the catalog via `locationCityId` / `location_city_id`.
- Offers keep controlled snapshot fields copied from the catalog.
- Add new airports later by adding catalog rows; no schema change is required.

### Company member creation

- Company members are created manually/demo-only in MVP.
- Roles remain `admin`, `recruiter`, and `viewer`.
- No self-service invitation flow.
- No invitation tokens.
- No email invite links or Resend/email onboarding.
- Current team UI remains manual/demo (`Add demo member`), not an invitation flow.

### One company per user

- Each company user/admin belongs to one company in MVP.
- `my_company_id()` may assume one primary company.
- Schema docs now call for a unique `user_id` constraint on `company_members` for V2-S1.
- Local demo member creation now rejects adding a user who already belongs to another company.
- Multi-company membership, company switching, and company context selectors are future scope.

## Future-scope notes

- Self-service company invitations, invite tokens, and email invite links.
- Resend/email notifications.
- Supabase Realtime.
- Offer expiration cron.
- Multi-company membership and company switching.
- Complete worldwide airport database seeding.

## QA

Passed:
- `npx tsc --noEmit`
- `node scripts/validateSeeds.js` - no warnings or errors
- `npx expo export --platform web` - exported 36 static routes to `dist`
