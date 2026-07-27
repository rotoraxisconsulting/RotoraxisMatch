// Validates the REAL aircraft_type_ratings catalog in Supabase — the single
// source of truth for this catalog (see
// docs/archive/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md). Unlike
// scripts/validateSeeds.js (which only checks local demo JSON and can no
// longer see the catalog contents at all), this script reads the live table.
//
// Read access to aircraft_type_ratings is public (RLS policy atr_read —
// `USING (true)`), so this only needs the publishable/anon key, never the
// service role key.
//
// Run: npm run validate:aircraft-ratings
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from './lib/loadEnv';
import { mapAircraftTypeRatingRow, AircraftTypeRatingRow } from '../src/constants/aircraftTypeRatings';

loadEnvFile();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (checked process.env and .env).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// The initial 80-row seed used fixed, deterministic ids
// 00000000-0000-4000-a000-000000000001 .. 000000000080 (see migration 016).
// Checking these specific ids are still present is the "at least the base
// 80" check the brief asks for, without re-declaring all 80 rows' data here.
function baseSeedIds(): string[] {
  const ids: string[] = [];
  for (let n = 1; n <= 80; n += 1) {
    ids.push(`00000000-0000-4000-a000-${String(n).padStart(12, '0')}`);
  }
  return ids;
}

const VALID_CATEGORIES = new Set([
  'commercial_airplane',
  'regional_airplane',
  'regional_turboprop',
  'business_jet',
  'general_aviation',
  'helicopter',
]);

async function main() {
  const errors: string[] = [];
  const warnings: string[] = [];

  const { data, error } = await supabase
    .from('aircraft_type_ratings')
    .select('id, manufacturer, aircraft_family, engine_manufacturer, engine_family, easa_endorsement, display_name, commercial_aliases, aircraft_category, easa_group, source_revision, priority, is_active');

  if (error) {
    console.error('Could not query aircraft_type_ratings:', error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as AircraftTypeRatingRow[];
  const catalog = rows.map(mapAircraftTypeRatingRow);

  // 1. Row-level structural checks.
  const seenIds = new Set<string>();
  const seenEasa = new Set<string>();
  for (const r of catalog) {
    if (seenIds.has(r.id)) errors.push(`Duplicate id: ${r.id}`);
    seenIds.add(r.id);

    if (seenEasa.has(r.easaEndorsement)) errors.push(`Duplicate easa_endorsement: "${r.easaEndorsement}"`);
    seenEasa.add(r.easaEndorsement);

    if (!r.displayName.trim()) errors.push(`${r.id}: empty display_name`);
    if (!r.manufacturer.trim()) errors.push(`${r.id}: empty manufacturer`);
    if (!r.aircraftFamily.trim()) errors.push(`${r.id}: empty aircraft_family`);
    if (!VALID_CATEGORIES.has(r.aircraftCategory)) errors.push(`${r.id}: invalid aircraft_category "${r.aircraftCategory}"`);
    if (!Number.isInteger(r.priority) || r.priority < 0) errors.push(`${r.id}: invalid priority ${r.priority}`);

    const seenAliases = new Set<string>();
    for (const alias of r.commercialAliases) {
      const norm = alias.trim().toLowerCase();
      if (seenAliases.has(norm)) errors.push(`${r.id}: duplicate alias "${alias}" within the same row`);
      seenAliases.add(norm);
    }
  }

  // 2. Minimum-size checks (>= 80, never a hard "exactly 80" so future
  // catalog growth via approved catalog_requests never breaks this check).
  if (catalog.length < 80) errors.push(`Expected at least 80 rows, found ${catalog.length}`);
  const activeCount = catalog.filter((r) => r.isActive).length;
  if (activeCount < 80) warnings.push(`Only ${activeCount} active rows (expected at least 80) — fine if a base rating was deliberately deactivated, otherwise investigate`);

  // 3. Base-80 presence check — ids only, no data duplication.
  const idSet = new Set(catalog.map((r) => r.id));
  const missingBaseIds = baseSeedIds().filter((id) => !idSet.has(id));
  if (missingBaseIds.length > 0) {
    errors.push(`Missing ${missingBaseIds.length} of the original 80 base rating ids: ${missingBaseIds.slice(0, 5).join(', ')}${missingBaseIds.length > 5 ? '…' : ''}`);
  }

  // 4. FK relations — guaranteed by the database's own foreign keys, but
  // checked here too as a defensive, independent confirmation.
  const [habRes, orhRes, catreqRes] = await Promise.all([
    supabase.from('technician_habilitations').select('id, aircraft_type_rating_id').not('aircraft_type_rating_id', 'is', null),
    supabase.from('offer_required_habilitations').select('offer_id, aircraft_type_rating_id'),
    supabase.from('catalog_requests').select('id, resolved_aircraft_type_rating_id').not('resolved_aircraft_type_rating_id', 'is', null),
  ]);
  for (const row of (habRes.data ?? []) as { id: string; aircraft_type_rating_id: string }[]) {
    if (!idSet.has(row.aircraft_type_rating_id)) errors.push(`technician_habilitations ${row.id}: aircraft_type_rating_id ${row.aircraft_type_rating_id} not found in catalog`);
  }
  for (const row of (orhRes.data ?? []) as { offer_id: string; aircraft_type_rating_id: string }[]) {
    if (!idSet.has(row.aircraft_type_rating_id)) errors.push(`offer_required_habilitations (offer ${row.offer_id}): aircraft_type_rating_id ${row.aircraft_type_rating_id} not found in catalog`);
  }
  for (const row of (catreqRes.data ?? []) as { id: string; resolved_aircraft_type_rating_id: string }[]) {
    if (!idSet.has(row.resolved_aircraft_type_rating_id)) errors.push(`catalog_requests ${row.id}: resolved_aircraft_type_rating_id ${row.resolved_aircraft_type_rating_id} not found in catalog`);
  }

  // 5. "Inactive ratings unavailable for new selections" is enforced in
  // application code (catalogRepository.getAircraftTypeRatings() always
  // filters `is_active = true`), not something a catalog-only SQL check can
  // verify — documented here rather than silently skipped.
  console.log('Note: "inactive ratings unavailable for new selections" is a UI/repository contract (catalogRepository.getAircraftTypeRatings() filters is_active=true), not checked by this script.');

  console.log('\n=== AIRCRAFT TYPE RATINGS CATALOG VALIDATION ===');
  console.log(`Total rows: ${catalog.length}`);
  console.log(`Active rows: ${activeCount}`);
  console.log(`Base-80 ids present: ${80 - missingBaseIds.length}/80`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors.length}`);

  if (warnings.length > 0) {
    console.log('\n--- Warnings ---');
    warnings.forEach((w) => console.log('  WARN: ' + w));
  }

  if (errors.length > 0) {
    console.log('\n--- Errors ---');
    errors.forEach((e) => console.log('  ERROR: ' + e));
    console.log('\nRESULT: FAIL');
    process.exitCode = 1;
  } else {
    console.log('\nRESULT: PASS');
  }
}

main().catch((err) => {
  console.error('Validation script crashed:', err);
  process.exit(1);
});
