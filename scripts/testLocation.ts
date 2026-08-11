// Tests de la infraestructura de localización (Fase 7, F2a).
//
// Sin red y sin Supabase: el envoltorio del directorio de ciudades recibe un
// `fetch` falso por inyección, y la caché de países un fetcher falso. Todo lo
// que se ejerce aquí es determinista.
//
// Lo que se protege, por orden de importancia:
//
//   1. Que un 404 del proveedor sea CERO RESULTADOS y no un error. La API de
//      countries.dev responde 404 con 'No cities found' en text/plain cuando
//      no hay coincidencias — comprobado contra el endpoint real. Tratarlo
//      como fallo pintaría un aviso de error al teclear media palabra.
//   2. Que un fallo de red NUNCA lance. El servicio es una comodidad: si
//      lanzara, acabaría en un catch que corta un formulario.
//   3. Que una fila corrupta del proveedor no se convierta en una ciudad con
//      coordenadas falsas — en F2c eso sería un pin en el sitio equivocado.
//   4. Que la URL del proveedor viva en UN solo fichero.
//
// Run: npm run test:location
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { createCityDirectory } from '../src/repositories/v2/cityDirectoryRepository';
import { createLocationCountriesCache } from '../src/repositories/v2/locationCountriesCache';
import { CountryCatalogEntry, getCityCoordinates } from '../src/types/location';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS — ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL — ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

// ── Respuestas falsas ─────────────────────────────────────────────────────

const MALAGA_ROW = {
  geonameId: 2514256,
  name: 'Málaga',
  asciiName: 'Malaga',
  countryCode: 'ES',
  admin1Code: '51',
  latitude: 36.72016,
  longitude: -4.42034,
  population: 592346,
  timezone: 'Europe/Madrid',
  featureCode: 'PPLA2',
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

function textResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as unknown as Response;
}

/** Un fetch falso que anota las URLs pedidas. */
function stubFetch(handler: (url: string) => Promise<Response>) {
  const calls: string[] = [];
  const fn = (async (input: unknown) => {
    const url = String(input);
    calls.push(url);
    return handler(url);
  }) as unknown as typeof fetch;
  return { fn, calls };
}

async function main() {
  console.log('\n=== LOCALIZACIÓN — directorio de ciudades y catálogo de países ===\n');

  // ── El envoltorio del directorio ────────────────────────────────────────

  await test('Directorio — una respuesta normal se mapea a ciudades', async () => {
    const { fn, calls } = stubFetch(async () => jsonResponse([MALAGA_ROW]));
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'malaga', countryCode: 'ES' });

    assert.equal(outcome.status, 'ok');
    if (outcome.status !== 'ok') return;
    assert.equal(outcome.cities.length, 1);
    assert.equal(outcome.cities[0].name, 'Málaga');
    assert.equal(outcome.cities[0].asciiName, 'Malaga');
    assert.equal(outcome.cities[0].latitude, 36.72016);
    assert.equal(outcome.cities[0].geonameId, 2514256);
    // El país va en mayúsculas y el texto codificado.
    assert.ok(calls[0].includes('country=ES'), calls[0]);
    assert.ok(calls[0].includes('q=malaga'), calls[0]);
  });

  await test('Directorio — 404 "No cities found" es CERO RESULTADOS, no un error', async () => {
    // Éste es el test que justifica la suite entera. La API responde así ante
    // una búsqueda que simplemente no encaja todavía.
    const { fn } = stubFetch(async () => textResponse('No cities found', 404));
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'zzzzqqq', countryCode: 'ES' });

    assert.equal(outcome.status, 'ok');
    if (outcome.status !== 'ok') return;
    assert.deepEqual(outcome.cities, []);
  });

  await test('Directorio — un cuerpo que no es JSON es "malformed", no un fallo de red', async () => {
    // Distinguirlos importa: 'malformed' significa que el proveedor cambió el
    // contrato, y eso se arregla tocando código, no reintentando.
    const { fn } = stubFetch(async () => textResponse('<html>gateway</html>', 200));
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'madrid', countryCode: 'ES' });

    assert.equal(outcome.status, 'unavailable');
    if (outcome.status !== 'unavailable') return;
    assert.equal(outcome.reason, 'malformed');
  });

  await test('Directorio — JSON que no es un array también es "malformed"', async () => {
    const { fn } = stubFetch(async () => jsonResponse({ error: 'nope' }));
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'madrid', countryCode: 'ES' });

    assert.equal(outcome.status, 'unavailable');
    if (outcome.status !== 'unavailable') return;
    assert.equal(outcome.reason, 'malformed');
  });

  await test('Directorio — un 5xx es "http" y no lanza', async () => {
    const { fn } = stubFetch(async () => textResponse('boom', 503));
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'madrid', countryCode: 'ES' });

    assert.equal(outcome.status, 'unavailable');
    if (outcome.status !== 'unavailable') return;
    assert.equal(outcome.reason, 'http');
  });

  await test('Directorio — la red caída devuelve "network" en vez de lanzar', async () => {
    // La garantía central: con la red muerta el usuario sigue escribiendo.
    const { fn } = stubFetch(async () => {
      throw new TypeError('Network request failed');
    });
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'madrid', countryCode: 'ES' });

    assert.equal(outcome.status, 'unavailable');
    if (outcome.status !== 'unavailable') return;
    assert.equal(outcome.reason, 'network');
    assert.ok(outcome.error instanceof Error);
  });

  await test('Directorio — pasado el techo de tiempo es "timeout", no "aborted"', async () => {
    // Los dos abortan la petición; sólo uno es culpa del proveedor. Si el
    // timeout se reportara como 'aborted', el hook lo ignoraría en silencio y
    // la lista se quedaría "buscando" para siempre.
    const { fn } = stubFetch(
      (url) =>
        new Promise<Response>((_resolve, reject) => {
          void url;
          setTimeout(() => {
            const err = new Error('aborted');
            err.name = 'AbortError';
            reject(err);
          }, 40);
        }),
    );
    const directory = createCityDirectory({ fetchImpl: fn, timeoutMs: 10 });

    const outcome = await directory.searchCities({ query: 'madrid', countryCode: 'ES' });

    assert.equal(outcome.status, 'unavailable');
    if (outcome.status !== 'unavailable') return;
    assert.equal(outcome.reason, 'timeout');
  });

  await test('Directorio — cancelar por el que llama es "aborted", que no es un fallo', async () => {
    const controller = new AbortController();
    const { fn } = stubFetch(
      () =>
        new Promise<Response>((_resolve, reject) => {
          const err = new Error('aborted');
          err.name = 'AbortError';
          setTimeout(() => reject(err), 5);
        }),
    );
    const directory = createCityDirectory({ fetchImpl: fn, timeoutMs: 5000 });

    const promise = directory.searchCities({ query: 'mad', countryCode: 'ES', signal: controller.signal });
    controller.abort();
    const outcome = await promise;

    assert.equal(outcome.status, 'aborted');
  });

  await test('Directorio — una señal ya abortada no llega a pedir nada', async () => {
    const controller = new AbortController();
    controller.abort();
    const { fn, calls } = stubFetch(async () => jsonResponse([MALAGA_ROW]));
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'mad', countryCode: 'ES', signal: controller.signal });

    assert.equal(outcome.status, 'aborted');
    assert.equal(calls.length, 0);
  });

  await test('Directorio — las filas corruptas se descartan una a una, no la respuesta entera', async () => {
    // Que 1 de 4 venga rota no puede dejar al usuario sin las otras 3. Y
    // ninguna de las rotas puede colarse: una ciudad "del directorio" sin
    // coordenadas reales acaba siendo un pin en el sitio equivocado.
    const { fn } = stubFetch(async () =>
      jsonResponse([
        MALAGA_ROW,
        { ...MALAGA_ROW, geonameId: 1, latitude: undefined },
        { ...MALAGA_ROW, geonameId: 2, name: '   ' },
        { ...MALAGA_ROW, geonameId: 3, longitude: 999 },
        { ...MALAGA_ROW, geonameId: 4, name: 'Sevilla' },
      ]),
    );
    const directory = createCityDirectory({ fetchImpl: fn });

    const outcome = await directory.searchCities({ query: 'a', countryCode: 'ES' });

    assert.equal(outcome.status, 'ok');
    if (outcome.status !== 'ok') return;
    assert.deepEqual(
      outcome.cities.map((c) => c.name),
      ['Málaga', 'Sevilla'],
    );
  });

  await test('Directorio — sin país válido no se pide nada, y no es un fallo', async () => {
    const { fn, calls } = stubFetch(async () => jsonResponse([MALAGA_ROW]));
    const directory = createCityDirectory({ fetchImpl: fn });

    for (const countryCode of ['', '   ', 'E', 'ESP', '12']) {
      const outcome = await directory.searchCities({ query: 'madrid', countryCode });
      assert.equal(outcome.status, 'ok', `countryCode=${countryCode}`);
      if (outcome.status !== 'ok') continue;
      assert.deepEqual(outcome.cities, [], `countryCode=${countryCode}`);
    }
    assert.equal(calls.length, 0, 'no debería haber salido ninguna petición');
  });

  await test('Directorio — el país se normaliza a mayúsculas y el límite se acota', async () => {
    const { fn, calls } = stubFetch(async () => jsonResponse([]));
    const directory = createCityDirectory({ fetchImpl: fn });

    await directory.searchCities({ query: 'x', countryCode: 'es', limit: 999 });
    await directory.searchCities({ query: 'x', countryCode: 'ES', limit: 0 });

    assert.ok(calls[0].includes('country=ES'), calls[0]);
    assert.ok(calls[0].includes('limit=50'), `el límite debería acotarse a 50: ${calls[0]}`);
    assert.ok(calls[1].includes('limit=1'), `el límite mínimo es 1: ${calls[1]}`);
  });

  await test('Directorio — el texto se codifica para la URL', async () => {
    const { fn, calls } = stubFetch(async () => jsonResponse([]));
    const directory = createCityDirectory({ fetchImpl: fn });

    await directory.searchCities({ query: '  a coruña & vigo  ', countryCode: 'ES' });

    assert.ok(!calls[0].includes(' '), `sin espacios crudos: ${calls[0]}`);
    assert.ok(calls[0].includes('%26') || !calls[0].includes('&vigo'), `el & va codificado: ${calls[0]}`);
    // Y recortado: los espacios de los extremos no son parte de la búsqueda.
    assert.ok(!calls[0].includes('q=%20'), calls[0]);
  });

  // ── La distinción que F2c necesita ──────────────────────────────────────

  await test('Ciudad — sólo la elegida del directorio tiene coordenadas', () => {
    assert.deepEqual(
      getCityCoordinates({
        kind: 'directory',
        name: 'Madrid',
        geonameId: 3117735,
        latitude: 40.4165,
        longitude: -3.70256,
        timezone: 'Europe/Madrid',
      }),
      { latitude: 40.4165, longitude: -3.70256 },
    );

    // Escrita a mano: no hay coordenadas, y `null` es la respuesta CORRECTA,
    // no un error. En F2c significa "no pintes pin de ciudad, cae al país".
    assert.equal(getCityCoordinates({ kind: 'manual', name: 'Madrid' }), null);
    assert.equal(getCityCoordinates(null), null);
  });

  // ── La caché del catálogo de países ─────────────────────────────────────

  const COUNTRIES: CountryCatalogEntry[] = [
    { code: 'ES', name: 'Spain', latitude: 40, longitude: -4 },
    { code: 'FR', name: 'France', latitude: 46, longitude: 2 },
  ];

  await test('Países — dentro del TTL se sirve lo cacheado sin volver a pedir', async () => {
    let calls = 0;
    let clock = 1000;
    const cache = createLocationCountriesCache({
      fetchActive: async () => {
        calls += 1;
        return COUNTRIES;
      },
      ttlMs: 500,
      now: () => clock,
    });

    assert.deepEqual(await cache.getActiveCountries(), COUNTRIES);
    clock += 100;
    await cache.getActiveCountries();
    assert.equal(calls, 1);

    clock += 1000; // TTL vencido
    await cache.getActiveCountries();
    assert.equal(calls, 2);
  });

  await test('Países — las llamadas concurrentes comparten una sola petición', async () => {
    let calls = 0;
    const cache = createLocationCountriesCache({
      fetchActive: async () => {
        calls += 1;
        await new Promise((r) => setTimeout(r, 10));
        return COUNTRIES;
      },
    });

    const [a, b, c] = await Promise.all([
      cache.getActiveCountries(),
      cache.getActiveCountries(),
      cache.getActiveCountries(),
    ]);

    assert.equal(calls, 1);
    assert.deepEqual(a, COUNTRIES);
    assert.deepEqual(b, COUNTRIES);
    assert.deepEqual(c, COUNTRIES);
  });

  await test('Países — un refresco fallido NO vacía el catálogo que ya funcionaba', async () => {
    // Un desplegable de países que se queda vacío porque falló un refresco de
    // fondo es peor que uno ligeramente viejo.
    let shouldFail = false;
    let clock = 0;
    const cache = createLocationCountriesCache({
      fetchActive: async () => {
        if (shouldFail) throw new Error('network down');
        return COUNTRIES;
      },
      ttlMs: 100,
      now: () => clock,
    });

    await cache.getActiveCountries();
    shouldFail = true;
    clock += 500; // fuerza refresco

    const served = await cache.getActiveCountries();
    assert.deepEqual(served, COUNTRIES, 'debería seguir sirviendo el catálogo anterior');
    assert.equal(cache.getState().status, 'success');
    assert.ok(cache.getState().error, 'el error queda anotado aunque se siga sirviendo');
  });

  await test('Países — sin catálogo previo, el fallo se propaga y queda en "error"', async () => {
    // Aquí NO se puede servir nada, y hay que decirlo: caer a una lista
    // hardcodeada sería tener dos fuentes para el mismo catálogo.
    const cache = createLocationCountriesCache({
      fetchActive: async () => {
        throw new Error('network down');
      },
    });

    await assert.rejects(() => cache.getActiveCountries(), /network down/);
    assert.equal(cache.getState().status, 'error');
    assert.deepEqual(cache.getState().countries, []);
  });

  await test('Países — tras un fallo, la siguiente llamada reintenta sola', async () => {
    let attempts = 0;
    const cache = createLocationCountriesCache({
      fetchActive: async () => {
        attempts += 1;
        if (attempts === 1) throw new Error('transient');
        return COUNTRIES;
      },
    });

    await assert.rejects(() => cache.getActiveCountries());
    assert.deepEqual(await cache.getActiveCountries(), COUNTRIES);
    assert.equal(attempts, 2);
  });

  await test('Países — invalidate() fuerza la siguiente petición', async () => {
    let calls = 0;
    const cache = createLocationCountriesCache({
      fetchActive: async () => {
        calls += 1;
        return COUNTRIES;
      },
    });

    await cache.getActiveCountries();
    await cache.getActiveCountries();
    assert.equal(calls, 1);

    cache.invalidate();
    assert.equal(cache.getState().status, 'empty');
    await cache.getActiveCountries();
    assert.equal(calls, 2);
  });

  // ── La regla arquitectónica, como test ──────────────────────────────────

  await test('Arquitectura — sólo cityDirectoryRepository conoce la URL del proveedor', () => {
    // "Toda la app pide ciudades a este módulo, nunca a la URL directamente."
    // Escrito como comentario se erosiona; escrito como test, no.
    //
    // Se busca 'https://countries.dev', no el dominio a secas: lo que está
    // prohibido es CONSTRUIR la petición en otro sitio, no nombrar el
    // servicio. Nombrarlo hace falta — la atribución de la CC BY en
    // terms-of-service.tsx lo cita por obligación legal, y varios comentarios
    // explican de dónde salen los datos. Un guardián que prohibiera la
    // palabra obligaría a borrar precisamente la documentación que sirve.
    const FORBIDDEN = 'https://countries.dev';
    const ALLOWED = 'src/repositories/v2/cityDirectoryRepository.ts';
    // La raíz del proyecto, no __dirname: este fichero se ejecuta ya
    // compilado desde .tmp-test-location/scripts, donde no hay src/ ni app/.
    // npm ejecuta los scripts desde la raíz del paquete.
    const root = process.cwd();
    const offenders: string[] = [];

    function walk(dir: string) {
      for (const entry of readdirSync(dir)) {
        if (entry === 'node_modules' || entry.startsWith('.')) continue;
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.(ts|tsx)$/.test(entry)) continue;
        const rel = relative(root, full).split('\\').join('/');
        if (rel === ALLOWED) continue;
        if (readFileSync(full, 'utf8').includes(FORBIDDEN)) offenders.push(rel);
      }
    }

    // Si los directorios no están donde se espera, este test pasaría sin
    // haber mirado nada — un guardián que no mira es peor que ninguno.
    for (const dir of ['src', 'app']) {
      assert.ok(
        statSync(join(root, dir)).isDirectory(),
        `No encuentro ${dir}/ desde ${root}: el rastreo no habría comprobado nada.`,
      );
    }

    walk(join(root, 'src'));
    walk(join(root, 'app'));

    // Y que el fichero permitido SÍ contenga la URL: si alguien la moviera,
    // el rastreo pasaría en verde por vacío en vez de avisar del cambio.
    assert.ok(
      readFileSync(join(root, ALLOWED), 'utf8').includes(FORBIDDEN),
      `${ALLOWED} ya no contiene la URL del proveedor: o se movió, o este guardián dejó de tener sentido.`,
    );

    assert.deepEqual(
      offenders,
      [],
      `Estos ficheros construyen la URL del proveedor en vez de pasar por ${ALLOWED}: ${offenders.join(', ')}`,
    );
  });
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  })
  .catch((err) => {
    console.error('Test runner crashed:', err);
    process.exit(1);
  });
