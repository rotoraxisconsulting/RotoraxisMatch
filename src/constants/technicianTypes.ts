import { TechnicianTypeCatalog } from '../types/catalog';

export const TECHNICIAN_TYPES: TechnicianTypeCatalog[] = [
  { code: 'mechanic',           label: 'Mechanic',            requiresLicense: true,  isActive: true,  sortOrder: 1 },
  { code: 'avionic',            label: 'Avionics Technician', requiresLicense: true,  isActive: true,  sortOrder: 2 },
  { code: 'sheet_metal_worker', label: 'Sheet Metal Worker',  requiresLicense: false, isActive: true,  sortOrder: 3 },
  { code: 'painter',            label: 'Painter',             requiresLicense: false, isActive: true,  sortOrder: 4 },
  { code: 'composite',          label: 'Composite Technician',requiresLicense: false, isActive: true,  sortOrder: 5 },
  { code: 'pilot',              label: 'Pilot',               requiresLicense: true,  isActive: false, sortOrder: 6 },
];
