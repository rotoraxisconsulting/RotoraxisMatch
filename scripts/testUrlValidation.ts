// Tests de src/utils/urlValidation.ts — el validador que comparten los
// social_links del técnico y el website de la empresa.
//
// ── Por qué existe ────────────────────────────────────────────────────
// Estas dos funciones son lo único entre lo que teclea un usuario y (a) una
// columna con un CHECK que aborta la escritura si no cuadra, y (b) un
// Linking.openURL() en el dispositivo de la otra parte. Los dos fallos son
// silenciosos de formas distintas: el primero sale como error crudo de
// constraint en vez de como mensaje legible; el segundo es una vía de
// ejecución.
//
// Puro y offline, sin credenciales — patrón de `npm run test:matching`.
//
// ── Lo que este script NO puede comprobar ─────────────────────────────
// Que el validador de TypeScript y el CHECK `chk_companies_website_format`
// (migración 036) digan lo mismo. Son dos reglas escritas dos veces, y pueden
// divergir sin que esto se ponga en rojo. Si esa divergencia llega a doler,
// el patrón a seguir es validateOfferStateMachine.ts, que sí pregunta a
// Postgres. Anotado a conciencia en vez de fingir cobertura que no hay.
//
// Run: npm run test:url-validation
import { isValidUrl, normalizeUrl } from '../src/utils/urlValidation';

let failures = 0;

function check(label: string, actual: unknown, expected: unknown): void {
  const ok = actual === expected;
  if (!ok) failures += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        esperado: ${JSON.stringify(expected)}\n        obtenido: ${JSON.stringify(actual)}`}`);
}

console.log('\n── isValidUrl ──────────────────────────────────────────────\n');

// Vacío es válido: los dos campos son opcionales y "sin declarar" es el
// estado por defecto, no un error.
check('vacío es válido', isValidUrl(''), true);
check('sólo espacios es válido', isValidUrl('   '), true);

check('host desnudo', isValidUrl('acme.com'), true);
check('con https', isValidUrl('https://acme.com'), true);
check('con http', isValidUrl('http://acme.com'), true);
check('con www y ruta', isValidUrl('https://www.acme.com/careers'), true);
check('subdominio y TLD compuesto', isValidUrl('jobs.acme.co.uk'), true);
check('con query y fragmento', isValidUrl('https://acme.com/a?b=1#c'), true);
check('LinkedIn típico', isValidUrl('linkedin.com/in/some-profile'), true);

// La razón de ser del validador: nada que no sea http/https puede acabar en
// un Linking.openURL().
check('javascript: rechazado', isValidUrl('javascript:alert(1)'), false);
check('JavaScript: mayúsculas rechazado', isValidUrl('JavaScript:alert(1)'), false);
check('data: rechazado', isValidUrl('data:text/html,<script>'), false);
check('file: rechazado', isValidUrl('file:///etc/passwd'), false);

check('sin punto', isValidUrl('acme'), false);
check('localhost', isValidUrl('http://localhost'), false);
check('con espacio', isValidUrl('acme .com'), false);
check('TLD de una letra', isValidUrl('acme.c'), false);
check('TLD numérico', isValidUrl('acme.12'), false);

// ── El caso del checkpoint (2026-07-29) ──────────────────────────────
// Duda planteada en revisión: ¿rechaza la BD un host en mayúsculas, porque el
// CHECK dice [a-z]{2,}? NO — el operador es `~*`, case-insensitive en
// Postgres, comprobado contra la base real. El caso se fija aquí igualmente
// porque lo que sí importa es que se GUARDE normalizado y no en dos formas
// distintas para el mismo sitio.
console.log('\n── mayúsculas (caso del checkpoint) ────────────────────────\n');

check('HTTPS://ACME.COM es válido', isValidUrl('HTTPS://ACME.COM'), true);
check('HTTPS://ACME.COM se normaliza a minúsculas', normalizeUrl('HTTPS://ACME.COM'), 'https://acme.com');
check('ACME.COM sin esquema', normalizeUrl('ACME.COM'), 'https://acme.com');
check('Host mixto', normalizeUrl('WwW.Acme.CoM'), 'https://www.acme.com');
// La ruta NO se toca: /Docs y /docs pueden ser recursos distintos.
check('la ruta conserva su caso', normalizeUrl('HTTPS://ACME.COM/Docs/Part66'), 'https://acme.com/Docs/Part66');
check('query conserva su caso', normalizeUrl('ACME.COM/a?Ref=XY'), 'https://acme.com/a?Ref=XY');

console.log('\n── normalizeUrl ────────────────────────────────────────────\n');

check('vacío', normalizeUrl(''), '');
check('espacios', normalizeUrl('   '), '');
check('antepone https', normalizeUrl('acme.com'), 'https://acme.com');
check('respeta http existente', normalizeUrl('http://acme.com'), 'http://acme.com');
check('no duplica esquema', normalizeUrl('https://acme.com'), 'https://acme.com');
check('recorta espacios', normalizeUrl('  acme.com  '), 'https://acme.com');
// Sin barra final para las URLs sin ruta: es lo que el usuario escribió.
check('sin barra final espuria', normalizeUrl('acme.com'), 'https://acme.com');
check('conserva la ruta', normalizeUrl('acme.com/careers'), 'https://acme.com/careers');
// No convierte un esquema peligroso en uno que parezca válido.
check('javascript: intacto', normalizeUrl('javascript:alert(1)'), 'javascript:alert(1)');

// ── Invariante entre las dos funciones ───────────────────────────────
// Todo lo que isValidUrl acepta tiene que seguir siendo aceptable DESPUÉS de
// normalizar: si no, guardaríamos algo que nuestro propio validador rechaza
// al releerlo, y ExternalLink lo pintaría como texto muerto.
console.log('\n── invariante normalizar∘validar ───────────────────────────\n');

const SAMPLES = [
  'acme.com', 'HTTPS://ACME.COM', 'www.acme.co.uk/x', 'http://a.io',
  'linkedin.com/in/x', 'instagram.com/y', 'ACME.COM/Docs?A=1#B',
];
SAMPLES.forEach((s) => {
  check(`normalizar(${s}) sigue siendo válido`, isValidUrl(normalizeUrl(s)), true);
  check(`normalizar(${s}) es idempotente`, normalizeUrl(normalizeUrl(s)), normalizeUrl(s));
});

console.log(
  failures === 0
    ? '\n✅ urlValidation: todos los casos pasan.\n'
    : `\n❌ urlValidation: ${failures} caso(s) fallando.\n`,
);
process.exit(failures === 0 ? 0 : 1);
