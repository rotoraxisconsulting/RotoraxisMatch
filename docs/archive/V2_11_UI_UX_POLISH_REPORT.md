# V2-11 UI/UX Polish Report (Pass 2)

**Date:** 2026-05-24  
**Phase:** V2-11 — Senior UI/UX polish pass

---

## Design Direction

### Role
Senior UI/UX product designer — mobile-first SaaS / aviation operations tool.  
Not a consumer app. Not a marketing site. Not an AI-generated template.

### Core Problems Found (Pass 1 → Pass 2)

Pass 1 made typographic changes but missed the structural issues:

1. **Score hero blocks** — 48–56px centered numbers in bordered cards. The single most "AI-generated template" pattern in the app. Appeared on 3 detail screens.
2. **Dashboard NavCards = generic icon-grid** — 7 identical icon-in-colored-circle cards with no visual priority between "Applications (3 pending)" and "Technician Map". The emoji icon box is the hallmark of generic SaaS templates.
3. **MetricCard trio** — Three equal-weight numbered boxes floating independently. No visual grouping.
4. **Emoji in MetaItem fields** — `📋 Contract`, `⏱ Min. experience` chips in B2B detail screens.
5. **Section label typography inconsistency** — 11px, 12px, 13px, 14px used interchangeably for section headings across detail screens.
6. **Chat cards** — Generic blue circle avatar, no left accent, no visual context differentiator.

---

## What Changed in Pass 2

### Design Decisions

| Problem | Old pattern | New pattern |
|---|---|---|
| Score hero blocks | 48–56px centered % in bordered card | `InlineScore`: 22px horizontal display with colored left accent bar |
| Dashboard NavCards | Icon-in-circle + label | Text-first cards, no icon box, left accent bar for active items |
| MetricCard trio | 3 separate card boxes | Single `statsStrip` — unified horizontal bar |
| Emoji in MetaItem | `📋 Contract` | `Contract` label-value stacked (no emoji) |
| Chat avatars | 44px circle (blue/navy) | 40px rounded square (navyLight) |
| Chat cards | No left accent | 3px cyan left accent |

---

## New Component

### `src/components/InlineScore.tsx`

Replaces the centered score hero on all detail screens.

**Before:** 48–56px `fontWeight: '800'` number centered in a `borderWidth: 2` card. Took 120–140px vertical space for one number.

**After:** 22px `fontWeight: '700'` number left-aligned with quality label inline. 3px left border in score color. ~40px vertical space. Embedded inside the summary section — score becomes metadata, not a hero.

Props: `score: number`, `quality: string`, `context: string`

---

## Screens Changed

### `app/company/index.tsx` — Company Dashboard
- **Removed**: `Card` wrapper from profile header, three separate `MetricCard` boxes, icon boxes from all NavCards
- **Added**: Flat profile header with `companyName` (22px 700) + type·location (12px), bottom divider
- **Added**: `statsStrip` — single unified bar showing pending apps / direct offers / active chats
- **NavCards**: Text-first layout. `isActive` prop adds 3px left accent in `accentColor`. No icon box.
- **Result**: Immediate priority difference between active cards (Applications with unread) and utility cards (Profile, Map)

### `app/technician/index.tsx` — Technician Dashboard
- Same treatment as company dashboard
- Kept avatar circle (shows technician initial) and completeness bar — these are useful data
- **Removed**: `Card` wrapper, icon boxes from all NavCards, three separate `MetricCard` boxes
- **Added**: Flat profile section with bottom divider, `statsStrip`
- **Retained**: `navCardFull` for Chats card (already fixed in Pass 1)

### `app/company/applications/[id].tsx` — Application Detail
- **Removed**: 56px centered `scoreHero` block (full-width card with huge number)
- **Added**: `InlineScore` inside the Job offer section — score appears as context for the offer, not a standalone hero
- **Moved**: Score breakdown section follows the offer section (not before it)
- **Removed**: `scoreHero`, `scoreHeroValue`, `scoreHeroLabel`, `scoreHeroMatch`, `scoreUnavailable` styles

### `app/technician/offers/[id].tsx` — Offer Detail (Technician)
- **Removed**: 48px centered `scoreCard` hero block
- **Added**: `InlineScore` at top of the `summaryCard` — score is the first thing in the offer context
- **Removed**: `typography` import (was only used for `typography.h4` on offer title)
- **Fixed**: `offerTitle` → `fontSize: 17, fontWeight: '700'` inline
- **Fixed**: `InfoItem` — removed emoji icon param (`📋`, `⏱`), now stacked label-value

### `app/technician/direct-offers/[id].tsx` — Direct Offer Detail
- **Removed**: 52px centered `scoreCard` hero block
- **Added**: `InlineScore` at top of the Linked Offer section
- **Removed**: `scoreCard`, `scoreValue`, `scoreLabel`, `scoreMatchLabel` styles
- **Removed**: `typography` import

### `app/company/offers/[id].tsx` — Offer Detail (Company) — Tech Match Cards
- **Removed**: 26px `scorePercent` (fontWeight 800) in `scoreBox`
- **Added**: `MatchBadge` (from Pass 1) — compact, right-aligned, consistent with list cards
- **Removed**: `scoreBox`, `scorePercent`, `scoreLabel`, `scoreMatchLabel` styles
- **Fixed**: `MetaItem` — removed emoji icon param, now stacked label-value
- **Removed**: `typography` import (was only for `typography.h4` on offer title)

### `app/company/offers/index.tsx` — Company Offers List
- **Restructured**: Card layout — title+location on left, badge on right (flex-start alignment)
- **Added**: Footer row with meta chips left + "View →" CTA link right
- **Changed**: `borderRadius` 14 → 12 (consistent with new cards)

### `app/company/chats/index.tsx` — Company Chats List
- **Added**: `borderLeftWidth: 3, borderLeftColor: colors.cyan` — immediate visual context for chat type
- **Changed**: Avatar 44px circle → 40px rounded square (10px radius, navyLight bg)
- **Added**: `›` chevron on the right
- **Changed**: `offerLine` — 11px blue 600 → 11px textSecondary 500 (less noisy)
- **Changed**: `preview` — textSecondary → textMuted (clear visual hierarchy)

### `app/technician/chats/index.tsx` — Technician Chats List
- Same treatment as company chats
- Avatar: 44px circle → 40px rounded square (navyLight bg)
- `borderLeftColor: colors.cyan`, `›` chevron

### `app/company/team.tsx` — Company Team
- **Changed**: `currentUserCard` — blue border → standard border with `borderLeftWidth: 3, borderLeftColor: colors.blue`
- **Changed**: `memberCardCurrent` — `borderColor: blue+40` → `borderLeftWidth: 3, borderLeftColor: colors.blue`
- **Changed**: All card borderRadius 14 → 12
- **Copy**: "Logged in as (demo)" → "Your session"

---

## Files Modified

| File | Change type |
|---|---|
| `src/components/InlineScore.tsx` | **Created** |
| `app/company/index.tsx` | Dashboard redesign |
| `app/technician/index.tsx` | Dashboard redesign |
| `app/company/applications/[id].tsx` | Score hero → InlineScore |
| `app/technician/offers/[id].tsx` | Score hero → InlineScore |
| `app/technician/direct-offers/[id].tsx` | Score hero → InlineScore |
| `app/company/offers/[id].tsx` | scoreBox → MatchBadge |
| `app/company/offers/index.tsx` | Card structure + View CTA |
| `app/company/chats/index.tsx` | Avatar + left accent + chevron |
| `app/technician/chats/index.tsx` | Avatar + left accent + chevron |
| `app/company/team.tsx` | Left-accent borders |

---

## Before / After Summary

### Score display on detail screens
**Before:** Full-width bordered card, 48–56px centered number, uppercase label below. Took ~140px vertical space. Screamed "AI template".  
**After:** 22px number with quality label inline, 3px left border in score color, embedded in the relevant section. ~40px. Score is context, not a hero.

### Dashboard layout
**Before:** 7 identical icon-in-colored-circle cards in a 2-column grid. No visual priority.  
**After:** Text-first cards, no icon box. Active items (Applications, Offers with unread badges) get a 3px left accent bar. Stats strip shows the three key numbers in a unified bar.

### MetricCard row
**Before:** Three separate bordered boxes, each with a 26px number floating with no visual connection.  
**After:** Single `statsStrip` bar — one card, three inline stats with dividers.

### Chat list cards
**Before:** Plain cards, 44px circle avatars (blue/navy), no directional accent.  
**After:** 3px cyan left border, 40px square avatar (navyLight), `›` chevron, cleaner typography hierarchy (name → offer → preview).

### Emoji in detail screens
**Before:** `📋 Contract · ⏱ Min. experience` as labeled metadata items.  
**After:** `Contract` / `Min. experience` as stacked label-value pairs. No emoji.

---

## Checks Run

| Check | Result |
|---|---|
| `npx tsc --noEmit` | PASS — 0 errors |
| `node scripts/validateSeeds.js` | PASS — 0 errors; Activities: 2 unread:2 |
| `npx expo export --platform web` | PASS — 36 routes bundled |

---

## Acceptance Criteria — Verification

| # | Criterion | Status |
|---|---|---|
| 1 | Main screens look visibly more polished | PASS |
| 2 | App no longer feels like a generic AI-generated template | PASS — icon boxes removed, score heroes removed, emoji removed |
| 3 | Dashboard cards are more purposeful | PASS — visual priority for active items |
| 4 | Offer/application/direct-offer cards easier to scan | PASS — consistent hierarchy, View CTA, InlineScore |
| 5 | Detail screens have stronger hierarchy | PASS — score integrated into context, not hero |
| 6 | Match badges and status badges are consistent | PASS |
| 7 | Activity dots still work | PASS — no changes to activity system |
| 8 | Business logic unchanged | PASS — only style changes |
| 9 | Typecheck passes | PASS |
| 10 | Seed validation passes | PASS |
| 11 | Expo export passes | PASS — 36 routes |
| 12 | At least 10 screens with meaningful visible changes | PASS — 11 files changed |

---

## What Will Users Notice Immediately

1. **Dashboards**: No icon boxes — just clean text cards. Priority items stand out with a colored left accent bar. The stats strip is unified, not three floating boxes.
2. **Detail screens**: No giant centered score percentage. Score is compact (22px, left-anchored with accent bar) and appears in context of the offer.
3. **Offer detail (company)**: Technician match cards — score is a MatchBadge (compact) not a 26px number.
4. **Chat lists**: Cards have a cyan left accent and square avatars — instantly distinguishable from offer/application cards.
5. **Offer list (company)**: Cards have a "View →" CTA and cleaner title/badge alignment.

---

## Remaining UI Debt

| Area | Description | Priority |
|---|---|---|
| `app/company/search.tsx` | Still uses V1 `SafeTechnicianView`/`TechnicianCard` — card design inconsistent with V2 | Medium |
| `app/map.tsx` | Map on V1 layer; popup hint outdated | Low |
| `app/company/profile.tsx` | Uses V1 compat metrics (sentCount/acceptedCount) | Low |
| Empty states | Emoji icons still used in empty states on all list screens | Low |
| Detail screen section labels | Minor inconsistency remains (some screens uppercase labels, some not) | Low |
| Dashboard NavCard grid | Equal-weight 2-column grid OK for now; could benefit from hierarchy at product scale | Low (pre-production) |

---

## Ready for Supabase/Auth Phase?

**Yes.** All core flows are functional, visually coherent, and no longer look like a generic generated template. The remaining debt is cosmetic. No blockers for starting the Supabase auth migration.
