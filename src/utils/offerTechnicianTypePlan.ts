// Pure decision logic for the "Required technician types" chips on the offer
// form (new.tsx / edit.tsx). Same shape as licenseUpdatePlan.ts: the screen
// asks what a tap SHOULD do, gets back the next selection plus an optional
// human-readable reason it was refused, and does the rendering.
//
// The rule it encodes (product decision, option A): an offer targets EITHER
// licensed profiles (mechanic / avionics / pilot — the ones that hold EASA
// Part-66 licences and aircraft type ratings) OR non-licensed trades (sheet
// metal, paint, composite). Never both, because the Part-66 requirement
// sections either apply to every targeted profile or to none of them.
//
// Refusing a tap is deliberate, over the two alternatives:
//   - silently clearing the Part-66 requirements would destroy what the
//     company typed to make room for a chip tap;
//   - allowing the mix and failing later at save time would surface the
//     problem after the work, not at the moment it was caused.
// offerRepository re-checks the same rule on write — this is the explanation,
// not the enforcement (see assertRequirementsMatchTechnicianTypes).
import { TechnicianTypeCode } from '../types/catalog';
import { TECHNICIAN_TYPES, isLicensedTechnicianType } from '../constants/technicianTypes';

export interface OfferTechnicianTypeTogglePlan {
  /** The selection to apply. Unchanged from `current` when `error` is set. */
  next: TechnicianTypeCode[];
  /** Set only when the tap was refused — ready to show to the user as-is. */
  error?: string;
}

function label(code: string): string {
  return TECHNICIAN_TYPES.find((t) => t.code === code)?.label ?? code;
}

export function planOfferTechnicianTypeToggle(input: {
  current: readonly TechnicianTypeCode[];
  code: TechnicianTypeCode;
  /**
   * How many Part-66 requirements the form currently holds — exact
   * habilitations + broad licences + broad aircraft families, summed. Only
   * consulted when the tap would make the offer non-licensed.
   */
  part66RequirementCount: number;
}): OfferTechnicianTypeTogglePlan {
  const { current, code, part66RequirementCount } = input;
  const currentTypes = [...current];

  // Deselecting is always allowed: it can only ever widen the offer, and a
  // selection you cannot undo is a trap.
  if (currentTypes.includes(code)) {
    return { next: currentTypes.filter((c) => c !== code) };
  }

  const adding = isLicensedTechnicianType(code);
  const conflicting = currentTypes.find((c) => isLicensedTechnicianType(c) !== adding);
  if (conflicting) {
    return {
      next: currentTypes,
      error:
        `An offer is either for licensed technicians or for non-licensed trades, not both. ` +
        `${label(code)} cannot be combined with ${label(conflicting)} — deselect it first.`,
    };
  }

  // Turning the offer non-licensed while Part-66 requirements are still on
  // the form: the sections that hold them are about to disappear, so refuse
  // instead of stranding requirements the screen can no longer show and the
  // repository will refuse to save.
  if (!adding && part66RequirementCount > 0) {
    return {
      next: currentTypes,
      error:
        `${label(code)} profiles do not hold EASA Part-66 licences or aircraft type ratings. ` +
        `Clear the ${part66RequirementCount} licence / aircraft / type rating requirement${
          part66RequirementCount === 1 ? '' : 's'
        } on this offer first.`,
    };
  }

  return { next: [...currentTypes, code] };
}
