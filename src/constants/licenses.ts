// V2 — Full EASA Part-66 license list
export const LICENSE_CATEGORIES = [
  { code: 'A1',   label: 'A1 — Line Maintenance: Turbine-powered Aeroplanes', categoryGroup: 'A', sortOrder: 1 },
  { code: 'A2',   label: 'A2 — Line Maintenance: Piston-powered Aeroplanes',  categoryGroup: 'A', sortOrder: 2 },
  { code: 'A3',   label: 'A3 — Line Maintenance: Turbine-powered Helicopters', categoryGroup: 'A', sortOrder: 3 },
  { code: 'A4',   label: 'A4 — Line Maintenance: Piston-powered Helicopters',  categoryGroup: 'A', sortOrder: 4 },
  { code: 'B1.1', label: 'B1.1 — Mechanical: Turbine-powered Aeroplanes',     categoryGroup: 'B1', sortOrder: 5 },
  { code: 'B1.2', label: 'B1.2 — Mechanical: Piston-powered Aeroplanes',      categoryGroup: 'B1', sortOrder: 6 },
  { code: 'B1.3', label: 'B1.3 — Mechanical: Turbine-powered Helicopters',    categoryGroup: 'B1', sortOrder: 7 },
  { code: 'B1.4', label: 'B1.4 — Mechanical: Piston-powered Helicopters',     categoryGroup: 'B1', sortOrder: 8 },
  { code: 'B2',   label: 'B2 — Avionics',                                     categoryGroup: 'B2', sortOrder: 9 },
  { code: 'B2L',  label: 'B2L — Limited Avionics',                            categoryGroup: 'B2', sortOrder: 10 },
  { code: 'B3',   label: 'B3 — Piston-engine non-pressurised aeroplanes',     categoryGroup: 'B3', sortOrder: 11 },
  { code: 'L',    label: 'L — Light Aircraft',                                categoryGroup: 'L',  sortOrder: 12 },
  { code: 'C',    label: 'C — Base Maintenance (Aircraft)',                    categoryGroup: 'C',  sortOrder: 13 },
] as const;

export type LicenseCode = (typeof LICENSE_CATEGORIES)[number]['code'];

export const LICENSE_CODES = LICENSE_CATEGORIES.map((l) => l.code);
