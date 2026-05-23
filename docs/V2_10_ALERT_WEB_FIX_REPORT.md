# V2-10 Alert Web Fix Report

**Date:** 2026-05-23  
**Phase:** V2-10 bug fix — Alert.alert callback no-op on Expo Web

---

## Root cause

`Alert.alert` on Expo Web maps to `window.confirm()`, which only supports a synchronous OK/Cancel dialog and ignores any button array callbacks passed to it. Both `handleAccept` and `handleReject` in the two affected screens had their actual repository calls (`updateStatus()`) inside `Alert.alert` button callbacks. On web those callbacks never fired, so `updateStatus()` was never called, and status never changed.

The screens appeared to work (buttons responded visually) but the confirmation step was silently swallowed.

---

## Files changed

| File | Change |
|---|---|
| `app/technician/direct-offers/[id].tsx` | Replaced Alert-based confirmation with Modal + inline error |
| `app/company/applications/[id].tsx` | Replaced Alert-based confirmation with Modal + inline error |

---

## Changes per file

### Pattern applied (identical in both files)

1. **Removed** `Alert` from React Native imports; added `Modal`.
2. **Added state:**
   - `confirmAction: 'accept' | 'reject' | null` — which action is pending confirmation
   - `actionError: string | null` — inline error shown in the screen when updateStatus fails
3. **Changed** `handleAccept` and `handleReject` from `async` functions calling `Alert.alert` to synchronous functions that set `confirmAction` state.
4. **Added** `doConfirmAction()`:
   - Captures `confirmAction` into a local variable before clearing it (avoids stale closure)
   - Closes the modal immediately (`setConfirmAction(null)`)
   - Calls `updateStatus()` with the correct target status
   - Handles `null` return (record not found) as a visible error, not a silent failure
   - Catches thrown errors and shows them inline
   - Calls `load()` on success to refresh all derived state (status, chatRoom, techView)
5. **Added** inline `{actionError && ...}` error block rendered above the action buttons.
6. **Added** `Modal` component rendered outside `ScrollView` but inside `SafeAreaView`:
   - Title and body text differ between accept and reject
   - Confirm button: green for accept, red for reject
   - Cancel button closes the modal without calling `updateStatus`
7. **Added** `errorNote` / `errorNoteText` styles and a `modalStyles` StyleSheet.

Repository logic is unchanged. `updateStatus()` in both `offerRequestRepository` and `offerApplicationRepository` correctly handles:
- `accepted` → sets `identityRevealed = true`, `documentsUnlocked = true`, calls `chatRepository.getOrCreateRoom()`
- `rejected` → keeps locked, no chat room created

No identity or chat room management was added to the screen layer.

---

## Modal content

### Technician direct offer

| Action | Title | Body |
|---|---|---|
| Accept | "Accept direct offer?" | "This will unlock your identity and documents for the company and open a chat." |
| Reject | "Reject direct offer?" | "The company will be notified. Your identity and documents will remain locked." |

### Company application

| Action | Title | Body |
|---|---|---|
| Accept | "Accept application?" | "This will unlock the technician identity/documents and open a chat." |
| Reject | "Reject application?" | "The technician will remain locked and no chat will be created." |

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Manual tests

Reset demo data before each test sequence.

### Technician direct offer

1. Press **Reset demo data** on home screen. Reload browser.
2. Go to Technician → Direct Offers → open pending offer (oreq-001)
3. Click **Accept offer** → confirmation modal appears
4. Click **Confirm accept** → modal closes, spinner shows briefly, status updates to "Accepted", "Open chat →" button appears
5. Tap "Open chat →" → chat thread opens
6. Press **Reset demo data** again. Reload.
7. Repeat steps 2–3, click **Confirm reject** → status updates to "Declined", no chat button

### Company application

1. Press **Reset demo data** on home screen. Reload browser.
2. Go to Company → Applications → open pending application (oapp-009, tech-005)
3. Click **Accept application** → confirmation modal appears
4. Click **Confirm accept** → modal closes, status updates to "Accepted", technician identity/documents unlock, "Open chat →" button appears
5. Tap "Open chat →" → chat thread opens
6. Press **Reset demo data** again. Reload.
7. Repeat steps 2–3, click **Confirm reject** → status updates to "Rejected", identity/documents remain locked, no chat button

---

## Alert.alert remaining in these files

**No.** `Alert` has been removed from the imports of both files. The confirmation flows are entirely Modal-based. `Alert.alert` is no longer called anywhere in `app/technician/direct-offers/[id].tsx` or `app/company/applications/[id].tsx`.

---

## Does accept/reject work on Expo Web

**Yes.** The Modal renders synchronously via React Native's portal mechanism (react-native-web), which works correctly on web. Button callbacks are React event handlers and are not subject to the `window.confirm` limitation. `updateStatus()` is now called directly from `doConfirmAction()` with no intermediate Alert layer.

---

## Remaining risks

| Risk | Description |
|---|---|
| Load() race on slow devices | If `load()` takes a long time after updateStatus, the user sees a spinner but no progress indicator in the screen. Acceptable for demo. |
| Modal backdrop not dismissible on web via Escape key on all browsers | `onRequestClose` handles Android back button; Escape on web may vary by browser. Cancel button is always available. |
| Repository `updateStatus` still returns null silently for missing IDs | The screen now catches this and shows an error, but root cause (bad ID) should not occur in normal flow. |
