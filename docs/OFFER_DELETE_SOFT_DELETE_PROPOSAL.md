# Offer delete — soft-delete/archive model proposal

**Status: DECIDED and implemented in code (2026-07-23); migration 026 NOT
yet applied against Supabase, awaiting explicit go-ahead alongside
migration 025.** The one open fork below (`'archived'` vs. reusing
`'closed'`) was resolved in favor of the new `'archived'` value. Written
originally for discussion per the RLS
audit finding that `offers` has no DELETE policy for the owning company
while a live "Delete offer" button exists
(`docs/RLS_OPERATION_AUDIT_2026-07-23_REPORT.md`, §1.1). Explicitly called
out as a product decision, not a simple policy add — modeled on the
existing deleted-technician-account pattern, as requested.

## The pattern being followed (deleted technician account)

`delete-account` (edge function) never removes the technician's row or its
dependents. It anonymizes PII in place and flips `profiles.status` to a
terminal value (`'deleted'`). Everything that references the technician —
habilitations, licenses, historical `offer_requests`/`offer_applications`/
`chat_rooms` — survives untouched. Visibility is controlled by a
view-level filter (`technician_public_view`, migration 024), not by
deleting rows. Historical screens on the company side show a "[Deleted
user]" placeholder with actions disabled, but the record itself, and
everything linked to it, stays intact. Admins keep full visibility.

The offer case has one structural difference worth naming up front: a
technician's identity is personal data with a privacy dimension (hence
anonymization). An offer is the company's own posted content — there's
nothing to anonymize, only a state to change. So "soft delete" here means
purely a status change, not a PII-scrubbing step.

## Proposed model

### 1. Decide hard-delete vs. archive by counting live dependents

"Live dependents" = rows that actually represent a transaction:
`offer_applications` and `offer_requests` referencing this `offer_id`.
`chat_rooms` don't need a separate count — every chat room hangs off an
application or a request (`chat_rooms.offer_request_id` /
`.offer_application_id`), never off `offers.id` directly, so counting the
two tables above already covers it transitively. `activity_events.offer_id`
(historical notification log entries, already `ON DELETE SET NULL`) is
**not** counted — those are passive history, not live relationships, same
reasoning CLAUDE.md's matching principle already uses to distinguish a
real qualification from a soft signal.

- **Zero applications AND zero direct offers ever created for this
  offer** → real `DELETE`. Nothing else in the system references the row,
  so removing it is inert — no orphaning, no history lost, nothing to
  preserve.
- **Any application or direct offer exists** → **archive**, never delete.
  The row stays exactly as-is (title, requirements, everything) — only its
  status changes. No PII to scrub, nothing to anonymize.

### 2. The archive path in detail

- New terminal `offers.status` value, `'archived'` — additive to the
  `offer_status` enum (`ALTER TYPE offer_status ADD VALUE 'archived'`,
  same technique already used for `user_status.deleted` in migration 015;
  zero risk to existing rows, enum values can't be removed but can be
  added freely).
- Setting `status = 'archived'` goes through the **existing**
  `offers_update_company` RLS policy — no new policy needed for this path,
  only for the zero-dependents hard-delete path (§3).
- Effect: immediately invisible to technicians (already true today for
  anything that isn't `published` + `visible` — no change needed there).
  In the company's own offer list (`app/company/offers/index.tsx`), it
  shows inline exactly the way `closed`/`expired` already do today (that
  screen doesn't hide any status, it renders every offer with a
  status-colored badge) — just needs one more badge color/label
  ("Archived", gray/muted), no new tab or filter UI required. This matches
  the screen's existing convention rather than inventing a new one.
- Every `offer_application`/`offer_request`/`chat_room` tied to it is
  **completely unaffected** — no cascade, no orphaning, nothing to
  reconcile, because the offer row was never deleted. This is strictly
  simpler than today's broken hard-delete attempt, which (if the RLS gap
  were naively patched with just a DELETE policy and nothing else) would
  still leave `offer_requests` orphaned via `ON DELETE SET NULL` — the
  archive path sidesteps that entirely by not deleting.
- Technician-side screens that resolve a specific offer by id
  (`app/technician/offers/[id].tsx`, `direct-offers/[id].tsx`) already
  handle "offer no longer open" as a historical-viewing case (see the
  `isOfferOpenForTechnicians` checks and "Viewing as historical record"
  banner already in `[id].tsx`) — an archived offer needs zero new code
  there, it flows through the same path `closed`/`expired` already use.

### 3. The hard-delete path in detail

- New `offers_delete_company` RLS policy, but scoped to the zero-dependents
  rule **at the database level**, not just trusted to client-side logic:
  ```sql
  CREATE POLICY offers_delete_company ON offers
    FOR DELETE USING (
      is_active_user()
      AND can_act_for_company(company_id)
      AND NOT EXISTS (SELECT 1 FROM offer_applications WHERE offer_id = offers.id)
      AND NOT EXISTS (SELECT 1 FROM offer_requests WHERE offer_id = offers.id)
    );
  ```
  This makes the invariant enforceable by Postgres itself, matching this
  project's established pattern (e.g. `guard_company_last_admin`) of never
  trusting the client alone for a hard business rule.
- Consequence the repository must handle explicitly, to avoid recreating
  the exact bug this proposal exists to fix: **never blindly call
  `.delete()` and hope.** `offerRepository` needs to know in advance which
  path applies (a cheap `count()` against `offer_applications`/
  `offer_requests` for that `offer_id`, done once, before deciding). If the
  counts are zero, delete for real; if not, update to `'archived'`. The
  RLS policy above is the backstop that makes a client bug in this
  decision fail loud (0 rows affected → still silent, unfortunately, since
  that's inherent to how RLS-blocked deletes behave) rather than fail
  correct — so the repository-side branch is the actual fix, the policy is
  defense-in-depth, not the whole fix by itself.

### 4. UI changes

- "Delete offer" button (`app/company/offers/[id].tsx`): before showing
  the confirm dialog, check dependents. Two distinct dialogs:
  - **Zero dependents:** keep today's copy almost as-is — "Delete offer?
    This action cannot be undone." → real delete.
  - **Has dependents:** different copy — e.g. "This offer has N
    application(s)/direct offer(s) attached and can't be permanently
    deleted. Archive it instead? It will stop being visible to
    technicians and move out of your active offers, but every
    application, direct offer and chat tied to it stays exactly as it is."
    → sets `status = 'archived'`.
  - Button label could stay "Delete offer" for both (simplest, matches
    user mental model of "get rid of this") or become context-aware
    ("Archive offer" when dependents exist) — open to your preference,
    not a technical fork either way.
- `app/company/offers/index.tsx`: add the `'archived'` case to
  `statusTone()`/`statusAccent()` (currently handles
  published/draft/expired/closed) — one more `if`, same pattern.
- No changes needed on the technician side beyond what already exists for
  closed/expired offers.

## The one real fork worth your explicit call

Whether to introduce the new `'archived'` enum value at all, vs. reusing
the existing `'closed'` status for both "company manually stopped
recruiting" and "company tried to delete but couldn't." Reusing `'closed'`
means zero schema migration for this part — but conflates two different
company intents into one status, and the company loses the ability to
tell them apart in their own offer list. Recommending the new `'archived'`
value (clean separation, tiny additive migration, no behavior change to
existing `'closed'` offers) — but this is the one piece of this proposal
that's a genuine either-way call, not a technical constraint.

**Decided (2026-07-23): the new `'archived'` value.**

## Implementation notes (as built)

- `supabase/migrations/026_offer_archive_and_safe_delete.sql` — adds
  `offer_status.archived` (additive enum value) and the
  `offers_delete_company` policy scoped to zero live dependents. **Written,
  not applied** — same protocol as migration 025, needs explicit
  confirmation before `apply_migration` runs.
- `src/types/enums.ts` — `OfferStatus` gained `'archived'`.
- `src/repositories/v2/offerRepository.ts` — new `getDependentCounts(offerId)`
  (read-only, used by the UI to choose dialog copy before acting);
  `delete()` now counts dependents itself and branches to a real DELETE or
  an UPDATE to `status: 'archived'`, returning `{ action: 'deleted' |
  'archived' }` instead of `void`. **This changes `delete()`'s public
  return shape** — flagging per CLAUDE.md's "don't change a repository's
  public API shape without saying so," though it was an implied
  consequence of this same proposal (§3) already shown before
  implementing.
- `app/company/offers/[id].tsx` — `handleDelete()` now checks dependents
  first and picks one of two confirmation messages (Delete vs. Archive
  wording) before showing the dialog; `deleteOffer()` branches on the
  returned `action` — navigates away on a real delete, or reloads the
  offer in place and shows an explanatory alert when it was archived
  instead. No change to which offers show the Delete button (still gated
  to `status === 'closed'`, pre-existing, unrelated to this change).
- `app/admin/offers.tsx` — added `'archived'` to the tab list, status
  label map, per-status next-actions map (terminal, empty array — same as
  `expired`), status tone (`'muted'`), and sort order map. No changes
  needed in `app/company/offers/index.tsx` (its `statusTone`/
  `statusAccent` fallbacks already resolve `'archived'` correctly, same
  as they do today for any status not explicitly listed) or on the
  technician side (an archived offer flows through the same "closed,
  historical" path `closed`/`expired` already use in
  `app/technician/offers/[id].tsx`, no code changes required there).
- `tsc --noEmit` clean, 96/96 tests passing (no pure-logic path touched by
  this change).
