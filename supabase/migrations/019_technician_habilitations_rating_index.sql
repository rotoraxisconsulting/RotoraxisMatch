-- ============================================================
-- AviationJobTalent V2 — Migration 019: index the new
-- technician_habilitations.aircraft_type_rating_id FK
-- ============================================================
-- Created: 2026-07-08
--
-- mcp__supabase__get_advisors (performance), run after validating the
-- fk_technician_habilitations_license constraint (018), flagged 3 unindexed
-- FKs on technician_habilitations:
--   - aircraft_type_code_fkey   (pre-existing since migration 001)
--   - license_code_fkey         (pre-existing since migration 001)
--   - aircraft_type_rating_id_fkey (NEW in migration 016)
--
-- Only the third is a regression introduced by this phase's work — the other
-- two are pre-existing schema-wide tech debt shared by ~9 other tables
-- (offer_required_aircraft_types, offer_required_licenses, chat_messages,
-- companies, activity_events, etc.) and out of scope here. Indexing just the
-- new column keeps this migration minimal and targeted at what this phase
-- actually introduced. See docs/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md
-- for the full advisors triage.
-- ============================================================

CREATE INDEX idx_technician_habilitations_rating
  ON technician_habilitations (aircraft_type_rating_id);
