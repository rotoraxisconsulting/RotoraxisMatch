# V2-10 Pre-flight Fixes Report

**Date:** 2026-05-23  
**Phase:** V2-10 pre-flight — 7 issues diagnosed and fixed before Supabase migration

---

## Summary

Seven issues were identified during manual testing after V2-9 QA. All have been fixed. Root causes split across: repository bug (1), seed data gap (1), stale AsyncStorage (shared fix), multi-button Alert web incompatibility (2 screens), and V1/V2 type value mismatch (1).

---

## Issues fixed

### Fix 1 — Reset Demo Data button

**Root cause:** `localDatabase.initializeFromSeeds()` is gated by `db:v2:initialized`. Any user who ran the app before a given seed phase never receives updated seed data. This caused Issues 2, 3, and 4.

**Fix:** Added a "Reset demo data" button to the home screen (`app/index.tsx`). It calls `localDatabase.resetV2Data()` which wipes all V2 AsyncStorage keys and re-seeds from current JSON files. After reset the user navigates to their role screen to see fresh data. Button is styled in warning amber, clearly labelled as demo-only.

**Files modified:**
- `app/index.tsx` — added `localDatabase` import, `resetting`/`resetDone` state, `handleResetDemoData()`, reset button JSX and styles

---

### Fix 2 — offerRepository.updateStatus() visible sync

**Root cause:** `updateStatus()` updated `status` but never updated `visible`. Offers published via the UI (draft → published) retained `visible: false`, making them invisible to the technician browse feed. `getPublished()` filters on both `status === 'published' && visible`.

**Fix:** Added `visible: status === 'published'` to the updated offer object in `updateStatus()`. `visible` is now a derived field that stays in sync with `status` on every transition.

**Files modified:**
- `src/repositories/v2/offerRepository.ts` — `updateStatus()` line 68

---

### Fix 3 — Add pending application seed for comp-001

**Root cause:** The only seeded `OfferApplication` for comp-001 was `oapp-003` with `status: 'accepted'`. Accept/Reject buttons are conditioned on `app.status === 'pending'`, so the buttons never rendered for the demo company.

**Fix:** Added `oapp-009` — a pending application from tech-005 for offer-002 (comp-001's B1.1/C Base Maintenance Engineer role). Seed passes all validateSeeds.js invariants.

**Files modified:**
- `src/data/seeds/offerApplications.json` — added oapp-009 (pending, tech-005, offer-002, comp-001)

---

### Fix 4 — Replace multi-button Alerts in Company Team screen

**Root cause:** React Native `Alert.alert` maps to `window.confirm()` on web, which only supports 2-button dialogs (OK / Cancel). The team screen used:
- `handleAddMember`: 4-button Alert (Admin / Recruiter / Viewer / Cancel) — broken on web
- `handleChangeRole`: 3-button Alert (2 roles + Cancel) — broken on web
- `handleRemoveMember`: 2-button Alert — functionally worked but inconsistent

**Fix:** Replaced all three with React Native `Modal` components:
- **Add Member modal:** lists all 3 roles (Admin / Recruiter / Viewer) as tap targets + Cancel
- **Change Role modal:** lists the other 2 roles for the selected member + Cancel
- **Remove Member modal:** confirmation with destructive "Remove" button + Cancel
- All guards preserved: `canManageCompanyMembers`, last-admin guard, self-remove guard
- Repository logic (`doAddMember`, `doChangeRole`, `doRemoveMember`) unchanged

**Files modified:**
- `app/company/team.tsx` — added `Modal` import, 3 modal state vars, replaced 3 handlers, added 3 modal JSX blocks, added `modalStyles`

---

### Fix 5 — Admin company type filters

**Root cause:** `TYPE_OPTIONS` in the admin companies screen used V1 lowercase type keys (`'mro'`, `'operator'`, `'contractor'`, `'recruiter'`). Runtime company data (via `v2CompanyToV1` adapter) holds V2 `CompanyTypeCode` values (`'MRO'`, `'airline'`, `'recruitment_agency'`, `'helicopter_operator'`, `'other'`). The filter `c.companyType === 'mro'` never matched `'MRO'`; only `'airline'` worked by coincidence.

**Fix:**
- Updated `TYPE_OPTIONS` keys to V2 values: `'MRO'`, `'airline'`, `'recruitment_agency'`, `'helicopter_operator'`, `'other'`; removed V1-only `'operator'` / `'contractor'` / `'recruiter'`
- Changed `TypeFilter` type to a V2-value literal union
- Changed comparison to `(c.companyType as string) === type` to avoid TypeScript union mismatch error (runtime values are V2, but `Company.companyType` is typed as V1)

**Files modified:**
- `app/admin/companies.tsx` — updated import, `TypeFilter`, `TYPE_OPTIONS`, filter cast

---

### Fix 6 — Admin offer moderation actions

**Root cause:** `handleModerate()` used `Alert.alert` with multiple action buttons (2 next statuses + Cancel = 3 buttons minimum). `window.confirm` on web collapses to OK/Cancel, making it impossible to choose between available status transitions.

**Fix:** Removed `handleModerate()` and the multi-button Alert entirely. `OfferCard` now renders inline action buttons directly on the card — one button per available next status. The card becomes a `View` instead of a `TouchableOpacity`. Actions:
- draft: `→ Published` (green), `→ Expired` (red)
- published: `→ Closed` (amber), `→ Expired` (red)
- closed: `→ Expired` (red)
- expired: no buttons, "No actions available" note

Button colors match existing `STATUS_COLORS` (success / warning / error). Error handling via a 2-button `Alert` is preserved.

**Files modified:**
- `app/admin/offers.tsx` — removed `handleModerate` + `doUpdate`, added `handleAction`, rewrote `OfferCard` component, updated `FlatList` render prop, updated styles

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors; OfferApplications: 9 |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Files modified

| File | Fix |
|---|---|
| `app/index.tsx` | Fix 1 — Reset demo data button |
| `src/repositories/v2/offerRepository.ts` | Fix 2 — visible sync in updateStatus |
| `src/data/seeds/offerApplications.json` | Fix 3 — oapp-009 pending for comp-001 |
| `app/company/team.tsx` | Fix 4 — Modal-based team management actions |
| `app/admin/companies.tsx` | Fix 5 — V2 company type filter values |
| `app/admin/offers.tsx` | Fix 6 — Inline offer moderation buttons |

---

## Manual smoke tests required

Reset demo data before testing any of the following:

1. **Reset Demo Data button** — press on home screen; button shows loading then "✓ Demo data reset"; navigate to company/technician role
2. **Chats appear** — after reset, company and technician chat lists show 2 rooms each for the demo users
3. **Technician accept/reject direct offer** — go to Technician > Direct Offers; oreq-001 (pending) should show Accept / Reject buttons
4. **Company accept/reject application** — go to Company > Applications; oapp-009 (pending, from tech-005) should show Accept / Reject
5. **Offer visible after publish** — create a new draft offer, publish it; it must appear in Technician > Browse Offers
6. **Close offer** — close a published offer; it must disappear from Technician browse feed
7. **Add team member** — Company > Team > "Add demo member" button opens modal with role choices; add a Viewer; appears in list
8. **Change role** — tap "Change role" on a member; modal shows available roles; select one; badge updates
9. **Remove member** — tap "Remove" on a non-admin member; confirmation modal; member removed
10. **Last-admin guard** — Remove button on last admin shows as disabled
11. **Admin company type filters** — Admin > Companies; MRO / Recruitment Agency / Helicopter Operator filters correctly narrow results
12. **Admin offer moderation** — Admin > Offers; each card with available transitions shows inline action buttons; tapping sets new status
13. **Existing flows unaffected** — offer creation, technician application, privacy gate, chat thread, admin metrics

---

## Reset required before manual testing

**Yes.** Changes to seed files (`offerApplications.json`) and AsyncStorage-backed logic (`offerRepository.updateStatus`) require a fresh AsyncStorage state. Press "Reset demo data" on the home screen before running smoke tests.

---

## Remaining risks (pre-Supabase)

These are unchanged from V2-9 and not in scope for this phase:

| Risk | Description |
|---|---|
| Permission guards are frontend-only | No RLS yet |
| Chat is not real-time | AsyncStorage only |
| Offer expiry not automated | No scheduled edge function |
| Single demo session per role | DEMO_* constants replace real auth |
| Acceptance side-effect is simulated locally | Must become `on_offer_accepted` edge function in V2-10 |

---

## Ready for V2-10 Supabase migration

Yes. All 7 pre-flight issues are resolved. The local demo is clean. V2-10 (Supabase migration) can proceed.
