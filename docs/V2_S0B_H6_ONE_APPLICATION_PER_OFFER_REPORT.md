# V2-S0B H6 — One Application Per Offer Report

**Date:** 2026-05-31  
**Finding:** H6 — Repository and UI allowed reapplication after withdrawn/expired. Seed validator only caught duplicate pending applications, not all statuses. Copy said "You can apply again later."  
**Status:** Resolved. Repository, UI, and validator all enforce one application per technician per offer regardless of status.

---

## 1. Decision Summary

**Final MVP rule:**

- One `offer_application` per `technicianId + offerId`, regardless of status.
- Applies to all statuses: pending, accepted, rejected, expired, withdrawn.
- Reapplication is out of scope for MVP.
- The existing application row is the permanent historical record.
- Supabase enforces this via `UNIQUE (technician_id, offer_id)` on `offer_applications`.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/repositories/v2/offerApplicationRepository.ts` | `create()` blocked only active statuses (`pending + accepted`). Withdrawn/rejected/expired could be duplicated. **Required fix.** |
| `app/technician/offers/[id].tsx` | `canApply` allowed reapply when `existingApp.status === 'withdrawn'` or `'expired'`. Withdraw dialog said "You can apply again later." **Required fix.** |
| `app/technician/offers/index.tsx` | Shows app status badge on offer cards; no Apply button on list. ✅ No change needed. |
| `src/utils/offerRelationStateMachine.ts` | Terminal statuses correctly defined. `isActiveOfferRelationStatus()` correctly returns true for pending+accepted only. ✅ No change needed. |
| `scripts/validateSeeds.js` | Only checked duplicate PENDING applications via `seenPendingApp`. **Required fix.** |
| `src/data/seeds/offerApplications.json` | ✅ No duplicate technicianId+offerId pairs in seeds. No seed changes needed. |
| `docs/DATA_MODEL_V2.md` | Unique constraint stated but without "regardless of status" / "no reapply" note. **Updated.** |
| `docs/USER_FLOWS_V2.md` | Apply step didn't mention one-application rule. **Updated.** |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Unique constraint stated without no-reapply note. **Updated.** |
| `docs/SUPABASE_SCHEMA_V2.sql` | UNIQUE constraint present with a short comment. **Extended comment.** |

---

## 3. Repository Behavior

**Before:**
```typescript
const existingActiveApplication = all.find(
  (a) => a.technicianId === data.technicianId &&
         a.offerId === data.offerId &&
         isActiveOfferRelationStatus(a.status),  // only pending + accepted
);
if (existingActiveApplication) throw new Error('You already have an active application for this offer.');
```
→ Allowed creating a second application after withdrawn/rejected/expired.

**After:**
```typescript
// Block any duplicate regardless of status — one application per technician per offer.
// Supabase equivalent: UNIQUE(technician_id, offer_id) on offer_applications.
const existingApplication = all.find(
  (a) => a.technicianId === data.technicianId && a.offerId === data.offerId,
);
if (existingApplication) throw new Error('You have already applied to this offer.');
```
→ Blocks creation if any application exists for the same technician + offer, regardless of status.

---

## 4. UI Behavior

**`canApply` logic — before:**
```typescript
const canApply = !activeDirectOffer && (!existingApp || existingApp.status === 'withdrawn' || existingApp.status === 'expired');
const activeApp = existingApp && existingApp.status !== 'withdrawn' && existingApp.status !== 'expired';
```
→ Apply button reappeared after withdrawal or expiry.

**`canApply` logic — after:**
```typescript
// One application per technician per offer — never allow a second application regardless of status.
const canApply = !activeDirectOffer && !existingApp;
const activeApp = !!existingApp;
```
→ Apply button never appears once any application exists.

**Side effect:** `statusInfo = activeApp ? appStatusInfo(existingApp.status) : null` now evaluates to a non-null badge for ALL existing application statuses (including withdrawn/expired), so the "Application status" card correctly shows "Withdrawn" or "Expired" badges instead of being empty.

**Withdraw dialog copy — before:**
```
'You can apply again later.'
```

**Withdraw dialog copy — after:**
```
'This will cancel your application. This cannot be undone.'
```

---

## 5. Seed Validator Change

**Before:** Only caught duplicate PENDING applications:
```javascript
const seenPendingApp = new Set();
...
if (a.status === 'pending') {
  const key = a.technicianId + '|' + a.offerId;
  if (seenPendingApp.has(key)) errors.push('oapp ...: duplicate pending application for tech+offer');
}
```

**After:** Catches duplicate applications for ANY status:
```javascript
// One application per technician per offer regardless of status
const seenAppPairs = new Set();
...
const appKey = a.technicianId + '|' + a.offerId;
if (seenAppPairs.has(appKey)) errors.push('oapp ...: duplicate application for same technicianId+offerId (status=...)');
seenAppPairs.add(appKey);
```

---

## 6. Files Modified

| File | Change |
|------|--------|
| `src/repositories/v2/offerApplicationRepository.ts` | `create()` now blocks all duplicate applications regardless of status |
| `app/technician/offers/[id].tsx` | `canApply` and `activeApp` logic fixed; withdraw dialog copy no longer says "apply again later" |
| `scripts/validateSeeds.js` | Duplicate check upgraded from pending-only to all-statuses |
| `docs/USER_FLOWS_V2.md` | One-application rule added to apply step §5 |
| `docs/DATA_MODEL_V2.md` | Unique constraint note extended: "regardless of status, reapplication out of scope" |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Same note added |
| `docs/SUPABASE_SCHEMA_V2.sql` | UNIQUE constraint comment extended |

---

## 7. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| A user who withdrew might expect to reapply | Copy now says "This cannot be undone." when withdrawing; status "Withdrawn" is shown permanently on the offer |
| Seeds from V2-3 QA report still say "Withdrawn applications reopen the apply flow — correct by design" | This is a historical QA report (V2_3_QA_REPORT.md) — it described the old behavior, not a requirement. The H6 decision supersedes it. Not worth editing QA reports. |
| The `offerRequestRepository` (direct offers) still allows resending after rejection | This is intentional by design — companies may resend a direct offer to the same technician after rejection. The unique constraint applies to applications only. |

---

## 8. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Repository prevents duplicate application for same technicianId + offerId | ✅ PASS — all statuses blocked |
| 2 | UI never allows reapply to same offer | ✅ PASS — `canApply = !existingApp` |
| 3 | Copy no longer says user can apply again later | ✅ PASS — withdraw dialog copy updated |
| 4 | SQL UNIQUE(technician_id, offer_id) matches local behavior | ✅ PASS — constraint comment updated to clarify |
| 5 | Seed validator catches duplicate applications (any status) | ✅ PASS — `seenAppPairs` checks all statuses |
| 6 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 7 | `node scripts/validateSeeds.js` passes with zero errors | ✅ PASS — 0 errors, 0 warnings |
| 8 | `npx expo export --platform web` builds all routes | ✅ PASS — 36 routes exported |

**H6 is fully resolved.**
