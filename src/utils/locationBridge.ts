import { findCountry } from '../constants/countries';
import { resolveLocationSnapshot } from '../constants/locationCities';
import { PersistedLocation } from '../types/location';

// ============================================================
// El puente aeropuerto -> país + ciudad
// ============================================================
// Fase 7, F2b. Traduce el `locationCityId` de un aeropuerto al modelo nuevo
// (`location_country_code` + `location_city_name`), que es lo que la
// migración 057 añadió a las tres tablas.
//
// ⚠ ES TEMPORAL, Y TIENE FECHA DE CADUCIDAD. Existe sólo mientras las
// pantallas sigan eligiendo aeropuerto. En F2c el usuario elige país y ciudad
// directamente con `CountryCityPicker`, la escritura pasa a ser directa y
// este fichero se borra entero junto con `location_airports`.
//
// ⚠ ES EL ÚNICO SITIO QUE HACE ESTA TRADUCCIÓN. Los tres repositorios
// (ofertas, técnicos, empresas) pasan por aquí. Tener dos caminos escribiendo
// el mismo dato es exactamente lo que produjo los dos fallos de
// `offerPatchToDb` en la tanda D: `license_code` y `requiresAllAircraft` se
// añadieron a `create()` y nunca al patch, así que editar una oferta no
// guardaba nada — sin error y sin aviso.
//
// ── Por qué NO devuelve coordenadas, nunca ─────────────────
// El aeropuerto tiene latitud y longitud, y son las del AEROPUERTO. Barajas
// está a 12 km del centro de Madrid y Ciampino a 15 del de Roma. Copiarlas
// como coordenadas de la ciudad daría un pin preciso y falso, que es peor que
// no tener pin: el que lo mira no tiene forma de saber que está mal.
//
// Sin coordenadas, F2c encuadra el país — menos preciso y honesto. Cuando el
// usuario reelija su ciudad del directorio, tendrá las de verdad. Es la misma
// decisión que tomó el backfill de la 057, y por el mismo motivo.

/**
 * Deriva la localización persistible a partir del aeropuerto elegido.
 *
 * Lanza si el aeropuerto no está en el catálogo o si su país no tiene código
 * ISO. Las dos son imposibles hoy — `location_city_id` es NOT NULL con FK, y
 * los 65 países del catálogo de aeropuertos resuelven (comprobado contra
 * `location_country_aliases`: 0 discrepancias) — y por eso mismo, si alguna
 * ocurre, es un fallo de datos que hay que ver, no algo que degradar en
 * silencio a un país vacío que el NOT NULL rechazaría después con un mensaje
 * mucho peor.
 */
export function persistedLocationFromAirport(locationCityId: string): PersistedLocation {
  const snapshot = resolveLocationSnapshot({ locationCityId });
  if (!snapshot) {
    throw new Error(`Unknown location city id "${locationCityId}": it is not in the airport catalog.`);
  }

  const country = findCountry(snapshot.country);
  if (!country) {
    throw new Error(
      `Airport "${locationCityId}" is in "${snapshot.country}", which has no ISO country code in constants/countries.ts. ` +
        'Every country in the airport catalog must map to a location_countries code.',
    );
  }

  return {
    locationCountryCode: country.code,
    locationCityName: snapshot.city,
    // Sin coordenadas y sin geonameId, a propósito. Ver la cabecera.
  };
}

/**
 * Las columnas de Postgres correspondientes, listas para un insert/update.
 *
 * Se escriben SIEMPRE las cinco, incluidas las tres a `null`: un update
 * parcial que cambiara el país pero dejara unas coordenadas viejas de otra
 * ciudad produciría una fila coherente para el CHECK y mentirosa para el
 * usuario — Madrid con el punto de Valencia.
 */
export function locationColumnsFromAirport(locationCityId: string): Record<string, unknown> {
  const location = persistedLocationFromAirport(locationCityId);
  return {
    location_country_code: location.locationCountryCode,
    location_city_name: location.locationCityName ?? null,
    location_city_lat: null,
    location_city_lng: null,
    location_city_geoname_id: null,
  };
}

/**
 * Aborta si alguien intenta escribir la localización nueva DIRECTAMENTE.
 *
 * Durante F2b los tres repositorios derivan las cinco columnas del aeropuerto,
 * así que un `locationCountryCode` suelto en un patch no se escribiría: se
 * caería en silencio. Y un campo que se cae en silencio es exactamente cómo
 * se produjeron los dos fallos de `offerPatchToDb` en la tanda D — el usuario
 * guarda, no hay error, y el dato no está.
 *
 * ⚠ ESTO SE BORRA EN F2c, y su desaparición es la señal de que el camino
 * directo ya existe. Cuando `CountryCityPicker` empiece a mandar país y
 * ciudad de verdad, esta guarda salta, y saltar es lo correcto: obliga a
 * implementar la escritura directa en vez de dejar que se pierda.
 */
export function assertNoDirectLocationWrite(patch: Partial<PersistedLocation>, where: string): void {
  const direct = (
    ['locationCountryCode', 'locationCityName', 'locationCityLat', 'locationCityLng', 'locationCityGeonameId'] as const
  ).filter((key) => patch[key] !== undefined);

  if (direct.length > 0) {
    throw new Error(
      `${where}: ${direct.join(', ')} cannot be written directly yet. During F2b the location columns are derived ` +
        'from locationCityId (see persistedLocationFromAirport). Wiring the direct path is F2c — implement it there ' +
        'instead of letting these values be dropped silently.',
    );
  }
}

/**
 * Lee las cinco columnas de una fila y las devuelve en forma de dominio.
 *
 * `?? undefined` y no `?? null` en los opcionales: en el dominio la ausencia
 * de ciudad se representa de UNA sola forma (`undefined`), igual que en el
 * resto de mappers del proyecto.
 */
export function persistedLocationFromRow(row: Record<string, any>): PersistedLocation {
  return {
    locationCountryCode: row.location_country_code,
    locationCityName: row.location_city_name ?? undefined,
    locationCityLat: row.location_city_lat ?? undefined,
    locationCityLng: row.location_city_lng ?? undefined,
    locationCityGeonameId: row.location_city_geoname_id ?? undefined,
  };
}
