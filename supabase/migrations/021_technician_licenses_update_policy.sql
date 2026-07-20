-- ============================================================
-- AviationJobTalent V2 — Migration 021: add the missing UPDATE
-- policy on technician_licenses
-- ============================================================
-- Created: 2026-07-20
--
-- Root cause (part66-phase3 vigencia work): technician_licenses has had
-- SELECT/INSERT/DELETE "own row" policies since migration 001, but no
-- UPDATE policy was ever added — the original save path only ever deleted
-- all of a technician's license rows and reinserted them (no UPDATE verb
-- involved). That delete-then-reinsert pattern was itself the bug fixed in
-- this same phase: it violated fk_technician_habilitations_license when a
-- license was still referenced by a habilitation. The fix
-- (technicianRepositoryV2.upsertLicenses(), app code only, no schema
-- change needed for it) replaced the delete-then-insert with
-- INSERT ... ON CONFLICT (technician_id, license_code) DO UPDATE — which
-- executes as a genuine UPDATE against any row that already exists.
--
-- Postgres RLS requires an applicable UPDATE policy for that DO UPDATE
-- branch. With none defined, RLS's implicit deny-all for the unlisted
-- command produced exactly this failure on every save that touched an
-- already-existing license row (i.e. every save of validity dates on a
-- license the technician already held):
--   new row violates row-level security policy (USING expression)
--   for table "technician_licenses"
--
-- Fix: add the missing "own row" UPDATE policy, same ownership criterion
-- as tl_insert_own/tl_select_own (technician_id = my_technician_id() AND
-- is_active_user()), applied to BOTH clauses — USING restricts which
-- existing row can be targeted, WITH CHECK restricts what the row can
-- become after the update. A technician can only ever update a license
-- row that is already theirs, into a row that is still theirs; they can
-- never repoint technician_id at someone else's row in either direction.
-- No USING(true), no policy without WITH CHECK, no service-role bypass.
--
-- technician_habilitations was audited for the same gap and does NOT need
-- an equivalent policy: technicianRepositoryV2.replaceHabilitations() still
-- does delete-then-insert (DELETE + INSERT only, never UPDATE/upsert) —
-- both already have "own row" policies (th_delete_own, th_insert_own) from
-- migration 001. No other table's write pattern changed in this phase.
--
-- Idempotent: safe to re-run.
-- ============================================================

DROP POLICY IF EXISTS tl_update_own ON technician_licenses;

CREATE POLICY tl_update_own ON technician_licenses
  FOR UPDATE
  USING (technician_id = my_technician_id() AND is_active_user())
  WITH CHECK (technician_id = my_technician_id() AND is_active_user());
