export const LICENSE_CATEGORIES = [
  { code: 'A', label: 'A — Line Maintenance Certifying Staff' },
  { code: 'B1.1', label: 'B1.1 — Turbine-powered Aeroplanes' },
  { code: 'B1.2', label: 'B1.2 — Piston-powered Aeroplanes' },
  { code: 'B1.3', label: 'B1.3 — Turbine-powered Helicopters' },
  { code: 'B1.4', label: 'B1.4 — Piston-powered Helicopters' },
  { code: 'B2', label: 'B2 — Avionics' },
  { code: 'C', label: 'C — Base Maintenance' },
  { code: 'D1', label: 'D1 — Non-Destructive Testing' },
] as const;

export type LicenseCode = (typeof LICENSE_CATEGORIES)[number]['code'];

export const LICENSE_CODES = LICENSE_CATEGORIES.map((l) => l.code);
