# V2-S0C Final Pre-Supabase Audit Report

**Date:** 2026-06-01  
**Scope:** Final validator hardening, dangerous-leftover search, doc consistency check, route/UI sanity check, and QA before V2-S1 Supabase/Auth.

---

## 1. Executive summary

**Is the app ready for V2-S1 Supabase/Auth? Yes — Ready.**

Main reason: the local V2 demo is internally consistent, local seeds validate cleanly, the Supabase clean-start boundary is documented, and the remaining legacy items are local/demo compatibility surfaces rather than Supabase blockers.

No Supabase/Auth implementation was added in this phase.

---

## 2. Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `node scripts/validateSeeds.js` | PASS — 0 errors, 0 warnings |
| `npx expo export --platform web` | PASS — 37 static routes exported |

Seed validator final counts:

| Entity | Count |
|---|---:|
| TechnicianProfiles | 18 |
| Companies | 9 |
| Profiles | 34 |
| Offers | 12 |
| OfferRequests | 12 |
| OfferApplications | 6 |
| Documents | 25 |
| Licenses | 29 |
| Habilitations | 41 |
| AircraftExperience | 53 |
| OfferRequiredTechnicianTypes | 13 |
| OfferRequiredLicenses | 12 |
| OfferRequiredAircraftTypes | 16 |
| AircraftTypeCatalogCodes | 33 |
| CompanyMembers | 15 |
| ChatRooms | 4 |
| ChatMessages | 9 |
| Activities | 2 |

---

## 3. Validators added/strengthened

`scripts/validateSeeds.js` was strengthened with:

- Explicit local-only/Supabase UUID note.
- Profile role/status validation.
- Offer `visible === (status === 'published')` validation.
- Offer `contractType` catalog validation.
- Company `companyType` catalog validation.
- Explicit `GENERAL` rejection for habilitations and offer required aircraft types, in addition to aircraft experience.
- Company member role validation.
- Company member profile role validation (`company_user` only).
- One-company-per-company-user validation.
- Every company must have at least one admin member.
- Duplicate chat room detection per `offerRequestId` and per `offerApplicationId`.
- Chat message `senderUserId`/profile existence validation.
- Chat message sender role validation.
- Chat message technician/company sender consistency checks.
- Summary counts for warnings/errors plus explicit `RESULT: PASS` / `RESULT: FAIL`.
- Non-zero exit code when validation errors are found.

Existing checks retained include verification status, location catalog membership, aircraft/license/technician-type references, composite offer requirement duplicates, duplicate applications, active direct-offer duplicates, accepted unlock/chat invariants, companyId cross-checks, and activity entity references.

---

## 4. Issues fixed during this phase

| File | Change |
|---|---|
| `scripts/validateSeeds.js` | Hardened final local seed validation and CLI PASS/FAIL behavior. |
| `docs/RLS_PLAN_V2.md` | Removed the planned company `SELECT` policy on base `technician_profiles`; company reads must go through `technician_public_view` / safe RPCs. |
| `docs/SUPABASE_SCHEMA_V2.sql` | Fixed stale RLS phase note from `V2-9` to `V2-S1`. |
| `app/technician/offers/[id].tsx` | Copy now says companies access admin-verified documents after acceptance. |
| `app/technician/direct-offers/[id].tsx` | Same verified-document copy clarification for accepted direct offers and accept confirmation. |
| `docs/HANDOFF_SUMMARY.md` | Updated S0C status, current seed counts, route/export status, and next-phase readiness. |
| `docs/V2_S0C_FINAL_PRE_SUPABASE_AUDIT_REPORT.md` | Added this final audit report. |

---

## 5. Remaining legacy/local-only items

| Item | Where it remains | Why safe now | Remove before production? |
|---|---|---|---|
| V1 `MatchRequest` / status `sent` | `src/types/matchRequest.ts`, V1 compat adapters, dashboard hooks, some legacy components | V2 `pending` maps to V1 `sent` only inside compatibility view models; V2 repositories and Supabase docs use `pending`. | Yes, after replacing remaining compat consumers. |
| `SafeTechnicianView`, `fullName`, `yearsExperience`, `specialties` | V1 technician types, adapters, technician dashboard/profile/search compatibility UI | Used as local/demo display adapters. Company-facing identity remains privacy-gated; flat `yearsExperience` no longer creates `GENERAL` experience rows. | Yes, migrate remaining screens to V2 DTOs before production hardening. |
| V1 `Company` fields `companyName` / `contactEmail` | V1 company type/adapters and some dashboard/admin display surfaces | Display compatibility only; V2 `CompanyProfile` uses `name` / `email`. | Yes, after remaining compat surfaces are removed. |
| Internal `matchingScore` | V1 map/search compatibility types and internal map sorting | No global map match percent is rendered. Offer-specific match UI uses `calculateOfferTechnicianMatch(offer, technician)`. | Yes, when map is migrated fully to V2 DTOs. |
| Legacy redirect routes | `/company/requests`, `/technician/requests` | They route users to current V2 screens and exported successfully. | Optional before production once deep links are gone. |
| Local JSON demo seeds | `src/data/seeds/*.json` | Local-only AsyncStorage demo data with human-readable IDs; validator explicitly states they are not Supabase UUIDs. | Do not migrate them directly. Keep only for demo mode. |
| Local `ActivityItem` with `chat_message_received` | `src/types/activity.ts`, local activity repository/seeds | Local demo/future-scope only. Supabase Phase 1 requires marketplace activity events, not chat message events. | Replace with `activity_events` + `activity_reads` during Supabase implementation. |

---

## 6. Remaining risks

No blocker remains for starting V2-S1 Supabase/Auth foundation.

Implementation watch item: when RLS is implemented, do not grant company users direct access to `technician_profiles`. The production boundary must be view/RPC/grants/RLS, not frontend DTOs.

Implementation watch item: document file URL generation must preserve the verified-only company access rule after acceptance.

---

## 7. Ready for Supabase/Auth?

**Ready.**

Next phase: **V2-S1 Supabase/Auth foundation**.

No exact blockers remain for starting the foundation phase.

---

## 8. Recommended next phase

V2-S1 Supabase/Auth foundation:

- Create Supabase project.
- Configure env vars.
- Apply schema/catalogs.
- Create profiles table and admin bootstrap.
- Add sign in/sign up.
- Add auth context.
- Keep demo mode available.
- No marketplace migration yet.
