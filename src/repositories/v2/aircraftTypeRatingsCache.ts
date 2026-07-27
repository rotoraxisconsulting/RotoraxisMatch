import { AircraftTypeRatingCatalog } from '../../types/catalog';

// Pure, dependency-injected TTL cache for the aircraft ratings catalog.
//
// Deliberately has NO import of src/lib/supabase.ts (or anything else with
// side effects) so it can be unit-tested with a fake fetcher — see
// scripts/testMatching.ts. catalogRepository.ts wires one instance of this
// up with the real Supabase queries.
//
// Design (see docs/archive/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md section
// "Estrategia de caché" for the full rationale):
//   - getActiveRatings() serves the last successful fetch for up to `ttlMs`
//     before refetching. Concurrent calls while a fetch is already in
//     flight share the same promise (no duplicate requests).
//   - If a background refresh fails but a previous successful catalog is
//     still held, that catalog keeps being served (status stays 'success')
//     — the error is recorded but never silently replaced by nothing, and
//     never replaced by a hardcoded fallback catalog either.
//   - If there is no previous catalog and the fetch fails, status becomes
//     'error'; the next call retries automatically (nothing here caches a
//     failure indefinitely).
//   - getRatingsByIds() resolves ids by id, batching every id not already
//     known into a single fetchByIds() call (never one request per id), and
//     never drops inactive entries — it is the path used to resolve labels
//     for ratings that used to be active and are referenced by existing
//     technician/offer rows.
//   - invalidate() clears the active-list freshness so the next
//     getActiveRatings() call refetches; it deliberately keeps whatever is
//     already resolved in the by-id map, since those rows didn't become
//     wrong just because the active list needs a refresh.
export type AircraftRatingsCacheStatus = 'empty' | 'loading' | 'success' | 'error';

export interface AircraftTypeRatingsCacheState {
  status: AircraftRatingsCacheStatus;
  ratings: AircraftTypeRatingCatalog[];
  fetchedAt: number | null;
  error: Error | null;
}

export interface AircraftTypeRatingsCacheDeps {
  fetchActive: () => Promise<AircraftTypeRatingCatalog[]>;
  fetchByIds: (ids: string[]) => Promise<AircraftTypeRatingCatalog[]>;
  ttlMs?: number;
  now?: () => number;
}

export interface AircraftTypeRatingsCache {
  getActiveRatings(options?: { forceRefresh?: boolean }): Promise<AircraftTypeRatingCatalog[]>;
  getRatingsByIds(ids: string[]): Promise<AircraftTypeRatingCatalog[]>;
  getState(): AircraftTypeRatingsCacheState;
  invalidate(): void;
}

const DEFAULT_TTL_MS = 15 * 60 * 1000; // 15 min — catalog changes rarely; short
// enough that a catalog_request resolved into a new row during a session
// shows up without an app restart if the user re-opens the picker later.

export function createAircraftTypeRatingsCache(deps: AircraftTypeRatingsCacheDeps): AircraftTypeRatingsCache {
  const ttlMs = deps.ttlMs ?? DEFAULT_TTL_MS;
  const now = deps.now ?? (() => Date.now());
  const byId = new Map<string, AircraftTypeRatingCatalog>();

  let state: AircraftTypeRatingsCacheState = { status: 'empty', ratings: [], fetchedAt: null, error: null };
  let inFlight: Promise<AircraftTypeRatingCatalog[]> | null = null;

  function isFresh(): boolean {
    return state.status === 'success' && state.fetchedAt !== null && now() - state.fetchedAt < ttlMs;
  }

  function getActiveRatings(options: { forceRefresh?: boolean } = {}): Promise<AircraftTypeRatingCatalog[]> {
    if (!options.forceRefresh && isFresh()) return Promise.resolve(state.ratings);
    if (inFlight) return inFlight;

    if (state.status === 'empty' || state.status === 'error') state = { ...state, status: 'loading' };

    const hadPreviousData = state.ratings.length > 0;

    const promise = deps
      .fetchActive()
      .then((ratings) => {
        ratings.forEach((r) => byId.set(r.id, r));
        state = { status: 'success', ratings, fetchedAt: now(), error: null };
        inFlight = null;
        return ratings;
      })
      .catch((err) => {
        inFlight = null;
        const error = err instanceof Error ? err : new Error(String(err));
        if (hadPreviousData) {
          // Keep serving the stale-but-known-good catalog — resolve (not
          // reject) so callers don't have to special-case "refresh failed
          // but I still have data". The error is recorded on state for
          // anyone who wants to show a subtle "last refresh failed" hint.
          state = { ...state, status: 'success', error };
          return state.ratings;
        }
        state = { status: 'error', ratings: [], fetchedAt: null, error };
        throw error;
      });
    inFlight = promise;
    return promise;
  }

  async function getRatingsByIds(ids: string[]): Promise<AircraftTypeRatingCatalog[]> {
    const uniqueIds = [...new Set(ids)].filter(Boolean);
    if (uniqueIds.length === 0) return [];
    const missing = uniqueIds.filter((id) => !byId.has(id));
    if (missing.length > 0) {
      const fetched = await deps.fetchByIds(missing);
      fetched.forEach((r) => byId.set(r.id, r));
    }
    return uniqueIds.map((id) => byId.get(id)).filter((r): r is AircraftTypeRatingCatalog => Boolean(r));
  }

  return {
    getActiveRatings,
    getRatingsByIds,
    getState: () => state,
    invalidate: () => {
      state = { status: 'empty', ratings: [], fetchedAt: null, error: null };
    },
  };
}
