-- ============================================================
-- AviationJobTalent V2 — Migration 013: Extend offer_requests unique index
-- ============================================================
-- Created: 2026-06-06
--
-- Migration 011 created uq_offer_requests_one_pending, which only
-- covered status = 'pending'. This left a gap:
--
--   A company could create a new 'pending' offer_request for a
--   (company, technician, offer) combination that already had an
--   'accepted' record, bypassing the frontend check via a direct
--   API call.
--
-- 'accepted' is terminal (the trigger rejects any further status
-- transition on it), so the pair already has an open chat and
-- revealed identity. A new 'pending' on top would be redundant
-- and confusing for the technician.
--
-- Fix: drop the pending-only index and replace it with one that
-- covers both 'pending' and 'accepted' — the two statuses that
-- isActiveOfferRelationStatus() considers active.
--
-- Safe to apply: the INSERT trigger (migration 011) forces every
-- new row to status='pending', so the 'accepted' branch of the
-- new index only ever triggers when an accepted record already
-- exists and a new insert attempts the same combo.
--
-- No existing data conflicts (verified before applying).
-- ============================================================

DROP INDEX IF EXISTS uq_offer_requests_one_pending;

CREATE UNIQUE INDEX uq_offer_requests_one_active
  ON offer_requests (
    company_id,
    technician_id,
    COALESCE(offer_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE status IN ('pending', 'accepted');
