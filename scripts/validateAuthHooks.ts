// Comprueba que los DOS ganchos sobre `auth.users` siguen instalados.
//
// ── Por qué existe ────────────────────────────────────────────────────
// `auth.users` pertenece a Supabase Auth, no a nosotros. Dos invariantes del
// producto cuelgan de sendos triggers propios sobre esa tabla:
//
//   on_auth_user_created -> handle_new_user()     : todo alta crea su profiles
//   on_auth_user_deleted -> handle_deleted_user() : todo borrado deja LÁPIDA
//
// Un upgrade de Auth que recreara la tabla se los llevaría por delante. El
// fallo resultante es SILENCIOSO en ambas direcciones: altas sin perfil (la
// app no sabe qué rol tiene el usuario) y borrados que dejan un perfil activo
// sin credenciales — visible, contactable y con PII intacta.
//
// Ni `tsc` ni los tests puros pueden ver esto: no es tipo ni es lógica, es
// estado del esquema. Misma familia que validate:aircraft-ratings y
// validate:state-machine — offline para lo puro, en vivo para lo que sólo
// existe en la base.
//
// Run: npm run validate:auth-hooks
import { createClient } from '@supabase/supabase-js';
import { loadEnvFile } from './lib/loadEnv';

loadEnvFile();

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY (checked process.env and .env).');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const EXPECTED = ['on_auth_user_created', 'on_auth_user_deleted'] as const;

async function main() {
  console.log('\n=== AUTH HOOKS — triggers propios sobre auth.users ===\n');

  const { data, error } = await supabase.rpc('auth_hooks_health');

  // Un error aquí NO se puede leer como "faltan los triggers": sería confundir
  // "no pude preguntar" con "la respuesta es no". Se falla ruidosamente.
  if (error) {
    console.error('No se pudo consultar auth_hooks_health(). Esto NO significa que los');
    console.error('triggers falten: significa que la comprobación no se ha hecho.');
    console.error('Detalle:', error.message);
    process.exit(1);
  }

  const rows = (data ?? []) as { trigger_name: string; present: boolean }[];

  // Guarda contra el falso verde: si la función deja de devolver los dos
  // nombres esperados, "0 fallos" sobre una lista vacía no vale como PASS.
  const returned = rows.map((r) => r.trigger_name).sort();
  const expected = [...EXPECTED].sort();
  if (returned.length !== expected.length || returned.some((n, i) => n !== expected[i])) {
    console.error(`auth_hooks_health() devolvió [${returned.join(', ')}], se esperaba [${expected.join(', ')}].`);
    console.error('La propia sonda ha cambiado — revísala antes de fiarte del resultado.');
    process.exit(1);
  }

  let missing = 0;
  for (const row of rows) {
    console.log(`  ${row.present ? 'OK     ' : 'FALTA  '} ${row.trigger_name}`);
    if (!row.present) missing++;
  }

  console.log('');
  if (missing > 0) {
    console.error(`RESULT: FAIL — ${missing} trigger(s) ausente(s) en auth.users.`);
    console.error('Reinstálalos: supabase/migrations/001_*.sql (alta) y 039 (borrado).');
    process.exit(1);
  }

  console.log('RESULT: PASS — los dos ganchos sobre auth.users están instalados.\n');
}

main().catch((e) => {
  console.error('Fallo inesperado:', e);
  process.exit(1);
});
