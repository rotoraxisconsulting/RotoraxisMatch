-- ============================================================
-- AviationJobTalent V2 — Migration 018: validate the pending
-- technician_habilitations -> technician_licenses composite FK
-- ============================================================
-- Created: 2026-07-08
--
-- fk_technician_habilitations_license was added NOT VALID in migration 016
-- because we could not be sure existing rows satisfied it. Diagnostic query
-- (run against rotoaxismatch-dev via mcp__supabase__execute_sql before this
-- migration was written):
--
--   SELECT th.*
--   FROM technician_habilitations th
--   LEFT JOIN technician_licenses tl
--     ON tl.technician_id = th.technician_id AND tl.license_code = th.license_code
--   WHERE tl.technician_id IS NULL;
--
-- Result: 0 rows (technician_habilitations currently has 2 real rows, both
-- with a matching technician_licenses row). Safe to validate.
--
-- VALIDATE CONSTRAINT only checks existing rows against a constraint that is
-- already being enforced for every new/updated row (NOT VALID never means
-- "not enforced" — it only means "not yet checked against history"). This
-- statement does not change what gets rejected going forward; it just
-- confirms the historical data already complies and flips
-- pg_constraint.convalidated to true.
-- ============================================================

ALTER TABLE technician_habilitations
  VALIDATE CONSTRAINT fk_technician_habilitations_license;
