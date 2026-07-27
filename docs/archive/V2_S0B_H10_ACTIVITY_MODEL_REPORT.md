# V2-S0B H10 — Activity Model / MVP Boundary Report

**Date:** 2026-05-31  
**Finding:** H10 — The activity model included `chat_message_received` as a first-class event type. Docs implied it was required for Phase 1 Supabase migration. MVP decision: marketplace events only for Phase 1; chat message activity is future scope.  
**Status:** Resolved. `chat_message_received` clearly marked as future scope throughout code and docs. Local demo keeps the mechanism untouched. MVP activity event list is explicitly defined.

---

## 1. Decision Summary

### MVP Phase 1 activity events (Supabase required)
| Event | Recipient | Trigger |
|-------|-----------|---------|
| `application_received` | Company | Technician applies |
| `application_accepted` | Technician | Company accepts |
| `application_rejected` | Technician | Company rejects |
| `direct_offer_received` | Technician | Company sends direct offer |
| `direct_offer_accepted` | Company | Technician accepts |
| `direct_offer_rejected` | Company | Technician rejects |

### Future scope (not Phase 1)
| Event | Why deferred |
|-------|-------------|
| `chat_message_received` | Requires Realtime or polling per-message read state; adds complexity without being a marketplace blocker |

### Local demo
- The local demo continues to emit `chat_message_received` for chat unread dot badges. This is intentional — removing it would break the chat UX.
- `ActivityItem` (flat record with `read: boolean`) is the local model — demo-only, not production.
- `activity_events` + `activity_reads` remain the Supabase target model.
- No notification center in MVP — red-dot badges only. Polling/manual refresh is acceptable.

---

## 2. Files Inspected

| File | Finding |
|------|---------|
| `src/types/activity.ts` | `ActivityType` included `chat_message_received` without scope annotation. Both `ActivityItem` (local demo) and `ActivityEvent`/`ActivityRead` (Supabase target) defined. **Added JSDoc.** |
| `src/repositories/v2/activityRepository.ts` | `getUnreadChatRoomIds()` and `markChatRoomRead()` handle `chat_message_received` — used by chat screens. No annotation. **Annotated as local-demo/future-scope.** |
| `src/repositories/v2/chatRepository.ts` | `sendMessage()` creates `chat_message_received` activity. No annotation. **Annotated as local-demo-only.** |
| `src/repositories/v2/offerApplicationRepository.ts` | Creates marketplace events (application_received, application_accepted, application_rejected). ✅ MVP Phase 1. No change needed. |
| `src/repositories/v2/offerRequestRepository.ts` | Creates marketplace events (direct_offer_received, direct_offer_accepted, direct_offer_rejected). ✅ MVP Phase 1. No change needed. |
| `src/data/seeds/activities.json` | 2 entries: `direct_offer_received` + `application_received`. ✅ No `chat_message_received` in seeds. |
| `app/company/index.tsx` | Uses `getUnreadCount(['chat_message_received'])` for chat badge. ✅ Keep as is — local demo works correctly. |
| `app/technician/index.tsx` | Same. ✅ Keep as is. |
| `app/company/chats/index.tsx` | Uses `getUnreadChatRoomIds()`. ✅ Keep as is. |
| `app/technician/chats/index.tsx` | Same. ✅ Keep as is. |
| `scripts/validateSeeds.js` | `VALID_ACTIVITY_TYPES` included `chat_message_received` without comment. **Added MVP vs future-scope comment.** |
| `docs/DATA_MODEL_V2.md` | Activity type column listed all types equally. **Updated to mark chat_message_received as future scope.** |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Two tables listed `chat_message_received` as required MVP. Local demo compat note incomplete. **Updated.** |
| `docs/SUPABASE_PLAN_V2.md` | `create_activity_event` trigger included chat messages. Notifications section didn't state MVP scope. **Updated.** |
| `docs/USER_FLOWS_V2.md` | Generic "notification" references only. ✅ No change needed. |
| `docs/RLS_PLAN_V2.md` | Activity RLS policies cover all event types correctly. ✅ No change needed. |

---

## 3. What Remains Local-Demo Only

| Feature | Status |
|---------|--------|
| `ActivityItem` with `read: boolean` | Local demo only. Supabase uses `activity_events` + `activity_reads`. |
| `chat_message_received` activity creation | Local demo only. `chatRepository.sendMessage()` annotated as future-scope. |
| `getUnreadChatRoomIds()` / `markChatRoomRead()` | Local demo only. Both methods annotated as future-scope. |
| Chat unread dot badges on dashboards | Local demo — computed from `chat_message_received` activity. Phase 1 Supabase uses polling on marketplace events only. |

---

## 4. Files Modified

### Code (annotations only)

| File | Change |
|------|--------|
| `src/types/activity.ts` | Added JSDoc block to `ActivityType` documenting MVP Phase 1 vs future scope |
| `src/repositories/v2/activityRepository.ts` | Added future-scope JSDoc to `getUnreadChatRoomIds()` and `markChatRoomRead()` |
| `src/repositories/v2/chatRepository.ts` | Added comment at `chat_message_received` creation in `sendMessage()` |
| `scripts/validateSeeds.js` | Added MVP vs future-scope comment to `VALID_ACTIVITY_TYPES` |

### Docs

| File | Change |
|------|--------|
| `docs/DATA_MODEL_V2.md` | `activity_events.type` column updated to mark `chat_message_received` as future scope |
| `docs/MVP_ARCHITECTURE_HANDOFF.md` | Activity event type tables mark `chat_message_received` as future scope; added "MVP Phase 1 event types" subsection and local demo compatibility note |
| `docs/SUPABASE_PLAN_V2.md` | `create_activity_event` trigger description excludes chat messages from Phase 1; `activity_events.type` column updated; Notifications section states MVP activity scope; chat message activity added to future scope table |

---

## 5. Activity Boundary Summary

```
Local demo (AsyncStorage)                 Supabase Phase 1              Future scope
─────────────────────────                 ───────────────               ────────────
ActivityItem                              activity_events               Realtime chat badges
  id, type, read, recipientRole,           id, type, recipient_*,      Push notifications
  recipientId, entityId, createdAt         entity_*, metadata,         Email notifications
                                           created_at                  Notification center
                                          activity_reads               chat_message_received
ActivityEvent (defined, not used           activity_event_id,            via Realtime/polling
in local demo)                             profile_id, read_at

chat_message_received ────────────────────── ✗ Not Phase 1 ─────────────── phase 2+
```

---

## 6. Remaining Risks

| Risk | Mitigation |
|------|-----------|
| Developer adds `chat_message_received` to Phase 1 Supabase trigger | `activityRepository.ts`, `chatRepository.ts`, `activity.ts`, and all 3 docs now clearly state future scope |
| Chat unread dots show 0 on Supabase (Phase 1 doesn't emit chat events) | Documented. Post-launch, replace with Realtime or a polling query on `chat_messages` |
| Multiple company members reading chat — per-member read state not tracked | `activity_reads` model already supports per-profile state; wire it up when `chat_message_received` is implemented in Phase 2+ |

---

## 7. Acceptance Criteria

| # | Criterion | Status |
|---|-----------|--------|
| 1 | Activity MVP event list is clear and limited | ✅ PASS — 6 marketplace events, documented in types + 4 docs |
| 2 | `chat_message_received` is marked future scope, not Phase 1 requirement | ✅ PASS — annotated in ActivityType, 2 repositories, validateSeeds, 3 docs |
| 3 | Local `ActivityItem` is documented as demo-only | ✅ PASS — MVP_ARCHITECTURE_HANDOFF.md updated |
| 4 | `activity_events` / `activity_reads` remain the Supabase target model | ✅ PASS — no changes to these structures |
| 5 | No notification center introduced | ✅ PASS — no UI changes |
| 6 | No Realtime/email/push/cron introduced | ✅ PASS — annotations only |
| 7 | `tsc --noEmit` passes with zero errors | ✅ PASS — 0 errors |
| 8 | `node scripts/validateSeeds.js` passes | ✅ PASS — 0 errors, 0 warnings |
| 9 | `npx expo export --platform web` builds all routes | ✅ PASS — 37 routes exported |

**H10 is fully resolved. Activity is ready for Supabase MVP Phase 1 planning.**
