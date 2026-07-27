// Generates supabase/migrations/020_easa_full_catalog.sql from the official
// EASA "List of Part-66 Type Ratings" (ED Decision 2019/024/R), reconciled
// against the CURRENT live aircraft_type_ratings table (read-only query —
// this script never writes to Supabase itself).
//
// Regenerable: re-run this script whenever scripts/data/ gets a newer EDD
// revision JSON — it always diffs against whatever is live at that moment,
// never against a stale hardcoded snapshot. Source JSON shape is documented
// in the mission brief (easaEndorsement/aircraftFamily/engineDesignation/
// easaGroup/productType/tcHolders/modelAliases/commercialAliases/sourceRevision).
//
// Output of this script is ONLY the .sql file + docs/archive/EASA_FULL_CATALOG_RECONCILIATION_REPORT.md
// (CHECKPOINT 1 material). It never calls apply_migration — applying the
// generated file against Supabase requires a separate, explicit step after
// the user has reviewed the reconciliation report.
//
// Run: npx tsc --module commonjs --target es2020 --moduleResolution node --esModuleInterop --skipLibCheck --outDir .tmp-generate-easa-catalog scripts/generateEasaFullCatalogMigration.ts && node .tmp-generate-easa-catalog/scripts/generateEasaFullCatalogMigration.js
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile, findRepoRoot } from './lib/loadEnv';

loadEnvFile();
const REPO_ROOT = findRepoRoot(__dirname);

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (checked process.env and .env).');
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================
// Source JSON shape
// ============================================================
interface EasaSourceEntry {
  easaEndorsement: string;
  aircraftFamily: string;
  engineDesignation: string | null;
  easaGroup: '1' | '2a' | '2b' | '2c' | '3';
  productType: 'Aeroplane' | 'Helicopter' | 'Gas Airship';
  tcHolders: string[];
  modelAliases: string[];
  commercialAliases: string[];
  sourceRevision: string;
}

interface CurrentRow {
  id: string;
  manufacturer: string;
  aircraft_family: string;
  engine_manufacturer: string | null;
  engine_family: string | null;
  easa_endorsement: string;
  display_name: string;
  commercial_aliases: string[];
  aircraft_category: string;
  easa_group: string | null;
  source_revision: string | null;
  priority: number;
  is_active: boolean;
  // NOTE: product_type is NOT selected here — the column does not exist on
  // the live table yet (this migration adds it, see section 0 below). There
  // is nothing to reconcile it against; every row gets it freshly from the
  // source JSON, for both the INSERT and UPDATE paths.
}

// ============================================================
// KNOWN_ENDORSEMENT_DRIFT_FIXES — the initial 80-row seed (migration 016)
// hand-typed 4 easa_endorsement strings with tiny formatting drift from the
// real EASA source (missing spaces, an added manufacturer prefix). Found by
// manually diffing all 80 curated strings against this JSON (documented in
// docs/archive/EASA_FULL_CATALOG_RECONCILIATION_REPORT.md). Exact-string reconciliation
// alone would treat these 4 as brand-new rows and create duplicates of
// already-existing, FK-referenced ratings — instead the generated migration
// corrects these 4 rows' easa_endorsement to the canonical JSON string
// (by their known fixed id) BEFORE the main upsert runs, so the upsert's
// ON CONFLICT (easa_endorsement) then matches them correctly and preserves
// their id. This is a small, explicit, enumerated exception list — never a
// generic fuzzy-matcher — so it never silently merges two genuinely
// different ratings.
const KNOWN_ENDORSEMENT_DRIFT_FIXES: { id: string; oldEndorsement: string; canonicalEndorsement: string }[] = [
  { id: '00000000-0000-4000-a000-000000000036', oldEndorsement: 'Bombardier DHC-8-100/200/300 (PWC PW120)', canonicalEndorsement: 'Bombardier DHC-8-100/200/300 (PWC PW 120)' },
  { id: '00000000-0000-4000-a000-000000000038', oldEndorsement: 'Fokker 50/60 Series (PWC PW125/127)', canonicalEndorsement: 'Fokker 50/60 Series (PWC PW 125/127)' },
  { id: '00000000-0000-4000-a000-000000000042', oldEndorsement: 'BAe 146/AVRO 146-RJ (Honeywell ALF500 Series)', canonicalEndorsement: 'BAe 146/ AVRO 146-RJ (Honeywell ALF500 Series)' },
  { id: '00000000-0000-4000-a000-000000000057', oldEndorsement: 'Dassault Falcon 900C/EX (Honeywell TFE731)', canonicalEndorsement: 'Falcon 900C/EX (Honeywell TFE731)' },
];

// ============================================================
// Engine designation parser — simple, documented, "null when unsure"
// ============================================================
// EASA's engineDesignation is free text, e.g. "PWC PW206", "Turbomeca
// Arrius 2B", "Lycoming", "CFM56". Split into (engineManufacturer,
// engineFamily) via a small table of known abbreviation prefixes (checked
// longest-first so "RRD"/"PWC" win over "RR"/"PW") and known single-word
// manufacturer names. Anything not recognized keeps the FULL raw string as
// engineManufacturer and leaves engineFamily null rather than guessing a
// split — never fabricates a wrong manufacturer/family boundary.
const PREFIX_MANUFACTURERS: [string, string][] = [
  // Order matters: longest/most specific prefix first.
  ['RRD', 'Rolls-Royce Deutschland'],
  ['PWC', 'Pratt & Whitney Canada'],
  ['RR', 'Rolls-Royce'],
  ['PW', 'Pratt & Whitney'],
  ['GE', 'General Electric'],
  ['CFM', 'CFM International'],
  ['IAE', 'International Aero Engines'],
];

// Bare manufacturer names that already appear in the source text as-is
// (first token == manufacturer name, no abbreviation to expand) — remainder
// (if any) becomes the family.
const SINGLE_TOKEN_MANUFACTURERS: Record<string, string> = {
  Lycoming: 'Lycoming', Continental: 'Continental', Rotax: 'Rotax',
  Turbomeca: 'Turbomeca', Safran: 'Safran', Honeywell: 'Honeywell',
  Williams: 'Williams International', Walter: 'Walter', Franklin: 'Franklin',
  Technify: 'Technify', LOM: 'LOM', Porsche: 'Porsche', Ivchenko: 'Ivchenko',
  Austro: 'Austro Engine', PZL: 'PZL', Vedeneyev: 'Vedeneyev', Wright: 'Wright',
  Jacobs: 'Jacobs', Limbach: 'Limbach', Potez: 'Potez', Superior: 'Superior',
  Rectimo: 'Rectimo', VW: 'Volkswagen', JPX: 'JPX', Thielert: 'Thielert',
  Jabiru: 'Jabiru',
};

// Known single-token (no space) designations that are actually a fused
// manufacturer+family with no separating token for the prefix rule above to
// find — small, explicit, high-value exceptions only (not an attempt at
// exhaustive coverage).
const EXACT_DESIGNATION_OVERRIDES: Record<string, [string, string]> = {
  CFM56: ['CFM International', 'CFM56'],
  GEnx: ['General Electric', 'GEnx'],
};

// Source data quirk, found by manual review at CHECKPOINT 1 (only 2 of 606
// rows match this): "Cessna/Reims-Cessna 337 Series (Continental) (not
// pressurised)" / "(pressurised)" — the real engine ("Continental") is
// embedded in aircraftFamily's OWN trailing parenthetical, and
// engineDesignation was populated with the SECOND, unrelated trailing
// qualifier instead ("pressurised"/"not pressurised" distinguishes the
// naturally-aspirated variant from the turbocharged one — a real, separate
// EASA endorsement each, never merged). Detected narrowly by matching
// engineDesignation against this exact qualifier text, not by any "family
// ends in parens" heuristic — two Bombardier CL-600 rows also end in a
// parenthetical ("... (604 Variant)") but have a perfectly normal
// engineDesignation ("GE CF34") and must be left alone.
const PRESSURISATION_QUALIFIER = /^(not )?pressurised$/i;

interface ParsedEngine {
  manufacturer: string | null;
  family: string | null;
  uncertain: boolean;
}

// Returns the engine AND the aircraft_family value to use for this row —
// normally just the source's own aircraftFamily unchanged, except for the
// pressurisation-qualifier quirk above, where the engine is pulled out of
// family's trailing parenthetical and family is returned with that
// parenthetical stripped (matching the engine-free family convention every
// other row in the catalog already follows).
function resolveEngineAndFamily(entry: EasaSourceEntry): { engine: ParsedEngine; aircraftFamily: string } {
  if (entry.engineDesignation && PRESSURISATION_QUALIFIER.test(entry.engineDesignation.trim())) {
    const match = entry.aircraftFamily.match(/^(.*)\s*\(([^()]+)\)\s*$/);
    if (match) {
      return {
        engine: { manufacturer: match[2].trim(), family: null, uncertain: false },
        aircraftFamily: match[1].trim(),
      };
    }
  }
  return { engine: parseEngineDesignation(entry.engineDesignation), aircraftFamily: entry.aircraftFamily };
}

function parseEngineDesignation(designation: string | null): ParsedEngine {
  if (!designation) return { manufacturer: null, family: null, uncertain: false };
  const trimmed = designation.trim();
  if (EXACT_DESIGNATION_OVERRIDES[trimmed]) {
    const [m, f] = EXACT_DESIGNATION_OVERRIDES[trimmed];
    return { manufacturer: m, family: f, uncertain: false };
  }
  const tokens = trimmed.split(/\s+/);
  const first = tokens[0];
  for (const [prefix, fullName] of PREFIX_MANUFACTURERS) {
    if (first === prefix) {
      const rest = tokens.slice(1).join(' ').trim();
      return { manufacturer: fullName, family: rest || null, uncertain: rest === '' };
    }
  }
  if (SINGLE_TOKEN_MANUFACTURERS[first]) {
    const rest = tokens.slice(1).join(' ').trim();
    return { manufacturer: SINGLE_TOKEN_MANUFACTURERS[first], family: rest || null, uncertain: false };
  }
  // Unrecognized pattern — keep the raw text visible (never silently
  // dropped), flagged as uncertain for the reconciliation report.
  return { manufacturer: trimmed, family: null, uncertain: true };
}

// ============================================================
// Aircraft category heuristic — documented, best-effort (see mission brief)
// ============================================================
const VALID_CATEGORIES = new Set([
  'commercial_airplane', 'regional_airplane', 'regional_turboprop',
  'business_jet', 'general_aviation', 'helicopter',
]);

// Group-1 Aeroplane entries span everything from A380s to Falcon 900s to
// ATR 72s — easaGroup alone does not distinguish them, so this keyword net
// (matched against aircraftFamily, case-insensitive) does. Order matters:
// checked business jet -> regional turboprop -> regional jet -> default
// commercial_airplane. Documented as best-effort; reviewed row-by-row in the
// reconciliation report, not claimed to be regulatory-grade.
const BUSINESS_JET_KEYWORDS = [
  'gulfstream', 'falcon', 'learjet', 'citation', 'hawker', 'challenger',
  'global express', 'global 5000', 'global 6000', 'global 7500', 'bae 125',
  'premier', 'phenom', 'legacy 450', 'legacy 500', 'legacy 600', 'legacy 650',
  'praetor', 'astra', 'westwind', 'galaxy', 'beechjet', 'sovereign',
  'latitude', 'longitude', 'pc-24', 'diamond i', 'diamond ii', 'jet commander',
  'sabreliner', 'hs 125', 'starship',
  // Added after auditing the group-1 Aeroplane classification table
  // (docs/archive/EASA_FULL_CATALOG_RECONCILIATION_REPORT.md): several real
  // business jets are only identified in this source by their type
  // certificate code, not a marketing name — CL-600 (Challenger family),
  // BD-100/BD-700 (Challenger 300 / Global family), Cessna 5xx/6xx/7xx
  // (Citation family), HondaJet, Eclipse, Beechjet 400, Cirrus SF50 (a
  // single-engine jet, unlike the piston SR20/SR22 which don't appear here).
  'cl-600', 'bd-100', 'bd-700', 'cessna 5', 'cessna 6', 'cessna 7',
  'honda aircraft', 'ha-420', 'eclipse ea', 'beech 400', 'sf50',
  'emb-5', 'iai 112', 'lockheed 1329', 'beech 390',
];
const REGIONAL_TURBOPROP_KEYWORDS = [
  'atr', 'dash 8', 'dhc-8', 'dhc-7', 'dhc-6', 'saab', 'dornier', 'do 328',
  'jetstream', 'metro', 'sa226', 'sa227', 'beech 1900', 'emb-120',
  'embraer 120', 'cn235', 'cn-235', 'let 410', 'twin otter', 'convair 5',
  'convair 6', 'fokker 27', 'f27', 'viscount', 'hs748', 'an-26', 'an-28',
  'an-32', 'c-27', 'c-212', 'c-295', 'atp', 'short 330', 'short 360',
  'sd330', 'sd360', 'bandeirante', 'emb-110', 'shorts',
  // Added after audit: Fokker 50/60 is a turboprop (unlike the 70/100 jets),
  // missed because the family string doesn't say "turboprop" anywhere.
  'fokker 50/60', 'fokker 50', 'fokker 60',
  'sa26', 'let l-410', 'let-410', 'let l-420', 'an26', 'beech 99', 'beech 100',
];
const REGIONAL_JET_KEYWORDS = [
  'crj', 'regional jet', 'erj', 'e170', 'e175', 'e190', 'e195', 'e-jet',
  'fokker 70', 'fokker 100', 'f70', 'f100', 'bae 146', 'avro rj',
  'superjet', 'ssj100', 'arj21',
  // Added after audit: the Sukhoi Superjet 100 appears under its original
  // Russian program designation "RRJ-95", not "Superjet"; Fokker F28 is the
  // 70/100's direct predecessor, same small-regional-jet class.
  'rrj-95', 'f28', 'emb-135', 'emb-145',
];
// General-aviation turboprop singles/light twins that sit in EASA group 1
// (not group 3, where the general_aviation heuristic normally applies) —
// without this list they fell into the commercial_airplane default
// alongside actual airliners, which is clearly wrong. Added after auditing
// the group-1 table; deliberately narrow (named families only, not a broad
// "everything small is general aviation" rule) to avoid over-claiming.
const GENERAL_AVIATION_KEYWORDS = [
  'tbm', 'pc-12', 'piaggio', 'mitsubishi mu-2', 'socata',
  'beech 90', 'beech 200', 'beech 300', 'beech b100', 'king air',
  'piper pa-46', 'piper pa-31t', 'piper pa-42', 'twin commander', 'nomad',
  'vulcanair', 'pzl m', 'grob', 'britten-norman', 'bn2t', 'emb-121',
  // Added per CHECKPOINT 1 review: Cessna piston/turboprop twins and the
  // Reims-Cessna F 406 utility twin, all general aviation, not airliners.
  'cessna 400 series', 'cessna 425', 'cessna 441', 'reims-cessna f 406',
];

function matchesAny(haystack: string, needles: string[]): boolean {
  const h = haystack.toLowerCase();
  return needles.some((n) => h.includes(n));
}

function classifyCategory(entry: EasaSourceEntry): { category: string; heuristicNote: string } {
  if (entry.productType === 'Helicopter') return { category: 'helicopter', heuristicNote: 'productType=Helicopter' };

  if (entry.productType === 'Gas Airship') {
    // Not covered by the mission brief's heuristic list (only 3 rows in the
    // whole catalog). No dedicated category exists for airships; bucketed
    // into general_aviation as the closest fit. Flagged explicitly in the
    // report rather than silently folded in — a real domain call the user
    // should confirm/override at CHECKPOINT 1.
    return { category: 'general_aviation', heuristicNote: 'productType=Gas Airship (no dedicated category — mapped to general_aviation, only 3 rows total)' };
  }

  // productType === 'Aeroplane'
  if (entry.easaGroup === '3') return { category: 'general_aviation', heuristicNote: 'easaGroup=3' };
  if (entry.easaGroup === '2a') return { category: 'regional_turboprop', heuristicNote: 'easaGroup=2a' };

  // easaGroup === '1' — needs the keyword net; group alone does not
  // distinguish A380 from ATR 72 from Falcon 900 (all group 1).
  const family = entry.aircraftFamily;
  if (matchesAny(family, BUSINESS_JET_KEYWORDS)) return { category: 'business_jet', heuristicNote: 'group=1, business-jet keyword match' };
  if (matchesAny(family, REGIONAL_TURBOPROP_KEYWORDS)) return { category: 'regional_turboprop', heuristicNote: 'group=1, regional-turboprop keyword match' };
  if (matchesAny(family, REGIONAL_JET_KEYWORDS)) return { category: 'regional_airplane', heuristicNote: 'group=1, regional-jet keyword match' };
  if (matchesAny(family, GENERAL_AVIATION_KEYWORDS)) return { category: 'general_aviation', heuristicNote: 'group=1, general-aviation keyword match' };
  return { category: 'commercial_airplane', heuristicNote: 'group=1, default (no keyword match)' };
}

// ============================================================
// SQL string escaping helpers
// ============================================================
function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}
function sqlStringArray(values: string[]): string {
  if (values.length === 0) return "'{}'::text[]";
  return `ARRAY[${values.map(sqlString).join(', ')}]::text[]`;
}
function sqlStringOrNull(value: string | null): string {
  return value === null ? 'NULL' : sqlString(value);
}

async function main() {
  const jsonPath = path.join(REPO_ROOT, 'scripts', 'data', 'easa_type_ratings_EDD2019-024R.json');
  const source: EasaSourceEntry[] = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`Loaded ${source.length} entries from ${path.basename(jsonPath)}`);

  const { data, error } = await supabase
    .from('aircraft_type_ratings')
    .select('id, manufacturer, aircraft_family, engine_manufacturer, engine_family, easa_endorsement, display_name, commercial_aliases, aircraft_category, easa_group, source_revision, priority, is_active');
  if (error) {
    console.error('Could not query current aircraft_type_ratings:', error.message);
    process.exit(1);
  }
  const current = (data ?? []) as CurrentRow[];
  console.log(`Loaded ${current.length} current rows from Supabase (read-only).`);

  // Build the "corrected" current-easa-endorsement set: apply the known
  // drift fixes conceptually so the reconciliation below sees the canonical
  // strings, matching what the generated SQL will produce after its
  // pre-fix UPDATE statements run.
  const driftFixByOldString = new Map(KNOWN_ENDORSEMENT_DRIFT_FIXES.map((f) => [f.oldEndorsement, f.canonicalEndorsement]));
  const currentByCorrectedEasa = new Map<string, CurrentRow>();
  for (const row of current) {
    const corrected = driftFixByOldString.get(row.easa_endorsement) ?? row.easa_endorsement;
    currentByCorrectedEasa.set(corrected, row);
  }

  const sourceEasaSet = new Set(source.map((e) => e.easaEndorsement));

  const newEntries: EasaSourceEntry[] = [];
  const matchedEntries: { entry: EasaSourceEntry; existing: CurrentRow }[] = [];
  for (const entry of source) {
    const existing = currentByCorrectedEasa.get(entry.easaEndorsement);
    if (existing) matchedEntries.push({ entry, existing });
    else newEntries.push(entry);
  }
  const obsoleteRows = current.filter((row) => {
    const corrected = driftFixByOldString.get(row.easa_endorsement) ?? row.easa_endorsement;
    return !sourceEasaSet.has(corrected) && row.is_active;
  });

  console.log(`Matched (existing, will UPDATE preserving id): ${matchedEntries.length}`);
  console.log(`New (will INSERT): ${newEntries.length}`);
  console.log(`Obsolete (active today, absent from official JSON -> will set is_active=false): ${obsoleteRows.length}`);

  // ---- Build per-entry derived fields for ALL 606 (used for the VALUES list) ----
  const engineParseFallbacks: { easaEndorsement: string; designation: string | null }[] = [];
  const categoryCounts: Record<string, number> = {};
  const rows = source.map((entry) => {
    const { engine, aircraftFamily } = resolveEngineAndFamily(entry);
    if (engine.uncertain) engineParseFallbacks.push({ easaEndorsement: entry.easaEndorsement, designation: entry.engineDesignation });
    const { category, heuristicNote } = classifyCategory(entry);
    categoryCounts[category] = (categoryCounts[category] ?? 0) + 1;
    const manufacturer = entry.tcHolders[0] ?? aircraftFamily.split(/\s+/)[0];
    const aliases = Array.from(new Set([...entry.modelAliases, ...entry.commercialAliases]));
    const displayName = engine.family
      ? `${aircraftFamily} — ${engine.family}`
      : engine.manufacturer
        ? `${aircraftFamily} — ${engine.manufacturer}`
        : aircraftFamily;
    return { entry, engine, aircraftFamily, category, heuristicNote, manufacturer, aliases, displayName };
  });

  if (!rows.every((r) => VALID_CATEGORIES.has(r.category))) {
    throw new Error('Internal error: classifyCategory produced a value outside the known enum.');
  }

  // ---- Generate SQL ----
  const today = new Date().toISOString().slice(0, 10);
  const sqlParts: string[] = [];

  sqlParts.push(`-- ============================================================
-- AviationJobTalent V2 — Migration 020: full official EASA Part-66
-- aircraft-engine type rating catalog (${source.length} endorsements)
-- ============================================================
-- Generated: ${today}, by scripts/generateEasaFullCatalogMigration.ts from
-- scripts/data/easa_type_ratings_EDD2019-024R.json ("List of Part-66 Type
-- Ratings", EASA ED Decision 2019/024/R, deduplicated, "Deleted" rows
-- excluded). Regenerate this file by re-running that script whenever a
-- newer EDD revision JSON is added — never hand-edit the generated VALUES
-- blocks below.
--
-- Reconciliation strategy (see docs/archive/EASA_FULL_CATALOG_RECONCILIATION_REPORT.md
-- for full counts and manual-review flags):
--   1. 4 rows from the initial 80-row seed (migration 016) had tiny
--      formatting drift in easa_endorsement vs the real EASA source (missing
--      spaces, one added manufacturer prefix) — corrected in place FIRST, by
--      known fixed id, so they reconcile as updates, not duplicates.
--   2. INSERT ... ON CONFLICT (easa_endorsement) DO UPDATE reconciles the
--      remaining ${source.length} official rows against whatever is live:
--        - existing row (same easa_endorsement) -> id is preserved (never
--          in the SET clause); only easa_group, source_revision,
--          product_type and commercial_aliases (unioned with what's already
--          there) are refreshed — product_type is new to every row (no
--          prior curated value exists to protect) so it is always set from
--          the source, unlike the fields below. display_name/manufacturer/
--          aircraft_family/
--          engine_manufacturer/engine_family/aircraft_category/priority are
--          intentionally left untouched for existing rows — the initial 80
--          were hand-curated with more care (real commercial nicknames,
--          tuned priority) than this script's heuristics can reproduce, and
--          overwriting them would be a quality regression, not an
--          improvement.
--        - no existing row -> plain INSERT with this script's derived
--          values (heuristic aircraft_category, parsed engine
--          manufacturer/family, synthesized display_name — all documented
--          in the generator and flagged for review in the report).
--   3. Any row active today whose (corrected) easa_endorsement is absent
--      from the official JSON is set is_active=false — NEVER deleted. FKs
--      from technician_habilitations / offer_required_habilitations /
--      catalog_requests stay valid either way.
--
--   4. Adds a new product_type column (Aeroplane/Helicopter/Gas Airship —
--      the source JSON's own top-level classification, kept verbatim
--      alongside the heuristic aircraft_category) and populates it for all
--      ${source.length} rows. Reserved for a later phase's category
--      faceting/pre-filtering — nothing reads it yet.
--
-- What this migration does NOT do: it does not touch technician_habilitations,
-- offer_required_habilitations or catalog_requests at all — those still
-- reference ratings by id, and every id that existed before this migration
-- still exists after it (updated in place, never replaced).
-- ============================================================


-- ============================================================
-- 0. Add product_type (Aeroplane / Helicopter / Gas Airship) — new column,
--    nullable (not every future row is guaranteed to have it), populated
--    for every row by the upsert in section 2 below.
-- ============================================================
ALTER TABLE aircraft_type_ratings
  ADD COLUMN IF NOT EXISTS product_type TEXT CHECK (product_type IN ('Aeroplane', 'Helicopter', 'Gas Airship'));


-- ============================================================
-- 1. Correct known easa_endorsement drift on 4 existing rows (by fixed id)
--    so the upsert below reconciles them as updates, not duplicates.
-- ============================================================
`);

  for (const fix of KNOWN_ENDORSEMENT_DRIFT_FIXES) {
    sqlParts.push(`UPDATE aircraft_type_ratings SET easa_endorsement = ${sqlString(fix.canonicalEndorsement)}, updated_at = now() WHERE id = ${sqlString(fix.id)} AND easa_endorsement = ${sqlString(fix.oldEndorsement)};`);
  }

  sqlParts.push(`

-- ============================================================
-- 2. Upsert all ${source.length} official EASA endorsements
-- ============================================================
INSERT INTO aircraft_type_ratings
  (manufacturer, aircraft_family, engine_manufacturer, engine_family, easa_endorsement, display_name, commercial_aliases, aircraft_category, easa_group, source_revision, priority, product_type)
VALUES`);

  const valueLines = rows.map(({ entry, engine, aircraftFamily, category, manufacturer, aliases, displayName }) => {
    return `  (${sqlString(manufacturer)}, ${sqlString(aircraftFamily)}, ${sqlStringOrNull(engine.manufacturer)}, ${sqlStringOrNull(engine.family)}, ${sqlString(entry.easaEndorsement)}, ${sqlString(displayName)}, ${sqlStringArray(aliases)}, ${sqlString(category)}, ${sqlString(entry.easaGroup)}, ${sqlString(entry.sourceRevision)}, 0, ${sqlString(entry.productType)})`;
  });
  sqlParts.push(valueLines.join(',\n') + '\nON CONFLICT (easa_endorsement) DO UPDATE SET\n' +
    '  easa_group = EXCLUDED.easa_group,\n' +
    '  source_revision = EXCLUDED.source_revision,\n' +
    '  product_type = EXCLUDED.product_type,\n' +
    '  commercial_aliases = (SELECT ARRAY(SELECT DISTINCT unnest(aircraft_type_ratings.commercial_aliases || EXCLUDED.commercial_aliases))),\n' +
    '  updated_at = now();\n');

  sqlParts.push(`
-- ============================================================
-- 3. Deactivate rows no longer present in the official list (never delete)
-- ============================================================`);
  if (obsoleteRows.length === 0) {
    sqlParts.push('-- No obsolete rows detected in this revision — every currently-active row\n-- matches an entry in the official JSON (after the drift fixes above).\n-- This section is intentionally left as a no-op DO block so future\n-- regenerations that DO find obsolete rows have a place to land without\n-- restructuring the migration.\nDO $$ BEGIN END $$;');
  } else {
    const ids = obsoleteRows.map((r) => sqlString(r.id)).join(',\n    ');
    sqlParts.push(`UPDATE aircraft_type_ratings SET is_active = false, updated_at = now()\n  WHERE id IN (\n    ${ids}\n  );`);
  }

  sqlParts.push(`

-- ============================================================
-- 4. Post-migration sanity check
-- ============================================================
DO $$
DECLARE
  total_count integer;
BEGIN
  SELECT count(*) INTO total_count FROM aircraft_type_ratings;
  IF total_count < ${source.length} THEN
    RAISE EXCEPTION 'Expected at least % aircraft_type_ratings rows after migration 020, found %', ${source.length}, total_count;
  END IF;
END $$;
`);

  const migrationPath = path.join(REPO_ROOT, 'supabase', 'migrations', '020_easa_full_catalog.sql');
  fs.writeFileSync(migrationPath, sqlParts.join('\n'), 'utf8');
  console.log(`\nWrote ${migrationPath}`);

  // ---- Reconciliation report ----
  const reportLines: string[] = [];
  reportLines.push('# Informe de reconciliación — migración 020 (catálogo EASA completo)');
  reportLines.push('');
  reportLines.push(`Generado: ${today} por \`scripts/generateEasaFullCatalogMigration.ts\`. CHECKPOINT 1 — no aplicado contra Supabase.`);
  reportLines.push('');
  reportLines.push('## Resumen');
  reportLines.push('');
  reportLines.push(`- Endorsements en la fuente oficial: ${source.length}`);
  reportLines.push(`- Filas actuales en \`aircraft_type_ratings\`: ${current.length}`);
  reportLines.push(`- Correcciones de deriva de texto aplicadas (mismo id, string corregido): ${KNOWN_ENDORSEMENT_DRIFT_FIXES.length}`);
  reportLines.push(`- Coinciden (UPDATE, id preservado): ${matchedEntries.length}`);
  reportLines.push(`- Nuevas (INSERT): ${newEntries.length}`);
  reportLines.push(`- Obsoletas hoy activas sin match oficial (is_active=false, nunca delete): ${obsoleteRows.length}`);
  reportLines.push('');
  reportLines.push('## Correcciones de deriva de texto (easa_endorsement)');
  reportLines.push('');
  reportLines.push('| id | string anterior (016) | string oficial (JSON) |');
  reportLines.push('|---|---|---|');
  for (const fix of KNOWN_ENDORSEMENT_DRIFT_FIXES) {
    reportLines.push(`| ${fix.id} | ${fix.oldEndorsement} | ${fix.canonicalEndorsement} |`);
  }
  reportLines.push('');
  if (obsoleteRows.length > 0) {
    reportLines.push('## Filas que se desactivarían (is_active=false)');
    reportLines.push('');
    for (const row of obsoleteRows) reportLines.push(`- ${row.id} — "${row.easa_endorsement}" (${row.display_name})`);
    reportLines.push('');
  } else {
    reportLines.push('## Filas que se desactivarían\n\nNinguna — las 80 filas activas actuales tienen correspondencia en la lista oficial (tras las 4 correcciones de deriva).\n');
  }
  reportLines.push('## Distribución de aircraft_category (heurística, todas las 606 filas)');
  reportLines.push('');
  reportLines.push('| categoría | filas |');
  reportLines.push('|---|---|');
  for (const [cat, count] of Object.entries(categoryCounts).sort((a, b) => b[1] - a[1])) reportLines.push(`| ${cat} | ${count} |`);
  reportLines.push('');
  reportLines.push(`## Motor: casos donde el parser no reconoció el patrón (${engineParseFallbacks.length} de ${source.length})`);
  reportLines.push('');
  reportLines.push('`engine_manufacturer` queda con el texto crudo completo y `engine_family` en NULL — nunca se adivinó una separación. Revisar si alguno merece añadirse a la tabla de prefijos conocidos del generador.');
  reportLines.push('');
  for (const f of engineParseFallbacks.slice(0, 60)) reportLines.push(`- "${f.easaEndorsement}" — designation: ${f.designation === null ? 'NULL' : `"${f.designation}"`}`);
  if (engineParseFallbacks.length > 60) reportLines.push(`- … y ${engineParseFallbacks.length - 60} más (ver salida completa del script)`);
  reportLines.push('');
  reportLines.push('## Todas las filas de Aeroplane grupo 1 clasificadas (222 filas) — para auditar la heurística de categoría');
  reportLines.push('');
  reportLines.push('| aircraftFamily | categoría asignada | motivo |');
  reportLines.push('|---|---|---|');
  for (const r of rows) {
    if (r.entry.productType === 'Aeroplane' && r.entry.easaGroup === '1') {
      reportLines.push(`| ${r.entry.aircraftFamily} | ${r.category} | ${r.heuristicNote} |`);
    }
  }
  reportLines.push('');
  reportLines.push('## Filas de Gas Airship (mapeadas a general_aviation — decisión a confirmar)');
  reportLines.push('');
  for (const r of rows) {
    if (r.entry.productType === 'Gas Airship') reportLines.push(`- ${r.entry.aircraftFamily} (${r.entry.easaEndorsement})`);
  }
  reportLines.push('');

  const reportPath = path.join(REPO_ROOT, 'docs', 'EASA_FULL_CATALOG_RECONCILIATION_REPORT.md');
  fs.writeFileSync(reportPath, reportLines.join('\n'), 'utf8');
  console.log(`Wrote ${reportPath}`);
  console.log(`\nCategory distribution: ${JSON.stringify(categoryCounts)}`);
  console.log(`Engine-parse fallbacks: ${engineParseFallbacks.length}/${source.length}`);
}

main().catch((err) => {
  console.error('Generator crashed:', err);
  process.exit(1);
});
