// @deprecated V2 removes specialties — technician type is now modeled via TechnicianTypeCode in catalog.ts
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
