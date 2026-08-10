import { LicenseCode, AircraftTypeRatingCatalog } from '../types/catalog';
import { OfferProductType } from '../types/offer';

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

/**
 * Migración 047 — ¿puede esta categoría de licencia aparecer en una oferta de
 * este producto? La usa el formulario de oferta para decidir qué chips de
 * licencia ofrece, una vez la empresa ha declarado aviones o helicópteros.
 *
 * Misma dirección que `getCompatibleProductType`, invertida: una categoría con
 * producto propio (A1/A2/B1.1/B1.2/B3 → aviones, A3/A4/B1.3/B1.4 →
 * helicópteros) solo encaja en su producto; las que no lo tienen (B2, B2L, C,
 * L cubren ambos por definición) encajan siempre. NO se reconstruye la tabla
 * aquí — un segundo listado podría separarse del primero.
 *
 * ⚠ La lista que ofrece el formulario para helicópteros es, por tanto,
 * A3/A4/B1.3/B1.4 **más** B2/B2L/C/L, no solo B2: las cuatro cubren ambos
 * productos y excluirlas sería inventar una restricción que la norma no pone.
 *
 * Esto NO es el enforcement: quien impide de verdad mezclar productos es la
 * base de datos, con las FK compuestas orh_matches_offer / orh_matches_rating
 * (migración 047). Esto es la ayuda de UI que evita llegar hasta ese error.
 */
export function isLicenseCompatibleWithProductType(
  licenseCode: LicenseCode,
  productType: OfferProductType,
): boolean {
  const compatible = getCompatibleProductType(licenseCode);
  return compatible === undefined || compatible === productType;
}

// Fase 3b screen 2 — flags an ALREADY-DECLARED habilitation row whose rating
// doesn't match its license category's compatible productType, e.g. a
// helicopter rating declared under B1.1 (aeroplane-only). Same mapping as
// the picker pre-filter above, on purpose — one rule, two uses (block new
// mistakes at the picker, surface old ones on existing rows) — never a
// second, independently-maintained definition of "compatible" that could
// drift from the first.
//
// Never guesses: B2/B2L/C/L (getCompatibleProductType returns undefined)
// cover both product types by definition, and a rating whose productType
// hasn't been backfilled (undefined) is never flagged either — same
// "unpopulated means no facet, not a guessed one" rule getByProductType()
// already follows. This is advisory only — existing rows are never hidden,
// blocked from editing, or auto-removed because of it.
export function isUnusualCombination(
  licenseCode: LicenseCode,
  ratingProductType: AircraftTypeRatingCatalog['productType'] | undefined,
): boolean {
  const expected = getCompatibleProductType(licenseCode);
  if (!expected || !ratingProductType) return false;
  return ratingProductType !== expected;
}
