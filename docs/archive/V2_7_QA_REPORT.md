# V2-7 QA Report — Multi-user Company Team Management

**Date:** 2026-05-23  
**Phase:** V2-7 — Multi-user company team management and role-based permissions

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors |
| `npx expo export --platform web` | PASS — 35 routes bundled |

---

## Routes added (1)

| Route | Description |
|---|---|
| `/company/team` | Company team screen — member list, add/change role/remove, role-gated actions |

**Total routes: 35** (was 34 after V2-6)

---

## Files created

- `src/utils/companyPermissionsV2.ts` — 7 permission helper functions
- `app/company/team.tsx` — Full team management screen (admin vs recruiter/viewer enforcement)

---

## Files modified

- `src/repositories/v2/companyRepositoryV2.ts` — Added `addMember`, `updateMemberRole`, `removeMember` with last-admin guards
- `src/state/useCompanyDashboard.ts` — Exported `DEMO_COMPANY_USER_ID`, `DEMO_COMPANY_MEMBER_ID`, `DEMO_COMPANY_MEMBER_ROLE`
- `app/company/index.tsx` — Added Team NavCard
- `app/company/chats/[id].tsx` — Import + `canSendChatMessages` check on send button; viewer note
- `app/company/applications/[id].tsx` — Import + `canReviewApplications` check on accept/reject; viewer note
- `app/company/offers/[id].tsx` — Import + `canSendDirectOffers` check on "Send direct offer"; viewer note; TODO comment for canManageOffers

---

## Repository methods added

| Method | Guard |
|---|---|
| `companyRepositoryV2.addMember(companyId, userId, role)` | Duplicate userId check |
| `companyRepositoryV2.updateMemberRole(memberId, role)` | Cannot demote last admin |
| `companyRepositoryV2.removeMember(memberId)` | Cannot remove last admin |

---

## Permission helpers (src/utils/companyPermissionsV2.ts)

| Function | admin | recruiter | viewer |
|---|---|---|---|
| `canManageCompanyMembers` | ✅ | ❌ | ❌ |
| `canManageCompanySettings` | ✅ | ❌ | ❌ |
| `canManageOffers` | ✅ | ✅ | ❌ |
| `canSendDirectOffers` | ✅ | ✅ | ❌ |
| `canReviewApplications` | ✅ | ✅ | ❌ |
| `canSendChatMessages` | ✅ | ✅ | ❌ |
| `isCompanyViewer` | ❌ | ❌ | ✅ |

---

## Demo configuration

- `DEMO_COMPANY_ID = 'comp-001'` (Delta Air Lines)
- `DEMO_COMPANY_USER_ID = 'prof-c001a'` (admin member, cm-001)
- `DEMO_COMPANY_MEMBER_ROLE = 'admin'` — all permissions granted in demo

---

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Company team screen exists | PASS |
| 2 | Company members listed with avatar, userId, role badge, date | PASS |
| 3 | Roles admin/recruiter/viewer displayed with correct badges | PASS |
| 4 | Admin can add demo member (via Alert role picker → generatee userId) | PASS |
| 5 | Admin can update member role (via Alert with remaining role options) | PASS |
| 6 | Admin can remove member (with confirmation Alert) | PASS |
| 7 | Last admin cannot be removed or demoted (repository guard + UI disabled) | PASS |
| 8 | Recruiter/viewer cannot manage team (isAdmin check in team screen) | PASS |
| 9 | Permission helpers exist in `src/utils/companyPermissionsV2.ts` | PASS |
| 10 | Permissions applied to: chat send (chats/[id]), accept/reject (applications/[id]), send direct offer (offers/[id]) | PASS |
| 11 | TypeScript check passes (0 errors) | PASS |
| 12 | App still starts — 35 routes bundled | PASS |
| 13 | No Supabase added | PASS |

---

## TODOs left for V2-9

- `canManageOffers` — edit/publish/close buttons in offers/[id] and offers/new (low risk, deferred)
- All permission checks marked with `// TODO: enforce via Supabase RLS in V2-9`
- Swap `DEMO_COMPANY_MEMBER_ROLE` constant for real auth context when Supabase Auth lands

---

## Regression check

| Screen | Status |
|---|---|
| `/company/offers/*` | Untouched except send-offer guard (admin → no behavior change) |
| `/company/applications/[id]` | Accept/reject guard added (admin → no behavior change) |
| `/company/chats/[id]` | Send guard added (admin → no behavior change) |
| `/technician/direct-offers/*` | Untouched |
| `/technician/chats/*` | Untouched |
| `/company/search` | Untouched |

---

## Issues found / fixed

- `import` statement accidentally placed mid-file in `useCompanyDashboard.ts` — moved to top immediately.
- `canManageOffers` imported but unused in `offers/[id].tsx` — replaced with TODO comment.

---

## Ready for V2-8

Yes. V2-7 is complete. Suggested next phase: V2-8 — Admin V2 (document management, offer moderation, request overview).
