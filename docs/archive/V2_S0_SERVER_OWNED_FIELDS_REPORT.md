# V2-S0 Server-Owned Fields Report

**Date:** 2026-05-29  
**Audit finding:** C2 — Future Supabase UPDATE policies must not allow the frontend to directly modify sensitive/server-owned fields.  
**Status:** Resolved via documentation and code annotations. No UI violations found in the current local demo.

---

## 1. Inspection Summary

All 12 source files (4 repositories, 2 hooks, 6 screens) were inspected for direct writes to server-owned fields. **No UI violation was found.** The codebase already follows the correct boundary:

| File | Verdict | Notes |
|------|---------|-------|
| `offerRequestRepository.ts` | ✅ CLEAN | `updateStatus()` manages `identityRevealed`, `documentsUnlocked`, chat, and activity internally |
| `offerApplicationRepository.ts` | ✅ CLEAN | Same pattern |
| `chatRepository.ts` | ✅ CLEAN | `getOrCreateRoom()` called only from repositories' `updateStatus()` |
| `activityRepository.ts` | ✅ CLEAN | `create()` called only from repository methods |
| `useCompanyDashboard.ts` | ✅ CLEAN | Calls `sendRequest()` via repository; no direct field writes |
| `useTechnicianDashboard.ts` | ✅ CLEAN | Calls `updateStatus()` via repository; profile updates use `technicianRepositoryV2.update()` for safe fields only |
| `app/company/applications/[id].tsx` | ✅ CLEAN | Calls `offerApplicationRepository.updateStatus()` only |
| `app/technician/direct-offers/[id].tsx` | ✅ CLEAN | Calls `offerRequestRepository.updateStatus()` only |
| `app/technician/offers/[id].tsx` | ✅ CLEAN | Calls `create()` and `withdraw()` only |
| `app/admin/technicians.tsx` | ✅ INTENTIONAL | Uses `updateTechnicianVerification` — admin-only write, protected by `is_admin()` RLS |
| `app/admin/companies.tsx` | ✅ INTENTIONAL | Uses `updateCompanyVerification` — same |
| `app/admin/documents.tsx` | ✅ INTENTIONAL | Uses `updateDocumentStatus` via `documentRepositoryV2.updateStatus()` — admin-only |

---

## 2. Server-Owned Fields Catalog

Fields that must never be directly written by ordinary frontend users (technician or company roles):

| Field | Table | Set by | RLS enforcement |
|-------|-------|--------|-----------------|
| `role` | `profiles` | Auth trigger on registration | Admin-only UPDATE policy after creation |
| `status` | `profiles` | Admin block/suspend flows | Admin-only; not user-editable |
| `verification_status` | `technician_profiles` | Admin manually via admin panel | `is_admin()` UPDATE policy |
| `verification_status` | `companies` | Admin manually via admin panel | `is_admin()` UPDATE policy |
| `identity_revealed` | `offer_requests` | `handle_offer_relation_status_transition()` trigger | No client UPDATE column access |
| `documents_unlocked` | `offer_requests` | Same trigger | Same |
| `identity_revealed` | `offer_applications` | Same trigger | Same |
| `documents_unlocked` | `offer_applications` | Same trigger | Same |
| `chat_rooms` (row creation) | `chat_rooms` | Same trigger (SECURITY DEFINER) | No client INSERT policy |
| `activity_events` (row creation) | `activity_events` | SECURITY DEFINER trigger functions | No client INSERT policy |

---

## 3. Local Demo vs Supabase Boundary

The local demo uses repositories as the boundary. Each repository method that triggers side effects includes a comment explaining the Supabase equivalent:

| Local method | Supabase equivalent |
|-------------|---------------------|
| `offerRequestRepository.updateStatus()` | `transition_offer_request_status(record_id, next_status)` RPC |
| `offerApplicationRepository.updateStatus()` | `transition_offer_application_status(record_id, next_status)` RPC |
| `chatRepository.getOrCreateRoom()` | Automatic: `handle_offer_relation_status_transition()` trigger |
| `activityRepository.create()` | Automatic: SECURITY DEFINER trigger function |
| `useAdminDashboard.updateTechnicianVerification()` | Direct UPDATE protected by `is_admin()` RLS policy |
| `useAdminDashboard.updateCompanyVerification()` | Same |

---

## 4. Changes Made

### Code annotations (TASK 2 + 3)

| File | Change |
|------|--------|
| `src/types/profile.ts` | JSDoc on `role` (SERVER-ASSIGNED) and `status` (SERVER-MANAGED) |
| `src/types/offerRequest.ts` | Strengthened `identityRevealed`/`documentsUnlocked` comments to name the trigger |
| `src/types/technician.ts` | JSDoc on `TechnicianProfile.verificationStatus` (ADMIN-ONLY) |
| `src/types/company.ts` | JSDoc on `CompanyProfile.verificationStatus` (ADMIN-ONLY) |
| `src/repositories/v2/offerRequestRepository.ts` | JSDoc on `updateStatus()` naming the Supabase RPC equivalent |
| `src/repositories/v2/offerApplicationRepository.ts` | JSDoc on `updateStatus()` naming the Supabase RPC equivalent |
| `src/repositories/v2/chatRepository.ts` | JSDoc on `getOrCreateRoom()` documenting it as a local trigger simulation |
| `src/repositories/v2/activityRepository.ts` | JSDoc on `create()` documenting it as a local trigger simulation |
| `src/state/useAdminDashboard.ts` | Comments explaining admin `verificationStatus` writes are intentional and RLS-protected |

### Docs updates (TASK 4 + 5)

| File | Change |
|------|--------|
| `docs/RLS_PLAN_V2.md` | Added `profiles.role`, `profiles.status`, `technician_profiles.verification_status`, `companies.verification_status` to "What frontend can write" table; added admin-write note |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Added "Server-owned fields" subsection in §7 with full field catalog table |
| `docs/SUPABASE_PLAN_V2.md` | Added "Server-owned fields" section with enforcement table and RPC/admin note |
| `docs/SUPABASE_SCHEMA_V2.sql` | Inline SQL comments on `profiles.role`, `profiles.status`, `technician_profiles.verification_status`, `companies.verification_status` |

---

## 5. RLS Design for Status Transitions

Status transitions on `offer_requests` and `offer_applications` must go through dedicated RPCs that validate the transition before writing and run all side effects in the same transaction:

```sql
-- transition_offer_request_status(record_id uuid, next_status offer_request_status)
-- transition_offer_application_status(record_id uuid, next_status offer_request_status)
```

Both RPCs call `assert_offer_relation_transition()` before modifying the row, then the `handle_offer_relation_status_transition()` BEFORE UPDATE trigger runs to set `identity_revealed`, `documents_unlocked`, and create the chat room.

The `WITH CHECK` clause on the existing RLS UPDATE policies should be tightened in a future migration to reject any client attempt to write `identity_revealed` or `documents_unlocked` directly (column-level check via trigger is the recommended approach).

---

## 6. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | No UI screen writes `identityRevealed`/`documentsUnlocked` directly | ✅ PASS |
| 2 | No UI screen creates `chat_rooms` records directly | ✅ PASS |
| 3 | No UI screen creates `activity_events` records directly | ✅ PASS |
| 4 | `offerRequestRepository.updateStatus()` has clear "RPC equivalent" annotation | ✅ PASS |
| 5 | `offerApplicationRepository.updateStatus()` has clear "RPC equivalent" annotation | ✅ PASS |
| 6 | `chatRepository.getOrCreateRoom()` has "trigger simulation" annotation | ✅ PASS |
| 7 | `activityRepository.create()` has "trigger simulation" annotation | ✅ PASS |
| 8 | `identityRevealed`/`documentsUnlocked` fields are clearly marked READ-ONLY with trigger name | ✅ PASS |
| 9 | `verificationStatus` (technician + company) is clearly marked ADMIN-ONLY | ✅ PASS |
| 10 | `profiles.role` and `profiles.status` are clearly marked SERVER-ASSIGNED/SERVER-MANAGED | ✅ PASS |
| 11 | All 4 docs updated with server-owned field constraints | ✅ PASS |
| 12 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 13 | `validateSeeds.js` passes with zero errors | ✅ PASS — 0 errors, 0 warnings |
| 14 | `expo export --platform web` builds all routes | ✅ PASS — 36 routes exported |
