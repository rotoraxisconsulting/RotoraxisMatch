import { findCountry } from '../constants/countries';
import { resolveLocationSnapshot } from '../constants/locationCities';
import { CountryCatalogEntry, LocationValue, PersistedLocation } from '../types/location';

// ============================================================
// Localización: del selector a Postgres, y de vuelta
// ============================================================
// Fase 7, F2c. Éste es el ÚNICO sitio que traduce entre lo que el usuario
// elige (`LocationValue`) y lo que se guarda (`PersistedLocation`), en las
// dos direcciones. Los tres repositorios pasan por aquí.
//
// ⚠ Hasta F2b este fichero derivaba la localización del AEROPUERTO
// (`persistedLocationFromAirport`, `locationColumnsFromAirport`) y
// `assertNoDirectLocationWrite` prohibía escribirla a mano. Las tres cosas se
// han retirado: los formularios ya eligen país y ciudad directamente, así que
// la derivación desde aeropuerto no tiene origen y la guarda ha cumplido su
// función — existía para que este momento no se saltara en silencio.
//
// ⚠ LAS CINCO COLUMNAS SE ESCRIBEN SIEMPRE JUNTAS. Escribir el país sin
// limpiar las coordenadas deja el punto de la ciudad anterior colgando de un
// país nuevo: Madrid con el pin de Valencia. `locationColumns()` no ofrece la
// posibilidad de escribir sólo algunas.

/**
 * Convierte lo que el selector produce en lo que la fila guarda.
 *
 * Lanza si no hay país: es NOT NULL en las tres tablas, y un formulario que
 * llegue aquí sin él tiene un fallo de validación que hay que ver, no que
 * degradar a una fila a medias.
 *
 * La distinción de F2a se conserva intacta: sólo la ciudad del directorio
 * trae coordenadas. La escrita a mano no las tiene EN EL TIPO, así que aquí
 * no hay nada que decidir — es imposible colar unas por error.
 */
export function persistedLocationFromValue(value: LocationValue): PersistedLocation {
  if (!value.country) {
    throw new Error('Location requires a country: it is NOT NULL in offers, technician_profiles and companies.');
  }

  const city = value.city;
  if (!city) {
    return { locationCountryCode: value.country.code };
  }

  if (city.kind === 'manual') {
    // Escrita a mano: nombre y nada más. Sin coordenadas que inventar.
    return { locationCountryCode: value.country.code, locationCityName: city.name };
  }

  return {
    locationCountryCode: value.country.code,
    locationCityName: city.name,
    locationCityLat: city.latitude,
    locationCityLng: city.longitude,
    locationCityGeonameId: city.geonameId,
  };
}

/**
 * Deriva el país de un aeropuerto del catálogo viejo.
 *
 * ⚠ QUEDA UN SOLO LECTOR, y es el que justifica que esta función siga viva:
 * `AuthContext.ensureRoleProfile()`. Una cuenta creada ANTES de F2c y que
 * confirme su email DESPUÉS tiene en sus metadatos un `location_city_id` y
 * ningún país — el formulario viejo no preguntaba por uno. Sin esta
 * traducción, esa persona confirmaría su correo y se quedaría sin perfil.
 *
 * No la uses para nada más: los formularios ya eligen país directamente.
 *
 * ── CUÁNDO SE PUEDE RETIRAR ────────────────────────────────
 * Cuando no quede NINGUNA cuenta pendiente de confirmar el email cuya
 * metadata tenga el formato viejo. La condición es comprobable, no una
 * corazonada:
 *
 *   SELECT count(*) FROM auth.users
 *   WHERE email_confirmed_at IS NULL
 *     AND raw_user_meta_data ? 'location_city_id'
 *     AND NOT (raw_user_meta_data ? 'location_country_code');
 *
 * En cuanto eso dé 0 —porque confirmaron, porque caducaron sus enlaces, o
 * porque se limpiaron— esta función, su rama en `AuthContext` y el import de
 * `locationCities` se van juntos. Antes de eso, borrarla deja sin perfil a
 * quien confirme su correo, y en silencio.
 *
 * Nunca devuelve coordenadas: las del aeropuerto no son las de la ciudad.
 */
export function persistedLocationFromAirport(locationCityId: string): PersistedLocation | null {
  const snapshot = resolveLocationSnapshot({ locationCityId });
  if (!snapshot) return null;

  const country = findCountry(snapshot.country);
  if (!country) return null;

  return { locationCountryCode: country.code, locationCityName: snapshot.city };
}

/**
 * El camino inverso: de la fila al valor que el selector edita.
 *
 * `countryName` viene del catálogo, no de la fila: el nombre es COPY y puede
 * cambiar (la migración 056 renombró 32 países). Guardarlo en la fila habría
 * congelado el nombre viejo; resolverlo aquí lo mantiene al día.
 */
export function locationValueFromPersisted(
  location: PersistedLocation,
  countryName: string,
): LocationValue {
  const country = { code: location.locationCountryCode, name: countryName };

  if (!location.locationCityName) return { country, city: null };

  // Con coordenadas => vino del directorio. Es la misma regla que el CHECK
  // `chk_*_city_coords` impone en Postgres, leída al revés.
  if (location.locationCityLat != null && location.locationCityLng != null) {
    return {
      country,
      city: {
        kind: 'directory',
        name: location.locationCityName,
        geonameId: location.locationCityGeonameId ?? 0,
        latitude: location.locationCityLat,
        longitude: location.locationCityLng,
        timezone: '',
      },
    };
  }

  return { country, city: { kind: 'manual', name: location.locationCityName } };
}

/**
 * Las cinco columnas de Postgres, SIEMPRE las cinco.
 *
 * Los `?? null` no son defensivos: son la limpieza. Una ciudad escrita a mano
 * tiene que poner las coordenadas a NULL explícitamente, o heredaría las de
 * la ciudad anterior y el mapa pintaría un punto que ya no corresponde a
 * nadie.
 */
export function locationColumns(location: PersistedLocation): Record<string, unknown> {
  return {
    location_country_code: location.locationCountryCode,
    location_city_name: location.locationCityName ?? null,
    location_city_lat: location.locationCityLat ?? null,
    location_city_lng: location.locationCityLng ?? null,
    location_city_geoname_id: location.locationCityGeonameId ?? null,
  };
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

// ============================================================
// El pin del mapa
// ============================================================

export type MapPinPrecision = 'city' | 'country';

export interface MapPin {
  latitude: number;
  longitude: number;
  /**
   * `city` = el punto es de la ciudad que el usuario eligió del directorio.
   * `country` = es el centroide del país, y NO señala dónde está nadie.
   *
   * Quien pinta el pin TIENE que mirar esto: un centroide dibujado con el
   * mismo zoom y el mismo símbolo que una ciudad se lee como una dirección
   * exacta. El centroide de Argelia cae en mitad del Sáhara mientras sus
   * aeropuertos están todos en la costa.
   */
  precision: MapPinPrecision;
}

/**
 * La regla del pin, en un solo sitio.
 *
 *   Ciudad del directorio            -> sus coordenadas        (precision 'city')
 *   Ciudad a mano, o sin ciudad      -> centroide del país      (precision 'country')
 *
 * NO re-deriva la distinción: la lee de si hay coordenadas guardadas, que es
 * exactamente lo que el CHECK de la 057 garantiza que sólo ocurre cuando la
 * ciudad vino del directorio.
 *
 * Devuelve `null` si el país no está en el catálogo cargado — que en la
 * práctica significa "el catálogo aún no ha llegado". Es un `null` honesto:
 * mejor no pintar pin que pintarlo en (0, 0).
 */
export function resolveMapPin(
  location: Pick<PersistedLocation, 'locationCountryCode' | 'locationCityLat' | 'locationCityLng'>,
  countriesByCode: Map<string, CountryCatalogEntry>,
): MapPin | null {
  if (location.locationCityLat != null && location.locationCityLng != null) {
    return { latitude: location.locationCityLat, longitude: location.locationCityLng, precision: 'city' };
  }

  const country = countriesByCode.get(location.locationCountryCode);
  if (!country) return null;

  return { latitude: country.latitude, longitude: country.longitude, precision: 'country' };
}

/** Índice por código, para no recorrer 249 países por técnico. */
export function indexCountriesByCode(countries: CountryCatalogEntry[]): Map<string, CountryCatalogEntry> {
  return new Map(countries.map((c) => [c.code, c]));
}
