import { LicenseCode, AircraftTypeRatingCatalog } from '../types/catalog';

// Fase 3b.4 — pure category -> compatible productType mapping, a preview of
// canHold()'s productType dimension (Fase 4, HabilitationScope). Used to
// PRE-FILTER the rating picker once a license category is known (offer
// form, technician profile) — help, not a cage: callers must always offer
// an escape hatch back to the unfiltered catalog, never hard-block a
// selection outside the hinted facet.
//
// A1/A2/B1.1/B1.2 -> Aeroplane; A3/A4/B1.3/B1.4 -> Helicopter, per the
// mission plan. B3 ("Piston-engine non-pressurised aeroplanes") was not
// listed in either bucket there — it's aeroplane-only by its own
// definition (src/constants/licenses.ts), same shape as A2/B1.2, so it's
// included here on that basis. Flagging this explicitly since it's filling
// a gap the plan didn't address, not just applying it.
//
// B2/B2L/C/L cover both aeroplanes and helicopters (see CLAUDE.md / mission
// doc "Conceptos del dominio") -> undefined, no pre-filter.
//
// TODO(open regulatory question, see mission brief): EASA AMC 66.A.45 may
// record some B2 endorsements without an engine designation — not
// special-cased here, matches the same TODO already in offerMatchExplain.ts
// (T1/T2 tiers) and would affect this mapping the same way if resolved.
export function getCompatibleProductType(
  licenseCode: LicenseCode,
): NonNullable<AircraftTypeRatingCatalog['productType']> | undefined {
  switch (licenseCode) {
    case 'A1':
    case 'A2':
    case 'B1.1':
    case 'B1.2':
    case 'B3':
      return 'Aeroplane';
    case 'A3':
    case 'A4':
    case 'B1.3':
    case 'B1.4':
      return 'Helicopter';
    default:
      return undefined;
  }
}
