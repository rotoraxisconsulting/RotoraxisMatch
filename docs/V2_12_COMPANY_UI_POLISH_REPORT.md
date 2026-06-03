# V2.12 Company UI Polish Report

## Scope

Applied the technician premium dashboard direction to the company/operator area only.

## Files modified

- `app/company/_layout.tsx`
- `app/company/index.tsx`
- `app/company/offers/_layout.tsx`
- `app/company/offers/index.tsx`
- `app/company/offers/[id].tsx`
- `app/company/offers/new.tsx`
- `app/company/offers/edit.tsx`
- `app/company/applications/_layout.tsx`
- `app/company/applications/index.tsx`
- `app/company/applications/[id].tsx`
- `app/company/chats/_layout.tsx`
- `app/company/chats/index.tsx`
- `app/company/chats/[id].tsx`
- `app/company/team.tsx`
- `app/company/profile.tsx`
- `app/company/search.tsx`
- `app/company/requests.tsx`
- `src/components/company/CompanyUI.tsx`

`app/company/requests.tsx` was also softened because it is a legacy company route that could still be reached by old deep links.

## Screens redesigned

- Company dashboard
- Company offer list
- Company offer detail
- Offer create form
- Offer edit form
- Applications list
- Application review detail
- Technician search
- Company chats list
- Company chat detail
- Team management
- Company profile
- Legacy requests redirect

## Shared components created

Created `src/components/company/CompanyUI.tsx` with reusable company UI primitives:

- `CompanyScreen`
- `CompanyPageHeader`
- `CompanyCard`
- `InlineBackButton`
- `CompanyBadge`
- `CompanyChip`
- `EmptyPanel`
- `ActivityDot`
- `InitialAvatar`
- `IconBox`
- `InfoRow`

These centralize the company/operator visual language: soft gray page background, white rounded cards, subtle borders, gentle shadows, slate/navy typography and restrained blue/cyan accents.

## Navigation bars removed or hidden

Company Stack headers are hidden in:

- `app/company/_layout.tsx`
- `app/company/offers/_layout.tsx`
- `app/company/applications/_layout.tsx`
- `app/company/chats/_layout.tsx`

Detail screens now use inline content headers with subtle back navigation instead of heavy dark top bars.

## Icon system updates

Used `lucide-react-native`, which was already installed before this company pass.

Representative icons:

- Dashboard: `Building2`, `BriefcaseBusiness`, `ClipboardCheck`, `Search`, `MessageCircle`, `Users`, `BadgeCheck`
- Offers: `BriefcaseBusiness`, `MapPin`, `ListChecks`, `Edit3`, `Send`, `CheckCircle`, `Clock`, `XCircle`
- Applications: `ClipboardCheck`, `UserRound`, `Lock`, `Unlock`, `FileCheck`, `MessageCircle`
- Search: `Radar`, `Search`, `BriefcaseBusiness`, `MapPin`, `Clock`, `Lock`, `Send`, `UserRound`
- Chats: `MessageCircle`, `Send`, `UserRound`
- Team/Profile: `Users`, `UserPlus`, `ShieldCheck`, `Trash2`, `Building2`, `Mail`, `Globe2`, `MapPin`

No emoji or placeholder dash icons remain in company UI.

## Visual system applied

- Soft gray/off-white page background
- White cards with 18-22px rounded corners
- Subtle borders and soft shadows
- Slate/navy text hierarchy with lighter 600/700 weights
- Restrained blue/cyan action color
- Green/amber/red semantic badges
- Compact chips for requirements, licenses, aircraft and status filters
- Privacy-safe technician cards before acceptance
- Clear CTAs for view, edit, send direct offer, review, accept/reject and chat

## Business logic safety

The pass was UI-only. Repository calls, route names, matching calculations, privacy gates, activity badge logic, accept/reject behavior, chat creation and local persistence flows were preserved.

One TypeScript fix was made in `app/company/applications/[id].tsx` to narrow unlocked technician views before reading private fields/documents.

## Checks run

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| `node scripts/validateSeeds.js` | PASS - no errors found |
| `npx expo export --platform web` | PASS - 36 static routes exported |

Expo export statically rendered all company routes, including offer/application/chat detail routes.

## Remaining UI debt

- Interactive browser click-through was not performed in this terminal pass.
- Company search still uses the existing contact-request demo flow because that is current business logic; the dashboard keeps that legacy route out of main navigation.
- Form validation and data entry patterns are visually cleaner, but deeper form UX could still be improved with field-level errors and better multi-select affordances.
- Admin screens remain on their previous visual system by request.
