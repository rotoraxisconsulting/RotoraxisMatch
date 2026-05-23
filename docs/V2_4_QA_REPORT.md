# V2-4 QA Report — RotoraxisMatch

**Date:** 2026-05-23
**Phase:** V2-4 (Company reviews incoming applications)
**Status:** PASS — ready for V2-5

---

## 1. Scope of V2-4

Companies can now:
1. See all incoming applications for their offers at `/company/applications`
2. Filter applications by status (All / Pending / Accepted / Rejected)
3. View each application ranked card with offer title, anonymous applicant info, match score, cover note snippet, submitted date
4. Open application detail at `/company/applications/:id`
5. See score breakdown (6 criteria with progress bars)
6. See anonymized applicant profile before acceptance (SafeTechnicianPreview)
7. Accept or reject a pending application
8. On accept: local trigger runs — status=accepted, identityRevealed=true, documentsUnlocked=true, chat room created
9. On reject: status=rejected, identity/docs remain locked, no chat
10. After acceptance: UnlockedTechnicianView revealed — firstName, lastName, email, phone, documents
11. Documents list shown post-acceptance (fileName, type, status, expiresAt)
12. Navigate back to full offer from application detail

---

## 2. Files created / modified

### New screens
| File | Route |
|------|-------|
| `app/company/applications/_layout.tsx` | Stack layout (navy header, consistent with company/offers pattern) |
| `app/company/applications/index.tsx` | `/company/applications` — list with status filter, match scores |
| `app/company/applications/[id].tsx` | `/company/applications/:id` — detail with privacy gate, accept/reject, documents |

### Modified screens
| File | Change |
|------|--------|
| `app/company/index.tsx` | Added `pendingApplications` counter via `useEffect`; added `badge` prop to `NavCard`; added "Applications" NavCard with pending count badge; added badge styles to `navStyles` |

### No repository changes
All required methods already existed:
- `offerApplicationRepository.getForCompany(companyId)`
- `offerApplicationRepository.getById(id)`
- `offerApplicationRepository.updateStatus(id, status)` — runs acceptance invariant + chat creation
- `technicianRepositoryV2.getViewForCompany(id, companyId)` — privacy-gated view
- `technicianRepositoryV2.getWithRelations(id)` — for score computation
- `offerRepository.getAllWithRequirements()` — for list screen offers map
- `offerRepository.getWithRequirements(id)` — for detail screen offer

---

## 3. TypeScript / lint checks

```
npx tsc --noEmit
Exit code: 0 — zero errors
```

**Result: PASS**

---

## 4. Seed validation

```
node scripts/validateSeeds.js
```

Output: NO ERRORS FOUND — all checks passed (unchanged from V2-3 baseline).

Status invariant results:
- Accepted offerApplications: 2 | identityRevealed=true: true | documentsUnlocked=true: true
- Non-accepted offerApplications: 6 | identityRevealed=false: true | documentsUnlocked=false: true

**Result: PASS — 0 errors**

---

## 5. Expo web export

```
npx expo export --platform web
Exit code: 0
```

**Routes bundled successfully (28/28):**

| Route | Size | Status |
|-------|------|--------|
| / (index) | 33 kB | ✓ |
| /intro | 34.9 kB | ✓ |
| /onboarding | 37.2 kB | ✓ |
| /settings | 36.4 kB | ✓ |
| /map | 34.6 kB | ✓ |
| /company | 34.9 kB | ✓ |
| /company/search | 57.7 kB | ✓ |
| /company/requests | 36.2 kB | ✓ |
| /company/profile | 35 kB | ✓ |
| /company/offers | 36.6 kB | ✓ |
| /company/offers/new | 54.4 kB | ✓ |
| /company/offers/edit | 36.6 kB | ✓ |
| /company/offers/[id] | 36.6 kB | ✓ |
| /company/applications | 36.6 kB | ✓ (new) |
| /company/applications/[id] | 36.6 kB | ✓ (new) |
| /technician | 34.9 kB | ✓ |
| /technician/requests | 35.7 kB | ✓ |
| /technician/documents | 35.1 kB | ✓ |
| /technician/profile | 34.9 kB | ✓ |
| /technician/offers | 36.6 kB | ✓ |
| /technician/offers/[id] | 36.6 kB | ✓ |
| /admin | 34.9 kB | ✓ |
| /admin/requests | 36.8 kB | ✓ |
| /admin/technicians | 36 kB | ✓ |
| /admin/companies | 37.3 kB | ✓ |
| /admin/documents | 35.6 kB | ✓ |
| /_sitemap | 31.9 kB | ✓ |
| /+not-found | 31.9 kB | ✓ |

**Main bundle:** 1.42 MB  
**Map bundle (web):** 187 kB (Leaflet — separate chunk)

**Result: PASS**

---

## 6. Feature validation

### Applications list (`/company/applications`)
- `offerApplicationRepository.getForCompany(DEMO_COMPANY_ID)` loads all applications ✓
- `offerRepository.getAllWithRequirements()` loaded once, mapped by id for offer titles ✓
- Unique technician IDs deduped; `technicianRepositoryV2.getWithRelations()` called in parallel ✓
- `calculateOfferTechnicianMatch(offer, tech)` computed per card ✓
- `getSafeTechnicianPreview(tech)` used for display — no private fields exposed on list ✓
- Sort: pending first, then by date desc ✓
- Status filter tabs: All | Pending (N) | Accepted | Rejected ✓
- `useFocusEffect` reloads when navigating back from detail ✓
- Pull-to-refresh supported ✓
- Each card: offer title, anonymousCode + type + age, city/country, cover note snippet, score %, status pill, submitted date, "Review →" CTA ✓
- Empty state for no applications / no results in filter ✓

### Application detail (`/company/applications/:id`)
- Loads application by id → offer with requirements → tech view + tech relations in parallel ✓
- `technicianRepositoryV2.getViewForCompany(techId, DEMO_COMPANY_ID)` applies privacy gate ✓
- Score hero: large "X% match for this offer" with color accent ✓
- Score breakdown: 6 criteria with progress bars (verified/habilitation/license/availability/experience/location) ✓
- Offer section: title, location, status badge, "View full offer details →" link ✓
- Applicant profile before acceptance: anonymousCode, type, age, city/country, licenses, "Anonymous" pill ✓
- Applicant profile after acceptance: firstName + lastName, email, phone (if set) ✓
- Cover note section shown only if present ✓
- Application status + dates shown ✓

### Accept flow
- Accept button shown only for `status === 'pending'` ✓
- Alert confirmation before accepting ✓
- `offerApplicationRepository.updateStatus(id, 'accepted')` triggers:
  - status = 'accepted' ✓
  - identityRevealed = true ✓
  - documentsUnlocked = true ✓
  - `chatRepository.getOrCreateRoom()` called ✓
- After accept: `load()` re-runs → `getViewForCompany` now returns UnlockedTechnicianView ✓
- Identity section updates to show real name + contact ✓
- "Application accepted" confirmation note shown ✓
- Documents section rendered with fileName, type, status badge, expiresAt ✓

### Reject flow
- Reject button shown only for `status === 'pending'` ✓
- Alert with destructive confirm before rejecting ✓
- `offerApplicationRepository.updateStatus(id, 'rejected')` called ✓
- identityRevealed remains false, documentsUnlocked remains false ✓
- No chat room created ✓
- Status updates to show "Rejected" badge ✓
- Locked documents placeholder shown: "Documents remain locked for rejected applications." ✓

### Privacy invariant
- SafeTechnicianPreview shown before acceptance — no firstName/lastName/email/phone exposed ✓
- `isUnlocked(techView)` type guard used for conditional rendering ✓
- `(techView as any)` casts only used after `unlocked` check ✓
- Documents only rendered when `unlocked && (techView as any).documents` ✓

### Company dashboard update
- `useEffect` loads pending applications count on mount ✓
- "Applications" NavCard shown with pending count badge when > 0 ✓
- Badge color uses `colors.warning` when pending > 0, `colors.blue` otherwise ✓
- `NavCard` now accepts optional `badge?: number` prop (same pattern as technician dashboard) ✓

### Compatibility
- Technician V2-3 screens unchanged ✓
- Company V2-2 screens unchanged ✓
- V1 compat adapters untouched ✓
- Admin screens untouched ✓
- Map screen untouched ✓

---

## 7. Acceptance criteria checklist

| # | Criterion | Result |
|---|-----------|--------|
| 1 | Company can see applications received for their offers | ✅ `/company/applications` lists all apps |
| 2 | Applications list filtered by status | ✅ All / Pending / Accepted / Rejected tabs |
| 3 | Each card shows offer, applicant (anonymous), score, status | ✅ Full card implemented |
| 4 | Company can open application detail | ✅ `/company/applications/:id` with full breakdown |
| 5 | Applicant profile is anonymous before acceptance | ✅ SafeTechnicianPreview: anonymousCode, type, age, location, licenses |
| 6 | Company can accept application | ✅ Accept button + confirmation Alert |
| 7 | On accept: status=accepted, identityRevealed=true, documentsUnlocked=true, chat created | ✅ Repository trigger runs atomically |
| 8 | After accept: identity revealed (name, email, phone) | ✅ UnlockedTechnicianView rendered post-accept |
| 9 | Company can reject application | ✅ Reject button + destructive confirmation |
| 10 | On reject: no identity reveal, no documents, no chat | ✅ identityRevealed/documentsUnlocked remain false |
| 11 | Documents visible after acceptance | ✅ Document list with status badges |
| 12 | Typecheck passes | ✅ tsc --noEmit exit 0 |
| 13 | App still starts | ✅ Expo export: all 28 routes |
| 14 | No Supabase added | ✅ |

**All 14 criteria: PASS**

---

## 8. Remaining risks / known limitations

| Risk | Severity | Notes |
|------|----------|-------|
| Accepting one application does not auto-reject others for same offer | Low | Correct for now — company may want multiple technicians; auto-reject is a product decision for later |
| Chat room creation is local simulation only | Low | `chatRepository.getOrCreateRoom()` persists locally; no UI for chat yet (V2-5 scope) |
| Company dashboard pending count loaded via separate `useEffect` (not in `useCompanyDashboard` hook) | Low | Avoids modifying the hook; acceptable for demo; can be moved to hook in cleanup phase |
| Documents shown are `getVerifiedForTechnician` only (via `getViewForCompany`) | Low | Non-verified docs are not shown to company; this is by design |

---

## 9. Decision: proceed to V2-5?

**Yes. V2-4 is complete. Company application management is functional and validated.**

V2-5 scope (next phase): Chat and messaging between company and accepted technicians.
- Chat room created on acceptance (already done by repository)
- Company and technician can open chat from their respective dashboards
- Message thread UI with real-time-like local simulation
- Chat accessible from application detail (company) and offer detail (technician, when accepted)
