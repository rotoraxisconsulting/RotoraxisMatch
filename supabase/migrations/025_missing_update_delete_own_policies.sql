-- ============================================================
-- AviationJobTalent V2 — Migration 025: missing UPDATE/DELETE
-- "own row" policies found by the RLS operation audit
-- ============================================================
-- Created: 2026-07-23
-- Source: docs/RLS_OPERATION_AUDIT_2026-07-23_REPORT.md — a full
-- table-by-table audit of every RLS-enabled table (which operations have a
-- policy, cross-referenced against what the app code actually executes).
-- Written after the identical bug (technician_licenses had no UPDATE
-- policy since migration 001, only surfacing when upsertLicenses() started
-- doing a real UPDATE — fixed in migration 021) turned out to have two more
-- instances of the same shape. Both are currently latent (see below) —
-- fixed proactively here rather than waiting for the write path that would
-- trigger them.
--
-- NOT included here: the `offers` DELETE gap from the same audit (a real,
-- live "Delete offer" button silently no-ops today) — that one is a
-- product decision (soft-delete/archive vs. hard delete, what happens to
-- orphaned offer_requests), not a simple policy add. Being designed
-- separately before any code or SQL is written for it.
--
--   A. technician_aircraft_experience — no UPDATE policy.
--      technicianRepositoryV2.updateExperienceYears() does a raw
--      .update() with no matching policy. Currently unreachable: its only
--      caller, useTechnicianDashboard.updateProfile(), is already-known
--      dead V1 code with zero call sites of its own (Fase 5 inventory).
--      Fixed now so reviving that path (or wiring this method up directly
--      to a real "years of experience" quick-edit) doesn't silently no-op
--      the way tl_update_own's absence once did.
--
--   B. documents — no DELETE policy for the owning technician.
--      documentRepositoryV2.remove() does a raw .delete() with no matching
--      policy. Currently unreachable: no "delete document" UI exists yet.
--      Storage already has a matching tech_delete_own_docs policy
--      (migration 006) for the underlying file — only the DB row was
--      missing its counterpart. Fixed now so whoever builds that feature
--      doesn't discover a silent no-op (file gone, orphaned row stays)
--      after the fact.
--
-- Both follow the exact ownership criterion already used by every sibling
-- policy on these tables (technician_id = my_technician_id()) — no
-- USING(true), no policy without an explicit ownership check, no
-- service-role bypass introduced.
--
-- Idempotent: safe to re-run.
-- ============================================================


-- ── A. technician_aircraft_experience: add UPDATE (own row) ──────────
--
-- Mirrors tl_update_own (migration 021) exactly: same ownership criterion
-- as this table's own tae_select_own/tae_insert_own/tae_delete_own
-- (technician_id = my_technician_id() AND is_active_user()), applied to
-- BOTH clauses — USING restricts which existing row can be targeted,
-- WITH CHECK restricts what the row can become after the update. A
-- technician can only ever update their own experience row into a row
-- that is still theirs.

DROP POLICY IF EXISTS tae_update_own ON technician_aircraft_experience;

CREATE POLICY tae_update_own ON technician_aircraft_experience
  FOR UPDATE
  USING (technician_id = my_technician_id() AND is_active_user())
  WITH CHECK (technician_id = my_technician_id() AND is_active_user());


-- ── B. documents: add DELETE (own row) ────────────────────────────────
--
-- Same ownership criterion as this table's own docs_select_own/
-- docs_insert_own (technician_id = my_technician_id()), and the same
-- shape as this table family's existing DELETE-own siblings
-- (tl_delete_own, th_delete_own, tae_delete_own) — none of which layer
-- an is_active_user() check onto DELETE, only onto SELECT/INSERT/UPDATE.
-- Matched here for consistency with that established convention rather
-- than introducing a one-off stricter rule for this table alone.

DROP POLICY IF EXISTS docs_delete_own ON documents;

CREATE POLICY docs_delete_own ON documents
  FOR DELETE USING (technician_id = my_technician_id());
