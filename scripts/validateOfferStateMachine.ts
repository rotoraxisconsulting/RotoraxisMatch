// Comprueba que la máquina de estados de relaciones oferta<->técnico dice lo
// MISMO en TypeScript y en Postgres.
//
// ── Por qué existe ────────────────────────────────────────────────────
// La regla vive en dos sitios: `ALLOWED_TRANSITIONS`
// (src/utils/offerRelationStateMachine.ts) y la función
// `assert_offer_relation_transition` (migración 033). El TypeScript NO tiene
// call sites en producción — es especificación; quien bloquea de verdad es el
// trigger de base de datos. Eso significa que las dos mitades pueden
// divergir y los tests unitarios NO lo notarían: comprueban el espejo contra
// sí mismo.
//
// Este script cierra ese hueco: recorre la matriz COMPLETA declarada en
// TypeScript (2 tipos × 5 estados origen × 5 estados destino = 50
// combinaciones) y, para cada una, llama a la función real de Postgres y
// comprueba que permite exactamente lo mismo. Cualquier deriva —en cualquiera
// de los dos lados— pone esto en rojo.
//
// Reparto deliberado, siguiendo el patrón que el proyecto ya usa:
//   npm run test:matching            -> puro, offline, sin credenciales
//   npm run validate:aircraft-ratings-> invariantes que solo existen en la BD
//   npm run validate:state-machine   -> este: coherencia TS <-> BD
//
// Run: npm run validate:state-machine
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from './lib/loadEnv';
import { ALLOWED_TRANSITIONS, OfferRelationKind } from '../src/utils/offerRelationStateMachine';
import { OfferRequestStatus } from '../src/types/enums';

loadEnvFile();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (checked process.env and .env).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// El nombre de tabla que la función de BD espera para cada tipo de relación.
// La función se ramifica por TG_TABLE_NAME, así que el mapeo tiene que ser
// exactamente este.
const TABLE_BY_KIND: Record<OfferRelationKind, string> = {
  application: 'offer_applications',
  direct_offer: 'offer_requests',
};

const ALL_STATUSES: OfferRequestStatus[] = ['pending', 'accepted', 'rejected', 'expired', 'withdrawn'];

/**
 * Llama a la función REAL de Postgres vía RPC y devuelve si permitió la
 * transición. Un error de la función = transición bloqueada.
 *
 * Nota: distingue "bloqueada por la regla" de "no pude preguntar". Un fallo
 * de red o un RPC inexistente NO se puede leer como "bloqueada" — seria dar
 * por buena la coherencia sin haberla comprobado, que es exactamente el tipo
 * de falso verde que este script existe para impedir.
 */
async function dbAllows(
  from: OfferRequestStatus,
  to: OfferRequestStatus,
  table: string,
): Promise<{ allowed: boolean; message?: string }> {
  const { error } = await supabase.rpc('assert_offer_relation_transition', {
    old_status: from,
    new_status: to,
    relation_table: table,
  });

  if (!error) return { allowed: true };

  // PGRST202 = la función no existe / no está expuesta por PostgREST.
  if (error.code === 'PGRST202') {
    throw new Error(
      'assert_offer_relation_transition no esta expuesta via RPC. Este script no puede verificar nada: ' +
        'no interpretes su ausencia como "todo bien". Detalle: ' + error.message,
    );
  }

  return { allowed: false, message: error.message };
}

async function main() {
  console.log('\n=== OFFER RELATION STATE MACHINE — coherencia TypeScript <-> Postgres ===\n');

  const mismatches: string[] = [];
  let checked = 0;
  let allowedCount = 0;

  for (const kind of Object.keys(ALLOWED_TRANSITIONS) as OfferRelationKind[]) {
    const table = TABLE_BY_KIND[kind];
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        // La transición a sí mismo es un no-op explícito en ambos lados; no
        // aporta información y la función retorna antes de mirar la tabla.
        if (from === to) continue;

        const tsAllows = (ALLOWED_TRANSITIONS[kind][from] ?? []).includes(to);
        const db = await dbAllows(from, to, table);
        checked += 1;
        if (tsAllows) allowedCount += 1;

        if (tsAllows !== db.allowed) {
          mismatches.push(
            `  ${kind.padEnd(13)} ${from.padEnd(10)} -> ${to.padEnd(10)}  ` +
              `TS=${tsAllows ? 'permite' : 'bloquea'}  BD=${db.allowed ? 'permite' : 'bloquea'}` +
              (db.message ? `\n      BD dijo: ${db.message}` : ''),
          );
        }
      }
    }
  }

  console.log(`Combinaciones comprobadas: ${checked} (2 tipos x 5 estados x 5 estados, menos las de identidad)`);
  console.log(`  permitidas por la declaracion TS: ${allowedCount}`);
  console.log(`  bloqueadas por la declaracion TS: ${checked - allowedCount}`);

  // Guardia contra un falso verde: si la matriz se vaciara por un refactor,
  // "0 desajustes" no significaria nada.
  const EXPECTED_COMBINATIONS = 40; // 2 * (5*5 - 5)
  if (checked !== EXPECTED_COMBINATIONS) {
    console.error(
      `\nFAIL: se esperaban ${EXPECTED_COMBINATIONS} combinaciones y se comprobaron ${checked}. ` +
        'La matriz declarada ha cambiado de forma — revisa ALLOWED_TRANSITIONS antes de fiarte de este resultado.',
    );
    process.exit(1);
  }

  if (mismatches.length > 0) {
    console.error(`\nFAIL — ${mismatches.length} desajuste(s) entre la declaracion TS y la funcion de Postgres:\n`);
    console.error(mismatches.join('\n'));
    console.error(
      '\nLa regla vive en dos sitios y han divergido. Alinea src/utils/offerRelationStateMachine.ts ' +
        'con la migracion correspondiente (033 fue la ultima que la toco) — no parchees solo uno.',
    );
    process.exit(1);
  }

  console.log('\nRESULT: PASS — la base de datos permite y bloquea exactamente lo que declara ALLOWED_TRANSITIONS.');
}

main().catch((err) => {
  console.error('\nFAIL:', err instanceof Error ? err.message : err);
  process.exit(1);
});
