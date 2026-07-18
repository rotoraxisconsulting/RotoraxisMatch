-- ============================================================
-- AviationJobTalent V2 — Migration 016: EASA Part-66 aircraft-engine
-- type rating catalog (aircraft_type_ratings), 80-entry initial seed
-- ============================================================
-- Created: 2026-07-08
--
-- Supersedes an earlier, narrower draft of this same migration file
-- (12 engines + 12 ratings, normalized as engine_types +
-- aircraft_ratings + aircraft_rating_aircraft_types joined to the
-- existing aircraft_types catalog). That draft was never committed and
-- never applied to any Supabase project (verified via
-- mcp__supabase__list_migrations against rotoaxismatch-dev before this
-- version was written) — rewriting it in place avoids shipping two
-- overlapping "aircraft rating" catalogs. See
-- docs/AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md for the full
-- rationale, migration strategy and legacy-data mapping report.
--
-- Problem being fixed:
--   The previous draft's engine_types catalog was exactly the kind of
--   "generic reusable engine catalog" this phase's brief says not to
--   build, and only covered 12 combinations against the existing
--   33-code aircraft_types catalog (which itself cannot represent most
--   real-world aircraft — no Embraer ERJ, no Dash 8, no Gulfstream,
--   no AS350/H145, etc.). This migration replaces it with a single,
--   self-contained, searchable catalog of 80 real aircraft+engine
--   combinations that does not depend on aircraft_types at all.
--
-- What this migration adds (additive, non-destructive):
--   - aircraft_type_ratings        the new catalog (80 rows seeded)
--   - technician_habilitations.aircraft_type_rating_id (nullable) +
--     .experience_years + .is_current — new rows can use these instead
--     of / alongside the legacy aircraft_type_code column, which stays
--     readable and untouched for existing rows.
--   - offer_required_habilitations  exact category+rating requirement
--     rows, referencing aircraft_type_rating_id.
--   - requirement_level ('mandatory' | 'preferred', default 'preferred')
--     on all four offer requirement tables (kept from the superseded
--     draft — same concept, unrelated to the rating-model change).
--   - catalog_requests              "I can't find my rating" requests,
--     free text only, never used for matching until an admin resolves
--     them into a real aircraft_type_ratings row.
--   - A safe, idempotent backfill of technician_habilitations rows whose
--     legacy aircraft_type_code has exactly one unambiguous match in the
--     new catalog's aliases (see section 8 below).
--
-- What is explicitly NOT done here (out of scope for this phase):
--   - No changes to the existing aircraft_types catalog/table — it
--     keeps serving technician_aircraft_experience and
--     offer_required_aircraft_types exactly as before.
--   - No automatic mapping of ambiguous legacy codes (e.g. a bare
--     "B737" or "A320" that could mean several engine variants).
--   - No deletion or reinterpretation of any existing data.
--   - No type-course/OJT/recency modeling, no admin approval UI for
--     catalog_requests beyond what already existed.
-- ============================================================


-- ============================================================
-- 1. aircraft_type_ratings — EASA aircraft-engine rating catalog
-- ============================================================

CREATE TABLE aircraft_type_ratings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  manufacturer         TEXT        NOT NULL,
  aircraft_family      TEXT        NOT NULL,
  engine_manufacturer  TEXT,
  engine_family        TEXT,
  -- Canonical EASA denomination — the stable, authoritative catalog key.
  easa_endorsement     TEXT        NOT NULL,
  display_name         TEXT        NOT NULL,
  commercial_aliases   TEXT[]      NOT NULL DEFAULT '{}',
  aircraft_category    TEXT        NOT NULL CHECK (aircraft_category IN (
                          'commercial_airplane', 'regional_airplane', 'regional_turboprop',
                          'business_jet', 'general_aviation', 'helicopter'
                        )),
  -- Optional EASA regulatory group/subgroup — not populated for the initial
  -- 80 rows (none of them needed it), kept for future refinement.
  easa_group           TEXT,
  -- Which catalog import/batch this row came from, for future re-imports.
  source_revision      TEXT,
  priority             INTEGER     NOT NULL DEFAULT 0,
  is_active            BOOLEAN     NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_aircraft_type_ratings_easa_endorsement UNIQUE (easa_endorsement)
);

CREATE INDEX idx_aircraft_type_ratings_sort
  ON aircraft_type_ratings (priority DESC, manufacturer, aircraft_family, engine_family);
CREATE INDEX idx_aircraft_type_ratings_manufacturer ON aircraft_type_ratings (manufacturer);
CREATE INDEX idx_aircraft_type_ratings_aliases ON aircraft_type_ratings USING GIN (commercial_aliases);

-- IDs are fixed (not gen_random_uuid()) and match
-- src/constants/aircraftTypeRatings.ts exactly, so the same catalog row ID
-- chosen by the app's (locally-sourced) catalog picker is a valid FK target
-- here. Generated from that file — see
-- docs/AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md section on how the
-- two were kept in sync.
INSERT INTO aircraft_type_ratings
  (id, manufacturer, aircraft_family, engine_manufacturer, engine_family, easa_endorsement, display_name, commercial_aliases, aircraft_category, priority, source_revision)
VALUES
  ('00000000-0000-4000-a000-000000000001', 'Airbus', 'A318/A319/A320/A321', 'CFM International', 'CFM56', 'Airbus A318/A319/A320/A321 (CFM56)', 'Airbus A320 family — CFM56', ARRAY['A318', 'A319', 'A320', 'A321', 'A320ceo']::text[], 'commercial_airplane', 100, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000002', 'Airbus', 'A319/A320/A321', 'International Aero Engines', 'V2500', 'Airbus A319/A320/A321 (IAE V2500)', 'Airbus A320 family — V2500', ARRAY['A319', 'A320', 'A321', 'A320ceo', 'IAE']::text[], 'commercial_airplane', 99, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000003', 'Airbus', 'A319/A320/A321', 'CFM International', 'LEAP-1A', 'Airbus A319/A320/A321 (CFM LEAP-1A)', 'Airbus A320neo family — LEAP-1A', ARRAY['A319neo', 'A320neo', 'A321neo', 'A321LR', 'A321XLR']::text[], 'commercial_airplane', 98, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000004', 'Airbus', 'A319/A320/A321', 'Pratt & Whitney', 'PW1100G', 'Airbus A319/A320/A321 (IAE PW1100G)', 'Airbus A320neo family — PW1100G', ARRAY['A319neo', 'A320neo', 'A321neo', 'GTF']::text[], 'commercial_airplane', 97, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000005', 'Airbus', 'A330', 'General Electric', 'CF6', 'Airbus A330 (GE CF6)', 'Airbus A330 — CF6', ARRAY['A330-200', 'A330-300', 'A330F']::text[], 'commercial_airplane', 89, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000006', 'Airbus', 'A330', 'Pratt & Whitney', 'PW4000', 'Airbus A330 (PW 4000)', 'Airbus A330 — PW4000', ARRAY['A330-200', 'A330-300']::text[], 'commercial_airplane', 85, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000007', 'Airbus', 'A330', 'Rolls-Royce', 'Trent 700', 'Airbus A330 (RR Trent 700)', 'Airbus A330 — Trent 700', ARRAY['A330-200', 'A330-300']::text[], 'commercial_airplane', 90, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000008', 'Airbus', 'A330neo', 'Rolls-Royce', 'Trent 7000', 'Airbus A330 (RR Trent 7000)', 'Airbus A330neo — Trent 7000', ARRAY['A330-800', 'A330-900']::text[], 'commercial_airplane', 88, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000009', 'Airbus', 'A340-200/300', 'CFM International', 'CFM56', 'Airbus A340 (CFM56)', 'Airbus A340-200/300 — CFM56', ARRAY['A340-200', 'A340-300']::text[], 'commercial_airplane', 55, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000010', 'Airbus', 'A340-500/600', 'Rolls-Royce', 'Trent 500', 'Airbus A340 (RR Trent 500)', 'Airbus A340-500/600 — Trent 500', ARRAY['A340-500', 'A340-600']::text[], 'commercial_airplane', 54, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000011', 'Airbus', 'A350', 'Rolls-Royce', 'Trent XWB', 'Airbus A350 (RR Trent XWB)', 'Airbus A350 — Trent XWB', ARRAY['A350-900', 'A350-1000', 'A350']::text[], 'commercial_airplane', 86, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000012', 'Airbus', 'A380', 'Engine Alliance', 'GP7200', 'Airbus A380 (EA GP7200)', 'Airbus A380 — GP7200', ARRAY['A380-800']::text[], 'commercial_airplane', 60, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000013', 'Airbus', 'A380', 'Rolls-Royce', 'Trent 900', 'Airbus A380 (RR Trent 900)', 'Airbus A380 — Trent 900', ARRAY['A380-800']::text[], 'commercial_airplane', 61, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000014', 'Airbus', 'A220', 'Pratt & Whitney', 'PW1500G', 'Bombardier BD-500 Series (PW PW1500G)', 'Airbus A220 — PW1500G', ARRAY['BD-500', 'A220-100', 'A220-300', 'CSeries', 'CS100', 'CS300', 'A220']::text[], 'commercial_airplane', 87, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000015', 'Boeing', '737 Classic', 'CFM International', 'CFM56', 'Boeing 737-300/400/500 (CFM56)', 'Boeing 737 Classic — CFM56', ARRAY['737-300', '737-400', '737-500']::text[], 'commercial_airplane', 72, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000016', 'Boeing', '737 NG', 'CFM International', 'CFM56', 'Boeing 737-600/700/800/900 (CFM56)', 'Boeing 737 NG — CFM56', ARRAY['737-600', '737-700', '737-800', '737-900', '737NG']::text[], 'commercial_airplane', 96, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000017', 'Boeing', '737 MAX', 'CFM International', 'LEAP-1B', 'Boeing 737-7/8/9 (CFM LEAP-1B)', 'Boeing 737 MAX — LEAP-1B', ARRAY['737 MAX 7', '737 MAX 8', '737 MAX 9', '737-7', '737-8', '737-9']::text[], 'commercial_airplane', 94, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000018', 'Boeing', '747-400', 'General Electric', 'CF6', 'Boeing 747-400 (GE CF6)', 'Boeing 747-400 — CF6', ARRAY['B747', 'Jumbo']::text[], 'commercial_airplane', 49, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000019', 'Boeing', '747-400', 'Pratt & Whitney', 'PW4000', 'Boeing 747-400 (PW 4000)', 'Boeing 747-400 — PW4000', ARRAY['B747', 'Jumbo']::text[], 'commercial_airplane', 47, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000020', 'Boeing', '747-400', 'Rolls-Royce', 'RB211', 'Boeing 747-400 (RR RB211)', 'Boeing 747-400 — RB211', ARRAY['B747', 'Jumbo']::text[], 'commercial_airplane', 48, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000021', 'Boeing', '747-8', 'General Electric', 'GEnx', 'Boeing 747-8 (GE GEnx)', 'Boeing 747-8 — GEnx', ARRAY['747-8I', '747-8F']::text[], 'commercial_airplane', 50, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000022', 'Boeing', '757', 'Pratt & Whitney', 'PW2000', 'Boeing 757-200/300 (PW 2000)', 'Boeing 757 — PW2000', ARRAY['757-200', '757-300']::text[], 'commercial_airplane', 57, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000023', 'Boeing', '757', 'Rolls-Royce', 'RB211', 'Boeing 757-200/300 (RR RB211)', 'Boeing 757 — RB211', ARRAY['757-200', '757-300']::text[], 'commercial_airplane', 58, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000024', 'Boeing', '767', 'General Electric', 'CF6', 'Boeing 767-200/300/400 (GE CF6)', 'Boeing 767 — CF6', ARRAY['767-200', '767-300', '767-400', '767F']::text[], 'commercial_airplane', 62, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000025', 'Boeing', '767', 'Pratt & Whitney', 'PW4000', 'Boeing 767-200/300 (PW 4000)', 'Boeing 767 — PW4000', ARRAY['767-200', '767-300']::text[], 'commercial_airplane', 59, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000026', 'Boeing', '777', 'General Electric', 'GE90', 'Boeing 777-200/300 (GE 90)', 'Boeing 777 — GE90', ARRAY['777-200', '777-300', '777-300ER', 'Triple Seven']::text[], 'commercial_airplane', 82, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000027', 'Boeing', '777', 'Pratt & Whitney', 'PW4000', 'Boeing 777-200/300 (PW 4000)', 'Boeing 777 — PW4000', ARRAY['777-200', '777-300']::text[], 'commercial_airplane', 68, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000028', 'Boeing', '777', 'Rolls-Royce', 'Trent 800', 'Boeing 777-200/300 (RR Trent 800)', 'Boeing 777 — Trent 800', ARRAY['777-200', '777-300']::text[], 'commercial_airplane', 70, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000029', 'Boeing', '787', 'General Electric', 'GEnx', 'Boeing 787-8/9/10 (GEnx)', 'Boeing 787 — GEnx', ARRAY['787-8', '787-9', '787-10', 'Dreamliner']::text[], 'commercial_airplane', 84, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000030', 'Boeing', '787', 'Rolls-Royce', 'Trent 1000', 'Boeing 787-8/9/10 (RR Trent 1000)', 'Boeing 787 — Trent 1000', ARRAY['787-8', '787-9', '787-10', 'Dreamliner']::text[], 'commercial_airplane', 83, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000031', 'Embraer', 'ERJ 135/145', 'Rolls-Royce', 'AE3007A', 'Embraer EMB-135/145 (RR Corp AE3007A)', 'Embraer ERJ 135/145 — AE3007', ARRAY['EMB-135', 'EMB-145', 'ERJ135', 'ERJ145']::text[], 'regional_airplane', 73, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000032', 'Embraer', 'E170/E175', 'General Electric', 'CF34', 'Embraer ERJ-170 Series (GE CF34)', 'Embraer E170/E175 — CF34', ARRAY['ERJ-170', 'E170', 'E175']::text[], 'regional_airplane', 79, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000033', 'Embraer', 'E190/E195', 'General Electric', 'CF34', 'Embraer ERJ-190 Series (GE CF34)', 'Embraer E190/E195 — CF34', ARRAY['ERJ-190', 'E190', 'E195', 'E-Jet']::text[], 'regional_airplane', 81, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000034', 'Embraer', 'E190-E2/E195-E2', 'Pratt & Whitney', 'PW1900G', 'Embraer ERJ-190 Series (PW 1900G)', 'Embraer E190-E2/E195-E2 — PW1900G', ARRAY['E190-E2', 'E195-E2', 'E2', 'GTF']::text[], 'regional_airplane', 78, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000035', 'ATR', 'ATR 42/72', 'Pratt & Whitney Canada', 'PW120', 'ATR 42-400/500/72-212A (PWC PW120)', 'ATR 42/72 — PW120', ARRAY['ATR42', 'ATR72', 'ATR 42-500', 'ATR 72-500', 'ATR 72-600']::text[], 'regional_turboprop', 93, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000036', 'Bombardier', 'Dash 8-100/200/300', 'Pratt & Whitney Canada', 'PW120', 'Bombardier DHC-8-100/200/300 (PWC PW120)', 'Dash 8-100/200/300 — PW120', ARRAY['DHC-8', 'Dash 8', 'Q100', 'Q200', 'Q300']::text[], 'regional_turboprop', 69, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000037', 'Bombardier', 'Dash 8 Q400', 'Pratt & Whitney Canada', 'PW150', 'Bombardier DHC-8-400 (PWC PW150)', 'Dash 8 Q400 — PW150', ARRAY['DHC-8-400', 'Q400', 'Dash 8']::text[], 'regional_turboprop', 80, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000038', 'Fokker', 'Fokker 50/60', 'Pratt & Whitney Canada', 'PW125/PW127', 'Fokker 50/60 Series (PWC PW125/127)', 'Fokker 50/60 — PW125/127', ARRAY['F50', 'F60']::text[], 'regional_turboprop', 41, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000039', 'Fokker', 'Fokker 70/100', 'Rolls-Royce Deutschland', 'Tay', 'Fokker 70/100 (RRD Tay)', 'Fokker 70/100 — Tay', ARRAY['F70', 'F100']::text[], 'regional_airplane', 44, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000040', 'Saab', 'Saab 340', 'General Electric', 'CT7', 'Saab (SF) 340 (GE CT7)', 'Saab 340 — CT7', ARRAY['SF340', 'Saab SF340']::text[], 'regional_turboprop', 52, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000041', 'Saab', 'Saab 2000', 'Rolls-Royce', 'AE2100', 'Saab 2000 (RR Corp AE2100)', 'Saab 2000 — AE2100', ARRAY['SF2000']::text[], 'regional_turboprop', 43, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000042', 'BAe', 'BAe 146/Avro RJ', 'Honeywell', 'ALF500', 'BAe 146/AVRO 146-RJ (Honeywell ALF500 Series)', 'BAe 146 / Avro RJ — ALF500', ARRAY['BAe 146', 'Avro RJ', 'RJ70', 'RJ85', 'RJ100']::text[], 'regional_airplane', 45, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000043', 'CASA', 'C-212', 'Honeywell', 'TPE331', 'CASA C-212 (Honeywell TPE331)', 'CASA C-212 — TPE331', ARRAY['Aviocar', 'C212']::text[], 'regional_turboprop', 42, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000044', 'CASA', 'CN-235', 'General Electric', 'CT7', 'CASA CN-235 (GE CT7)', 'CASA CN-235 — CT7', ARRAY['CN235']::text[], 'regional_turboprop', 51, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000045', 'Airbus Defence and Space', 'C-295', 'Pratt & Whitney Canada', 'PW127', 'CASA C-295 (PWC PW127)', 'CASA C-295 — PW127', ARRAY['C295', 'Airbus C295']::text[], 'regional_turboprop', 56, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000046', 'Dornier', 'Dornier 228', 'Honeywell', 'TPE331', 'Dornier 228 (Honeywell TPE331)', 'Dornier 228 — TPE331', ARRAY['Do 228', 'DO228']::text[], 'regional_turboprop', 46, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000047', 'Beechcraft', 'Beech 1900', 'Pratt & Whitney Canada', 'PT6', 'Beech 1900 (PWC PT6)', 'Beechcraft 1900 — PT6', ARRAY['Beech 1900', 'B1900', '1900D']::text[], 'regional_turboprop', 53, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000048', 'Cessna', 'CitationJet/CJ1/CJ2/CJ3', 'Williams International', 'FJ44', 'Cessna 525/525A/525B (Williams FJ44)', 'CitationJet / CJ1 / CJ2 / CJ3 — FJ44', ARRAY['CitationJet', 'CJ1', 'CJ2', 'CJ3', 'C525']::text[], 'business_jet', 76, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000049', 'Cessna', 'Citation CJ4', 'Williams International', 'FJ44', 'Cessna 525C (Williams FJ44)', 'Citation CJ4 — FJ44', ARRAY['CJ4', 'C525C']::text[], 'business_jet', 74, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000050', 'Cessna', 'Citation II/V/Bravo/Ultra/Encore', 'Pratt & Whitney Canada', 'PW530/PW535', 'Cessna 550/560 (PWC PW530/535)', 'Citation II/V/Bravo/Ultra/Encore', ARRAY['Citation II', 'Citation V', 'Bravo', 'Ultra', 'Encore', 'C550', 'C560']::text[], 'business_jet', 71, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000051', 'Bombardier', 'Challenger 300/350', 'Honeywell', 'AS907', 'Bombardier BD-100-1A10 (Honeywell AS907)', 'Challenger 300/350 — AS907', ARRAY['BD-100', 'Challenger 300', 'Challenger 350']::text[], 'business_jet', 77, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000052', 'Bombardier', 'Global Express/5000/6000', 'Rolls-Royce Deutschland', 'BR710', 'Bombardier BD-700 Series (RRD BR700-710)', 'Global Express/5000/6000 — BR710', ARRAY['BD-700', 'Global Express', 'Global 5000', 'Global 6000']::text[], 'business_jet', 75, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000053', 'Bombardier', 'Challenger 604/605', 'General Electric', 'CF34', 'Bombardier CL-600-2B16 (604 Variant) (GE CF34)', 'Challenger 604/605 — CF34', ARRAY['CL-604', 'CL-605', 'Challenger 604', 'Challenger 605']::text[], 'business_jet', 67, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000054', 'Gulfstream', 'GIV/GIV-SP', 'Rolls-Royce Deutschland', 'Tay', 'Gulfstream GIV/GIV-SP Series (RRD Tay)', 'Gulfstream GIV/GIV-SP — Tay', ARRAY['GIV', 'GIV-SP', 'G400']::text[], 'business_jet', 64, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000055', 'Gulfstream', 'GV-SP', 'Rolls-Royce Deutschland', 'BR710', 'Gulfstream GV-SP Series (RRD BR710)', 'Gulfstream G500/G550 — BR710', ARRAY['GV-SP', 'G500', 'G550']::text[], 'business_jet', 66, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000056', 'Gulfstream', 'GVI', 'Rolls-Royce Deutschland', 'BR725', 'Gulfstream GVI (RRD BR725)', 'Gulfstream G650/G650ER — BR725', ARRAY['GVI', 'G650', 'G650ER']::text[], 'business_jet', 65, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000057', 'Dassault', 'Falcon 900C/EX', 'Honeywell', 'TFE731', 'Dassault Falcon 900C/EX (Honeywell TFE731)', 'Falcon 900C/EX — TFE731', ARRAY['Falcon 900', 'Falcon 900C', 'Falcon 900EX']::text[], 'business_jet', 63, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000058', 'Pilatus', 'PC-12', 'Pratt & Whitney Canada', 'PT6', 'Pilatus PC-12 (PWC PT6)', 'Pilatus PC-12 — PT6', ARRAY['PC12', 'PC-12 NG', 'PC-12 NGX']::text[], 'general_aviation', 92, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000059', 'Pilatus', 'PC-24', 'Williams International', 'FJ44', 'Pilatus PC-24 (Williams FJ44)', 'Pilatus PC-24 — FJ44', ARRAY['PC24', 'Super Versatile Jet']::text[], 'business_jet', 69, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000060', 'Daher', 'TBM', 'Pratt & Whitney Canada', 'PT6', 'Socata TBM700 (PWC PT6)', 'Daher TBM family — PT6', ARRAY['Socata TBM', 'TBM700', 'TBM850', 'TBM900', 'TBM910', 'TBM930', 'TBM940', 'TBM960']::text[], 'general_aviation', 70, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000061', 'Airbus Helicopters', 'AS350', 'Turbomeca', 'Arriel 1', 'Eurocopter AS 350 (Turbomeca Arriel 1)', 'Airbus AS350 Écureuil — Arriel 1', ARRAY['AS350', 'Écureuil', 'Squirrel']::text[], 'helicopter', 83, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000062', 'Airbus Helicopters', 'AS350/H125', 'Turbomeca', 'Arriel 2', 'Eurocopter AS 350 (Turbomeca Arriel 2)', 'Airbus AS350 B3/H125 — Arriel 2', ARRAY['AS350 B3', 'H125', 'Écureuil', 'Squirrel']::text[], 'helicopter', 96, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000063', 'Airbus Helicopters', 'EC130/H130', 'Turbomeca', 'Arriel 2', 'Eurocopter EC 130 (Turbomeca Arriel 2)', 'Airbus EC130/H130 — Arriel 2', ARRAY['EC130', 'H130']::text[], 'helicopter', 84, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000064', 'Bell', 'Bell 206/AB206', 'Rolls-Royce', '250', 'Agusta AB206 / Bell 206 (RR Corp 250)', 'Bell 206 / AB206 — RR250', ARRAY['Bell 206', 'JetRanger', 'LongRanger', 'AB206', 'Allison 250']::text[], 'helicopter', 91, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000065', 'Bell', 'Bell 407', 'Rolls-Royce', '250', 'Bell 407 (RR Corp 250)', 'Bell 407 — RR250', ARRAY['Bell 407', 'Allison 250', 'B407']::text[], 'helicopter', 88, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000066', 'Robinson', 'R66', 'Rolls-Royce', '250', 'Robinson R66 (RR Corp 250)', 'Robinson R66 — RR250', ARRAY['R66', 'Robinson R66']::text[], 'helicopter', 79, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000067', 'Robinson', 'R22/R44', 'Lycoming', 'Piston', 'Robinson R22/R44 Series (Lycoming)', 'Robinson R22/R44 — Lycoming', ARRAY['R22', 'R44', 'Raven', 'Clipper']::text[], 'helicopter', 90, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000068', 'Airbus Helicopters', 'EC135/H135', 'Pratt & Whitney Canada', 'PW206', 'Eurocopter EC 135 (PWC PW206)', 'Airbus EC135/H135 — PW206', ARRAY['EC135', 'H135']::text[], 'helicopter', 93, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000069', 'Airbus Helicopters', 'EC135/H135', 'Turbomeca', 'Arrius 2B', 'Eurocopter EC 135 (Turbomeca Arrius 2B)', 'Airbus EC135/H135 — Arrius 2B', ARRAY['EC135', 'H135']::text[], 'helicopter', 94, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000070', 'Airbus Helicopters', 'EC145/BK117 C2', 'Turbomeca', 'Arriel 1', 'Eurocopter MBB-BK 117 C2 (Turbomeca Arriel 1)', 'EC145 / BK117 C2 — Arriel 1', ARRAY['EC145', 'BK117 C2', 'BK 117 C2']::text[], 'helicopter', 86, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000071', 'Airbus Helicopters', 'H145/BK117 D2', 'Turbomeca', 'Arriel 2', 'Eurocopter MBB-BK 117 D2 (Turbomeca Arriel 2)', 'Airbus H145 / BK117 D2 — Arriel 2', ARRAY['H145', 'EC145 T2', 'BK117 D2', 'BK 117 D2']::text[], 'helicopter', 95, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000072', 'Airbus Helicopters', 'H175', 'Pratt & Whitney Canada', 'PT6C', 'Eurocopter EC 175 (PWC PT6C)', 'Airbus H175 — PT6C', ARRAY['EC175', 'H175']::text[], 'helicopter', 77, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000073', 'Airbus Helicopters', 'H225', 'Turbomeca', 'Makila 2A', 'Eurocopter EC 225 (Turbomeca Makila 2A)', 'Airbus H225 — Makila 2A', ARRAY['EC225', 'H225', 'Super Puma']::text[], 'helicopter', 78, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000074', 'Leonardo', 'A109', 'Turbomeca', 'Arrius 2', 'Agusta A109 Series (Turbomeca Arrius 2)', 'Leonardo A109 family — Arrius 2', ARRAY['Agusta A109', 'AW109', 'A109E', 'A109S']::text[], 'helicopter', 82, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000075', 'Leonardo', 'AW139', 'Pratt & Whitney Canada', 'PT6', 'Agusta AB139 / AW139 (PWC PT6)', 'Leonardo AW139 — PT6', ARRAY['AB139', 'AW139']::text[], 'helicopter', 97, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000076', 'Leonardo', 'AW169', 'Pratt & Whitney Canada', 'PW210', 'AW169 (PWC 210)', 'Leonardo AW169 — PW210', ARRAY['AW169']::text[], 'helicopter', 87, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000077', 'Leonardo', 'AW189', 'General Electric', 'CT7', 'AW189 (GE CT7)', 'Leonardo AW189 — CT7', ARRAY['AW189']::text[], 'helicopter', 85, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000078', 'Bell', 'Bell 412/AB412', 'Pratt & Whitney Canada', 'PT6', 'Bell 412 / Agusta AB412 (PWC PT6)', 'Bell 412 / AB412 — PT6', ARRAY['Bell 412', 'AB412']::text[], 'helicopter', 89, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000079', 'Sikorsky', 'S-76C', 'Turbomeca', 'Arriel 2', 'Sikorsky S-76C (Turbomeca Arriel 2)', 'Sikorsky S-76C — Arriel 2', ARRAY['S76', 'S-76', 'S76C']::text[], 'helicopter', 80, 'part66-initial-80-2026-07-08'),
  ('00000000-0000-4000-a000-000000000080', 'Sikorsky', 'S-92A', 'General Electric', 'CT7-8', 'Sikorsky S-92A (GE CT7-8)', 'Sikorsky S-92A — CT7-8', ARRAY['S92', 'S-92', 'S92A']::text[], 'helicopter', 81, 'part66-initial-80-2026-07-08');


-- ============================================================
-- 2. technician_habilitations — additive, non-destructive adaptation
-- ============================================================

ALTER TABLE technician_habilitations
  ALTER COLUMN aircraft_type_code DROP NOT NULL;

ALTER TABLE technician_habilitations
  ADD COLUMN aircraft_type_rating_id UUID REFERENCES aircraft_type_ratings(id),
  ADD COLUMN experience_years        NUMERIC,
  ADD COLUMN is_current              BOOLEAN NOT NULL DEFAULT true;

-- A habilitation row must point at *something* — either the legacy general
-- aircraft type, the exact rating, or both during a transitional edit.
ALTER TABLE technician_habilitations
  ADD CONSTRAINT chk_technician_habilitations_target
  CHECK (aircraft_type_code IS NOT NULL OR aircraft_type_rating_id IS NOT NULL);

-- Legacy UNIQUE(technician_id, license_code, aircraft_type_code) is untouched:
-- Postgres treats NULL aircraft_type_code values as distinct, so it never
-- blocks rating-only rows.
--
-- New partial unique index for normalized rows: license-scoped (not just
-- technician+rating) so the same technician can legitimately hold the same
-- exact rating under two different Part-66 categories (e.g. B1.1 AND B2 on
-- the same A320neo/LEAP-1A), and can hold several engine variants of the
-- same family under one license (e.g. B1.1 + A320 Family/CFM56 and
-- B1.1 + A320 Family/V2500 at once) — mirrors the license-scoped uniqueness
-- the legacy aircraft_type_code column already had.
CREATE UNIQUE INDEX uq_technician_habilitations_rating
  ON technician_habilitations (technician_id, license_code, aircraft_type_rating_id)
  WHERE aircraft_type_rating_id IS NOT NULL;

-- Integrity: a habilitation's license_code must be a license the technician
-- actually holds in technician_licenses. Added NOT VALID because we cannot
-- be sure existing rows satisfy it; NEW rows and updates are enforced
-- immediately regardless of NOT VALID.
--
-- Diagnostic query — run before validating the constraint:
--   SELECT h.id, h.technician_id, h.license_code
--   FROM technician_habilitations h
--   LEFT JOIN technician_licenses l
--     ON l.technician_id = h.technician_id AND l.license_code = h.license_code
--   WHERE l.technician_id IS NULL;
-- Once that query returns no rows (or every returned row has been corrected
-- or explicitly accepted as legacy), validate with:
--   ALTER TABLE technician_habilitations VALIDATE CONSTRAINT fk_technician_habilitations_license;
ALTER TABLE technician_habilitations
  ADD CONSTRAINT fk_technician_habilitations_license
  FOREIGN KEY (technician_id, license_code)
  REFERENCES technician_licenses (technician_id, license_code)
  NOT VALID;


-- ============================================================
-- 3. Legacy data migration — safe, idempotent, unambiguous-only backfill
-- ============================================================
-- Maps technician_habilitations.aircraft_type_code -> aircraft_type_rating_id
-- ONLY where the legacy code has exactly one unambiguous match among the 80
-- new ratings' commercial_aliases (e.g. "AW139" only ever appears in the
-- Leonardo AW139/PT6 rating). Codes with multiple possible engines in the
-- new catalog (A320, A318/19/21, B737, B747, B757, B767, B777, B787, A330,
-- A340, A380, H135) are deliberately left unmapped — aircraft_type_code
-- stays exactly as-is for those rows, nothing is lost or guessed. CRJ200/
-- CRJ700/CRJ900 have no match at all in the initial 80 and are also left
-- untouched. See docs/AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md for
-- the full per-code mapping table and counts.
--
-- Guarded by NOT EXISTS so a technician who already holds an explicit
-- normalized row for (technician_id, license_code, that same rating) is
-- never given a second, colliding row — this UPDATE is safe to run more
-- than once (idempotent) and safe to run against real data that already
-- has some normalized rows.
UPDATE technician_habilitations th
SET aircraft_type_rating_id = m.rating_id
FROM (VALUES
  ('A220',  '00000000-0000-4000-a000-000000000014'::uuid),
  ('A350',  '00000000-0000-4000-a000-000000000011'::uuid),
  ('Q400',  '00000000-0000-4000-a000-000000000037'::uuid),
  ('E175',  '00000000-0000-4000-a000-000000000032'::uuid),
  ('E190',  '00000000-0000-4000-a000-000000000033'::uuid),
  ('E195',  '00000000-0000-4000-a000-000000000033'::uuid),
  ('ATR42', '00000000-0000-4000-a000-000000000035'::uuid),
  ('ATR72', '00000000-0000-4000-a000-000000000035'::uuid),
  ('B407',  '00000000-0000-4000-a000-000000000065'::uuid),
  ('B412',  '00000000-0000-4000-a000-000000000078'::uuid),
  ('S76',   '00000000-0000-4000-a000-000000000079'::uuid),
  ('S92',   '00000000-0000-4000-a000-000000000080'::uuid),
  ('H125',  '00000000-0000-4000-a000-000000000062'::uuid),
  ('H145',  '00000000-0000-4000-a000-000000000071'::uuid),
  ('AW139', '00000000-0000-4000-a000-000000000075'::uuid),
  ('R44',   '00000000-0000-4000-a000-000000000067'::uuid)
) AS m(legacy_code, rating_id)
WHERE th.aircraft_type_code = m.legacy_code
  AND th.aircraft_type_rating_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM technician_habilitations existing
    WHERE existing.technician_id = th.technician_id
      AND existing.license_code = th.license_code
      AND existing.aircraft_type_rating_id = m.rating_id
  );


-- ============================================================
-- 4. offer_required_habilitations — exact category+rating requirement
-- ============================================================

CREATE TABLE offer_required_habilitations (
  offer_id                UUID        NOT NULL REFERENCES offers(id) ON DELETE CASCADE,
  license_code            TEXT        NOT NULL REFERENCES license_categories(code),
  aircraft_type_rating_id UUID        NOT NULL REFERENCES aircraft_type_ratings(id),
  -- Existing convention across all four requirement tables is
  -- mandatory/preferred (not required/preferred) — kept consistent rather
  -- than introducing a second label for the same two-value concept.
  requirement_level       TEXT        NOT NULL DEFAULT 'preferred'
                             CHECK (requirement_level IN ('mandatory', 'preferred')),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, license_code, aircraft_type_rating_id)
);


-- ============================================================
-- 5. requirement_level on the legacy broad-requirement tables
-- ============================================================
-- Default 'preferred' so existing offers are NOT retroactively turned into
-- hard filters — nothing in the matching logic treats 'preferred' as
-- exclusionary. Companies opt into 'mandatory' explicitly going forward.

ALTER TABLE offer_required_technician_types
  ADD COLUMN requirement_level TEXT NOT NULL DEFAULT 'preferred'
    CHECK (requirement_level IN ('mandatory', 'preferred'));

ALTER TABLE offer_required_licenses
  ADD COLUMN requirement_level TEXT NOT NULL DEFAULT 'preferred'
    CHECK (requirement_level IN ('mandatory', 'preferred'));

ALTER TABLE offer_required_aircraft_types
  ADD COLUMN requirement_level TEXT NOT NULL DEFAULT 'preferred'
    CHECK (requirement_level IN ('mandatory', 'preferred'));


-- ============================================================
-- 6. catalog_requests — "I can't find my rating" user requests
-- ============================================================
-- Free text only. Never inserted into aircraft_type_ratings directly and
-- never participates in matching until an admin resolves it into a real
-- catalog row (resolved_aircraft_type_rating_id).

CREATE TABLE catalog_requests (
  id                                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by                       UUID        NOT NULL REFERENCES profiles(id),
  raw_text                           TEXT        NOT NULL,
  context                            TEXT,
  status                             TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending', 'approved', 'rejected', 'merged')),
  resolved_aircraft_type_rating_id   UUID        REFERENCES aircraft_type_ratings(id),
  admin_notes                        TEXT,
  created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-owned fields: status/resolved_aircraft_type_rating_id/admin_notes
-- must always start 'pending'/NULL/NULL regardless of what the client sends
-- on INSERT. Only admin RPCs (a future phase) can move a request out of
-- 'pending'; for this phase there is no UPDATE policy at all for non-admin
-- users (see RLS below), so this trigger's only job is closing the
-- INSERT-time loophole.
CREATE OR REPLACE FUNCTION public.force_catalog_request_defaults()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  NEW.status := 'pending';
  NEW.resolved_aircraft_type_rating_id := NULL;
  NEW.admin_notes := NULL;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER force_catalog_request_defaults
  BEFORE INSERT ON catalog_requests
  FOR EACH ROW EXECUTE FUNCTION public.force_catalog_request_defaults();


-- ============================================================
-- 7. Row Level Security
-- ============================================================

-- ── aircraft_type_ratings ──
-- Same public-read / admin-write pattern as the other catalog tables
-- (technician_types, license_categories, aircraft_types, ...). A normal
-- authenticated user can read the whole catalog (including inactive rows —
-- the app filters is_active client-side, same convention as aircraft_types)
-- but cannot insert, edit, activate or delete a row themselves.
ALTER TABLE aircraft_type_ratings ENABLE ROW LEVEL SECURITY;
CREATE POLICY atr_read  ON aircraft_type_ratings FOR SELECT USING (true);
CREATE POLICY atr_admin ON aircraft_type_ratings FOR ALL    USING (is_admin());

-- ── offer_required_habilitations ──
-- Mirrors offer_required_aircraft_types exactly: public read for
-- published+visible offers, owner-company read for their own (draft)
-- offers, insert/delete gated by can_act_for_company(), admin full access.
-- No UPDATE policy — rows are replaced (delete+insert), matching the
-- existing offerRepository.replaceRequirements() pattern.

ALTER TABLE offer_required_habilitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY orh_select_published ON offer_required_habilitations
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_habilitations.offer_id
        AND o.status = 'published' AND o.visible = true
    )
  );

CREATE POLICY orh_select_own_company ON offer_required_habilitations
  FOR SELECT USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_habilitations.offer_id
        AND o.company_id = my_company_id()
    )
  );

CREATE POLICY orh_insert_company ON offer_required_habilitations
  FOR INSERT WITH CHECK (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_habilitations.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY orh_delete_company ON offer_required_habilitations
  FOR DELETE USING (
    is_active_user()
    AND EXISTS (
      SELECT 1 FROM offers o
      WHERE o.id = offer_required_habilitations.offer_id
        AND can_act_for_company(o.company_id)
    )
  );

CREATE POLICY orh_all_admin ON offer_required_habilitations
  FOR ALL USING (is_admin());

-- ── catalog_requests ──
-- Users can create and read their own requests. Nobody but admin can
-- update (approve/reject/merge) — enforced by the absence of any non-admin
-- UPDATE policy, plus the BEFORE INSERT trigger above closing the
-- insert-time loophole for status/resolved_aircraft_type_rating_id/admin_notes.

ALTER TABLE catalog_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY catreq_insert_own ON catalog_requests
  FOR INSERT WITH CHECK (requested_by = auth.uid() AND is_active_user());

CREATE POLICY catreq_select_own ON catalog_requests
  FOR SELECT USING (requested_by = auth.uid());

CREATE POLICY catreq_all_admin ON catalog_requests
  FOR ALL USING (is_admin());
