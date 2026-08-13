export type TechnicianMapLocationPrecision = 'city' | 'country';

export type TechnicianMapGroupPrecision = TechnicianMapLocationPrecision | 'mixed';

export interface TechnicianMapPoint {
  id: string;
  latitude?: number;
  longitude?: number;
  locationPrecision?: TechnicianMapLocationPrecision;
}

export interface TechnicianMapMarkerGroup<T extends TechnicianMapPoint> {
  key: string;
  latitude: number;
  longitude: number;
  locationPrecision: TechnicianMapGroupPrecision;
  technicians: T[];
}

// Directory cities and country fallbacks intentionally reuse one coordinate
// per place. Five decimals also absorbs harmless provider rounding differences
// (roughly one metre) without merging genuinely different city locations.
const GROUP_COORDINATE_DECIMALS = 5;

function normalizedPrecision(point: TechnicianMapPoint): TechnicianMapLocationPrecision {
  // Compatibility records created before F2c can lack this field. Their stored
  // coordinates historically represented a city, so preserve that meaning.
  return point.locationPrecision === 'country' ? 'country' : 'city';
}

function groupPrecision(
  current: TechnicianMapGroupPrecision,
  next: TechnicianMapLocationPrecision,
): TechnicianMapGroupPrecision {
  return current === next ? current : 'mixed';
}

export function groupTechnicianMapMarkers<T extends TechnicianMapPoint>(
  technicians: T[],
): TechnicianMapMarkerGroup<T>[] {
  const groups = new Map<string, TechnicianMapMarkerGroup<T>>();

  technicians.forEach((technician) => {
    const latitude = Number(technician.latitude);
    const longitude = Number(technician.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return;

    // Precision is deliberately not part of the key: a country fallback and a
    // city at the same point must never cover one another. Such a group is
    // labelled "mixed" so the UI does not overstate its accuracy.
    const key = `${latitude.toFixed(GROUP_COORDINATE_DECIMALS)}:${longitude.toFixed(GROUP_COORDINATE_DECIMALS)}`;
    const precision = normalizedPrecision(technician);
    const existing = groups.get(key);

    if (existing) {
      existing.technicians.push(technician);
      existing.locationPrecision = groupPrecision(existing.locationPrecision, precision);
      return;
    }

    groups.set(key, {
      key,
      latitude,
      longitude,
      locationPrecision: precision,
      technicians: [technician],
    });
  });

  return [...groups.values()];
}
