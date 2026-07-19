-- ============================================================
-- CHECKPOINT 2 cleanup — reverts the acceptance-test data added to
-- rotoaxismatch-dev for the Fase 2 scoring validation (part66-coherence
-- branch). NOT a schema migration — plain data DML, run manually via
-- execute_sql (or psql) once you've finished validating in the app.
-- Safe to run once; re-running is a no-op (nothing left to delete/revert).
-- ============================================================
-- What this undoes:
--   1. Deletes the CHECKPOINT 2 offer (a0000000-0000-4000-b000-000000000001)
--      and its offer_required_habilitations row (ON DELETE CASCADE handles
--      the requirement row automatically once the offer is gone).
--   2. Deletes the technician_habilitations rows added to technicians A/B
--      (the exact CFM56 / related V2500 ratings under B1.1).
--   3. Deletes the technician_licenses (B1.1) rows added to technicians A/B.
--   4. Restores the original `availability` JSON on technicians A/B/C —
--      exact values confirmed live before any CHECKPOINT 2 change was made.
-- Does NOT touch anything else on these 3 technician_profiles rows (name,
-- verification_status, technician_type, location, etc. were never changed).
-- ============================================================

BEGIN;

DELETE FROM offers WHERE id = 'a0000000-0000-4000-b000-000000000001';
-- offer_required_habilitations.offer_id has ON DELETE CASCADE — no separate
-- DELETE needed for that row.

DELETE FROM technician_habilitations
WHERE technician_id = '082b831f-bdd7-4af5-b278-d875d6db5e74'
  AND license_code = 'B1.1'
  AND aircraft_type_rating_id = '00000000-0000-4000-a000-000000000001';

DELETE FROM technician_habilitations
WHERE technician_id = '4c598ccc-493c-496a-b040-94630af42cef'
  AND license_code = 'B1.1'
  AND aircraft_type_rating_id = '00000000-0000-4000-a000-000000000002';

DELETE FROM technician_licenses
WHERE technician_id = '082b831f-bdd7-4af5-b278-d875d6db5e74' AND license_code = 'B1.1';

DELETE FROM technician_licenses
WHERE technician_id = '4c598ccc-493c-496a-b040-94630af42cef' AND license_code = 'B1.1';

UPDATE technician_profiles
SET availability = '{"immediately": false, "available_from": null, "contract_types": []}'::jsonb
WHERE id = '082b831f-bdd7-4af5-b278-d875d6db5e74';

UPDATE technician_profiles
SET availability = '{"immediately": true, "available_from": null, "contract_types": []}'::jsonb
WHERE id = '4c598ccc-493c-496a-b040-94630af42cef';

UPDATE technician_profiles
SET availability = '{"immediately": false, "available_from": null, "contract_types": []}'::jsonb
WHERE id = '91c69d2c-0b7d-41a6-b658-c8f929d193b1';

COMMIT;
