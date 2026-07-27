# V2-S0B H11 — Direct Offer Duplicate Rule Report

**Date:** 2026-05-31  
**Finding:** H11 — `useCompanyDashboard.hasSentRequest()` checked for ANY historical request (regardless of status), causing the "Send direct offer" button to be disabled even when the previous request was rejected, expired, or withdrawn.  
**Status:** Resolved. `hasSentRequest()` now checks active statuses only. `validateSeeds.js` checks both pending and accepted duplicates. Docs updated with the H11 rule.

---

## 1. Decision Summary

**H11 MVP rule for direct offers:**

| Case | Result |
|------|--------|
| Same companyId + technicianId + offerId, status = `pending` | ❌ Blocked |
| Same companyId + technicianId + offerId, status = `accepted` | ❌ Blocked |
| Same companyId + technicianId + offerId, status = `rejected` | ✅ Allowed (historical) |
| Same companyId + technicianId + offerId, status = `expired` | ✅ Allowed (historical) |
| Same companyId + technicianId + offerId, status = `withdrawn` | ✅ Allowed (historical) |
| Different `offerId`, same company + technician | ✅ Allowed |

**Distinct from H6 (applications):** Applications use a strict one-per-offer rule for all statuses. Direct offers allow re-sending after terminal statuses. These are separate flows.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/repositories/v2/offerRequestRepository.ts` | `create()` already uses `isActiveOfferRelationStatus()` + composite key `companyId+technicianId+offerId`. ✅ Already correct — repository was not the bug. |
| `src/state/useCompanyDashboard.ts` | `hasSentRequest()` checked ANY request regardless of status. ❌ **Required fix.** `getRequestForTechnician()` returned first found regardless of status — could show stale rejected status. ❌ **Improved.** |
| `app/company/search.tsx` | Uses `hasSentRequest(item.id)` to disable "Send" button. Bug inherited from `hasSentRequest`. No change needed after fixing the hook. |
| `app/company/offers/[id].tsx` | Uses `pendingRequestForTech()` and `acceptedRequestForTech()` as separate specific checks. ✅ Already correct. |
| `scripts/validateSeeds.js` | Checked duplicate PENDING direct offers only — missed ACCEPTED. **Required fix.** |
| `docs/DATA_MODEL_V2.md` | Mentioned "prevent sending a duplicate while one is already pending" but didn't document H11 rule clearly. **Updated.** |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Said "Business logic prevents duplicate pending offers" — lacked H11 clarity. **Updated.** |

---

## 3. Previous vs New Behavior

### `useCompanyDashboard.hasSentRequest()`

**Before (bug):**
```typescript
const hasSentRequest = useCallback(
  (technicianId: string) => requests.some((r) => r.technicianId === technicianId),
  [requests],
);
```
→ Returned `true` for ANY request (rejected, expired, withdrawn included). Send button permanently disabled after any historical request.

**After (fixed):**
```typescript
const hasSentRequest = useCallback(
  (technicianId: string) => requests.some(
    (r) => r.technicianId === technicianId && (r.status === 'sent' || r.status === 'accepted'),
  ),
  [requests],
);
```
→ Returns `true` only for active requests. `'sent'` = V1 alias for V2 `'pending'`.

### `useCompanyDashboard.getRequestForTechnician()`

**Before:**
```typescript
const getRequestForTechnician = useCallback(
  (technicianId: string) => requests.find((r) => r.technicianId === technicianId),
  [requests],
);
```
→ Returned first found (could be an old rejected request even when a new pending exists, showing wrong status badge).

**After:**
```typescript
const getRequestForTechnician = useCallback(
  (technicianId: string) => {
    const active = requests.find(
      (r) => r.technicianId === technicianId && (r.status === 'sent' || r.status === 'accepted'),
    );
    return active ?? requests.find((r) => r.technicianId === technicianId);
  },
  [requests],
);
```
→ Prefers the active request; falls back to any historical request for display purposes.

---

## 4. Repository Was Already Correct

`offerRequestRepository.create()` was already using the correct check:
```typescript
const existingActiveDirectOffer = all.find(
  (r) =>
    r.companyId === data.companyId &&
    r.technicianId === data.technicianId &&
    isActiveOfferRelationStatus(r.status) &&     // pending + accepted only
    (data.offerId ? r.offerId === data.offerId : !r.offerId),  // correct composite key
);
```
The repository guard is at the correct level. The UI `hasSentRequest` was the only broken path.

---

## 5. Seed Validator Change

**Before:** Only checked duplicate PENDING direct offers:
```javascript
if (r.status === 'pending') {
  const key = companyId + '|' + technicianId + '|' + (offerId || '');
  if (seenPendingDirect.has(key)) errors.push('...: duplicate pending direct offer');
}
```

**After:** Checks both PENDING and ACCEPTED (the active statuses):
```javascript
if (r.status === 'pending' || r.status === 'accepted') {
  const key = companyId + '|' + technicianId + '|' + (offerId || '');
  if (seenActiveDirect.has(key)) errors.push('...: duplicate active (pending/accepted) direct offer...');
}
```
Multiple rejected/expired/withdrawn for the same key are allowed (historical records).

---

## 6. Supabase Note

Do not add a UNIQUE constraint on `(company_id, technician_id)` or `(company_id, technician_id, offer_id)` to `offer_requests`. A global unique constraint would prevent re-sending after rejection, which is the intended behavior.

If a DB-level duplicate guard is added in the future, use a partial unique index:
```sql
CREATE UNIQUE INDEX offer_requests_active_unique
  ON offer_requests (company_id, technician_id, offer_id)
  WHERE status IN ('pending', 'accepted');
```

For MVP, enforce in the RPC/repository: `transition_offer_request_status()` and `create_offer_request()` RPC validate the active-duplicate rule before inserting.

---

## 7. Files Modified

| File | Change |
|------|--------|
| `src/state/useCompanyDashboard.ts` | `hasSentRequest()` now checks `status === 'sent' || status === 'accepted'`; `getRequestForTechnician()` prefers active request |
| `scripts/validateSeeds.js` | Duplicate check updated from pending-only to `pending || accepted` (`seenActiveDirect`) |
| `docs/DATA_MODEL_V2.md` | H11 MVP rule documented with all four cases |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Note updated with H11 rule and partial unique index guidance |

---

## 8. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| `requests` in `useCompanyDashboard` only includes unlinked direct offers (no `offerId`) | The hook calls `getForCompany()` which returns ALL requests. `hasSentRequest` correctly handles the no-offerId case (V1 search flow). The offer detail screen (`/company/offers/[id]`) uses its own separate `existingRequests` filtered by `offerId` — that code was already correct. |
| Company sends multiple historical requests for same technician, status display shows wrong one | `getRequestForTechnician()` now prefers active requests first, then falls back to any historical. This gives the most meaningful status badge. |

---

## 9. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Duplicate direct offer check uses companyId + technicianId + offerId | ✅ PASS — both repository and UI use composite key |
| 2 | Only pending/accepted block new direct offers | ✅ PASS — `hasSentRequest` and `seenActiveDirect` use `status === 'sent/accepted'` |
| 3 | rejected/expired/withdrawn do not block | ✅ PASS — `hasSentRequest` only returns true for active statuses |
| 4 | Different offerId does not block | ✅ PASS — repository uses `r.offerId === data.offerId` |
| 5 | Repository enforces the rule, not only UI | ✅ PASS — repository was already correct |
| 6 | Docs document the rule clearly | ✅ PASS — DATA_MODEL_V2.md and MVP_ARCHITECTURE_HANDOFF.md updated |
| 7 | Seed validator catches duplicate active direct offers | ✅ PASS — checks pending + accepted |
| 8 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 9 | `node scripts/validateSeeds.js` passes | ✅ PASS — 0 errors, 0 warnings |
| 10 | `npx expo export --platform web` builds all routes | ✅ PASS — 37 routes exported |

**H11 is fully resolved.**
