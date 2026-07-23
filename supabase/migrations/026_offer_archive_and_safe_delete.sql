-- ============================================================
-- AviationJobTalent V2 — Migration 026: offer archive status +
-- safe hard-delete policy
-- ============================================================
-- Created: 2026-07-23
-- Source: docs/OFFER_DELETE_SOFT_DELETE_PROPOSAL.md, approved by the user
-- (2026-07-23) — the offers-DELETE finding from
-- docs/RLS_OPERATION_AUDIT_2026-07-23_REPORT.md (§1.1) is a product
-- decision, not a simple policy add: app/company/offers/[id].tsx has a
-- live "Delete offer" button wired to offerRepository.delete(), which
-- silently deletes 0 rows today because offers has no DELETE policy for
-- the owning company (only offers_all_admin covers it).
--
-- Model, mirroring the deleted-technician-account pattern (anonymize/mark
-- terminal in place rather than destroy rows when real relationships
-- exist) but simpler — an offer has no PII to scrub, only a status to
-- change:
--   - Zero offer_applications AND zero offer_requests reference this
--     offer → nothing else in the system depends on the row, so a real
--     DELETE is safe. New offers_delete_company policy, scoped to that
--     exact condition at the database level (not just trusted to the
--     repository) — same "enforce the invariant in Postgres itself"
--     pattern already used by guard_company_last_admin (migration 011).
--   - Any application or direct offer exists → the row is never deleted.
--     New terminal status 'archived' (offer_status enum, additive — same
--     technique as user_status.deleted, migration 015) is set instead via
--     the EXISTING offers_update_company policy; no new policy needed for
--     this path. Every offer_application/offer_request/chat_room tied to
--     the offer is completely unaffected — no cascade, no orphaning,
--     because the offer row was never touched beyond its status.
--
-- The repository (src/repositories/v2/offerRepository.ts) is responsible
-- for deciding which path applies BEFORE acting — counting dependents and
-- branching to either a real delete or an update to 'archived' — rather
-- than blindly attempting delete() and hoping RLS lets it through. The
-- policy below is a backstop enforcing the same rule in the database,
-- not the whole fix by itself: an RLS-blocked DELETE still returns 0 rows
-- silently rather than an error, which is exactly the bug this migration
-- exists to close off, not reproduce from a different angle.
--
-- Idempotent: safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS).
-- ============================================================


-- ── A. New terminal offer_status value ────────────────────────────────

ALTER TYPE offer_status ADD VALUE IF NOT EXISTS 'archived';


-- ── B. Safe hard-delete: only when zero live dependents exist ────────
--
-- "Live dependents" = rows representing an actual transaction
-- (offer_applications, offer_requests). chat_rooms don't need a separate
-- check — every chat room hangs off an application or a request
-- (offer_request_id / offer_application_id), never off offers.id
-- directly, so it's already covered transitively.
-- activity_events.offer_id is passive notification history (already
-- ON DELETE SET NULL) and is deliberately NOT counted here — it's not a
-- live relationship, same distinction the matching principle already
-- draws between a real qualification and a soft signal.

DROP POLICY IF EXISTS offers_delete_company ON offers;

CREATE POLICY offers_delete_company ON offers
  FOR DELETE USING (
    is_active_user()
    AND can_act_for_company(company_id)
    AND NOT EXISTS (SELECT 1 FROM offer_applications WHERE offer_id = offers.id)
    AND NOT EXISTS (SELECT 1 FROM offer_requests WHERE offer_id = offers.id)
  );
