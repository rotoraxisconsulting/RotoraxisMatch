# RotoraxisMatch — V2 Handoff Summary

**As of:** 2026-05-24  
**Current state:** V2-10 complete — activity badges, V1 legacy cleanup; ready for Supabase migration

---

## What is built

RotoraxisMatch V2 is a cross-platform aviation technician matching app. It runs on Web, iOS, and Android via Expo.

The app is fully functional in **demo mode** (AsyncStorage + JSON seeds). Real auth and Supabase are not yet connected.

---

## Phases completed

| Phase | Description | QA report |
|---|---|---|
| V2-1a | TypeScript types + constants | — |
| V2-1b | V2 seed data (18 techs, 9 companies, 12 offers, 20 requests/apps, 25 docs) | — |
| V2-1c | 10 V2 repositories | — |
| V2-1d | Hooks + privacy utils migrated to V2 | — |
| V2-1e | Data layer QA | — |
| V2-2 | Company offer management UI (list/create/edit/publish/detail) | `docs/V2_2_QA_REPORT.md` |
| V2-3 | Technician offer browsing + apply with cover note | `docs/V2_3_QA_REPORT.md` |
| V2-4 | Company application review (accept/reject, privacy gate, identity/docs unlock) | `docs/V2_4_QA_REPORT.md` |
| V2-5 | Chat/messaging (4 routes, room per accepted record, deep links) | `docs/V2_5_QA_REPORT.md` |
| V2-6 | Technician direct offers (list + detail, accept/reject/chat) | `docs/V2_6_QA_REPORT.md` |
| V2-7 | Multi-user company team (addMember/updateRole/removeMember, permission guards) | `docs/V2_7_QA_REPORT.md` |
| V2-8 | Admin V2 (offer moderation, combined requests view, 9-cell metrics) | `docs/V2_8_QA_REPORT.md` |
| V2-9 | Full local end-to-end QA — all flows, privacy, matching, seed fixes | `docs/V2_9_QA_REPORT.md` |
| V2-10a | Pre-flight fixes — reset button, pending seed, team modals, admin type filter | `docs/V2_10_PREFLIGHT_FIXES_REPORT.md` |
| V2-10b | Activity badges — red dots on NavCards + cards, unread-first sort, mark-as-read | `docs/V2_10_ACTIVITY_BADGES_REPORT.md` |
| V2-10c | V1 legacy cleanup — redirect screens, company dashboard V2 metrics, copy updates | `docs/V2_LEGACY_CLEANUP_REPORT.md` |

---

## App routes (36 total)

### Public
- `/` — Role selector

### Company (`/company/...`)
- `/company` — Dashboard
- `/company/search` — Technician search with privacy gate
- `/company/offers` — Offer list
- `/company/offers/new` — Create offer
- `/company/offers/edit` — Edit offer
- `/company/offers/[id]` — Offer detail + ranked technicians + send direct offer
- `/company/applications` — Application inbox (filter by status)
- `/company/applications/[id]` — Application detail + accept/reject + identity/docs unlock
- `/company/chats` — Chat list
- `/company/chats/[id]` — Chat thread
- `/company/requests` — Legacy redirect → Applications + Job Offers (TODO: remove)
- `/company/team` — Team management
- `/company/profile` — Company profile (view)

### Technician (`/technician/...`)
- `/technician` — Dashboard
- `/technician/profile` — Editable profile
- `/technician/documents` — Document list
- `/technician/requests` — Legacy redirect → Direct Offers (TODO: remove)
- `/technician/offers` — Browse published offers
- `/technician/offers/[id]` — Offer detail + apply
- `/technician/direct-offers` — Direct offers inbox
- `/technician/direct-offers/[id]` — Direct offer detail + accept/reject
- `/technician/chats` — Chat list
- `/technician/chats/[id]` — Chat thread

### Admin (`/admin/...`)
- `/admin` — Dashboard (9-cell metrics, 5 NavCards)
- `/admin/technicians` — Technician verification
- `/admin/companies` — Company verification
- `/admin/documents` — Document status management
- `/admin/offers` — Offer moderation
- `/admin/requests` — Combined direct offers + applications (V2-native)

### Other
- `/map` — Technician map (V1 layer; TODO: migrate to V2 repos)

---

## Architecture

```
screens / components
  → hooks (useCompanyDashboard, useTechnicianDashboard, useAdminDashboard, ...)
    → repositories/v2/ (offerRepository, offerRequestRepository, ...)
      → storage/localDatabase (AsyncStorage + JSON seeds)
```

Privacy layer: `src/types/privacy.ts` + `src/utils/privacyV2.ts`  
Matching: `src/utils/matchingV2.ts` — pure function, always `offerId + technicianId`  
Permissions: `src/utils/companyPermissionsV2.ts` — frontend guards, RLS later

---

## Key invariants

1. **Privacy**: `SafeTechnicianPreview` never exposes `firstName`, `lastName`, `email`, `phone`, `birthDate`. Identity only available via `UnlockedTechnicianView` after `isUnlocked()` returns true, which requires `status === 'accepted'`.

2. **Matching**: Every displayed match % comes from `calculateOfferTechnicianMatch(offer, technician)` carrying `offerId + technicianId`. No global match score on technician profile. Never shown without offer context.

3. **Acceptance**: On `updateStatus('accepted')`, the repository sets `identityRevealed = true`, `documentsUnlocked = true`, and calls `chatRepository.getOrCreateRoom()`. This is simulated locally — in production it becomes a Supabase Edge Function.

4. **Chat**: Chat screen re-checks `status === 'accepted'` on every load and shows a locked state if not accepted.

5. **Seed consistency**: Every accepted `OfferRequest` and `OfferApplication` has a corresponding chat room in `chatRooms.json`. Validated by `scripts/validateSeeds.js`.

---

## Seed data summary

| Entity | Count |
|---|---|
| TechnicianProfiles | 18 |
| Companies | 9 |
| Profiles (auth) | 34 |
| Offers | 12 (11 published, 1 draft) |
| OfferRequests (direct offers) | 12 (3 accepted, 5 pending, 2 rejected, 1 expired, 1 withdrawn) |
| OfferApplications | 8 (2 accepted, 4 pending, 1 rejected, 1 expired) |
| Documents | 25 |
| ChatRooms | 5 (one per accepted record) |
| ChatMessages | 12 |
| CompanyMembers | 15 |

Demo IDs:
- `DEMO_COMPANY_ID = 'comp-001'` (Delta Air Lines)
- `DEMO_COMPANY_USER_ID = 'prof-c001a'`
- `DEMO_COMPANY_MEMBER_ROLE = 'admin'`
- `DEMO_TECHNICIAN_ID = 'tech-001'`

---

## Remaining V1 compat (not yet removed)

These V1 structures remain intentionally — they support active screens and must stay until those screens are migrated to V2 types.

| Artifact | Location | Consumers | Blocker to remove |
|---|---|---|---|
| `MatchRequest` / `MatchRequestStatus` | `src/types/matchRequest.ts` | `useCompanyDashboard`, `useTechnicianDashboard`, `useAdminDashboard`, `company/search`, `company/profile`, admin screens | Migrate `company/search` and `company/profile` to V2 `OfferRequest` type |
| `v2CompatAdapters.ts` | `src/utils/v2CompatAdapters.ts` | All three dashboard hooks + map | Remove after migrating all consumers |
| `SafeTechnicianView` | `src/types/technician.ts` | `company/search`, map, `TechnicianCard`, `RequestContactModal` | Migrate search + map to `SafeTechnicianPreview` |
| `matchRequestRepository` | `src/repositories/matchRequestRepository.ts` | `useMapTechnicians` only | Migrate map screen to V2 repos |
| `useMapTechnicians` | `src/state/useMapTechnicians.ts` | `app/map.tsx` | Migrate map screen to V2 repos |
| V1 `Company` shape (`companyName`, `contactEmail`) | `src/types/company.ts` | `company/profile`, `IncomingRequestCard` | Migrate those screens to `CompanyProfile` |

See `docs/V2_LEGACY_CLEANUP_REPORT.md` for the full audit.

---

## Known limitations (pre-Supabase)

| Limitation | Where |
|---|---|
| Permission guards are frontend-only | `companyPermissionsV2.ts` — no RLS |
| User blocking/suspension not implemented | Requires `userStatus` field in schema |
| Chat not real-time | AsyncStorage only; needs Supabase Realtime |
| Offer expiry not automated | No scheduled edge function yet |
| Single demo session per role | DEMO_* constants replace auth session |
| Acceptance side-effect is simulated locally | Must become `on_offer_accepted` edge function |

---

## Next phase: V2-10 — Supabase migration

Recommended order per `docs/IMPLEMENTATION_PHASES_V2.md`:

1. Supabase Auth (email/password, role in `profiles` table)
2. Technician profiles + habilitations
3. Company profiles + company_users
4. Offers
5. OfferRequests + OfferApplications
6. TechnicianDocuments + Storage bucket
7. ChatRooms + ChatMessages + Realtime
8. RLS policies (see `docs/RLS_PLAN_V2.md`)
9. Edge functions: `on_offer_accepted`, `notify_offer_status`, `expire_job_offers`
10. Remove AsyncStorage layer

Repository interfaces do not change — only the adapter underneath swaps.

Reference docs:
- `docs/SUPABASE_PLAN_V2.md` — migration plan
- `docs/SUPABASE_SCHEMA_V2.sql` — Postgres schema with seeds
- `docs/RLS_PLAN_V2.md` — RLS policies
- `docs/TYPESCRIPT_TYPES_V2.md` — canonical types
- `docs/MIGRATION_FROM_DEMO_TO_V2.md` — V1→V2 field mapping
