import { TechnicianTypeCatalog } from '../types/catalog';

export const TECHNICIAN_TYPES: TechnicianTypeCatalog[] = [
  { code: 'mechanic',           label: 'Mechanic',            requiresLicense: true,  isActive: true,  sortOrder: 1 },
  { code: 'avionic',            label: 'Avionics Technician', requiresLicense: true,  isActive: true,  sortOrder: 2 },
  { code: 'sheet_metal_worker', label: 'Sheet Metal Worker',  requiresLicense: false, isActive: true,  sortOrder: 3 },
  { code: 'painter',            label: 'Aircraft Painter',    requiresLicense: false, isActive: true,  sortOrder: 4 },
  { code: 'composite',          label: 'Composite Technician',requiresLicense: false, isActive: true,  sortOrder: 5 },
  { code: 'pilot',              label: 'Pilot',               requiresLicense: true,  isActive: false, sortOrder: 6 },
];

// Display label for a technician type code. The catalog above is the only
// place a label is written; screens read it through here.
//
// Unknown code -> the code itself, which is what every caller already did on
// a miss. A raw code on screen is ugly but honest; inventing a label for a
// row that is not in the catalog would be worse.
export function technicianTypeLabel(code: string): string {
  return TECHNICIAN_TYPES.find((t) => t.code === code)?.label ?? code;
}

// ── Licensed vs non-licensed profiles ───────────────────────────────────
// EASA Part-66 licences and aircraft type ratings only exist for the
// technician types that CERTIFY work (mechanic, avionics, pilot). A sheet
// metal worker, painter or composite technician holds no licence and no type
// rating — the whole Part-66 axis is empty for them, and applying it anyway
// produced offers and profiles with a qualification section that could never
// be filled in.
//
// `requiresLicense` in the catalog above is the single source of truth for
// that split. It had been declared with the right values since the catalog
// was written but was never read anywhere; these two helpers are its only
// consumers, so changing a row above changes the behaviour everywhere.

// Unknown code -> treated as licensed. That is the pre-existing behaviour
// (every Part-66 section visible), and this function must never be the thing
// that hides a qualification section because a catalog row is missing: the
// costly direction of being wrong is silently dropping a real licence, not
// showing an extra section.
export function isLicensedTechnicianType(code: string): boolean {
  return TECHNICIAN_TYPES.find((t) => t.code === code)?.requiresLicense ?? true;
}

// Does this offer target profiles that hold licences, and therefore have a
// Part-66 axis to require anything on?
//
// Empty list = the offer does not restrict the technician type at all, so it
// does not restrict this either: current behaviour, everything stays
// available. Matches how the matching engine reads the same field (an empty
// requiredTechnicianTypes is "no restriction", see offerMatchExplain.ts).
//
// The decision recorded for this feature is that an offer is EITHER for
// licensed profiles OR for non-licensed ones, never both — the offer form
// enforces that and offerRepository re-checks it server-side. `.some()`
// rather than `.every()` is the safe reading for any row that predates the
// rule (or was written by an older client): if even one licensed type is
// targeted, the Part-66 sections stay visible and existing requirements stay
// editable, instead of being hidden behind a screen that cannot show them.
export function offerTargetsLicensedProfiles(offer: { requiredTechnicianTypes: readonly string[] }): boolean {
  if (offer.requiredTechnicianTypes.length === 0) return true;
  return offer.requiredTechnicianTypes.some(isLicensedTechnicianType);
}
