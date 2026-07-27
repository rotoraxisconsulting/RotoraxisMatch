# V2 Documentation Cleanup Report

**Date:** 2026-05-27  
**Scope:** Pre-Supabase documentation audit and alignment

---

## Summary

All V2 source-of-truth documentation has been reviewed and corrected. Obsolete V1 files were deleted, naming inconsistencies were fixed, future-scope features were moved out of the MVP definition, and phase status was updated to reflect the current state of the codebase.

---

## Task 1 — References to deleted V1 files

The following V1 documentation files were deleted before this cleanup:

- `docs/PRODUCT_CONTEXT.md`
- `docs/ARCHITECTURE.md`
- `docs/UI_UX_GUIDELINES.md`
- `docs/DATA_MODEL.md`
- `docs/MIGRATION_TO_SUPABASE.md`
- `docs/TASKS.md`

**References found and fixed:**

| File | Fix |
|------|-----|
| `CLAUDE.md` | Removed "V1 docs remain for reference only" intro note |
| `CLAUDE.md` | Removed "V1 docs (reference only)" section listing all six deleted files |
| `CLAUDE.md` | Added `docs/HANDOFF_SUMMARY.md` to V2 source-of-truth doc list |

No references to deleted V1 files remain in the codebase or in any documentation file.

---

## Task 2 — Naming inconsistencies fixed

All entity and table names are now consistent across all V2 docs. The canonical names match `DATA_MODEL_V2.md`, `TYPESCRIPT_TYPES_V2.md`, and `SUPABASE_SCHEMA_V2.sql`.

| Wrong name | Correct name | Files fixed |
|-----------|-------------|------------|
| `company_users` | `company_members` | `SUPABASE_PLAN_V2.md` (table heading + RLS section) |
| `job_offers` | `offers` | `SUPABASE_PLAN_V2.md` (table heading + RLS section), `IMPLEMENTATION_PHASES_V2.md` |
| `technician_documents` | `documents` | `SUPABASE_PLAN_V2.md` (table heading + RLS section) |
| `aircraft_experience` | `technician_aircraft_experience` | `SUPABASE_PLAN_V2.md` |
| `jobOfferId` | `offerId` | `SUPABASE_PLAN_V2.md` (offer_requests and offer_applications tables) |
| `expire_job_offers` | `expire_offers` | `SUPABASE_PLAN_V2.md` (edge functions future-scope table) |
| `CompanyUser` | `CompanyMember` | `IMPLEMENTATION_PHASES_V2.md` (V2-7 task) |
| `company_users.role` | `company_members.role` | `SUPABASE_PLAN_V2.md` (RLS section) |
| `Job Offers` (copy) | `Offers` | `HANDOFF_SUMMARY.md` (legacy redirect description) |

---

## Task 3 — Chat room FK direction corrected

`SUPABASE_PLAN_V2.md` previously listed `chatRoomId` as a column on both `offer_requests` and `offer_applications`. This was wrong.

**Correct architecture:** `chat_rooms` holds FKs to `offer_requests` and `offer_applications` — not the reverse.

**Changes made:**
- Removed `chatRoomId` column from `offer_requests` table definition
- Removed `chatRoomId` column from `offer_applications` table definition
- Added explicit note to `chat_rooms` section: *"The `chat_rooms` table references the accepted `offer_request` or `offer_application` — not the other way around."*
- Added FK type annotations to `chat_rooms.offerRequestId` and `chat_rooms.offerApplicationId`
- Added DB constraint and partial unique index notes

---

## Task 4 — Document model simplified for MVP

The V2 document review model is intentionally simple: admin manually sets document status. No audit log, no cron, no reviewer identity tracking for the first Supabase migration.

**Fields removed from docs:**
- `verifiedAt` / `verified_at`
- `verifiedBy` / `verified_by`

**Fields now used (correct MVP model):**
- `reviewedAt` / `reviewed_at` — set when admin changes status; cleared on reset to pending
- `rejectionReason` / `rejection_reason` — set when rejected; cleared on all other transitions
- `expiresAt` / `expires_at` — stored but not auto-expired in MVP

| File | Change |
|------|--------|
| `TYPESCRIPT_TYPES_V2.md` | `Document` interface: replaced `verifiedAt`/`verifiedBy` with `reviewedAt`/`rejectionReason` |
| `MIGRATION_FROM_DEMO_TO_V2.md` | Document field mapping: replaced `verified_at`/`verified_by` with `reviewed_at`/`rejection_reason` |
| `IMPLEMENTATION_PHASES_V2.md` | V2-1a task: replaced `verifiedAt`/`verifiedBy` with `reviewedAt`/`rejectionReason`, added MVP note |
| `SUPABASE_PLAN_V2.md` | Already correct from prior session (Work Item 2) — `documents` table has `reviewed_at`/`rejection_reason` |
| `DATA_MODEL_V2.md` | Already correct from prior session (Work Item 2) — `documents` table has `reviewed_at`/`rejection_reason` |
| `RLS_PLAN_V2.md` | Already correct from prior session (Work Item 2) — policies reference `reviewed_at`/`rejection_reason` |
| `SUPABASE_SCHEMA_V2.sql` | Already correct from prior session (Work Item 2) — `reviewed_at`/`rejection_reason` columns |

---

## Task 5 — Activity model clarified

The local demo and Supabase production models are now clearly separated in `SUPABASE_PLAN_V2.md`.

**MVP (first Supabase migration):**
- `activity_events` + `activity_reads` tables are included — required because companies have multiple members (one `read: boolean` on the event would be ambiguous)
- Activity badges (red dots) computed by querying `activity_events` minus rows in `activity_reads`
- No Realtime subscription required in Phase 1

**Future scope (moved out of V2-S1 definition):**
- Supabase Realtime subscription for live badge updates
- Email notifications via Resend
- Push notifications via Expo Notifications

---

## Task 6 — Automation scope simplified

`SUPABASE_PLAN_V2.md` edge functions and notifications sections restructured into **MVP** and **Future scope** sub-sections.

**MVP automated behavior (V2-S1):**
- Acceptance unlocks identity/documents atomically (`handle_offer_accepted` trigger)
- Acceptance creates chat room atomically (same trigger)
- Accepted/rejected creates counterparty activity event (SECURITY DEFINER function)
- RLS enforces privacy on all tables
- Duplicate prevention via DB unique constraints

**Moved to future scope:**
- `expire_offers` cron function
- `notify_offer_status` push notification
- Supabase Realtime subscription
- Email notifications (Resend)

Also fixed: `SUPABASE_PLAN_V2.md` `offers` table no longer lists `requiredTechnicianTypes`, `requiredLicenses`, `requiredAircraftTypes` as array columns. Replaced with a note pointing to the correct relation tables (`offer_required_technician_types`, `offer_required_licenses`, `offer_required_aircraft_types`).

---

## Task 7 — Phase status updated

**`IMPLEMENTATION_PHASES_V2.md`:**
- Added phase status table at the top showing all local phases (V2-1 through V2-docs) as complete
- Added new **Phase V2-S1 — Supabase / Auth MVP** section with correct recommended order
- Added new **Phase V2-S2 — EAS build and release prep** (was V2-10)
- Updated phase order summary table to reflect actual completed phases and upcoming Supabase phase
- Fixed V2-7 `CompanyUser` → `CompanyMember`
- Fixed V2-9 references: `company_users` → `company_members`, `JobOffers` → `Offers`, `TechnicianDocuments` → `Documents`, removed `expire_job_offers`

**`HANDOFF_SUMMARY.md`:**
- Updated `As of` date: 2026-05-24 → 2026-05-27
- Updated current state: "V2-10 complete" → "V2-13 + docs cleanup complete"
- Replaced "Next phase: V2-10 — Supabase migration" with "Next phase: V2-S1 — Supabase / Auth MVP"
- Added V2-11, V2-12, V2-13, V2-docs rows to completed phases table
- Fixed stale "company_users" reference in V2-S1 order list

---

## Files modified

| File | Changes |
|------|---------|
| `CLAUDE.md` | Removed V1 doc references; added HANDOFF_SUMMARY.md to source-of-truth list |
| `docs/SUPABASE_PLAN_V2.md` | Table names, FK direction, status enum, requirements arrays, edge functions restructure, notifications restructure, migration path update |
| `docs/TYPESCRIPT_TYPES_V2.md` | Document interface: `reviewedAt`/`rejectionReason` |
| `docs/MIGRATION_FROM_DEMO_TO_V2.md` | Document field mapping: `reviewed_at`/`rejection_reason` |
| `docs/DATA_MODEL_V2.md` | Email/Realtime phase references → "Future scope" |
| `docs/IMPLEMENTATION_PHASES_V2.md` | Phase status table, V2-S1 section, V2-1a/V2-7/V2-9 fixes, updated summary table |
| `docs/HANDOFF_SUMMARY.md` | Date, status, completed phases table, next-phase section |
| `docs/DOCS_CLEANUP_REPORT.md` | Created (this file) |

**Unchanged (already correct):**
- `docs/DATA_MODEL_V2.md` — entity model, naming, document fields all correct
- `docs/RLS_PLAN_V2.md` — policies, table names, document fields all correct
- `docs/SUPABASE_SCHEMA_V2.sql` — SQL schema correct throughout
- `docs/USER_FLOWS_V2.md` — flows correct
- `docs/PRODUCT_CONTEXT_V2.md` — product definition correct
- All QA/report docs — historical records, no changes needed

---

## Final source-of-truth docs

| File | Role |
|------|------|
| `docs/PRODUCT_CONTEXT_V2.md` | Product definition, roles, MVP goal |
| `docs/DATA_MODEL_V2.md` | Entities, privacy rules, offer visibility policy, matching |
| `docs/TYPESCRIPT_TYPES_V2.md` | Canonical TypeScript types |
| `docs/USER_FLOWS_V2.md` | User-facing flows |
| `docs/SUPABASE_PLAN_V2.md` | Supabase migration target — tables, RLS summary, edge functions, migration order |
| `docs/SUPABASE_SCHEMA_V2.sql` | Full Postgres schema |
| `docs/RLS_PLAN_V2.md` | Complete RLS policies with SQL |
| `docs/IMPLEMENTATION_PHASES_V2.md` | Phase status and next phase definition |
| `docs/MIGRATION_FROM_DEMO_TO_V2.md` | V1→V2 field mapping |
| `docs/HANDOFF_SUMMARY.md` | App state snapshot, routes, seed counts, V1 compat table |

---

## Remaining documentation risks

All critical inconsistencies are resolved. Minor items that remain as known, accepted debt:

| Item | Status |
|------|--------|
| `SUPABASE_PLAN_V2.md` uses camelCase column names; `SUPABASE_SCHEMA_V2.sql` uses snake_case | Accepted — plan doc is a design reference, SQL is authoritative for actual schema |
| `HANDOFF_SUMMARY.md` V1 compat table references `company/profile` using old `Company` shape | Acceptable — this is intentional documentation of remaining V1 compat that must exist until those screens are migrated during V2-S1 |
| QA reports (V2_2 through V2_13) may reference old phase numbering | Accepted — historical records, not consulted for implementation |

---

## Ready for Supabase/Auth planning?

**Yes.** All V2 source-of-truth documentation is now internally consistent, uses correct naming, reflects the simple MVP document model, and has future scope clearly separated from Phase 1 requirements.

The Supabase migration can start from `docs/SUPABASE_PLAN_V2.md` (table definitions + migration order), `docs/SUPABASE_SCHEMA_V2.sql` (SQL to run), and `docs/RLS_PLAN_V2.md` (policies to apply).
