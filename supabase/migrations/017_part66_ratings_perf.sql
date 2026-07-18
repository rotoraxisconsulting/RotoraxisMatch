-- ============================================================
-- AviationJobTalent V2 — Migration 017: performance follow-up for
-- migration 016 (Part-66 aircraft-engine rating catalog)
-- ============================================================
-- Created: 2026-07-08
--
-- Applied right after 016 in the same session, based on
-- mcp__supabase__get_advisors (performance) run immediately after 016
-- was applied to rotoaxismatch-dev. The sibling tables this migration's
-- new tables were modeled on (offer_required_aircraft_types,
-- offer_required_licenses, technician_habilitations) do NOT show these
-- findings, so this is a real gap introduced by 016, not pre-existing
-- tech debt — worth fixing immediately rather than leaving for later.
--
-- Purely additive: new indexes, and a no-op-semantically RLS policy
-- rewrite (same predicate, wrapped so Postgres evaluates auth.uid() once
-- per query instead of once per row).
-- ============================================================

CREATE INDEX idx_catalog_requests_requested_by ON catalog_requests (requested_by);
CREATE INDEX idx_catalog_requests_resolved_rating ON catalog_requests (resolved_aircraft_type_rating_id);

CREATE INDEX idx_offer_required_habilitations_rating ON offer_required_habilitations (aircraft_type_rating_id);
CREATE INDEX idx_offer_required_habilitations_license ON offer_required_habilitations (license_code);

-- Wrap auth.uid() in a scalar subquery so it's evaluated once per query
-- instead of once per row (see Supabase RLS performance guidance). Same
-- access rule as before: users can only insert/read their own requests.
DROP POLICY catreq_insert_own ON catalog_requests;
CREATE POLICY catreq_insert_own ON catalog_requests
  FOR INSERT WITH CHECK (requested_by = (select auth.uid()) AND is_active_user());

DROP POLICY catreq_select_own ON catalog_requests;
CREATE POLICY catreq_select_own ON catalog_requests
  FOR SELECT USING (requested_by = (select auth.uid()));
