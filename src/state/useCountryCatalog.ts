import { useCallback, useEffect, useState } from 'react';
import { catalogRepository } from '../repositories/v2/catalogRepository';
import { CountryCatalogEntry } from '../types/location';

export type CountryCatalogLoadState = 'loading' | 'success' | 'empty' | 'error';

interface UseCountryCatalogReturn {
  countries: CountryCatalogEntry[];
  state: CountryCatalogLoadState;
  error: Error | null;
  retry: () => void;
}

// Punto de entrada compartido para el catálogo de países
// (`location_countries`, 249 activos). Respaldado por la caché de módulo de
// catalogRepository, así que montar este hook en varias pantallas a la vez
// dispara UNA sola petición.
//
// Igual que useAircraftTypeRatingsCatalog: nunca cae a una lista hardcodeada
// si falla. El que llama recibe 'error' y un retry(), y decide qué pintar.
//
// ⚠ Los cuatro estados son distintos y hay que tratarlos como tales.
// 'loading' NO es 'empty': pintar "no hay países" mientras la lista viene de
// camino es exactamente el patrón de sacar conclusiones de un resultado que
// todavía no ha llegado.
export function useCountryCatalog(): UseCountryCatalogReturn {
  const [countries, setCountries] = useState<CountryCatalogEntry[]>([]);
  const [state, setState] = useState<CountryCatalogLoadState>('loading');
  const [error, setError] = useState<Error | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setState((prev) => (prev === 'success' ? prev : 'loading'));

    catalogRepository
      .getCountries(attempt > 0 ? { forceRefresh: true } : undefined)
      .then((data) => {
        if (cancelled) return;
        setCountries(data);
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

  return { countries, state, error, retry };
}
