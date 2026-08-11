// Tipos de localización del modelo nuevo (Fase 7 — F2a).
//
// ⚠ NADA DE ESTO ESTÁ CONECTADO TODAVÍA. Ningún tipo de dominio (Offer,
// TechnicianProfile, Company) los importa aún: eso es F2b. Este fichero
// define la FORMA de una localización para que el componente y el envoltorio
// de la API hablen el mismo idioma, sin tocar el modelo de datos actual.
//
// El modelo: PAÍS obligatorio del catálogo `location_countries` (migraciones
// 055/056), CIUDAD opcional. La ciudad puede venir de la API de countries.dev
// (y entonces trae coordenadas) o escribirse a mano (y entonces no).

/** Fila de `public.location_countries`. La clave es el ISO-3166-1 alpha-2. */
export interface CountryCatalogEntry {
  /** ISO-3166-1 alpha-2 en mayúsculas. Es la PK: lo único estable. */
  code: string;
  /** Nombre para mostrar. Es COPY, puede cambiar sin avisar — nunca emparejes por aquí. */
  name: string;
  /** Centroide del país. Sirve para encuadrar un mapa, no para medir distancias. */
  latitude: number;
  longitude: number;
}

/** Una ciudad tal y como la devuelve el directorio (GeoNames vía countries.dev). */
export interface DirectoryCity {
  /** Identificador GeoNames. Estable, y la key natural de la lista. */
  geonameId: number;
  /** Nombre local, con acentos: 'Málaga'. */
  name: string;
  /** Nombre sin acentos: 'Malaga'. Se muestra sólo si difiere del anterior. */
  asciiName: string;
  countryCode: string;
  latitude: number;
  longitude: number;
  population: number;
  timezone: string;
}

/**
 * La ciudad elegida, en las DOS variantes que el producto distingue.
 *
 * ⚠ La distinción es estructural a propósito, no un campo `source` sobre una
 * forma común: en la variante 'manual' las coordenadas NO EXISTEN, así que es
 * imposible leerlas por descuido. En F2c esto decide dónde cae el pin del
 * mapa — con `directory` se pinta la ciudad, con `manual` no hay punto que
 * pintar y hay que caer al país. Si esto fuera un booleano opcional junto a
 * dos números opcionales, alguien acabaría pintando un pin en (0, 0).
 */
export type CitySelection =
  | {
      kind: 'directory';
      name: string;
      geonameId: number;
      latitude: number;
      longitude: number;
      timezone: string;
    }
  | {
      kind: 'manual';
      /** Lo que el usuario tecleó, recortado. Sin coordenadas: no las sabemos. */
      name: string;
    };

/** El valor completo del selector: país obligatorio, ciudad opcional. */
export interface LocationValue {
  /** `null` hasta que el usuario elige país. País es obligatorio en el modelo nuevo. */
  country: { code: string; name: string } | null;
  /** `null` si no se ha rellenado. La ciudad es OPCIONAL, no un campo a medias. */
  city: CitySelection | null;
}

/**
 * El valor inicial de un formulario. Congelado a propósito: es una constante
 * de módulo compartida por todas las pantallas que lo usen como estado
 * inicial, y una mutación accidental sobre ella contaminaría a las demás.
 */
export const EMPTY_LOCATION: LocationValue = Object.freeze({ country: null, city: null });

/**
 * Devuelve las coordenadas de la ciudad, o `null` si no las hay.
 *
 * Existe para que nadie tenga que hacer el `kind === 'directory'` a mano y se
 * lo salte. Devolver `null` es la respuesta correcta y esperada para una
 * ciudad escrita a mano, no un caso de error.
 */
export function getCityCoordinates(city: CitySelection | null): { latitude: number; longitude: number } | null {
  if (city?.kind !== 'directory') return null;
  return { latitude: city.latitude, longitude: city.longitude };
}
