/**
 * @deprecated V1 catalog export with no current internal importer. It remains
 * re-exported from constants/index.ts for source compatibility with V1 callers
 * while Technician.specialties is still part of the compatibility UI shape.
 * New code should model technician type with TechnicianTypeCode from catalog.ts.
 * Remove this export only after the V1 constants surface and
 * Technician.specialties have been retired and downstream imports audited.
 */
export const SPECIALTIES = [
  'Airframe',
  'Powerplant',
  'Avionics',
  'Landing Gear',
  'Hydraulics',
  'Pneumatics',
  'NDT',
  'Composites',
  'Interiors',
  'Electrical Systems',
  'Fuel Systems',
  'De-icing Systems',
  'APU',
  'Flight Controls',
  'Cabin Systems',
] as const;

export type Specialty = (typeof SPECIALTIES)[number];
