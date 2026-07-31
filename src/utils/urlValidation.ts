/**
 * Validacion y normalizacion de URLs declaradas por el usuario.
 *
 * Un solo sitio para las dos superficies que aceptan enlaces libres:
 * los social_links del tecnico (LinkedIn / Instagram / web personal) y el
 * website de la empresa. Si aparece una tercera, usa esto — no escribas otra
 * regex.
 *
 * Reglas, en orden:
 *  - Vacio es VALIDO. Los dos campos son opcionales; "sin declarar" no es un
 *    error, es el estado por defecto.
 *  - Solo http y https. Un `javascript:` o un `data:` en un campo que luego se
 *    abre con Linking.openURL es una via de ejecucion, no una URL mal escrita.
 *  - El esquema se puede omitir al escribir ("acme.com"); normalizeUrl le
 *    antepone https://. Lo que se PERSISTE es siempre la forma normalizada,
 *    para que quien lo consuma no tenga que adivinar.
 *  - El host necesita un punto y una etiqueta final alfabetica de 2+ letras.
 *    Descarta despistes tipicos ("acme", "http://localhost") sin pretender
 *    validar TLDs reales: eso es trabajo del servidor, no de un formulario.
 */

const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/i;

/**
 * Antepone https:// si falta el esquema y pasa ESQUEMA y HOST a minusculas,
 * dejando ruta, query y fragmento EXACTAMENTE como se escribieron: el host es
 * case-insensitive por DNS, pero la ruta no lo es —
 * `/Docs` y `/docs` pueden ser dos recursos distintos, y bajarla a minusculas
 * romperia enlaces reales.
 *
 * Por que importa el caso: sin esto, "ACME.COM" y "acme.com" se guardarian
 * como dos cadenas distintas para el mismo sitio. NO es para contentar al
 * CHECK de la migracion 036 — ese usa `~*` (case-insensitive en Postgres) y
 * acepta las mayusculas igual; comprobado contra la BD. Es por consistencia
 * del dato, que es problema nuestro, no suyo.
 *
 * No valida — para eso esta isValidUrl.
 */
export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === '') return '';

  // Un esquema distinto de http/https se deja intacto a proposito: normalizar
  // "javascript:alert(1)" a "https://javascript:alert(1)" lo colaria como
  // valido. Que llegue tal cual a isValidUrl y lo rechace.
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(withScheme);
  } catch {
    return withScheme; // malformada: que la rechace isValidUrl, no este helper
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return withScheme;

  // El constructor URL ya baja esquema y host a minusculas y respeta el resto.
  // Solo se le quita la barra final que anade a las URLs sin ruta, para que
  // "acme.com" se guarde como "https://acme.com" y no como "https://acme.com/".
  if (parsed.pathname === '/' && !parsed.search && !parsed.hash) {
    return `${parsed.protocol}//${parsed.host}`;
  }
  return parsed.href;
}

/** Vacio = valido (campo opcional). Acepta la forma sin esquema. */
export function isValidUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (trimmed === '') return true;
  if (/\s/.test(trimmed)) return false;

  const normalized = normalizeUrl(trimmed);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return HOST_RE.test(parsed.hostname);
}
