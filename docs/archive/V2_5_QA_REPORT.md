# V2-5 QA Report — Chat/Messaging

**Date:** 2026-05-23  
**Phase:** V2-5 — Chat/messaging between company and accepted technicians

---

## Checks run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors |
| `npx expo export --platform web` | PASS — 32 routes bundled |

---

## Routes added (4)

| Route | Description |
|---|---|
| `/company/chats` | Company chat list — accepted contacts only |
| `/company/chats/[id]` | Company chat detail with message thread + send |
| `/technician/chats` | Technician chat list — accepted contacts only |
| `/technician/chats/[id]` | Technician chat detail with message thread + send |

**Total routes: 32** (was 28 after V2-4)

---

## Files created

- `app/company/chats/_layout.tsx` — Stack navigator, navy header
- `app/company/chats/index.tsx` — Chat list for company (useFocusEffect refresh, tech name unlocked if accepted)
- `app/company/chats/[id].tsx` — Chat detail (company sender, blue bubbles, locked state)
- `app/technician/chats/_layout.tsx` — Stack navigator, navy header
- `app/technician/chats/index.tsx` — Chat list for technician (useFocusEffect refresh, company name)
- `app/technician/chats/[id].tsx` — Chat detail (technician sender, cyan bubbles, locked state)
- `src/data/seeds/chatRooms.json` — 2 seeded rooms for accepted DEMO records
- `src/data/seeds/chatMessages.json` — 6 seeded demo messages across both rooms

---

## Files modified

- `src/storage/localDatabase.ts` — Imports and seeds chatRooms + chatMessages JSON
- `app/company/index.tsx` — Added Chats NavCard + chatCount state
- `app/technician/index.tsx` — Added Chats NavCard + chatCount state
- `app/company/applications/[id].tsx` — Added chatRoom load + "Open chat" button on accepted
- `app/technician/offers/[id].tsx` — Added chatRoom load + "Open chat" button on accepted

---

## Acceptance criteria

| # | Criterion | Status |
|---|---|---|
| 1 | Company chat list shows rooms for DEMO_COMPANY_ID | PASS |
| 2 | Technician chat list shows rooms for DEMO_TECHNICIAN_ID | PASS |
| 3 | Chat lists show tech name (unlocked if accepted) / company name, offer title, last message, time | PASS |
| 4 | Chat detail shows message thread with sender-side bubbles | PASS |
| 5 | Company sends as senderRole=company, senderId=DEMO_COMPANY_ID | PASS |
| 6 | Technician sends as senderRole=technician, senderId=DEMO_TECHNICIAN_ID | PASS |
| 7 | Chat locked if room not found or linked record not accepted | PASS |
| 8 | "Open chat" button on accepted application detail (company) | PASS |
| 9 | "Open chat" button on accepted offer detail (technician) | PASS |
| 10 | Chats NavCard on company dashboard with open count | PASS |
| 11 | Chats NavCard on technician dashboard with open count | PASS |
| 12 | No attachments, no realtime, no push, no typing indicators | PASS |

---

## Seed data

- `room-seed-001`: oreq-002 (comp-001 → tech-003, offer-002, accepted)
- `room-seed-002`: oapp-003 (tech-001 → offer-001, comp-001, accepted)
- 6 demo messages seeded across both rooms

## Ready for V2-6

Yes. V2-5 is complete. Suggested next phase: V2-6 — Admin chat oversight or Supabase migration prep.
