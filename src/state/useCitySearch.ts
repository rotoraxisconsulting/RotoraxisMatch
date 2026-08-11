import { useCallback, useEffect, useRef, useState } from 'react';
import { cityDirectoryRepository, CityDirectory } from '../repositories/v2/cityDirectoryRepository';
import { DirectoryCity } from '../types/location';

/**
 * Los cuatro estados de la búsqueda. Son CUATRO y no tres a propósito:
 *
 *   idle        — no hay país todavía, no hay nada que buscar.
 *   searching   — hay una petición en marcha o esperando al debounce.
 *   ready       — llegó respuesta. `cities` es la verdad, VACÍA INCLUIDA.
 *   unavailable — el directorio no respondió. NO significa "no hay ciudades".
 *
 * ⚠ La distinción entre 'searching', 'ready' con lista vacía y 'unavailable'
 * es el punto entero de este hook. Colapsarlas en "¿hay resultados?" es el
 * patrón que ya nos costó una sesión: sacar conclusiones de un resultado que
 * todavía no ha llegado. Mientras es 'searching' NO SE SABE si hay ciudades,
 * y quien pinte "no encontrada" ahí estará mintiendo la mitad del tiempo.
 */
export type CitySearchState = 'idle' | 'searching' | 'ready' | 'unavailable';

interface UseCitySearchOptions {
  /** Inyectable para test. Se congela al montar: es un punto de inyección, no un prop reactivo. */
  directory?: CityDirectory;
  debounceMs?: number;
  limit?: number;
}

interface UseCitySearchReturn {
  query: string;
  setQuery: (value: string) => void;
  cities: DirectoryCity[];
  state: CitySearchState;
  /** Reintenta la última búsqueda. Sólo tiene sentido tras 'unavailable'. */
  retry: () => void;
}

// 280 ms: por encima del ritmo de tecleo normal (así no se manda una petición
// por letra) y por debajo del umbral en que la lista se siente parada.
const DEFAULT_DEBOUNCE_MS = 280;

/**
 * Busca ciudades del directorio acotadas a un país, con debounce y
 * cancelación de la petición anterior.
 *
 * NO valida nada. No decide si la ciudad que el usuario escribió "existe", no
 * la corrige y no la reemplaza por un resultado. El texto libre es una salida
 * legítima del producto, no un borrador a la espera de que el servidor lo
 * bendiga. Este hook sólo SUGIERE.
 */
export function useCitySearch(countryCode: string | null, options: UseCitySearchOptions = {}): UseCitySearchReturn {
  const [query, setQuery] = useState('');
  const [cities, setCities] = useState<DirectoryCity[]>([]);
  const [state, setState] = useState<CitySearchState>('idle');
  const [attempt, setAttempt] = useState(0);

  // Congelados al montar. Si fueran dependencias del efecto, un objeto creado
  // en línea por el que llama reiniciaría la búsqueda en cada render.
  const directoryRef = useRef(options.directory ?? cityDirectoryRepository);
  const debounceMs = useRef(options.debounceMs ?? DEFAULT_DEBOUNCE_MS).current;
  const limit = useRef(options.limit).current;

  // Cada petición se numera. El AbortController corta la anterior, pero una
  // respuesta ya en vuelo puede llegar DESPUÉS de la siguiente: sin este
  // contador, un resultado viejo y lento pisaría al nuevo y la lista
  // mostraría ciudades de una búsqueda que el usuario ya cambió.
  const requestSeq = useRef(0);

  // Cambiar de país tira la búsqueda anterior entera. Los resultados de
  // España no son "resultados aún válidos" para Francia.
  useEffect(() => {
    setQuery('');
    setCities([]);
    setState(countryCode ? 'searching' : 'idle');
  }, [countryCode]);

  useEffect(() => {
    if (!countryCode) {
      setCities([]);
      setState('idle');
      return;
    }

    let cancelled = false;
    const seq = requestSeq.current + 1;
    requestSeq.current = seq;
    const controller = new AbortController();

    // 'searching' se marca YA, no cuando arranca el fetch: entre la tecla y
    // el final del debounce tampoco se sabe nada, y el estado tiene que
    // decirlo. Si aquí quedara 'ready' con la lista anterior, el usuario
    // vería resultados de lo que escribió hace dos letras.
    setState('searching');

    const timer = setTimeout(() => {
      directoryRef.current
        .searchCities({ query, countryCode, limit, signal: controller.signal })
        .then((outcome) => {
          if (cancelled || seq !== requestSeq.current) return;

          // Cancelada porque el usuario siguió tecleando. No es un fallo y no
          // se pinta: hay otra petición en marcha que sí traerá respuesta.
          if (outcome.status === 'aborted') return;

          if (outcome.status === 'unavailable') {
            setCities([]);
            setState('unavailable');
            return;
          }

          setCities(outcome.cities);
          setState('ready');
        });
      // Sin .catch(): searchCities no lanza nunca, por contrato (ver la
      // cabecera de cityDirectoryRepository). Si algún día lanzara, queremos
      // enterarnos por una promesa no capturada, no que un catch silencioso
      // lo convierta en "no hay ciudades".
    }, debounceMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [countryCode, query, attempt, debounceMs, limit]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  return { query, setQuery, cities, state, retry };
}
