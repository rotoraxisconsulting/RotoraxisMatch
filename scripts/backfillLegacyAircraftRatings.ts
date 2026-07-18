// Backfills technician_habilitations.aircraft_type_rating_id for legacy rows
// (aircraft_type_code set, aircraft_type_rating_id still NULL) whenever
// exactly one aircraft_type_ratings row's aliases unambiguously match the
// legacy code. Never guesses among several candidates, never overwrites a
// row that already has a rating, never touches aircraft_type_code.
//
// IMPORTANT — corrects a claim in an earlier report: a migration that has
// already been applied does NOT re-run automatically when new legacy rows
// appear later (e.g. a technician created after the migration ran, still
// using an old client that only writes aircraft_type_code). This script is
// the explicit, re-runnable, idempotent replacement for "the migration will
// just handle it" — run it again any time you want to sweep newly-created
// legacy rows. See docs/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md
// section 10 for the full explanation.
//
// Requires SUPABASE_SERVICE_ROLE_KEY (bypasses RLS — this writes
// technician_habilitations rows the script does not "own" the way a signed-in
// technician would). NEVER use the service role key in client/app code —
// this script only ever runs locally or in a trusted server/CI context, and
// the key must never be committed (.env is gitignored; see .env.example).
//
// Usage:
//   npm run backfill:aircraft-ratings -- --dry-run   (default if no flag given)
//   npm run backfill:aircraft-ratings -- --apply     (writes 'mapped' rows)
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from './lib/loadEnv';
import { mapAircraftTypeRatingRow, AircraftTypeRatingRow } from '../src/constants/aircraftTypeRatings';
import {
  planLegacyAircraftRatingBackfill,
  summarizeBackfillPlan,
  LegacyHabilitationRow,
} from '../src/utils/aircraftRatingBackfillPlan';

loadEnvFile();

const apply = process.argv.includes('--apply');
const dryRun = !apply; // dry-run is the safe default — --apply is opt-in only

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  console.error('Missing SUPABASE_URL / EXPO_PUBLIC_SUPABASE_URL (checked process.env and .env).');
  process.exit(1);
}
if (!SERVICE_ROLE_KEY) {
  console.error(
    'Missing SUPABASE_SERVICE_ROLE_KEY. This script writes technician_habilitations rows for ' +
    'technicians other than "yourself", which RLS blocks for the anon/publishable key by design. ' +
    'Add SUPABASE_SERVICE_ROLE_KEY=... to your local .env (never commit it — .env is gitignored) ' +
    'and run this only locally or in a trusted server/CI context.',
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function main() {
  console.log(`Mode: ${dryRun ? 'DRY RUN (no writes)' : 'APPLY (will write mapped rows)'}\n`);

  const [legacyRes, catalogRes, normalizedRes] = await Promise.all([
    supabase
      .from('technician_habilitations')
      .select('id, technician_id, license_code, aircraft_type_code')
      .not('aircraft_type_code', 'is', null)
      .is('aircraft_type_rating_id', null),
    supabase
      .from('aircraft_type_ratings')
      .select('id, manufacturer, aircraft_family, engine_manufacturer, engine_family, easa_endorsement, display_name, commercial_aliases, aircraft_category, easa_group, source_revision, priority, is_active')
      .eq('is_active', true),
    supabase
      .from('technician_habilitations')
      .select('technician_id, license_code, aircraft_type_rating_id')
      .not('aircraft_type_rating_id', 'is', null),
  ]);

  if (legacyRes.error) { console.error('Could not query legacy habilitations:', legacyRes.error.message); process.exit(1); }
  if (catalogRes.error) { console.error('Could not query aircraft_type_ratings:', catalogRes.error.message); process.exit(1); }
  if (normalizedRes.error) { console.error('Could not query normalized habilitations:', normalizedRes.error.message); process.exit(1); }

  const legacyRows: LegacyHabilitationRow[] = ((legacyRes.data ?? []) as {
    id: string; technician_id: string; license_code: string; aircraft_type_code: string;
  }[]).map((r) => ({
    id: r.id,
    technicianId: r.technician_id,
    licenseCode: r.license_code,
    aircraftTypeCode: r.aircraft_type_code,
  }));

  const catalog = ((catalogRes.data ?? []) as AircraftTypeRatingRow[]).map(mapAircraftTypeRatingRow);

  const existingNormalized = ((normalizedRes.data ?? []) as {
    technician_id: string; license_code: string; aircraft_type_rating_id: string;
  }[]).map((r) => ({
    technicianId: r.technician_id,
    licenseCode: r.license_code,
    aircraftTypeRatingId: r.aircraft_type_rating_id,
  }));

  const plan = planLegacyAircraftRatingBackfill(legacyRows, catalog, existingNormalized);
  const summary = summarizeBackfillPlan(plan);

  console.log('=== BACKFILL PLAN ===');
  console.log(`Rows analyzed:      ${summary.analyzed}`);
  console.log(`Mapped:             ${summary.mapped}`);
  console.log(`Ambiguous:          ${summary.ambiguous}`);
  console.log(`No match:           ${summary.noMatch}`);
  console.log(`Collisions avoided: ${summary.collisionsAvoided}`);

  const mapped = plan.filter((p) => p.outcome === 'mapped');
  const ambiguous = plan.filter((p) => p.outcome === 'ambiguous');
  const noMatch = plan.filter((p) => p.outcome === 'no_match');
  const collisions = plan.filter((p) => p.outcome === 'collision_avoided');

  if (mapped.length > 0) {
    console.log('\n--- Mapped (would be written with --apply) ---');
    mapped.forEach((p) => console.log(`  hab ${p.row.id} (tech ${p.row.technicianId}, ${p.row.licenseCode}, "${p.row.aircraftTypeCode}") -> rating ${p.ratingId}`));
  }
  if (ambiguous.length > 0) {
    console.log('\n--- Ambiguous (left untouched — multiple ratings match) ---');
    ambiguous.forEach((p) => console.log(`  hab ${p.row.id} ("${p.row.aircraftTypeCode}") matches ${p.candidateIds?.length} ratings: ${p.candidateIds?.join(', ')}`));
  }
  if (collisions.length > 0) {
    console.log('\n--- Collisions avoided (technician already has this exact rating under this license) ---');
    collisions.forEach((p) => console.log(`  hab ${p.row.id} (tech ${p.row.technicianId}, ${p.row.licenseCode}) -> rating ${p.ratingId} already exists as a normalized row`));
  }
  if (noMatch.length > 0) {
    console.log('\n--- No match (left untouched — no catalog rating lists this code as an alias) ---');
    noMatch.forEach((p) => console.log(`  hab ${p.row.id} ("${p.row.aircraftTypeCode}")`));
  }

  if (!apply) {
    console.log('\nDry run only — no rows written. Re-run with --apply to write the "Mapped" rows above.');
    return;
  }

  if (mapped.length === 0) {
    console.log('\nNothing to write — no unambiguous new mappings found.');
    return;
  }

  console.log(`\nApplying ${mapped.length} mapping(s)...`);
  let succeeded = 0;
  const failures: string[] = [];
  for (const entry of mapped) {
    const { error } = await supabase
      .from('technician_habilitations')
      .update({ aircraft_type_rating_id: entry.ratingId })
      .eq('id', entry.row.id)
      .is('aircraft_type_rating_id', null); // idempotency guard: never overwrite a row someone else just normalized
    if (error) failures.push(`hab ${entry.row.id}: ${error.message}`);
    else succeeded += 1;
  }
  console.log(`Applied: ${succeeded}/${mapped.length}`);
  if (failures.length > 0) {
    console.log('Failures:');
    failures.forEach((f) => console.log('  ' + f));
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error('Backfill script crashed:', err);
  process.exit(1);
});
