import { DirectoryCity } from '../../types/location';

// ============================================================
// Directorio de ciudades — el ÚNICO fichero que conoce la URL
// ============================================================
// Fase 7, F2a. Las ciudades no viven en Postgres y no van a vivir: mantener
// un catálogo de ciudades del mundo es asumir su mantenimiento para siempre.
// Se piden a countries.dev, que sirve datos de GeoNames sin clave.
//
// ⚠ NADIE MÁS PUEDE LLAMAR A ESA URL. Si el proveedor desaparece o cambia de
// forma, se reescribe este fichero y no diez. `scripts/testLocation.ts` lo
// comprueba de verdad: rastrea src/ y app/ buscando 'https://countries.dev' y
// falla si aparece fuera de aquí. La regla no es un comentario, es un test.
// (Busca la URL, no el dominio a secas: NOMBRAR el servicio es legítimo y a
// veces obligatorio — la atribución CC BY del aviso legal lo cita.)
//
// ⚠ ESTE SERVICIO ES UNA COMODIDAD, NO UNA DEPENDENCIA. Si se cae, el
// usuario escribe la ciudad a mano y sigue. Por eso NADA de aquí lanza por un
// fallo de red: `searchCities` devuelve siempre un resultado descriptivo, y
// el que llama nunca necesita try/catch. Un throw acabaría, tarde o temprano,
// en un catch que corta un formulario.
//
// ── El detalle que hay que conocer de esta API ──────────────
// Sin resultados devuelve **404 con `text/plain` y el cuerpo 'No cities
// found'**, no un array vacío en JSON. Comprobado contra el endpoint real:
//
//   q=malaga&country=ES  -> 200 application/json  [Málaga, Vélez-Málaga]
//   q=zzzzqqq&country=ES -> 404 text/plain        'No cities found'
//   q=madrid&country=XX  -> 404 text/plain        'No cities found'
//
// Eso obliga a dos cosas, y las dos son fáciles de hacer mal:
//   1. Un 404 aquí es CERO RESULTADOS, no un error. Tratarlo como error haría
//      que teclear media palabra que aún no encaja pintase un aviso de fallo
//      en lugar de "no hay coincidencias, escríbela a mano".
//   2. `res.json()` a pelo sobre ese cuerpo lanza SyntaxError. Un catch
//      genérico lo reportaría como caída de red, que es mentira.
//
// Ordena por población descendente (verificado: q=san&country=BO devuelve
// Santa Cruz de la Sierra 1.8M antes que San Borja 24k) y es insensible a
// acentos ('malaga' encuentra 'Málaga'), así que no hace falta normalizar el
// texto antes de mandarlo.
//
// ── Atribución ─────────────────────────────────────────────
// Datos de GeoNames bajo CC BY 4.0. La atribución está en el aviso legal
// (app/terms-of-service.tsx, sección "15. Data sources and attribution") y
// visible junto a los resultados en CountryCityPicker. La licencia la exige;
// no la quites al refactorizar.

const CITY_DIRECTORY_URL = 'https://countries.dev/cities';

/** Techo de la petición. Pasado esto se abandona y el usuario escribe a mano. */
const DEFAULT_TIMEOUT_MS = 6000;

/** 10 resultados llenan la lista sin obligar a hacer scroll dentro del campo. */
const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

export type CityDirectoryFailure =
  /** No hubo respuesta: sin red, DNS, CORS, proveedor caído. */
  | 'network'
  /** Hubo respuesta pero tardó más que el techo. */
  | 'timeout'
  /** Respondió, pero no con el JSON que esperamos. Cambio de contrato. */
  | 'malformed'
  /** Respondió con un código que no sabemos interpretar (5xx, 429...). */
  | 'http';

/**
 * El resultado de una búsqueda. Es un union cerrado y NO lanza nunca: el que
 * llama distingue los tres casos sin try/catch.
 *
 * `aborted` no es un fallo — es lo que pasa cuando el usuario sigue tecleando
 * y cancelamos la petición anterior. Quien lo reciba debe IGNORARLO: pintar
 * "no disponible" al cancelar sería parpadear un error en cada tecla.
 */
export type CitySearchOutcome =
  | { status: 'ok'; cities: DirectoryCity[] }
  | { status: 'aborted' }
  | { status: 'unavailable'; reason: CityDirectoryFailure; error: Error };

export interface CitySearchParams {
  /** Texto tecleado. Vacío es válido: la API devuelve las mayores del país. */
  query: string;
  /** ISO-3166-1 alpha-2. Acota la búsqueda; sin él no se busca. */
  countryCode: string;
  limit?: number;
  /** Señal del que llama, para cancelar al teclear de nuevo o al desmontar. */
  signal?: AbortSignal;
}

export interface CityDirectoryDeps {
  /** Inyectable para poder testear sin red — ver scripts/testLocation.ts. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  baseUrl?: string;
}

/**
 * Valida una fila del proveedor antes de dejarla entrar.
 *
 * No es paranoia: una fila sin `latitude` que pasara de largo se convertiría
 * en una `CitySelection` de tipo 'directory' SIN coordenadas reales, y en F2c
 * en un pin en el golfo de Guinea. Se descarta la fila, no la respuesta
 * entera — que 1 de 10 ciudades venga rota no es motivo para dejar al usuario
 * sin las otras 9.
 */
function toDirectoryCity(row: unknown): DirectoryCity | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Record<string, unknown>;

  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const latitude = typeof r.latitude === 'number' ? r.latitude : NaN;
  const longitude = typeof r.longitude === 'number' ? r.longitude : NaN;
  const geonameId = typeof r.geonameId === 'number' ? r.geonameId : NaN;

  if (!name) return null;
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) return null;
  if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) return null;
  if (!Number.isFinite(geonameId)) return null;

  return {
    geonameId,
    name,
    asciiName: typeof r.asciiName === 'string' && r.asciiName.trim() ? r.asciiName.trim() : name,
    countryCode: typeof r.countryCode === 'string' ? r.countryCode.toUpperCase() : '',
    latitude,
    longitude,
    population: typeof r.population === 'number' && Number.isFinite(r.population) ? r.population : 0,
    timezone: typeof r.timezone === 'string' ? r.timezone : '',
  };
}

function isAbortError(err: unknown): boolean {
  return Boolean(err) && typeof err === 'object' && (err as { name?: string }).name === 'AbortError';
}

export function createCityDirectory(deps: CityDirectoryDeps = {}) {
  const doFetch = deps.fetchImpl ?? ((...args: Parameters<typeof fetch>) => fetch(...args));
  const timeoutMs = deps.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = deps.baseUrl ?? CITY_DIRECTORY_URL;

  async function searchCities(params: CitySearchParams): Promise<CitySearchOutcome> {
    const countryCode = params.countryCode?.trim().toUpperCase() ?? '';

    // Sin país no se busca. No es un fallo del proveedor, así que no se
    // reporta como 'unavailable': simplemente no hay nada que pedir.
    if (!/^[A-Z]{2}$/.test(countryCode)) return { status: 'ok', cities: [] };

    const limit = Math.min(Math.max(1, Math.trunc(params.limit ?? DEFAULT_LIMIT)), MAX_LIMIT);
    const url = `${baseUrl}?q=${encodeURIComponent(params.query.trim())}&country=${countryCode}&limit=${limit}`;

    // Dos motivos para abortar: el techo de tiempo y el del que llama. Se
    // combinan en un controller propio para poder distinguir después CUÁL
    // saltó — el timeout es 'unavailable', la cancelación del usuario no.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => controller.abort();
    params.signal?.addEventListener('abort', onCallerAbort);

    try {
      if (params.signal?.aborted) return { status: 'aborted' };

      const response = await doFetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });

      // 404 = 'No cities found'. Cero resultados, no un error. Ver la
      // cabecera: es el caso normal de teclear media palabra.
      if (response.status === 404) return { status: 'ok', cities: [] };

      if (!response.ok) {
        return {
          status: 'unavailable',
          reason: 'http',
          error: new Error(`City directory responded ${response.status}`),
        };
      }

      // El cuerpo se lee como texto y se parsea aquí, en vez de con
      // `response.json()`, para que un cuerpo no-JSON sea 'malformed' (un
      // cambio de contrato del proveedor) y no un error de red disfrazado.
      const body = await response.text();
      let parsed: unknown;
      try {
        parsed = JSON.parse(body);
      } catch {
        return {
          status: 'unavailable',
          reason: 'malformed',
          error: new Error('City directory returned a body that is not JSON'),
        };
      }

      if (!Array.isArray(parsed)) {
        return {
          status: 'unavailable',
          reason: 'malformed',
          error: new Error('City directory returned JSON that is not an array'),
        };
      }

      const cities = parsed
        .map(toDirectoryCity)
        .filter((c): c is DirectoryCity => c !== null);

      return { status: 'ok', cities };
    } catch (err) {
      if (isAbortError(err)) {
        // El techo de tiempo también aborta, y ahí sí hay que decirlo: el
        // usuario no canceló nada, el proveedor no llegó a tiempo.
        if (timedOut) {
          return {
            status: 'unavailable',
            reason: 'timeout',
            error: new Error(`City directory timed out after ${timeoutMs}ms`),
          };
        }
        return { status: 'aborted' };
      }
      return {
        status: 'unavailable',
        reason: 'network',
        error: err instanceof Error ? err : new Error(String(err)),
      };
    } finally {
      clearTimeout(timer);
      params.signal?.removeEventListener('abort', onCallerAbort);
    }
  }

  return { searchCities };
}

export type CityDirectory = ReturnType<typeof createCityDirectory>;

/** La instancia que usa la app. Los tests construyen la suya con un fetch falso. */
export const cityDirectoryRepository = createCityDirectory();
