import { CountryCatalogEntry } from '../../types/location';

// Caché TTL del catálogo de países (`public.location_countries`, migraciones
// 055/056: 250 filas, 249 activas).
//
// Mismo patrón e intención que aircraftTypeRatingsCache: sin ningún import
// con efectos (nada de src/lib/supabase.ts), para poder testearla con un
// fetcher falso — ver scripts/testLocation.ts. catalogRepository monta la
// instancia real.
//
// Es más pequeña que la de ratings a propósito: aquí no hace falta el mapa
// por id. Los países no se desactivan salvo casos como 'UM' (migración 056),
// y resolver el nombre de un código inactivo ya seleccionado es un problema
// de F2c, cuando exista algo que lo seleccione. Añadirlo ahora sería código
// sin lector.
//
// Reglas de fallo, iguales que en ratings porque el razonamiento es el mismo:
//   - Un refresco que falla teniendo catálogo previo NO borra el catálogo:
//     se sigue sirviendo el anterior y el error queda anotado. Un desplegable
//     de países que se vacía porque un refresco de fondo falló es peor que
//     uno ligeramente viejo.
//   - Sin catálogo previo, el fallo se propaga y el estado queda en 'error'.
//     Nunca se cae a una lista hardcodeada: el catálogo vive en Postgres.
//   - Las llamadas concurrentes comparten la petición en vuelo.

export type CountryCatalogStatus = 'empty' | 'loading' | 'success' | 'error';

export interface LocationCountriesCacheState {
  status: CountryCatalogStatus;
  countries: CountryCatalogEntry[];
  fetchedAt: number | null;
  error: Error | null;
}

export interface LocationCountriesCacheDeps {
  fetchActive: () => Promise<CountryCatalogEntry[]>;
  ttlMs?: number;
  now?: () => number;
}

export interface LocationCountriesCache {
  getActiveCountries(options?: { forceRefresh?: boolean }): Promise<CountryCatalogEntry[]>;
  getState(): LocationCountriesCacheState;
  invalidate(): void;
}

// 1 hora: la lista de países del mundo no cambia en una sesión. El TTL existe
// para recoger una desactivación administrativa sin reiniciar la app, no
// porque se espere movimiento.
const DEFAULT_TTL_MS = 60 * 60 * 1000;

export function createLocationCountriesCache(deps: LocationCountriesCacheDeps): LocationCountriesCache {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now ?? (() => Date.now());

  let state: LocationCountriesCacheState = { status: 'empty', countries: [], fetchedAt: null, error: null };
  let inFlight: Promise<CountryCatalogEntry[]> | null = null;

  function isFresh(): boolean {
    return state.status === 'success' && state.fetchedAt !== null && now() - state.fetchedAt < ttlMs;
  }

  function getActiveCountries(options: { forceRefresh?: boolean } = {}): Promise<CountryCatalogEntry[]> {
    if (!options.forceRefresh && isFresh()) return Promise.resolve(state.countries);
    if (inFlight) return inFlight;

    if (state.status === 'empty' || state.status === 'error') state = { ...state, status: 'loading' };

    const hadPreviousData = state.countries.length > 0;

    const promise = deps
      .fetchActive()
      .then((countries) => {
        state = { status: 'success', countries, fetchedAt: now(), error: null };
        inFlight = null;
        return countries;
      })
      .catch((err) => {
        inFlight = null;
        const error = err instanceof Error ? err : new Error(String(err));
        if (hadPreviousData) {
          state = { ...state, status: 'success', error };
          return state.countries;
        }
        state = { status: 'error', countries: [], fetchedAt: null, error };
        throw error;
      });

    inFlight = promise;
    return promise;
  }

  return {
    getActiveCountries,
    getState: () => state,
    invalidate: () => {
      state = { status: 'empty', countries: [], fetchedAt: null, error: null };
    },
  };
}
