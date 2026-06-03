export type AircraftCategory = 'airplane' | 'helicopter';

// V2 — Catalog objects with code + label + category (matches SQL seed)
export const AIRCRAFT_TYPE_CATALOG = [
  // Fixed-wing — Boeing
  { code: 'B737',   label: 'Boeing 737',         manufacturer: 'Boeing',             aircraftFamily: '737',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'B747',   label: 'Boeing 747',         manufacturer: 'Boeing',             aircraftFamily: '747',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'B757',   label: 'Boeing 757',         manufacturer: 'Boeing',             aircraftFamily: '757',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'B767',   label: 'Boeing 767',         manufacturer: 'Boeing',             aircraftFamily: '767',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'B777',   label: 'Boeing 777',         manufacturer: 'Boeing',             aircraftFamily: '777',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'B787',   label: 'Boeing 787',         manufacturer: 'Boeing',             aircraftFamily: '787',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  // Fixed-wing — Airbus
  { code: 'A220',   label: 'Airbus A220',        manufacturer: 'Airbus',             aircraftFamily: 'A220',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A318',   label: 'Airbus A318',        manufacturer: 'Airbus',             aircraftFamily: 'A320',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A319',   label: 'Airbus A319',        manufacturer: 'Airbus',             aircraftFamily: 'A320',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A320',   label: 'Airbus A320',        manufacturer: 'Airbus',             aircraftFamily: 'A320',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A321',   label: 'Airbus A321',        manufacturer: 'Airbus',             aircraftFamily: 'A320',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A330',   label: 'Airbus A330',        manufacturer: 'Airbus',             aircraftFamily: 'A330',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A340',   label: 'Airbus A340',        manufacturer: 'Airbus',             aircraftFamily: 'A340',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A350',   label: 'Airbus A350',        manufacturer: 'Airbus',             aircraftFamily: 'A350',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'A380',   label: 'Airbus A380',        manufacturer: 'Airbus',             aircraftFamily: 'A380',   aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  // Fixed-wing — Regional
  { code: 'CRJ200', label: 'Bombardier CRJ-200', manufacturer: 'Bombardier',         aircraftFamily: 'CRJ',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'CRJ700', label: 'Bombardier CRJ-700', manufacturer: 'Bombardier',         aircraftFamily: 'CRJ',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'CRJ900', label: 'Bombardier CRJ-900', manufacturer: 'Bombardier',         aircraftFamily: 'CRJ',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'Q400',   label: 'Bombardier Q400',    manufacturer: 'Bombardier',         aircraftFamily: 'Q',      aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'E175',   label: 'Embraer E175',       manufacturer: 'Embraer',            aircraftFamily: 'E-Jet',  aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'E190',   label: 'Embraer E190',       manufacturer: 'Embraer',            aircraftFamily: 'E-Jet',  aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'E195',   label: 'Embraer E195',       manufacturer: 'Embraer',            aircraftFamily: 'E-Jet',  aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'ATR42',  label: 'ATR 42',             manufacturer: 'ATR',                aircraftFamily: 'ATR',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  { code: 'ATR72',  label: 'ATR 72',             manufacturer: 'ATR',                aircraftFamily: 'ATR',    aircraftCategory: 'airplane'   as AircraftCategory, isActive: true },
  // Rotary-wing
  { code: 'B407',   label: 'Bell 407',           manufacturer: 'Bell',               aircraftFamily: 'Bell 400', aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'B412',   label: 'Bell 412',           manufacturer: 'Bell',               aircraftFamily: 'Bell 400', aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'S76',    label: 'Sikorsky S-76',      manufacturer: 'Sikorsky',           aircraftFamily: 'S-76',   aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'S92',    label: 'Sikorsky S-92',      manufacturer: 'Sikorsky',           aircraftFamily: 'S-92',   aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'H125',   label: 'Airbus H125',        manufacturer: 'Airbus Helicopters', aircraftFamily: 'H125',   aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'H135',   label: 'Airbus H135',        manufacturer: 'Airbus Helicopters', aircraftFamily: 'H135',   aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'H145',   label: 'Airbus H145',        manufacturer: 'Airbus Helicopters', aircraftFamily: 'H145',   aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'AW139',  label: 'Leonardo AW139',     manufacturer: 'Leonardo',           aircraftFamily: 'AW139',  aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
  { code: 'R44',    label: 'Robinson R44',       manufacturer: 'Robinson',           aircraftFamily: 'R44',    aircraftCategory: 'helicopter' as AircraftCategory, isActive: true },
] as const;

export type AircraftTypeCode = (typeof AIRCRAFT_TYPE_CATALOG)[number]['code'];

export const AIRCRAFT_TYPE_CODES = AIRCRAFT_TYPE_CATALOG.map((a) => a.code);

// Category-filtered views of the catalog
export const AIRPLANES = AIRCRAFT_TYPE_CATALOG.filter((a) => a.aircraftCategory === 'airplane');
export const HELICOPTERS = AIRCRAFT_TYPE_CATALOG.filter((a) => a.aircraftCategory === 'helicopter');

// Helpers

export function getAircraftCategory(code: string): AircraftCategory | null {
  const entry = AIRCRAFT_TYPE_CATALOG.find((a) => a.code === code);
  return entry ? (entry.aircraftCategory as AircraftCategory) : null;
}

export function isHelicopterType(code: string): boolean {
  return getAircraftCategory(code) === 'helicopter';
}

export function isAirplaneType(code: string): boolean {
  return getAircraftCategory(code) === 'airplane';
}

export function getAircraftCategoriesForCodes(codes: string[]): Set<AircraftCategory> {
  const result = new Set<AircraftCategory>();
  for (const code of codes) {
    const cat = getAircraftCategory(code);
    if (cat) result.add(cat);
  }
  return result;
}

/** Returns 'airplane', 'helicopter', 'mixed', or null if codes is empty / all unknown. */
export function inferAircraftCategory(codes: string[]): AircraftCategory | 'mixed' | null {
  if (!codes.length) return null;
  const cats = getAircraftCategoriesForCodes(codes);
  if (cats.size === 0) return null;
  if (cats.size > 1) return 'mixed';
  return cats.has('helicopter') ? 'helicopter' : 'airplane';
}

// V1 compat — string array of labels for legacy components
// @deprecated use AIRCRAFT_TYPE_CATALOG instead
export const AIRCRAFT_TYPES = AIRCRAFT_TYPE_CATALOG.map((a) => a.label);

/** @deprecated use AircraftTypeCode instead */
export type AircraftType = (typeof AIRCRAFT_TYPES)[number];
