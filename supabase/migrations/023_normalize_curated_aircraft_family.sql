-- ============================================================
-- AviationJobTalent V2 — Migration 023: normalize aircraft_family on the
-- 80 curated (migration 016) rows to the official EASA-derived convention
-- ============================================================
-- Created: 2026-07-22
-- Applied: 2026-07-22 against rotoaxismatch-dev, approved by the user.
-- Post-apply verification: 0 rows left holding an old-style aircraft_family
-- value (exhaustive check, confirmed independently too); the 3 re-backfilled
-- offer_required_aircraft_types keys resolve against the real getFamilies()
-- (541 -> 538 groups, confirming the AS350/AS350-H125 merge landed).
--
-- Problem being fixed (found by the user auditing Supabase directly,
-- 2026-07-22): migration 020's generator deliberately left aircraft_family
-- untouched for the 80 rows that already existed (migration 016's hand-
-- curated seed) — see its own comment: "the initial 80 were hand-curated
-- with more care... than this script's heuristics can reproduce, and
-- overwriting them would be a quality regression, not an improvement."
-- That assumption doesn't hold for aircraft_family specifically: 72 of the
-- 80 curated rows use a DIFFERENT naming convention than the ~526 rows
-- migration 020 added from the official JSON —
--   - curated: short/informal, manufacturer usually NOT included
--     ("737 NG", "ATR 42/72", "A109", "767")
--   - official: derived straight from easa_endorsement (minus the engine
--     parenthetical), manufacturer usually included as a text prefix
--     ("Boeing 737-600/700/800/900", "ATR 42-400/500/72-212A",
--     "Agusta A109 Series", "Boeing 767-200/300/400")
-- Consequence for Fase 3b's broad aircraft-type filter (getFamilies() /
-- getAircraftFamilyKey(), src/constants/aircraftTypeRatingViews.ts +
-- aircraftTypeRatings.ts): grouping is exact-string based, so this
-- convention split silently fragments/misgroups families, and the two
-- conventions don't even sort together (curated strings don't start with
-- the manufacturer name the way official ones do).
--
-- What changes:
--   1. UPDATEs aircraft_family on exactly the 72 curated rows that differ
--      from the official derivation, to that official value. The official
--      value = the matching entry's own aircraftFamily field in
--      scripts/data/easa_type_ratings_EDD2019-024R.json (looked up by
--      easa_endorsement — the same field migration 020's generator reads,
--      via the same resolveEngineAndFamily() logic; NOT a fresh regex
--      re-derivation). A fixed, explicit, enumerated (id, new_family)
--      list — same style as generateEasaFullCatalogMigration.ts's own
--      KNOWN_ENDORSEMENT_DRIFT_FIXES — never a generic fuzzy matcher.
--      manufacturer, easa_endorsement, display_name, commercial_aliases,
--      priority etc. are NOT touched — only aircraft_family.
--   2. Re-backfills the 3 rows in offer_required_aircraft_types that
--      migration 022 wrote (the only rows in that table today) — their
--      family key embeds the old aircraft_family string, which no longer
--      matches what getFamilies()/getAircraftFamilyKey() computes once
--      step 1 lands, so it would silently orphan otherwise.
--
-- Side effects worth knowing about, not fixed here (no new curation):
--   - Two curated rows that were WRONGLY split before this fix now
--     correctly merge: ids ...61 ("AS350") and ...62 ("AS350/H125") both
--     become "Eurocopter AS 350" — same real EASA endorsement family,
--     previously fragmented by inconsistent curated naming alone.
--   - The ceo/neo Airbus A320 overlap (id ...1 "A318/A319/A320/A321" stays
--     separate from ids ...2/...3/...4, which all become the identical
--     "Airbus A319/A320/A321") is UNCHANGED by this migration — that's
--     EASA's own endorsement naming not distinguishing ceo/neo in the
--     airframe-range text, not a curation artifact; not something to
--     invent a split for.
--   - src/utils/v2CompatAdapters.ts and app/technician/profile.tsx derive
--     an aircraftTypes list from rating.aircraftFamily live, in-memory,
--     every read — never persisted — so they self-correct automatically,
--     no backfill needed. Same for offerMatchExplain.ts's
--     areRatingsRelated()/getAircraftFamilyKey()/
--     resolveLegacyCodeToFamilyKeys() — all computed live from whatever
--     catalog snapshot is loaded.
--   - Nothing else in the schema persists a copy of aircraft_family
--     (checked information_schema.columns — only aircraft_type_ratings and
--     the unrelated legacy aircraft_types table have a column by that
--     name).
--   - docs/*.md and docs/SUPABASE_SCHEMA_V2.sql may quote old family
--     strings as examples; historical/reference only, nothing reads them
--     programmatically, not updated here.
-- ============================================================


-- ============================================================
-- 1. Normalize aircraft_family on the 72 affected curated rows
-- ============================================================
-- Idempotent: the WHERE clause only matches rows still holding the OLD
-- value, so re-running after this has already applied is a no-op.
UPDATE aircraft_type_ratings t
SET aircraft_family = v.new_family, updated_at = now()
FROM (VALUES
  ('00000000-0000-4000-a000-000000000001', 'Airbus A318/A319/A320/A321'),
  ('00000000-0000-4000-a000-000000000002', 'Airbus A319/A320/A321'),
  ('00000000-0000-4000-a000-000000000003', 'Airbus A319/A320/A321'),
  ('00000000-0000-4000-a000-000000000004', 'Airbus A319/A320/A321'),
  ('00000000-0000-4000-a000-000000000005', 'Airbus A330'),
  ('00000000-0000-4000-a000-000000000006', 'Airbus A330'),
  ('00000000-0000-4000-a000-000000000007', 'Airbus A330'),
  ('00000000-0000-4000-a000-000000000008', 'Airbus A330'),
  ('00000000-0000-4000-a000-000000000009', 'Airbus A340'),
  ('00000000-0000-4000-a000-000000000010', 'Airbus A340'),
  ('00000000-0000-4000-a000-000000000011', 'Airbus A350'),
  ('00000000-0000-4000-a000-000000000012', 'Airbus A380'),
  ('00000000-0000-4000-a000-000000000013', 'Airbus A380'),
  ('00000000-0000-4000-a000-000000000014', 'Bombardier BD-500 Series'),
  ('00000000-0000-4000-a000-000000000015', 'Boeing 737-300/400/500'),
  ('00000000-0000-4000-a000-000000000016', 'Boeing 737-600/700/800/900'),
  ('00000000-0000-4000-a000-000000000017', 'Boeing 737-7/8/9'),
  ('00000000-0000-4000-a000-000000000018', 'Boeing 747-400'),
  ('00000000-0000-4000-a000-000000000019', 'Boeing 747-400'),
  ('00000000-0000-4000-a000-000000000020', 'Boeing 747-400'),
  ('00000000-0000-4000-a000-000000000021', 'Boeing 747-8'),
  ('00000000-0000-4000-a000-000000000022', 'Boeing 757-200/300'),
  ('00000000-0000-4000-a000-000000000023', 'Boeing 757-200/300'),
  ('00000000-0000-4000-a000-000000000024', 'Boeing 767-200/300/400'),
  ('00000000-0000-4000-a000-000000000025', 'Boeing 767-200/300'),
  ('00000000-0000-4000-a000-000000000026', 'Boeing 777-200/300'),
  ('00000000-0000-4000-a000-000000000027', 'Boeing 777-200/300'),
  ('00000000-0000-4000-a000-000000000028', 'Boeing 777-200/300'),
  ('00000000-0000-4000-a000-000000000029', 'Boeing 787-8/9/10'),
  ('00000000-0000-4000-a000-000000000030', 'Boeing 787-8/9/10'),
  ('00000000-0000-4000-a000-000000000031', 'Embraer EMB-135/145'),
  ('00000000-0000-4000-a000-000000000032', 'Embraer ERJ-170 Series'),
  ('00000000-0000-4000-a000-000000000033', 'Embraer ERJ-190 Series'),
  ('00000000-0000-4000-a000-000000000034', 'Embraer ERJ-190 Series'),
  ('00000000-0000-4000-a000-000000000035', 'ATR 42-400/500/72-212A'),
  ('00000000-0000-4000-a000-000000000036', 'Bombardier DHC-8-100/200/300'),
  ('00000000-0000-4000-a000-000000000037', 'Bombardier DHC-8-400'),
  ('00000000-0000-4000-a000-000000000038', 'Fokker 50/60 Series'),
  ('00000000-0000-4000-a000-000000000040', 'Saab (SF) 340'),
  ('00000000-0000-4000-a000-000000000042', 'BAe 146/ AVRO 146-RJ'),
  ('00000000-0000-4000-a000-000000000043', 'CASA C-212'),
  ('00000000-0000-4000-a000-000000000044', 'CASA CN-235'),
  ('00000000-0000-4000-a000-000000000045', 'CASA C-295'),
  ('00000000-0000-4000-a000-000000000048', 'Cessna 525/525A/525B'),
  ('00000000-0000-4000-a000-000000000049', 'Cessna 525C'),
  ('00000000-0000-4000-a000-000000000050', 'Cessna 550/560'),
  ('00000000-0000-4000-a000-000000000051', 'Bombardier BD-100-1A10'),
  ('00000000-0000-4000-a000-000000000052', 'Bombardier BD-700 Series'),
  ('00000000-0000-4000-a000-000000000053', 'Bombardier CL-600-2B16 (604 Variant)'),
  ('00000000-0000-4000-a000-000000000054', 'Gulfstream GIV/GIV-SP Series'),
  ('00000000-0000-4000-a000-000000000055', 'Gulfstream GV-SP Series'),
  ('00000000-0000-4000-a000-000000000056', 'Gulfstream GVI'),
  ('00000000-0000-4000-a000-000000000058', 'Pilatus PC-12'),
  ('00000000-0000-4000-a000-000000000059', 'Pilatus PC-24'),
  ('00000000-0000-4000-a000-000000000060', 'Socata TBM700'),
  ('00000000-0000-4000-a000-000000000061', 'Eurocopter AS 350'),
  ('00000000-0000-4000-a000-000000000062', 'Eurocopter AS 350'),
  ('00000000-0000-4000-a000-000000000063', 'Eurocopter EC 130'),
  ('00000000-0000-4000-a000-000000000064', 'Agusta AB206 / Bell 206'),
  ('00000000-0000-4000-a000-000000000066', 'Robinson R66'),
  ('00000000-0000-4000-a000-000000000067', 'Robinson R22/R44 Series'),
  ('00000000-0000-4000-a000-000000000068', 'Eurocopter EC 135'),
  ('00000000-0000-4000-a000-000000000069', 'Eurocopter EC 135'),
  ('00000000-0000-4000-a000-000000000070', 'Eurocopter MBB-BK 117 C2'),
  ('00000000-0000-4000-a000-000000000071', 'Eurocopter MBB-BK 117 D2'),
  ('00000000-0000-4000-a000-000000000072', 'Eurocopter EC 175'),
  ('00000000-0000-4000-a000-000000000073', 'Eurocopter EC 225'),
  ('00000000-0000-4000-a000-000000000074', 'Agusta A109 Series'),
  ('00000000-0000-4000-a000-000000000075', 'Agusta AB139 / AW139'),
  ('00000000-0000-4000-a000-000000000078', 'Bell 412 / Agusta AB412'),
  ('00000000-0000-4000-a000-000000000079', 'Sikorsky S-76C'),
  ('00000000-0000-4000-a000-000000000080', 'Sikorsky S-92A')
) AS v(id, new_family)
WHERE t.id = v.id::uuid
  AND t.aircraft_family != v.new_family;


-- ============================================================
-- 2. Re-backfill the 3 offer_required_aircraft_types rows migration 022
--    wrote, so their family key matches the normalized catalog
-- ============================================================
-- Idempotent: matches only rows still holding the OLD key.
UPDATE offer_required_aircraft_types o
SET aircraft_type_code = v.new_key
FROM (VALUES
  ('Sikorsky::S-76C', 'Sikorsky::Sikorsky S-76C'),
  ('Airbus Helicopters::AS350/H125', 'Airbus Helicopters::Eurocopter AS 350'),
  ('Airbus Helicopters::EC135/H135', 'Airbus Helicopters::Eurocopter EC 135')
) AS v(old_key, new_key)
WHERE o.aircraft_type_code = v.old_key;


-- ============================================================
-- 3. Post-migration verification
-- ============================================================
DO $$
DECLARE
  mismatched_curated INT;
  stale_offer_keys INT;
BEGIN
  -- Exhaustive, not a sample: every one of the exact 72 (id, old_family)
  -- pairs this migration targeted must have moved off its old value.
  SELECT count(*) INTO mismatched_curated
  FROM aircraft_type_ratings t
  JOIN (VALUES
    ('00000000-0000-4000-a000-000000000001', 'A318/A319/A320/A321'),
    ('00000000-0000-4000-a000-000000000002', 'A319/A320/A321'),
    ('00000000-0000-4000-a000-000000000003', 'A319/A320/A321'),
    ('00000000-0000-4000-a000-000000000004', 'A319/A320/A321'),
    ('00000000-0000-4000-a000-000000000005', 'A330'),
    ('00000000-0000-4000-a000-000000000006', 'A330'),
    ('00000000-0000-4000-a000-000000000007', 'A330'),
    ('00000000-0000-4000-a000-000000000008', 'A330neo'),
    ('00000000-0000-4000-a000-000000000009', 'A340-200/300'),
    ('00000000-0000-4000-a000-000000000010', 'A340-500/600'),
    ('00000000-0000-4000-a000-000000000011', 'A350'),
    ('00000000-0000-4000-a000-000000000012', 'A380'),
    ('00000000-0000-4000-a000-000000000013', 'A380'),
    ('00000000-0000-4000-a000-000000000014', 'A220'),
    ('00000000-0000-4000-a000-000000000015', '737 Classic'),
    ('00000000-0000-4000-a000-000000000016', '737 NG'),
    ('00000000-0000-4000-a000-000000000017', '737 MAX'),
    ('00000000-0000-4000-a000-000000000018', '747-400'),
    ('00000000-0000-4000-a000-000000000019', '747-400'),
    ('00000000-0000-4000-a000-000000000020', '747-400'),
    ('00000000-0000-4000-a000-000000000021', '747-8'),
    ('00000000-0000-4000-a000-000000000022', '757'),
    ('00000000-0000-4000-a000-000000000023', '757'),
    ('00000000-0000-4000-a000-000000000024', '767'),
    ('00000000-0000-4000-a000-000000000025', '767'),
    ('00000000-0000-4000-a000-000000000026', '777'),
    ('00000000-0000-4000-a000-000000000027', '777'),
    ('00000000-0000-4000-a000-000000000028', '777'),
    ('00000000-0000-4000-a000-000000000029', '787'),
    ('00000000-0000-4000-a000-000000000030', '787'),
    ('00000000-0000-4000-a000-000000000031', 'ERJ 135/145'),
    ('00000000-0000-4000-a000-000000000032', 'E170/E175'),
    ('00000000-0000-4000-a000-000000000033', 'E190/E195'),
    ('00000000-0000-4000-a000-000000000034', 'E190-E2/E195-E2'),
    ('00000000-0000-4000-a000-000000000035', 'ATR 42/72'),
    ('00000000-0000-4000-a000-000000000036', 'Dash 8-100/200/300'),
    ('00000000-0000-4000-a000-000000000037', 'Dash 8 Q400'),
    ('00000000-0000-4000-a000-000000000038', 'Fokker 50/60'),
    ('00000000-0000-4000-a000-000000000040', 'Saab 340'),
    ('00000000-0000-4000-a000-000000000042', 'BAe 146/Avro RJ'),
    ('00000000-0000-4000-a000-000000000043', 'C-212'),
    ('00000000-0000-4000-a000-000000000044', 'CN-235'),
    ('00000000-0000-4000-a000-000000000045', 'C-295'),
    ('00000000-0000-4000-a000-000000000048', 'CitationJet/CJ1/CJ2/CJ3'),
    ('00000000-0000-4000-a000-000000000049', 'Citation CJ4'),
    ('00000000-0000-4000-a000-000000000050', 'Citation II/V/Bravo/Ultra/Encore'),
    ('00000000-0000-4000-a000-000000000051', 'Challenger 300/350'),
    ('00000000-0000-4000-a000-000000000052', 'Global Express/5000/6000'),
    ('00000000-0000-4000-a000-000000000053', 'Challenger 604/605'),
    ('00000000-0000-4000-a000-000000000054', 'GIV/GIV-SP'),
    ('00000000-0000-4000-a000-000000000055', 'GV-SP'),
    ('00000000-0000-4000-a000-000000000056', 'GVI'),
    ('00000000-0000-4000-a000-000000000058', 'PC-12'),
    ('00000000-0000-4000-a000-000000000059', 'PC-24'),
    ('00000000-0000-4000-a000-000000000060', 'TBM'),
    ('00000000-0000-4000-a000-000000000061', 'AS350'),
    ('00000000-0000-4000-a000-000000000062', 'AS350/H125'),
    ('00000000-0000-4000-a000-000000000063', 'EC130/H130'),
    ('00000000-0000-4000-a000-000000000064', 'Bell 206/AB206'),
    ('00000000-0000-4000-a000-000000000066', 'R66'),
    ('00000000-0000-4000-a000-000000000067', 'R22/R44'),
    ('00000000-0000-4000-a000-000000000068', 'EC135/H135'),
    ('00000000-0000-4000-a000-000000000069', 'EC135/H135'),
    ('00000000-0000-4000-a000-000000000070', 'EC145/BK117 C2'),
    ('00000000-0000-4000-a000-000000000071', 'H145/BK117 D2'),
    ('00000000-0000-4000-a000-000000000072', 'H175'),
    ('00000000-0000-4000-a000-000000000073', 'H225'),
    ('00000000-0000-4000-a000-000000000074', 'A109'),
    ('00000000-0000-4000-a000-000000000075', 'AW139'),
    ('00000000-0000-4000-a000-000000000078', 'Bell 412/AB412'),
    ('00000000-0000-4000-a000-000000000079', 'S-76C'),
    ('00000000-0000-4000-a000-000000000080', 'S-92A')
  ) AS old_vals(id, old_family)
    ON t.id = old_vals.id::uuid
  WHERE t.aircraft_family = old_vals.old_family;
  IF mismatched_curated > 0 THEN
    RAISE EXCEPTION 'Migration 023: % curated row(s) still hold their old aircraft_family value', mismatched_curated;
  END IF;

  SELECT count(*) INTO stale_offer_keys
  FROM offer_required_aircraft_types
  WHERE aircraft_type_code IN (
    'Sikorsky::S-76C', 'Airbus Helicopters::AS350/H125', 'Airbus Helicopters::EC135/H135'
  );
  IF stale_offer_keys > 0 THEN
    RAISE EXCEPTION 'Migration 023: % offer_required_aircraft_types row(s) still hold a pre-normalization family key', stale_offer_keys;
  END IF;
END $$;
