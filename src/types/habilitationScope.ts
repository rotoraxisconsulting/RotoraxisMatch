// Fase 4 (docs/MISSION_PART66.md) — pure types for future EASA Part-66
// group-based habilitation scoping (Groups 1/2a/2b/2c/3). Scaffolding
// only: nothing in the app constructs, stores, or reads a
// HabilitationScope yet. Every technician_habilitations row today is (and
// stays, until a later phase decides otherwise) an exact rating — this
// type describes the BROADER claim a future offer requirement or
// declared qualification could make once group-level scoping exists, not
// what either side can express today. See canHold()
// (src/utils/habilitationScope.ts) for the function this scaffolds.

export type AircraftClass = 'Aeroplane' | 'Helicopter';
export type PropulsionType = 'turbine' | 'piston';

// Matches the 5 distinct values actually populated in
// aircraft_type_ratings.easa_group (verified live against
// rotoaxismatch-dev, 2026-07-26): '1' (278 rows), '2a' (28), '2b' (21),
// '2c' (8), '3' (271).
export type EasaGroup = '1' | '2a' | '2b' | '2c' | '3';

interface HabilitationScopeFields {
  // undefined = unknown/unpopulated on this dimension — same convention
  // AircraftTypeRatingCatalog.productType and getCompatibleProductType()
  // already use (src/utils/licenseCategoryProductType.ts): never guessed
  // into a class, treated by canHold() as "can't confirm" rather than
  // silently "matches everything".
  aircraftClass?: AircraftClass;
  propulsion?: PropulsionType;
}

export type HabilitationScope =
  | (HabilitationScopeFields & {
      kind: 'exact_rating';
      /** The specific aircraft_type_ratings row this scope claims. */
      aircraftTypeRatingId: string;
    })
  | (HabilitationScopeFields & {
      kind: 'manufacturer_subgroup';
      easaGroup: EasaGroup;
      /** e.g. "Airbus" — every rating from this manufacturer within the group. */
      manufacturer: string;
    })
  | (HabilitationScopeFields & {
      kind: 'full_subgroup';
      easaGroup: EasaGroup;
    })
  | (HabilitationScopeFields & {
      kind: 'full_group';
      easaGroup: EasaGroup;
    });
