# V2-S0B H5 — Company Document Access (Verified Only) Report

**Date:** 2026-05-31  
**Finding:** H5 — Some docs stated companies could see all document statuses after acceptance. The correct MVP rule is that companies see only admin-verified documents (status = `verified`).  
**Status:** Resolved. The local code was already correct. Docs and UI copy updated to match the rule.

---

## 1. Decision Summary

**Final MVP rule:**

| Actor | What they see |
|-------|-------------|
| Technician | All own documents, all statuses (including rejection_reason) |
| Admin | All documents, all statuses |
| Company — before accepted | No documents |
| Company — after accepted | Only documents with `status = 'verified'` |

`documentsUnlocked = true` means the company may access **eligible** documents — not every document row. For MVP, eligible = `status = 'verified'`.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/repositories/v2/documentRepositoryV2.ts` | `getForTechnician()` returns all docs (technician/admin). `getVerifiedForTechnician()` returns `status='verified'` only. Both exist and are correct. |
| `src/repositories/v2/technicianRepositoryV2.ts` — `getViewForCompany()` | Uses `documentRepositoryV2.getVerifiedForTechnician(id)` ✅ — already correct |
| `src/state/useCompanyDashboard.ts` — `buildTechnicianMapV2()` | Uses `documentRepositoryV2.getVerifiedForTechnician(techId)` ✅ — already correct |
| `src/utils/privacyV2.ts` — `getUnlockedTechnicianView()` | Pure function that passes through whatever `documents` array is given. All callers already pass verified-only for company contexts. Added JSDoc contract note. |
| `app/company/applications/[id].tsx` | Calls `technicianRepositoryV2.getViewForCompany()` which already returns verified-only. Some copy strings said "documents" without "verified only" — **fixed**. |
| `app/company/chats/[id].tsx` | No document display. ✅ Not affected. |
| `app/company/search.tsx` | No document display. ✅ Not affected. |
| `src/types/document.ts` | No change needed. |
| `src/types/privacy.ts` | No change needed. `UnlockedTechnicianView.documents` is typed as `Document[]` — filtering is the caller's responsibility. |

---

## 3. Code Was Already Correct

All company-facing document access paths already used `documentRepositoryV2.getVerifiedForTechnician()`:

```
technicianRepositoryV2.getViewForCompany()
  └── documentRepositoryV2.getVerifiedForTechnician(id)  ✅

useCompanyDashboard.buildTechnicianMapV2()
  └── documentRepositoryV2.getVerifiedForTechnician(techId)  ✅
```

No repository changes were required. The fix was entirely documentation and UI copy.

---

## 4. Files Modified

### Code

| File | Change |
|------|--------|
| `src/utils/privacyV2.ts` | Added JSDoc contract note to `getUnlockedTechnicianView()` — documents parameter must be pre-filtered to verified-only for company-facing calls |
| `app/company/applications/[id].tsx` | Fixed 4 copy strings to say "admin-verified documents" instead of generic "documents" |

**Specific copy changes in `app/company/applications/[id].tsx`:**

| Before | After |
|--------|-------|
| "Private contact details and documents are available." | "Private contact details and admin-verified documents are available." |
| "Unlocked after acceptance." (Documents section sub) | "Admin-verified documents only." |
| "Identity and documents are unlocked. Chat is available for direct coordination." | "Identity unlocked. Admin-verified documents are available. Chat is open for direct coordination." |
| "This will unlock the technician identity and documents, then open chat access." | "This will unlock the technician identity and admin-verified documents, then open chat access." |

### Docs

| File | Change |
|------|--------|
| `docs/USER_FLOWS_V2.md` | Fixed acceptance flow steps §6 and §8; rewrote §11 Document unlock flow with role-visibility table |
| `docs/RLS_PLAN_V2.md` | Updated `docs_select_company` SQL policy to add `AND documents.status = 'verified'`; updated section intro; updated summary matrix entry |
| `docs/SUPABASE_PLAN_V2.md` | Updated documents RLS entry to say "only verified documents" |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Updated 4 locations: Flow B final state, Privacy section "After acceptance", §10 document access rule, RLS summary table |
| `docs/DATA_MODEL_V2.md` | Updated "What companies see after acceptance" section |

---

## 5. Technician and Admin Document Views

These are **unchanged**:

- `documentRepositoryV2.getForTechnician()` — returns all documents (all statuses). Used by technician profile screen.
- `documentRepositoryV2.getAll()` — returns all documents (all statuses). Used by admin documents screen.
- Admin `updateStatus()` — can set any status. Unchanged.

---

## 6. Future Supabase RLS Note

The `docs_select_company` policy in `RLS_PLAN_V2.md` now includes `AND documents.status = 'verified'`.

Complete Supabase company document access requirements:
1. `auth_role() = 'company_user'` — must be a company user
2. `is_active_user()` — account not blocked/suspended
3. `documents.status = 'verified'` — **only verified documents**
4. An accepted offer record exists between this company and the technician (`documents_unlocked = true`)

The storage bucket policy for `technician-documents` relies on `offer_accepted_between()` for row access. In Supabase, document file access should also be restricted to verified-status documents via signed URL generation logic (sign URLs only for verified documents, check at generation time).

---

## 7. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| A future caller of `getUnlockedTechnicianView()` passes all documents | JSDoc contract note added; function signature is `Document[]` so callers must pass the right list |
| Supabase storage bucket policy doesn't filter by `status = 'verified'` | Storage policy in `RLS_PLAN_V2.md` grants access if `documents_unlocked = true` — signed URL generation logic must also check `status = 'verified'` before generating. Documented in §6 above. |
| Admin review screen shows company users a badge that says doc status is not verified | Company unlocked view only receives verified docs, so `doc.status === 'verified'` badge code is always triggered. Fallback badge tone code is now dead but harmless. |

---

## 8. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Company unlocked view returns only verified documents | ✅ PASS — code already used `getVerifiedForTechnician()` |
| 2 | Technician/admin document views unchanged | ✅ PASS — `getForTechnician()` and admin paths untouched |
| 3 | UI copy does not imply all documents are visible to company | ✅ PASS — 4 strings updated |
| 4 | Docs clearly state verified-only company document access | ✅ PASS — 5 docs updated |
| 5 | Future Supabase RLS rule documented | ✅ PASS — `docs_select_company` updated with `status = 'verified'` |
| 6 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 7 | `node scripts/validateSeeds.js` passes | ✅ PASS — 0 errors, 0 warnings |
| 8 | `npx expo export --platform web` builds all routes | ✅ PASS — 36 routes exported |

**H5 is fully resolved.**
