import { useCallback, useEffect, useMemo, useState } from 'react';
import { catalogRepository } from '../repositories/v2/catalogRepository';
import { AircraftTypeRatingCatalog } from '../types/catalog';
import { AircraftRatingIndex, buildAircraftRatingIndex } from '../constants/aircraftTypeRatings';

export type AircraftTypeRatingsLoadState = 'loading' | 'success' | 'empty' | 'error';

interface UseAircraftTypeRatingsCatalogReturn {
  ratings: AircraftTypeRatingCatalog[];
  ratingIndex: AircraftRatingIndex;
  state: AircraftTypeRatingsLoadState;
  error: Error | null;
  retry: () => void;
}

// Shared entry point for every screen that needs the aircraft ratings
// catalog (technician profile, offer forms, matching, search). Backed by
// catalogRepository's module-level cache, so mounting this hook in several
// places at once only triggers one network request. Never falls back to a
// hardcoded catalog on error — callers get an explicit 'error' state plus a
// retry() function instead.
export function useAircraftTypeRatingsCatalog(): UseAircraftTypeRatingsCatalogReturn {
  const [ratings, setRatings] = useState<AircraftTypeRatingCatalog[]>([]);
  const [state, setState] = useState<AircraftTypeRatingsLoadState>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev === 'success' ? prev : 'loading'));

    catalogRepository
      .getAircraftTypeRatings(attempt > 0 ? { forceRefresh: true } : undefined)
      .then((data) => {
        if (cancelled) return;
        setRatings(data);
        setError(null);
        setState(data.length === 0 ? 'empty' : 'success');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setState('error');
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  // Stable reference across renders unless `ratings` itself actually
  // changed — callers may safely put ratingIndex in a useCallback/useEffect
  // dependency array without triggering a reload loop.
  const ratingIndex = useMemo(() => buildAircraftRatingIndex(ratings), [ratings]);

  return { ratings, ratingIndex, state, error, retry };
}
