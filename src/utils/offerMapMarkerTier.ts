import type { OfferMapItem, OfferMapMarkerTier } from '../types/offerMap';
import {
  offerMapMarkerIconGeometry,
  offerMapMarkerShape,
  type OfferMapMarkerGeometry,
  type OfferMapMarkerIconOptions,
} from './offerMapMarkerIcon';

/**
 * Debajo de este zoom la forma de 56px deja de caber en pantalla: media Europa
 * son ~500px a zoom 4, y tres formas ya se tocan. A partir de aquí, punto.
 */
export const OFFER_MAP_SHAPE_MIN_ZOOM = 6;

/** Aire entre marcadores: dos iconos que se rozan se leen como uno solo. */
const MARKER_GAP_PX = 6;

/** Lado de la celda del índice de colisiones, en píxeles de pantalla. */
const COLLISION_CELL_PX = 128;

const TILE_SIZE = 256;
const MAX_MERCATOR_LATITUDE = 85.05112878;
const MAX_ZOOM = 22;

export interface PixelPoint {
  x: number;
  y: number;
}

/**
 * Web Mercator a píxeles absolutos para un zoom dado (teselas de 256px), que
 * es el mismo sistema que usa Leaflet en `map.project`.
 *
 * Se hace aquí y no pidiéndoselo al mapa porque en nativo el mapa vive dentro
 * del WebView y la decisión de nivel se toma en React Native: es aritmética
 * pura, y así web y nativo colocan las etiquetas con el mismo código.
 */
export function projectToPixels(latitude: number, longitude: number, zoom: number): PixelPoint {
  const scale = TILE_SIZE * Math.pow(2, clampZoom(zoom));
  const clampedLatitude = Math.min(MAX_MERCATOR_LATITUDE, Math.max(-MAX_MERCATOR_LATITUDE, latitude));
  const sin = Math.sin((clampedLatitude * Math.PI) / 180);
  return {
    x: scale * (longitude / 360 + 0.5),
    y: scale * (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)),
  };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 0;
  return Math.min(MAX_ZOOM, Math.max(0, zoom));
}

/** Qué marcador se pinta cuando la burbuja no cabe (o no existe). */
export function offerMapBaseTier(zoom: number): Exclude<OfferMapMarkerTier, 'label'> {
  return clampZoom(zoom) >= OFFER_MAP_SHAPE_MIN_ZOOM ? 'shape' : 'dot';
}

export interface OfferMapMarkerTierInput {
  key: string;
  latitude: number;
  longitude: number;
  /** Geometría de la burbuja, o `null` si este grupo no puede pintarla nunca. */
  label: OfferMapMarkerGeometry | null;
  shape: OfferMapMarkerGeometry;
  dot: OfferMapMarkerGeometry;
  /** A mayor prioridad, se queda con la burbuja cuando dos se pelean el hueco. */
  priority: number;
}

interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function rectFor(center: PixelPoint, geometry: OfferMapMarkerGeometry): Rect {
  const [width, height] = geometry.iconSize;
  const [anchorX, anchorY] = geometry.iconAnchor;
  const minX = center.x - anchorX - MARKER_GAP_PX;
  const minY = center.y - anchorY - MARKER_GAP_PX;
  return {
    minX,
    minY,
    maxX: minX + width + MARKER_GAP_PX * 2,
    maxY: minY + height + MARKER_GAP_PX * 2,
  };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}

/**
 * Índice uniforme por celdas: sin él la colocación es O(n²) y con miles de
 * ofertas el mapa se congela en cada gesto de zoom.
 */
class CollisionGrid {
  private readonly rects: (Rect | null)[] = [];
  private readonly cells = new Map<string, number[]>();

  insert(rect: Rect): number {
    const id = this.rects.length;
    this.rects.push(rect);
    this.forEachCell(rect, (cellKey) => {
      const bucket = this.cells.get(cellKey);
      if (bucket) bucket.push(id);
      else this.cells.set(cellKey, [id]);
    });
    return id;
  }

  remove(id: number): void {
    this.rects[id] = null;
  }

  intersects(rect: Rect): boolean {
    let hit = false;
    this.forEachCell(rect, (cellKey) => {
      if (hit) return;
      const bucket = this.cells.get(cellKey);
      if (!bucket) return;
      for (const id of bucket) {
        const other = this.rects[id];
        if (other && overlaps(rect, other)) {
          hit = true;
          return;
        }
      }
    });
    return hit;
  }

  private forEachCell(rect: Rect, visit: (cellKey: string) => void): void {
    const minCellX = Math.floor(rect.minX / COLLISION_CELL_PX);
    const maxCellX = Math.floor(rect.maxX / COLLISION_CELL_PX);
    const minCellY = Math.floor(rect.minY / COLLISION_CELL_PX);
    const maxCellY = Math.floor(rect.maxY / COLLISION_CELL_PX);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellY = minCellY; cellY <= maxCellY; cellY += 1) {
        visit(`${cellX}:${cellY}`);
      }
    }
  }
}

/**
 * Decide el marcador de cada grupo para el zoom actual.
 *
 * La regla no es un umbral de zoom seco, porque con dos ofertas en Europa las
 * burbujas se leen perfectamente a zoom 4 y esconderlas sería una regresión.
 * Manda la colisión real en píxeles: el zoom sólo elige a qué se degrada.
 *
 * Ningún grupo se descarta. Un marcador que no cabe baja de nivel; nunca
 * desaparece, porque una oferta que no se pinta es una oferta que no existe
 * para el técnico.
 */
export function resolveOfferMapMarkerTiers(
  inputs: readonly OfferMapMarkerTierInput[],
  zoom: number,
): Map<string, OfferMapMarkerTier> {
  const baseTier = offerMapBaseTier(zoom);
  const tiers = new Map<string, OfferMapMarkerTier>();
  const grid = new CollisionGrid();

  const entries = inputs.map((input) => {
    const center = projectToPixels(input.latitude, input.longitude, zoom);
    const baseRect = rectFor(center, baseTier === 'shape' ? input.shape : input.dot);
    return {
      input,
      baseRect,
      labelRect: input.label ? rectFor(center, input.label) : null,
      gridId: grid.insert(baseRect),
    };
  });

  const ordered = [...entries].sort((a, b) => (
    b.input.priority - a.input.priority || a.input.key.localeCompare(b.input.key)
  ));

  for (const entry of ordered) {
    if (!entry.labelRect) {
      tiers.set(entry.input.key, baseTier);
      continue;
    }
    // Se retira su propio hueco antes de medir: el marcador se sustituye, no se suma.
    grid.remove(entry.gridId);
    if (grid.intersects(entry.labelRect)) {
      grid.insert(entry.baseRect);
      tiers.set(entry.input.key, baseTier);
    } else {
      grid.insert(entry.labelRect);
      tiers.set(entry.input.key, 'label');
    }
  }

  return tiers;
}

/**
 * Lo que un grupo de marcadores aporta a la decisión de nivel. Estructural a
 * propósito: `OfferMapMarkerGroup` encaja aquí sin que esta utilidad tenga que
 * importar nada de React Native, que es lo que la mantiene testeable en node.
 */
export interface OfferMapTierGroup {
  key: string;
  latitude: number;
  longitude: number;
  offers: readonly Pick<OfferMapItem, 'contractType' | 'salary' | 'score' | 'blockers'>[];
}

/** El color no entra en la geometría, así que la medida no necesita saberlo. */
const MEASURE_ONLY_COLOR = '#000000';

/**
 * Forma, recuento, salario y nivel de un grupo en un solo sitio, para que el
 * marcador que se mide y el que se pinta no puedan describir cosas distintas.
 */
export function offerMapGroupIconOptions(
  group: OfferMapTierGroup,
  tier: OfferMapMarkerTier,
  color: string,
): OfferMapMarkerIconOptions {
  const representative = group.offers[0];
  const grouped = group.offers.length > 1;
  return {
    shape: grouped ? 'cluster' : offerMapMarkerShape(representative.contractType),
    color,
    count: group.offers.length,
    salary: representative.salary,
    tier,
  };
}

export function offerMapGroupTierInput(group: OfferMapTierGroup): OfferMapMarkerTierInput {
  const representative = group.offers[0];
  const grouped = group.offers.length > 1;
  const measure = (tier: OfferMapMarkerTier) => offerMapMarkerIconGeometry(
    offerMapGroupIconOptions(group, tier, MEASURE_ONLY_COLOR),
  );
  return {
    key: group.key,
    latitude: group.latitude,
    longitude: group.longitude,
    // Un cluster ya dice un número, no un importe; y sin salario no hay burbuja.
    label: !grouped && representative.salary ? measure('label') : null,
    shape: measure('shape'),
    dot: measure('dot'),
    // La burbuja se la queda el mejor match, y una oferta que el técnico no
    // puede firmar cede el hueco antes que una para la que sí cualifica.
    priority: (representative.blockers.length ? 0 : 1_000_000) + representative.score,
  };
}
