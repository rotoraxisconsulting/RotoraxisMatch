// Standalone tests — no Supabase/DB connection required. Exercises the pure
// functions in src/utils/offerMatchExplain.ts, src/constants/aircraftTypeRatings.ts,
// src/repositories/v2/aircraftTypeRatingsCache.ts and
// src/utils/aircraftRatingBackfillPlan.ts against small in-memory fixtures.
//
// Deliberately does NOT import or duplicate the real 80-row aircraft_type_ratings
// catalog — that catalog lives exclusively in Supabase now (see
// docs/archive/AIRCRAFT_TYPE_RATINGS_SUPABASE_SOURCE_REPORT.md) and is validated
// against the live database by `npm run validate:aircraft-ratings`
// (scripts/validateAircraftTypeRatingsCatalog.ts), not here. Every function
// under test here takes its catalog/index as an argument, so a handful of
// fabricated fixtures is enough to exercise every code path.
//
// Run via: npm run test:matching  (compiles with tsc to a scratch dir, then
// runs the plain JS output with node — see package.json).
import assert from 'node:assert/strict';
import { calculateOfferTechnicianMatch, getMatchLabel } from '../src/utils/offerMatchExplain';
import { OfferWithRequirements, OfferRequiredHabilitation } from '../src/types/offer';
import { TechnicianWithRelations, TechnicianHabilitation, TechnicianLicense } from '../src/types/technician';
import { AircraftTypeRatingCatalog } from '../src/types/catalog';
import {
  buildAircraftRatingIndex,
  getAircraftTypeRatingLabel,
  sortAircraftTypeRatings,
  filterAircraftTypeRatings,
  mapAircraftTypeRatingRow,
  AircraftTypeRatingRow,
} from '../src/constants/aircraftTypeRatings';
import { createAircraftTypeRatingsCache } from '../src/repositories/v2/aircraftTypeRatingsCache';
import {
  planLegacyAircraftRatingBackfill,
  summarizeBackfillPlan,
  LegacyHabilitationRow,
  ExistingNormalizedHabilitation,
} from '../src/utils/aircraftRatingBackfillPlan';
import { planLicenseRemoval } from '../src/utils/licenseUpdatePlan';
import { getFamilies, getByProductType, searchRatings } from '../src/constants/aircraftTypeRatingViews';
import { getAircraftFamilyKey, resolveLegacyCodeToFamilyKeys } from '../src/constants/aircraftTypeRatings';
import { getCompatibleProductType, isUnusualCombination } from '../src/utils/licenseCategoryProductType';
import { isValidDateOrder } from '../src/utils/validityDates';
import {
  isActiveOfferRelationStatus,
  assertOfferRelationTransition,
  shouldUnlockAcceptedRelation,
  getStatusActivityType,
  evaluateDirectOfferConflict,
  evaluateApplicationConflict,
} from '../src/utils/offerRelationStateMachine';
import { canHold, getCompatiblePropulsion } from '../src/utils/habilitationScope';
import { HabilitationScope } from '../src/types/habilitationScope';

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`PASS — ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`FAIL — ${name}`);
    console.error(err instanceof Error ? err.message : err);
  }
}

// ── Offer/technician fixture builders ─────────────────────────────────────

function makeOffer(overrides: Partial<OfferWithRequirements> = {}): OfferWithRequirements {
  return {
    id: 'offer-test',
    companyId: 'company-test',
    title: 'Test offer',
    description: 'Test',
    contractType: 'permanent',
    locationCityId: 'airport:XXXX',
    locationCountry: 'Nowhere',
    locationCity: 'Nowhere City',
    locationBaseAirport: 'XXXX',
    minYearsExperience: 0,
    status: 'published',
    visible: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    requiredTechnicianTypes: [],
    requiredLicenses: [],
    requiredAircraftTypes: [],
    requiredHabilitations: [],
    ...overrides,
  };
}

function makeHabReq(
  licenseCode: string,
  aircraftTypeRatingId: string,
  requirementLevel: 'mandatory' | 'preferred',
): OfferRequiredHabilitation {
  return {
    offerId: 'offer-test',
    licenseCode: licenseCode as any,
    aircraftTypeRatingId,
    requirementLevel,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

function makeHab(licenseCode: string, extra: Partial<TechnicianHabilitation> = {}): TechnicianHabilitation {
  return {
    id: `hab-${Math.random()}`,
    technicianId: 'tech-test',
    licenseCode: licenseCode as any,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  };
}

function makeLicense(licenseCode: string): TechnicianLicense {
  return { id: `lic-${Math.random()}`, technicianId: 'tech-test', licenseCode: licenseCode as any, createdAt: '2026-01-01T00:00:00.000Z' };
}

function makeTechnician(overrides: Partial<TechnicianWithRelations> = {}): TechnicianWithRelations {
  return {
    id: 'tech-test',
    userId: 'user-test',
    anonymousCode: 'AVT-0000',
    firstName: 'Test',
    lastName: 'Technician',
    email: 'test@example.com',
    birthDate: '1990-01-01',
    technicianType: 'mechanic',
    locationCityId: 'airport:YYYY',
    availability: { immediately: true, contractTypes: ['permanent'] },
    verificationStatus: 'pending',
    profileCompleteness: 50,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    licenses: [],
    habilitations: [],
    aircraftExperience: [],
    ...overrides,
  };
}

// ── Aircraft rating fixture builder + small fixture catalog ──────────────
// Deliberately 7 rows, never the real 80 — every field the domain type
// requires gets a sane default so each fixture below only needs to override
// what the test actually cares about.

function makeRating(
  overrides: Partial<AircraftTypeRatingCatalog> & Pick<AircraftTypeRatingCatalog, 'id'>,
): AircraftTypeRatingCatalog {
  return {
    manufacturer: 'TestMfr',
    aircraftFamily: 'TestFamily',
    easaEndorsement: `EASA-${overrides.id}`,
    displayName: `Test rating ${overrides.id}`,
    commercialAliases: [],
    aircraftCategory: 'general_aviation',
    priority: 50,
    isActive: true,
    ...overrides,
  };
}

const FIXTURES: AircraftTypeRatingCatalog[] = [
  makeRating({
    id: 'fx-a320-cfm56',
    manufacturer: 'Airbus',
    aircraftFamily: 'A318/A319/A320/A321',
    engineManufacturer: 'CFM International',
    engineFamily: 'CFM56',
    easaEndorsement: 'A320 CFM56-5',
    displayName: 'Airbus A320 family — CFM56',
    commercialAliases: ['A318', 'A319', 'A320', 'A321', 'CFM56'],
    aircraftCategory: 'commercial_airplane',
    productType: 'Aeroplane',
    priority: 100,
  }),
  makeRating({
    id: 'fx-a320-v2500',
    manufacturer: 'Airbus',
    aircraftFamily: 'A318/A319/A320/A321',
    engineManufacturer: 'IAE',
    engineFamily: 'V2500',
    easaEndorsement: 'A320 V2500',
    displayName: 'Airbus A320 family — V2500',
    commercialAliases: ['A320', 'V2500'],
    aircraftCategory: 'commercial_airplane',
    productType: 'Aeroplane',
    priority: 90,
  }),
  makeRating({
    id: 'fx-a320neo-leap1a',
    manufacturer: 'Airbus',
    aircraftFamily: 'A319neo/A320neo/A321neo',
    engineManufacturer: 'CFM International',
    engineFamily: 'LEAP-1A',
    easaEndorsement: 'A320 LEAP-1A',
    displayName: 'Airbus A320neo family — LEAP-1A',
    commercialAliases: ['A319neo', 'A320neo', 'A321neo', 'LEAP-1A', 'LEAP'],
    aircraftCategory: 'commercial_airplane',
    productType: 'Aeroplane',
    priority: 95,
  }),
  makeRating({
    id: 'fx-b777-ge90',
    manufacturer: 'Boeing',
    aircraftFamily: '777',
    engineManufacturer: 'GE Aviation',
    engineFamily: 'GE90',
    easaEndorsement: 'B777 GE90',
    displayName: 'Boeing 777 — GE90',
    commercialAliases: ['777', 'B777', 'GE90'],
    aircraftCategory: 'commercial_airplane',
    productType: 'Aeroplane',
    priority: 80,
  }),
  makeRating({
    id: 'fx-b787-genx',
    manufacturer: 'Boeing',
    aircraftFamily: '787',
    engineManufacturer: 'GE Aviation',
    engineFamily: 'GEnx',
    easaEndorsement: 'B787 GEnx',
    displayName: 'Boeing 787 — GEnx',
    commercialAliases: ['787', 'B787', 'GEnx', 'Dreamliner'],
    aircraftCategory: 'commercial_airplane',
    productType: 'Aeroplane',
    priority: 85,
  }),
  makeRating({
    id: 'fx-aw139-pt6',
    manufacturer: 'Leonardo',
    aircraftFamily: 'AW139',
    engineManufacturer: 'Pratt & Whitney Canada',
    engineFamily: 'PT6',
    easaEndorsement: 'AW139 PT6C',
    displayName: 'Leonardo AW139 — PT6',
    commercialAliases: ['AW139', 'PT6'],
    aircraftCategory: 'helicopter',
    productType: 'Helicopter',
    priority: 70,
  }),
  makeRating({
    id: 'fx-bell412-pt6-inactive',
    manufacturer: 'Bell',
    aircraftFamily: '412',
    engineManufacturer: 'Pratt & Whitney Canada',
    engineFamily: 'PT6',
    easaEndorsement: 'Bell 412 PT6 (test)',
    displayName: 'Bell 412 — PT6 (test, inactive)',
    commercialAliases: ['Bell412', '412'],
    aircraftCategory: 'helicopter',
    productType: 'Helicopter',
    priority: 10,
    isActive: false,
  }),
];

const RATING_INDEX = buildAircraftRatingIndex(FIXTURES);
const NOT_A_REAL_RATING = 'fx-pending-catalog-request'; // never in FIXTURES — models a rating still awaiting admin resolution

async function main() {
  // ── Matching ─────────────────────────────────────────────────────────

  await test('Matching — Case 1: exact category+rating match', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'exact', `expected level 'exact', got '${result.level}'`);
    assert.equal(result.mandatoryMissing.length, 0);
  });

  await test('Matching — Case 2: no false combination across categories', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.3', 'fx-aw139-pt6', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B2'), makeLicense('B1.3')],
      // AW139 habilitation exists ONLY under B2, never under B1.3.
      habilitations: [makeHab('B2', { aircraftTypeRatingId: 'fx-aw139-pt6' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.notEqual(result.level, 'exact', 'must not report exact — B1.3+AW139 was never held together');
    assert.ok(
      result.mandatoryMissing.some((m) => m.includes('B1.3')),
      'mandatoryMissing should flag the unmet B1.3 + AW139 requirement',
    );
  });

  await test('Matching — Case 3: same family, different engine => related + clarification', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'related');
    assert.ok(result.clarifications.length > 0, 'expected at least one clarification about the engine mismatch');
  });

  await test('Matching — Case 4: technician can hold several distinct ratings under one license at once', () => {
    const habilitations = [
      makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' }),
      makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' }),
      makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320neo-leap1a' }),
    ];
    const uniqueKeys = new Set(habilitations.map((h) => `${h.technicianId}|${h.licenseCode}|${h.aircraftTypeRatingId}`));
    assert.equal(uniqueKeys.size, 3, 'all three (technicianId, licenseCode, aircraftTypeRatingId) keys must be distinct');

    // Each one independently resolves to an exact match for its own requirement.
    const technician = makeTechnician({ licenses: [makeLicense('B1.1')], habilitations });
    for (const ratingId of ['fx-a320-cfm56', 'fx-a320-v2500', 'fx-a320neo-leap1a']) {
      const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', ratingId, 'mandatory')] });
      const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
      assert.equal(result.level, 'exact', `expected exact match for ${ratingId}`);
    }
  });

  // requiredAircraftTypes holds family keys since migration 022 (2026-07-22)
  // — "<manufacturer>::<aircraftFamily>" from aircraft_type_ratings, never a
  // bare legacy code. 'A320' resolves (inclusively) to this one family in
  // the fixture catalog.
  const A320_FAMILY_KEY = 'Airbus::A318/A319/A320/A321';

  await test('Matching — Case 5: legacy broad requirement does not combine independent license/aircraft rows', () => {
    const offer = makeOffer({ requiredLicenses: ['B1.1'] as any, requiredAircraftTypes: [A320_FAMILY_KEY] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      // A320 habilitation exists, but only under B2 — never under B1.1.
      habilitations: [makeHab('B2', { aircraftTypeCode: 'A320' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.notEqual(result.level, 'legacy', 'must not report a full legacy match from two unrelated rows');
    assert.equal(result.breakdown.habilitation, 0);
    assert.equal(result.breakdown.license, 0);
  });

  await test('Matching — Case 5b: broad aircraft requirement matches a technician holding a different engine variant in the same family', () => {
    // Migration 022's whole point: ONE family-key selection covers every
    // engine variant in that family, not just the specific alias string a
    // company happened to type.
    const offer = makeOffer({ requiredLicenses: ['B1.1'] as any, requiredAircraftTypes: [A320_FAMILY_KEY] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'legacy', 'a V2500-variant A320-family rating must satisfy an A320-family broad requirement');
  });

  await test('Matching — Case 5c: broad aircraft requirement resolves a technician\'s bare legacy code inclusively', () => {
    // 'A318' is only ever an alias of fx-a320-cfm56 in the fixture catalog,
    // never of fx-a320-v2500 — resolveLegacyCodeToFamilyKeys must still land
    // on the shared family, not require a literal alias match against one
    // specific rating.
    const offer = makeOffer({ requiredLicenses: ['B1.1'] as any, requiredAircraftTypes: [A320_FAMILY_KEY] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeCode: 'A318' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'legacy');
  });

  await test('Matching — Case 5d: aircraftExperience alone can no longer satisfy a broad aircraft requirement', () => {
    // TechnicianAircraftExperience has no rating link at all — since
    // requiredAircraftTypes moved to family keys (migration 022) there is
    // nothing to resolve it against without guessing, so it stops
    // contributing to this tier (documented limitation, see
    // docs/MISSION_PART66.md).
    const offer = makeOffer({ requiredAircraftTypes: [A320_FAMILY_KEY] });
    const technician = makeTechnician({
      habilitations: [],
      aircraftExperience: [{ id: 'exp-1', technicianId: 'tech-test', aircraftTypeCode: 'A320', value: 5, unit: 'years', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.notEqual(result.level, 'legacy', 'aircraftExperience has no rating link — it cannot resolve to a family');
  });

  await test('Matching — Case 6: preferred requirement mismatch stays related, never excluded', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'related');
    assert.equal(result.mandatoryMissing.length, 0, 'preferred misses must not appear in mandatoryMissing');
  });

  await test('Matching — Case 7: mandatory requirement mismatch is flagged but the profile still surfaces as related', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'related', 'unmet mandatory must not silently become exact');
    assert.ok(result.mandatoryMissing.length > 0, 'expected the unmet mandatory requirement to be listed');
  });

  await test('Matching — Case 8: a pending catalog request id is never a resolvable rating', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.3', NOT_A_REAL_RATING, 'mandatory')] });
    const technician = makeTechnician({ licenses: [makeLicense('B1.3')], habilitations: [] });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.notEqual(result.level, 'exact');
    assert.ok(result.mandatoryMissing.length > 0);
  });

  await test('Matching — Case 9: no match from sharing only a manufacturer (Boeing 777 vs Boeing 787)', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-b787-genx', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-b777-ge90' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'not_met', 'Boeing 777 and Boeing 787 are different families — same manufacturer alone must not count as related');
    assert.equal(result.clarifications.some((c) => c.includes('777')), false);
  });

  await test('Matching — Case 10: a habilitation referencing a deactivated rating still matches exactly, and its label still resolves', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.3', 'fx-bell412-pt6-inactive', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.3')],
      habilitations: [makeHab('B1.3', { aircraftTypeRatingId: 'fx-bell412-pt6-inactive' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'exact', 'matching must not penalize a rating just because it was later deactivated');
    assert.equal(
      getAircraftTypeRatingLabel('fx-bell412-pt6-inactive', RATING_INDEX),
      'Bell 412 — PT6 (test, inactive)',
      'an inactive rating referenced by an existing row must still resolve to its real display name, never a bare id',
    );
  });

  // ── Fase 2 — scoring redesign (qualification dominates, mandatory acts
  //    as a ceiling, absent data stays neutral) ─────────────────────────

  await test('Fase 2 — T1 (exact rating) awards the full habilitation weight (35)', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.habilitation, 35, 'T1 must award the full habilitation weight');
    assert.equal(result.level, 'exact');
  });

  await test('Fase 2 — T2 (same family, different engine) awards a partial habilitation weight', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.ok(
      result.breakdown.habilitation > 0 && result.breakdown.habilitation < 35,
      `T2 must award a partial habilitation weight strictly between 0 and 35, got ${result.breakdown.habilitation}`,
    );
    assert.ok(result.clarifications.some((c) => c.includes('Same family, different engine')));
  });

  await test('Fase 2 — T3 (legacy code match, no engine on record) scores below T2', () => {
    const offerT2 = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const techT2 = makeTechnician({ licenses: [makeLicense('B1.1')], habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })] });
    const resultT2 = calculateOfferTechnicianMatch(offerT2, techT2, RATING_INDEX);

    const offerT3 = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const techT3 = makeTechnician({ licenses: [makeLicense('B1.1')], habilitations: [makeHab('B1.1', { aircraftTypeCode: 'A318' })] });
    const resultT3 = calculateOfferTechnicianMatch(offerT3, techT3, RATING_INDEX);

    assert.ok(resultT3.breakdown.habilitation > 0, 'T3 must still award some credit, never treated as no-match');
    assert.ok(
      resultT3.breakdown.habilitation < resultT2.breakdown.habilitation,
      `T3 (${resultT3.breakdown.habilitation}) must score below T2 (${resultT2.breakdown.habilitation})`,
    );
    assert.ok(resultT3.clarifications.some((c) => c.includes('Approximate match without engine data')));
  });

  await test('T3 is family-based since migration 022: a legacy code alias of a DIFFERENT rating in the same family still counts', () => {
    // 'A318' is only ever an alias of fx-a320-cfm56 in the fixture catalog.
    // The offer requires fx-a320-v2500 (same family, different engine) —
    // under the old "literal alias of THIS exact rating" rule this would
    // have fallen through to T4/not_met; family-based resolution correctly
    // places it at T3 (weaker than T2, no engine on record).
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-v2500', 'preferred')] });
    const technician = makeTechnician({ licenses: [makeLicense('B1.1')], habilitations: [makeHab('B1.1', { aircraftTypeCode: 'A318' })] });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.ok(result.breakdown.habilitation > 0, 'expected T3 credit, not T4/no-match');
    assert.ok(result.clarifications.some((c) => c.includes('Approximate match without engine data')));
  });

  await test('Fase 2 — T4 (no match at all) awards zero habilitation', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const technician = makeTechnician({ licenses: [makeLicense('B1.1')], habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-b777-ge90' })] });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.habilitation, 0);
  });

  await test('Fase 2 — regression: zero qualification never manufactures a Partial score (previously 55/100, now capped Weak)', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      minYearsExperience: 1,
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      aircraftExperience: [{ id: 'exp-1', technicianId: 'tech-test', aircraftTypeCode: 'A320', value: 5, unit: 'years', createdAt: '2026-01-01T00:00:00.000Z' }],
      licenses: [],
      habilitations: [],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.ok(result.total <= 39, `expected a capped Weak score, got ${result.total}`);
    assert.equal(result.label, 'Weak match');
  });

  await test('Fase 2 — regression: an offer with no qualification requirement never reaches Excellent from profile alone', () => {
    const offer = makeOffer({ contractType: 'permanent', minYearsExperience: 1 });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      aircraftExperience: [{ id: 'exp-1', technicianId: 'tech-test', aircraftTypeCode: 'A320', value: 5, unit: 'years', createdAt: '2026-01-01T00:00:00.000Z' }],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.habilitation, 0, 'habilitation must not be awarded when the offer has no qualification requirement');
    assert.equal(result.breakdown.license, 0);
    assert.notEqual(result.label, 'Excellent match');
    assert.ok(result.total <= 75, `expected the no-requirements ceiling (75), got ${result.total}`);
  });

  await test('Fase 2 — an exact rating with a weak profile outranks a correct license without the rating even with a perfect profile', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      minYearsExperience: 5,
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });

    const weakProfileExactRating = makeTechnician({
      verificationStatus: 'pending',
      availability: { immediately: false, contractTypes: ['temporary'] },
      aircraftExperience: [],
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const perfectProfileNoRating = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      aircraftExperience: [{ id: 'exp-1', technicianId: 'tech-test', aircraftTypeCode: 'A320', value: 10, unit: 'years', createdAt: '2026-01-01T00:00:00.000Z' }],
      licenses: [makeLicense('B1.1')], // holds the right category...
      habilitations: [], // ...but no rating for it at all
    });

    const resultA = calculateOfferTechnicianMatch(offer, weakProfileExactRating, RATING_INDEX);
    const resultB = calculateOfferTechnicianMatch(offer, perfectProfileNoRating, RATING_INDEX);

    assert.ok(
      resultA.total > resultB.total,
      `exact rating + weak profile (${resultA.total}) must outrank correct license without rating + perfect profile (${resultB.total})`,
    );
    assert.equal(resultA.level, 'exact');
  });

  await test('Fase 2 — an unmet mandatory requirement never lets the total exceed 59, even with a maxed-out rest of profile', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      minYearsExperience: 1,
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      aircraftExperience: [{ id: 'exp-1', technicianId: 'tech-test', aircraftTypeCode: 'A320', value: 5, unit: 'years', createdAt: '2026-01-01T00:00:00.000Z' }],
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-v2500' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.ok(result.mandatoryMissing.length > 0);
    assert.ok(result.total <= 59, `expected the mandatory cap (59), got ${result.total}`);
  });

  await test('Fase 2 — a rating endorsed with no declared experience still scores a full T1 match (absent data is neutral)', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })], // experienceYears/isCurrent left undefined
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.habilitation, 35, 'undefined experienceYears/isCurrent must not reduce the T1 score');
    assert.equal(result.level, 'exact');
    assert.equal(result.mandatoryMissing.length, 0);
  });

  await test('Fase 2 — getMatchLabel boundaries include the renamed "Weak match" tier', () => {
    assert.equal(getMatchLabel(0), 'Weak match');
    assert.equal(getMatchLabel(39), 'Weak match');
    assert.equal(getMatchLabel(40), 'Partial match');
    assert.equal(getMatchLabel(59), 'Partial match');
    assert.equal(getMatchLabel(60), 'Strong match');
    assert.equal(getMatchLabel(80), 'Excellent match');
  });

  // ── Fase 3 — vigencia (expired / not-current degradation) ────────────
  // Fixed reference date so expired-vs-future fixtures are deterministic
  // regardless of when the suite runs.
  const NOW = new Date(2026, 5, 15); // 2026-06-15

  await test('Vigencia — absent issuedAt/expiresAt/isCurrent is neutral: full T1 score, no notice', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const tech = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, tech, buildAircraftRatingIndex(FIXTURES), NOW);
    assert.equal(result.breakdown.habilitation, 35);
    assert.deepEqual(result.vigenciaNotices, []);
    assert.equal(result.mandatoryMissing.length, 0);
  });

  await test('Vigencia — an expired rating degrades slightly (never excludes) and adds one "Expired" notice', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const tech = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56', expiresAt: '2026-03-01' })],
    });
    const result = calculateOfferTechnicianMatch(offer, tech, buildAircraftRatingIndex(FIXTURES), NOW);
    assert.ok(result.breakdown.habilitation < 35 && result.breakdown.habilitation > 0, `expected a slight cut, got ${result.breakdown.habilitation}`);
    assert.equal(result.level, 'exact', 'still tier exact — degraded, never excluded');
    assert.equal(result.mandatoryMissing.length, 0, 'a degraded exact match never becomes mandatoryMissing');
    assert.equal(result.vigenciaNotices.length, 1);
    assert.equal(result.vigenciaNotices[0].label, 'Expired');
    assert.ok(result.vigenciaNotices[0].detail.includes('2026-03'));
  });

  await test('Vigencia — precedence: an expired date wins even when isCurrent is explicitly true', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const tech = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56', expiresAt: '2026-03-01', isCurrent: true })],
    });
    const result = calculateOfferTechnicianMatch(offer, tech, buildAircraftRatingIndex(FIXTURES), NOW);
    assert.equal(result.vigenciaNotices.length, 1, 'exactly one notice — never two contradictory ones');
    assert.equal(result.vigenciaNotices[0].label, 'Expired', 'expired date wins over isCurrent=true');
  });

  await test('Vigencia — inverse case: a future/absent expiry with isCurrent=false is a distinct "Not current" notice', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const tech = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56', expiresAt: '2027-01-01', isCurrent: false })],
    });
    const result = calculateOfferTechnicianMatch(offer, tech, buildAircraftRatingIndex(FIXTURES), NOW);
    assert.equal(result.vigenciaNotices.length, 1);
    assert.equal(result.vigenciaNotices[0].label, 'Not current');
  });

  await test('Vigencia — an expired license affects a rating with no vigencia issues of its own, with one combined notice', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const tech = makeTechnician({
      licenses: [{ ...makeLicense('B1.1'), expiresAt: '2026-01-01' }],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, tech, buildAircraftRatingIndex(FIXTURES), NOW);
    assert.equal(result.vigenciaNotices.length, 1);
    assert.equal(result.vigenciaNotices[0].label, 'Expired');
    assert.ok(result.vigenciaNotices[0].detail.startsWith('License B1.1 expired 2026-01'));
    assert.ok(result.vigenciaNotices[0].detail.includes('all its ratings affected'));
  });

  await test('Vigencia — license AND rating both expired produce exactly one combined notice, not two', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const tech = makeTechnician({
      licenses: [{ ...makeLicense('B1.1'), expiresAt: '2026-01-01' }],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56', expiresAt: '2026-02-01' })],
    });
    const result = calculateOfferTechnicianMatch(offer, tech, buildAircraftRatingIndex(FIXTURES), NOW);
    assert.equal(result.vigenciaNotices.length, 1, 'one combined notice, not one per source');
    assert.ok(result.vigenciaNotices[0].detail.startsWith('License B1.1 expired'), 'license-level message takes precedence');
  });

  // ── Mapper ───────────────────────────────────────────────────────────

  await test('Mapper — mapAircraftTypeRatingRow converts a Supabase snake_case row to the domain shape', () => {
    const row: AircraftTypeRatingRow = {
      id: 'fx-row-1',
      manufacturer: 'Airbus',
      aircraft_family: 'A320',
      engine_manufacturer: null,
      engine_family: null,
      easa_endorsement: 'A320 GENERIC',
      display_name: 'Airbus A320 (generic)',
      commercial_aliases: null,
      aircraft_category: 'commercial_airplane',
      easa_group: null,
      source_revision: null,
      priority: 42,
      is_active: true,
    };
    const mapped = mapAircraftTypeRatingRow(row);
    assert.equal(mapped.id, 'fx-row-1');
    assert.equal(mapped.aircraftFamily, 'A320');
    assert.equal(mapped.engineManufacturer, undefined, 'null engine_manufacturer must map to undefined, not null');
    assert.equal(mapped.engineFamily, undefined);
    assert.deepEqual(mapped.commercialAliases, [], 'null commercial_aliases must map to an empty array, not null');
    assert.equal(mapped.easaGroup, undefined);
    assert.equal(mapped.sourceRevision, undefined);
    assert.equal(mapped.priority, 42);
    assert.equal(mapped.isActive, true);
  });

  // ── Sort ─────────────────────────────────────────────────────────────

  await test('Sort — sortAircraftTypeRatings orders by priority descending', () => {
    const shuffled = [...FIXTURES].reverse();
    const sorted = sortAircraftTypeRatings(shuffled);
    const expectedIds = [...FIXTURES].sort((a, b) => b.priority - a.priority).map((r) => r.id);
    assert.deepEqual(sorted.map((r) => r.id), expectedIds);
  });

  await test('Sort — ties on priority break by manufacturer, then family, then engine', () => {
    const tied = [
      makeRating({ id: 'fx-tie-b', manufacturer: 'Bravo', aircraftFamily: 'F2', engineFamily: 'E1', priority: 50 }),
      makeRating({ id: 'fx-tie-a2', manufacturer: 'Alpha', aircraftFamily: 'F2', engineFamily: 'E1', priority: 50 }),
      makeRating({ id: 'fx-tie-a1', manufacturer: 'Alpha', aircraftFamily: 'F1', engineFamily: 'E2', priority: 50 }),
    ];
    const sorted = sortAircraftTypeRatings(tied);
    assert.deepEqual(sorted.map((r) => r.id), ['fx-tie-a1', 'fx-tie-a2', 'fx-tie-b'], 'expected Alpha/F1 < Alpha/F2 < Bravo/F2');
  });

  // ── Search ───────────────────────────────────────────────────────────

  await test('Search — filterAircraftTypeRatings finds an alias match (A320neo)', () => {
    const results = filterAircraftTypeRatings(FIXTURES, 'A320neo');
    assert.ok(results.some((r) => r.id === 'fx-a320neo-leap1a'));
    assert.ok(
      results.every(
        (r) => r.commercialAliases.some((a) => a.toLowerCase().includes('a320neo')) || r.displayName.toLowerCase().includes('a320neo'),
      ),
    );
  });

  await test('Search — is case-insensitive and tolerates surrounding whitespace', () => {
    const a = filterAircraftTypeRatings(FIXTURES, 'A320neo');
    const b = filterAircraftTypeRatings(FIXTURES, '  a320NEO  ');
    assert.deepEqual(b.map((r) => r.id), a.map((r) => r.id));
  });

  await test('Search — is a pure text filter; it does not exclude inactive rows on its own', () => {
    const results = filterAircraftTypeRatings(FIXTURES, 'PT6');
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('fx-aw139-pt6'));
    assert.ok(
      ids.includes('fx-bell412-pt6-inactive'),
      'excluding inactive rows for NEW selections is the repository/UI layer\'s job (getAircraftTypeRatings filters is_active=true before the picker ever calls this), not this function\'s',
    );
  });

  await test('Search — matches by commercial nickname (Dreamliner)', () => {
    const results = filterAircraftTypeRatings(FIXTURES, 'Dreamliner');
    assert.equal(results.length, 1);
    assert.equal(results[0].aircraftFamily, '787');
  });

  // ── Views (Fase 3b — getFamilies/getByProductType/searchRatings) ─────

  await test('Views — getFamilies groups same manufacturer+family ratings together, sorted by priority', () => {
    const groups = getFamilies(FIXTURES);
    const a320 = groups.find((g) => g.key === 'Airbus::A318/A319/A320/A321');
    assert.ok(a320, 'expected an A320 family group');
    assert.equal(a320!.ratings.length, 2);
    assert.deepEqual(a320!.ratings.map((r) => r.id), ['fx-a320-cfm56', 'fx-a320-v2500'], 'higher-priority CFM56 (100) before V2500 (90)');
  });

  await test('Views — getFamilies never merges the same family string across different manufacturers', () => {
    const crossManufacturer: AircraftTypeRatingCatalog[] = [
      { ...FIXTURES[0], id: 'fx-fake-a', manufacturer: 'MakerA', aircraftFamily: 'Shared100' },
      { ...FIXTURES[0], id: 'fx-fake-b', manufacturer: 'MakerB', aircraftFamily: 'Shared100' },
    ];
    const groups = getFamilies(crossManufacturer);
    assert.equal(groups.length, 2, 'same family string, different manufacturer -> two distinct groups');
  });

  await test('Views — getFamilies orders groups by each group\'s best (highest-priority) member', () => {
    const groups = getFamilies(FIXTURES);
    const keys = groups.map((g) => g.key);
    assert.ok(keys.indexOf('Airbus::A318/A319/A320/A321') < keys.indexOf('Leonardo::AW139'), 'priority 100 group before priority 70 group');
  });

  await test('Views — getByProductType(Aeroplane) returns only airplane ratings, excludes helicopters', () => {
    const results = getByProductType(FIXTURES, 'Aeroplane');
    assert.equal(results.length, 5);
    assert.ok(results.every((r) => r.aircraftCategory !== 'helicopter'));
  });

  await test('Views — getByProductType(Helicopter) includes inactive ratings (facet, not an active filter)', () => {
    const results = getByProductType(FIXTURES, 'Helicopter');
    assert.equal(results.length, 2);
    assert.ok(results.some((r) => r.id === 'fx-bell412-pt6-inactive'), 'inactive helicopter still matches the facet — isActive filtering is a separate concern');
  });

  await test('Views — a rating with productType unset matches no facet, never guessed into one', () => {
    const withUnset: AircraftTypeRatingCatalog[] = [
      ...FIXTURES,
      makeRating({ id: 'fx-unset-product-type', manufacturer: 'Unknown', aircraftFamily: 'Unknown', aircraftCategory: 'general_aviation' }),
    ];
    assert.ok(!getByProductType(withUnset, 'Aeroplane').some((r) => r.id === 'fx-unset-product-type'));
    assert.ok(!getByProductType(withUnset, 'Helicopter').some((r) => r.id === 'fx-unset-product-type'));
  });

  await test('Views — searchRatings is the centralized search entry point (delegates to filterAircraftTypeRatings)', () => {
    assert.deepEqual(searchRatings(FIXTURES, 'CFM56'), filterAircraftTypeRatings(FIXTURES, 'CFM56'));
    assert.equal(searchRatings(FIXTURES, 'CFM56')[0].id, 'fx-a320-cfm56');
  });

  // ── getAircraftFamilyKey / resolveLegacyCodeToFamilyKeys (migration 022) ──

  await test('getAircraftFamilyKey matches the key getFamilies() groups by — never allowed to drift apart', () => {
    const groups = getFamilies(FIXTURES);
    const a320Group = groups.find((g) => g.aircraftFamily === 'A318/A319/A320/A321')!;
    assert.equal(getAircraftFamilyKey(FIXTURES.find((r) => r.id === 'fx-a320-cfm56')!), a320Group.key);
  });

  await test('resolveLegacyCodeToFamilyKeys is inclusive: a code aliasing two distinct families returns both, never a guessed single winner', () => {
    const ambiguous: AircraftTypeRatingCatalog[] = [
      makeRating({ id: 'fx-ambig-1', manufacturer: 'MakerA', aircraftFamily: 'FamilyOne', commercialAliases: ['SHARED'] }),
      makeRating({ id: 'fx-ambig-2', manufacturer: 'MakerB', aircraftFamily: 'FamilyTwo', commercialAliases: ['SHARED'] }),
    ];
    const keys = resolveLegacyCodeToFamilyKeys('SHARED', buildAircraftRatingIndex(ambiguous));
    assert.equal(keys.size, 2, 'expected both families, not a single guessed one');
    assert.ok(keys.has('MakerA::FamilyOne'));
    assert.ok(keys.has('MakerB::FamilyTwo'));
  });

  await test('resolveLegacyCodeToFamilyKeys collapses two ratings in the same family (different engine) into one key', () => {
    // Mirrors the real H135 case (PW206 + Arrius 2B engines, same family) —
    // see migration 022's backfill report.
    const keys = resolveLegacyCodeToFamilyKeys('A320', RATING_INDEX);
    assert.equal(keys.size, 1, 'fx-a320-cfm56 and fx-a320-v2500 are the same family — one key, not two');
    assert.ok(keys.has('Airbus::A318/A319/A320/A321'));
  });

  await test('resolveLegacyCodeToFamilyKeys returns an empty set for a code with no catalog match', () => {
    const keys = resolveLegacyCodeToFamilyKeys('NOT-A-REAL-CODE', RATING_INDEX);
    assert.equal(keys.size, 0);
  });

  // ── License category -> productType pre-filter (Fase 3b.4) ───────────

  await test('Category product type — A1/A2/B1.1/B1.2/B3 map to Aeroplane', () => {
    for (const code of ['A1', 'A2', 'B1.1', 'B1.2', 'B3'] as const) {
      assert.equal(getCompatibleProductType(code), 'Aeroplane', `expected ${code} -> Aeroplane`);
    }
  });

  await test('Category product type — A3/A4/B1.3/B1.4 map to Helicopter', () => {
    for (const code of ['A3', 'A4', 'B1.3', 'B1.4'] as const) {
      assert.equal(getCompatibleProductType(code), 'Helicopter', `expected ${code} -> Helicopter`);
    }
  });

  await test('Category product type — B2/B2L/C/L cover both, never pre-filtered', () => {
    for (const code of ['B2', 'B2L', 'C', 'L'] as const) {
      assert.equal(getCompatibleProductType(code), undefined, `expected ${code} -> no pre-filter`);
    }
  });

  // ── isUnusualCombination (Fase 3b screen 2) ───────────────────────────

  await test('isUnusualCombination — flags a helicopter rating declared under an aeroplane-only license (B1.1 + H145)', () => {
    assert.equal(isUnusualCombination('B1.1', 'Helicopter'), true);
  });

  await test('isUnusualCombination — flags an aeroplane rating declared under a helicopter-only license (B1.3 + A320)', () => {
    assert.equal(isUnusualCombination('B1.3', 'Aeroplane'), true);
  });

  await test('isUnusualCombination — never flags a matching combination', () => {
    assert.equal(isUnusualCombination('B1.1', 'Aeroplane'), false);
    assert.equal(isUnusualCombination('B1.3', 'Helicopter'), false);
  });

  await test('isUnusualCombination — never flags B2/B2L/C/L, which cover both product types', () => {
    for (const code of ['B2', 'B2L', 'C', 'L'] as const) {
      assert.equal(isUnusualCombination(code, 'Aeroplane'), false);
      assert.equal(isUnusualCombination(code, 'Helicopter'), false);
    }
  });

  await test('isUnusualCombination — never guesses when the rating\'s productType is unpopulated', () => {
    assert.equal(isUnusualCombination('B1.1', undefined), false);
  });

  // ── Cache ────────────────────────────────────────────────────────────

  await test('Cache — serves the cached result within the TTL without refetching', async () => {
    let calls = 0;
    let clock = 0;
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => {
        calls += 1;
        return FIXTURES.filter((f) => f.isActive);
      },
      fetchByIds: async (ids) => FIXTURES.filter((f) => ids.includes(f.id)),
      ttlMs: 1000,
      now: () => clock,
    });
    await cache.getActiveRatings();
    await cache.getActiveRatings();
    assert.equal(calls, 1, 'a second call within the TTL must not refetch');
  });

  await test('Cache — refetches once the TTL has expired', async () => {
    let calls = 0;
    let clock = 0;
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => {
        calls += 1;
        return FIXTURES.filter((f) => f.isActive);
      },
      fetchByIds: async () => [],
      ttlMs: 1000,
      now: () => clock,
    });
    await cache.getActiveRatings();
    clock += 1001;
    await cache.getActiveRatings();
    assert.equal(calls, 2, 'a call after TTL expiry must refetch');
  });

  await test('Cache — invalidate() forces the next call to refetch even within the TTL', async () => {
    let calls = 0;
    const clock = 0;
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => {
        calls += 1;
        return FIXTURES.filter((f) => f.isActive);
      },
      fetchByIds: async () => [],
      ttlMs: 10_000,
      now: () => clock,
    });
    await cache.getActiveRatings();
    cache.invalidate();
    await cache.getActiveRatings();
    assert.equal(calls, 2, 'invalidate() must force a refetch on the next call');
  });

  await test('Cache — a failed background refresh keeps serving the last good catalog', async () => {
    let attempt = 0;
    let clock = 0;
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => {
        attempt += 1;
        if (attempt === 1) return FIXTURES.filter((f) => f.isActive);
        throw new Error('network down');
      },
      fetchByIds: async () => [],
      ttlMs: 1000,
      now: () => clock,
    });
    const first = await cache.getActiveRatings();
    assert.ok(first.length > 0);
    clock += 1001;
    const second = await cache.getActiveRatings();
    assert.deepEqual(second.map((r) => r.id), first.map((r) => r.id), 'must keep serving the previous catalog when a refresh fails');
    assert.equal(cache.getState().status, 'success', 'status must stay success, not flip to error, when stale data exists');
    assert.ok(cache.getState().error, 'the failure must still be recorded on state.error');
  });

  await test("Cache — a failed fetch with no previous data rejects and leaves status 'error'", async () => {
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => {
        throw new Error('network down');
      },
      fetchByIds: async () => [],
    });
    await assert.rejects(() => cache.getActiveRatings());
    assert.equal(cache.getState().status, 'error');
  });

  await test('Cache — retrying after an error (with no previous data) can succeed', async () => {
    let attempt = 0;
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('network down');
        return FIXTURES.filter((f) => f.isActive);
      },
      fetchByIds: async () => [],
    });
    await assert.rejects(() => cache.getActiveRatings());
    const retried = await cache.getActiveRatings();
    assert.ok(retried.length > 0);
    assert.equal(cache.getState().status, 'success');
  });

  await test('Cache — fetchActive resolving to zero rows is status \'success\' with an empty array (the hook derives the UI "empty" state from this)', async () => {
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => [],
      fetchByIds: async () => [],
    });
    const result = await cache.getActiveRatings();
    assert.deepEqual(result, []);
    assert.equal(cache.getState().status, 'success');
  });

  await test('Cache — concurrent calls while a fetch is in flight share a single fetchActive request', async () => {
    let calls = 0;
    let resolveFetch: (v: AircraftTypeRatingCatalog[]) => void = () => {};
    const cache = createAircraftTypeRatingsCache({
      fetchActive: () => {
        calls += 1;
        return new Promise((resolve) => {
          resolveFetch = resolve;
        });
      },
      fetchByIds: async () => [],
    });
    const p1 = cache.getActiveRatings();
    const p2 = cache.getActiveRatings();
    resolveFetch(FIXTURES.filter((f) => f.isActive));
    const [r1, r2] = await Promise.all([p1, p2]);
    assert.equal(calls, 1, 'expected exactly one fetchActive call for two concurrent requests');
    assert.equal(r1.length, r2.length);
  });

  await test('Cache getRatingsByIds — includes inactive ratings so existing references still resolve', async () => {
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => [],
      fetchByIds: async (ids) => FIXTURES.filter((f) => ids.includes(f.id)),
    });
    const result = await cache.getRatingsByIds(['fx-aw139-pt6', 'fx-bell412-pt6-inactive']);
    const byId = new Map(result.map((r) => [r.id, r]));
    assert.ok(byId.has('fx-bell412-pt6-inactive'), 'an inactive rating id must still resolve via getRatingsByIds');
    assert.equal(byId.get('fx-bell412-pt6-inactive')?.isActive, false);
    assert.equal(byId.get('fx-bell412-pt6-inactive')?.displayName, 'Bell 412 — PT6 (test, inactive)');
  });

  await test('Cache getRatingsByIds — batches missing ids into a single fetchByIds call, never one request per id', async () => {
    const fetchByIdsCalls: string[][] = [];
    const cache = createAircraftTypeRatingsCache({
      fetchActive: async () => [],
      fetchByIds: async (ids) => {
        fetchByIdsCalls.push([...ids]);
        return FIXTURES.filter((f) => ids.includes(f.id));
      },
    });
    const ids = ['fx-a320-cfm56', 'fx-a320-v2500', 'fx-a320neo-leap1a'];
    const first = await cache.getRatingsByIds(ids);
    assert.equal(first.length, 3);
    assert.equal(fetchByIdsCalls.length, 1, 'expected exactly one fetchByIds call for three unknown ids');
    assert.deepEqual([...fetchByIdsCalls[0]].sort(), [...ids].sort());

    const idsAgain = ['fx-a320-cfm56', 'fx-a320-v2500', 'fx-b777-ge90'];
    const second = await cache.getRatingsByIds(idsAgain);
    assert.equal(second.length, 3);
    assert.equal(fetchByIdsCalls.length, 2, 'expected exactly one more fetchByIds call for the single newly-seen id');
    assert.deepEqual(fetchByIdsCalls[1], ['fx-b777-ge90']);
  });

  // ── Backfill plan ────────────────────────────────────────────────────

  await test('Backfill plan — an unambiguous alias maps a legacy row to its rating', () => {
    const legacyRows: LegacyHabilitationRow[] = [{ id: 'hab-1', technicianId: 'tech-1', licenseCode: 'B1.1', aircraftTypeCode: 'GE90' }];
    const plan = planLegacyAircraftRatingBackfill(legacyRows, FIXTURES, []);
    assert.equal(plan[0].outcome, 'mapped');
    assert.equal(plan[0].ratingId, 'fx-b777-ge90');
  });

  await test('Backfill plan — an alias shared by two ratings is left ambiguous, never guessed', () => {
    const legacyRows: LegacyHabilitationRow[] = [{ id: 'hab-2', technicianId: 'tech-1', licenseCode: 'B1.1', aircraftTypeCode: 'A320' }];
    const plan = planLegacyAircraftRatingBackfill(legacyRows, FIXTURES, []);
    assert.equal(plan[0].outcome, 'ambiguous');
    assert.deepEqual([...(plan[0].candidateIds ?? [])].sort(), ['fx-a320-cfm56', 'fx-a320-v2500']);
  });

  await test('Backfill plan — a code with no matching alias is left untouched', () => {
    const legacyRows: LegacyHabilitationRow[] = [{ id: 'hab-3', technicianId: 'tech-1', licenseCode: 'B1.1', aircraftTypeCode: 'NOT-A-REAL-CODE' }];
    const plan = planLegacyAircraftRatingBackfill(legacyRows, FIXTURES, []);
    assert.equal(plan[0].outcome, 'no_match');
  });

  await test('Backfill plan — a mapping that would collide with an existing normalized row is avoided, not double-written', () => {
    const legacyRows: LegacyHabilitationRow[] = [{ id: 'hab-4', technicianId: 'tech-1', licenseCode: 'B1.1', aircraftTypeCode: 'GE90' }];
    const existing: ExistingNormalizedHabilitation[] = [{ technicianId: 'tech-1', licenseCode: 'B1.1', aircraftTypeRatingId: 'fx-b777-ge90' }];
    const plan = planLegacyAircraftRatingBackfill(legacyRows, FIXTURES, existing);
    assert.equal(plan[0].outcome, 'collision_avoided');
    assert.equal(plan[0].ratingId, 'fx-b777-ge90');
  });

  await test('Backfill plan — summarizeBackfillPlan tallies every outcome across a mixed batch', () => {
    const legacyRows: LegacyHabilitationRow[] = [
      { id: 'hab-1', technicianId: 'tech-1', licenseCode: 'B1.1', aircraftTypeCode: 'GE90' },
      { id: 'hab-2', technicianId: 'tech-2', licenseCode: 'B1.1', aircraftTypeCode: 'A320' },
      { id: 'hab-3', technicianId: 'tech-3', licenseCode: 'B1.1', aircraftTypeCode: 'NOT-A-REAL-CODE' },
      { id: 'hab-4', technicianId: 'tech-4', licenseCode: 'B1.1', aircraftTypeCode: 'GE90' },
    ];
    const existing: ExistingNormalizedHabilitation[] = [{ technicianId: 'tech-4', licenseCode: 'B1.1', aircraftTypeRatingId: 'fx-b777-ge90' }];
    const plan = planLegacyAircraftRatingBackfill(legacyRows, FIXTURES, existing);
    const summary = summarizeBackfillPlan(plan);
    assert.deepEqual(summary, { analyzed: 4, mapped: 1, ambiguous: 1, noMatch: 1, collisionsAvoided: 1 });
  });

  // ── License update plan ─────────────────────────────────────────────
  // Regression coverage for the profile save bug: deleting a
  // technician_licenses row that technician_habilitations still
  // references violates fk_technician_habilitations_license. These tests
  // pin the invariant that closes it — an existing license/habilitation
  // pair is never lost, whether or not the technician also deselects the
  // license in the same save.

  await test('License update plan — a license the technician keeps is never touched, regardless of dependents', () => {
    const plan = planLicenseRemoval([], ['B1.1']);
    assert.deepEqual(plan, { deletes: [], blocked: [] });
  });

  await test('License update plan — a deselected license with no dependent habilitations is safe to delete', () => {
    const plan = planLicenseRemoval(['A1'], []);
    assert.deepEqual(plan, { deletes: ['A1'], blocked: [] });
  });

  await test('License update plan — a deselected license with a dependent habilitation is blocked, not deleted', () => {
    const plan = planLicenseRemoval(['B1.1'], ['B1.1']);
    assert.deepEqual(plan, { deletes: [], blocked: ['B1.1'] });
  });

  await test('License update plan — a mixed batch splits correctly between safe deletes and blocked codes', () => {
    const plan = planLicenseRemoval(['A1', 'B1.1', 'C1'], ['B1.1']);
    assert.deepEqual(plan.deletes.sort(), ['A1', 'C1']);
    assert.deepEqual(plan.blocked, ['B1.1']);
  });

  // ── Validity date order ──────────────────────────────────────────────

  await test('Validity date order — an unset issuedAt or expiresAt is always valid (neutral)', () => {
    assert.equal(isValidDateOrder(undefined, undefined), true);
    assert.equal(isValidDateOrder('2024-01-01', undefined), true);
    assert.equal(isValidDateOrder(undefined, '2024-01-01'), true);
  });

  await test('Validity date order — expiresAt after issuedAt is valid', () => {
    assert.equal(isValidDateOrder('2024-01-01', '2025-01-01'), true);
  });

  await test('Validity date order — expiresAt equal to issuedAt is invalid', () => {
    assert.equal(isValidDateOrder('2024-01-01', '2024-01-01'), false);
  });

  await test('Validity date order — expiresAt before issuedAt is invalid', () => {
    assert.equal(isValidDateOrder('2025-01-01', '2024-01-01'), false);
  });

  // ── Offer relation state machine ──────────────────────────────────────
  // Governs offer_requests (direct offers) AND offer_applications (both
  // tables share the same offer_request_status enum and the same DB
  // trigger, handle_offer_relation_status_transition/
  // assert_offer_relation_transition). Zero coverage before this pass,
  // despite backing every accept/reject/withdraw/reapply decision in both
  // flows — added here rather than only exercised manually in the app.

  await test('isActiveOfferRelationStatus — pending and accepted are active, everything terminal is not', () => {
    assert.equal(isActiveOfferRelationStatus('pending'), true);
    assert.equal(isActiveOfferRelationStatus('accepted'), true);
    assert.equal(isActiveOfferRelationStatus('rejected'), false);
    assert.equal(isActiveOfferRelationStatus('expired'), false);
    assert.equal(isActiveOfferRelationStatus('withdrawn'), false);
  });

  await test('assertOfferRelationTransition — same-status no-op never throws', () => {
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'pending'));
    assert.doesNotThrow(() => assertOfferRelationTransition('accepted', 'accepted'));
  });

  await test('assertOfferRelationTransition — pending can move to any terminal or accepted state', () => {
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'accepted'));
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'rejected'));
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'expired'));
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'withdrawn'));
  });

  await test('assertOfferRelationTransition — terminal statuses never transition anywhere else (one-shot by design)', () => {
    assert.throws(() => assertOfferRelationTransition('accepted', 'rejected'));
    assert.throws(() => assertOfferRelationTransition('rejected', 'pending'));
    assert.throws(() => assertOfferRelationTransition('withdrawn', 'pending'));
    assert.throws(() => assertOfferRelationTransition('expired', 'accepted'));
  });

  await test('shouldUnlockAcceptedRelation — true only for accepted', () => {
    assert.equal(shouldUnlockAcceptedRelation('accepted'), true);
    assert.equal(shouldUnlockAcceptedRelation('pending'), false);
    assert.equal(shouldUnlockAcceptedRelation('rejected'), false);
    assert.equal(shouldUnlockAcceptedRelation('withdrawn'), false);
    assert.equal(shouldUnlockAcceptedRelation('expired'), false);
  });

  await test('getStatusActivityType — direct offer and application accept/reject map to distinct activity types; other statuses are silent', () => {
    assert.equal(getStatusActivityType('direct_offer', 'accepted'), 'direct_offer_accepted');
    assert.equal(getStatusActivityType('direct_offer', 'rejected'), 'direct_offer_rejected');
    assert.equal(getStatusActivityType('direct_offer', 'pending'), null);
    assert.equal(getStatusActivityType('application', 'accepted'), 'application_accepted');
    assert.equal(getStatusActivityType('application', 'rejected'), 'application_rejected');
    assert.equal(getStatusActivityType('application', 'withdrawn'), null);
  });

  // ── Direct offer creation guard (offerRequestRepository.create) ───────

  await test('evaluateDirectOfferConflict — nothing existing, nothing blocks', () => {
    assert.equal(evaluateDirectOfferConflict([], [], 'offer-1'), null);
  });

  await test('evaluateDirectOfferConflict — an active request for the same offer blocks', () => {
    const result = evaluateDirectOfferConflict(
      [{ status: 'pending', offerId: 'offer-1' }],
      [],
      'offer-1',
    );
    assert.equal(result, 'An active direct offer already exists for this technician.');
  });

  await test('evaluateDirectOfferConflict — an active request for a DIFFERENT offer never cross-blocks', () => {
    const result = evaluateDirectOfferConflict(
      [{ status: 'pending', offerId: 'offer-other' }],
      [],
      'offer-1',
    );
    assert.equal(result, null);
  });

  await test('evaluateDirectOfferConflict — a terminal (withdrawn) request for the same offer never blocks a resend', () => {
    const result = evaluateDirectOfferConflict(
      [{ status: 'withdrawn', offerId: 'offer-1' }],
      [],
      'offer-1',
    );
    assert.equal(result, null);
  });

  await test('evaluateDirectOfferConflict — an active application for the same offer blocks (only checked when offerId is set)', () => {
    const result = evaluateDirectOfferConflict([], [{ status: 'pending' }], 'offer-1');
    assert.equal(result, 'This technician already has an active application for this offer.');
  });

  await test('evaluateDirectOfferConflict — open-ended direct offer (no offerId) only conflicts with another open-ended active request', () => {
    assert.equal(
      evaluateDirectOfferConflict([{ status: 'pending', offerId: undefined }], [], undefined),
      'An active direct offer already exists for this technician.',
    );
    assert.equal(
      evaluateDirectOfferConflict([{ status: 'pending', offerId: 'offer-1' }], [], undefined),
      null,
    );
  });

  // ── Application creation guard (offerApplicationRepository.create) ────
  // Regression coverage for a real gap found while auditing this flow: the
  // repository checked for a conflicting direct offer before inserting,
  // but never checked its OWN table — offer_applications has
  // UNIQUE(technician_id, offer_id), so a second attempt (including a
  // reapply after withdrawal/rejection, which the state machine above
  // never allows) fell through to a raw Postgres unique-violation error
  // instead of a friendly message. evaluateApplicationConflict backs the
  // fix.

  await test('evaluateApplicationConflict — nothing existing, nothing blocks', () => {
    assert.equal(evaluateApplicationConflict(undefined, null), null);
  });

  await test('evaluateApplicationConflict — an active direct offer for this role blocks, before even checking applications', () => {
    const result = evaluateApplicationConflict({ status: 'pending' }, null);
    assert.equal(result, 'You already have a direct offer for this role. Review it from Direct Offers.');
  });

  await test('evaluateApplicationConflict — a terminal direct offer never blocks applying', () => {
    const result = evaluateApplicationConflict({ status: 'rejected' }, null);
    assert.equal(result, null);
  });

  await test('evaluateApplicationConflict — a pending or accepted application of your own blocks as "active"', () => {
    assert.equal(
      evaluateApplicationConflict(undefined, { status: 'pending' }),
      'You already have an active application for this offer.',
    );
    assert.equal(
      evaluateApplicationConflict(undefined, { status: 'accepted' }),
      'You already have an active application for this offer.',
    );
  });

  await test('evaluateApplicationConflict — a withdrawn or rejected application blocks reapplying with a dedicated message (one-shot per offer)', () => {
    const withdrawn = evaluateApplicationConflict(undefined, { status: 'withdrawn' });
    const rejected = evaluateApplicationConflict(undefined, { status: 'rejected' });
    assert.equal(withdrawn, 'You already applied to this offer previously — re-applying is not available once an application has been withdrawn or decided.');
    assert.equal(rejected, withdrawn);
  });

  // ── Fase 4 scaffolding: canHold() / HabilitationScope ─────────────────
  // NOT wired to any form, matching path, or UI — see
  // docs/MISSION_PART66.md. Tests only, so the three dimensions (aircraft
  // class, propulsion, EASA group) are locked in before anything ever
  // consumes this.

  await test('getCompatiblePropulsion — turbine categories', () => {
    assert.equal(getCompatiblePropulsion('A1'), 'turbine');
    assert.equal(getCompatiblePropulsion('A3'), 'turbine');
    assert.equal(getCompatiblePropulsion('B1.1'), 'turbine');
    assert.equal(getCompatiblePropulsion('B1.3'), 'turbine');
  });

  await test('getCompatiblePropulsion — piston categories, including B3 (not covered by the class-only Fase 3b mapping)', () => {
    assert.equal(getCompatiblePropulsion('A2'), 'piston');
    assert.equal(getCompatiblePropulsion('A4'), 'piston');
    assert.equal(getCompatiblePropulsion('B1.2'), 'piston');
    assert.equal(getCompatiblePropulsion('B1.4'), 'piston');
    assert.equal(getCompatiblePropulsion('B3'), 'piston');
  });

  await test('getCompatiblePropulsion — B2/B2L/L/C have no propulsion restriction', () => {
    assert.equal(getCompatiblePropulsion('B2'), undefined);
    assert.equal(getCompatiblePropulsion('B2L'), undefined);
    assert.equal(getCompatiblePropulsion('L'), undefined);
    assert.equal(getCompatiblePropulsion('C'), undefined);
  });

  await test('canHold — exact_rating: matching class and propulsion holds', () => {
    const scope: HabilitationScope = {
      kind: 'exact_rating',
      aircraftTypeRatingId: 'fx-a320-cfm56',
      aircraftClass: 'Aeroplane',
      propulsion: 'turbine',
    };
    assert.equal(canHold('B1.1', scope), true);
  });

  await test('canHold — aircraft class mismatch fails regardless of propulsion', () => {
    const scope: HabilitationScope = {
      kind: 'exact_rating',
      aircraftTypeRatingId: 'fx-aw139',
      aircraftClass: 'Helicopter',
      propulsion: 'turbine',
    };
    assert.equal(canHold('B1.1', scope), false); // B1.1 is Aeroplane-only
  });

  await test('canHold — an unknown (undefined) scope class is never guessed as a match when the license is class-restricted', () => {
    const scope: HabilitationScope = { kind: 'exact_rating', aircraftTypeRatingId: 'fx-unknown', propulsion: 'turbine' };
    assert.equal(canHold('B1.1', scope), false);
  });

  await test('canHold — propulsion mismatch fails even when class matches', () => {
    const scope: HabilitationScope = {
      kind: 'exact_rating',
      aircraftTypeRatingId: 'fx-a320-v2500',
      aircraftClass: 'Aeroplane',
      propulsion: 'piston',
    };
    assert.equal(canHold('B1.1', scope), false); // B1.1 is turbine-only
  });

  await test('canHold — an unknown (undefined) scope propulsion is never guessed as a match when the license is propulsion-restricted', () => {
    const scope: HabilitationScope = { kind: 'exact_rating', aircraftTypeRatingId: 'fx-unknown', aircraftClass: 'Aeroplane' };
    assert.equal(canHold('B1.1', scope), false);
  });

  await test('canHold — B3 requires BOTH Aeroplane class and piston propulsion (not just class, unlike the Fase 3b mapping alone)', () => {
    const matching: HabilitationScope = {
      kind: 'exact_rating', aircraftTypeRatingId: 'fx-c172', aircraftClass: 'Aeroplane', propulsion: 'piston',
    };
    const wrongPropulsion: HabilitationScope = {
      kind: 'exact_rating', aircraftTypeRatingId: 'fx-tbm', aircraftClass: 'Aeroplane', propulsion: 'turbine',
    };
    assert.equal(canHold('B3', matching), true);
    assert.equal(canHold('B3', wrongPropulsion), false);
  });

  await test('canHold — B2/B2L/C/L hold any class and any propulsion, never pre-filtered', () => {
    const helicopterPiston: HabilitationScope = {
      kind: 'exact_rating', aircraftTypeRatingId: 'fx-r44', aircraftClass: 'Helicopter', propulsion: 'piston',
    };
    const aeroplaneTurbine: HabilitationScope = {
      kind: 'exact_rating', aircraftTypeRatingId: 'fx-a320', aircraftClass: 'Aeroplane', propulsion: 'turbine',
    };
    const unknownBoth: HabilitationScope = { kind: 'exact_rating', aircraftTypeRatingId: 'fx-unknown' };
    for (const license of ['B2', 'B2L', 'C', 'L'] as const) {
      assert.equal(canHold(license, helicopterPiston), true, `${license} + helicopter/piston`);
      assert.equal(canHold(license, aeroplaneTurbine), true, `${license} + aeroplane/turbine`);
      assert.equal(canHold(license, unknownBoth), true, `${license} + unknown/unknown`);
    }
  });

  await test('canHold — exact_rating always demonstrates its own qualification, regardless of EASA group (never consults ALLOWED_KINDS_BY_GROUP)', () => {
    const scope: HabilitationScope = {
      kind: 'exact_rating', aircraftTypeRatingId: 'fx-a320-cfm56', aircraftClass: 'Aeroplane', propulsion: 'turbine',
    };
    assert.equal(canHold('B1.1', scope), true);
  });

  await test('canHold — Group 1: only exact_rating is a valid substitute, no subgroup/full-group scope ever qualifies', () => {
    const base = { aircraftClass: 'Aeroplane' as const, propulsion: 'turbine' as const, easaGroup: '1' as const };
    assert.equal(canHold('B1.1', { kind: 'manufacturer_subgroup', manufacturer: 'Airbus', ...base }), false);
    assert.equal(canHold('B1.1', { kind: 'full_subgroup', ...base }), false);
    assert.equal(canHold('B1.1', { kind: 'full_group', ...base }), false);
  });

  await test('canHold — Groups 2a/2b/2c: manufacturer_subgroup and full_subgroup both qualify', () => {
    const propsAndClass = { aircraftClass: 'Aeroplane' as const, propulsion: 'turbine' as const };
    for (const easaGroup of ['2a', '2b', '2c'] as const) {
      assert.equal(canHold('B1.1', { kind: 'manufacturer_subgroup', manufacturer: 'Airbus', easaGroup, ...propsAndClass }), true, `manufacturer_subgroup/${easaGroup}`);
      assert.equal(canHold('B1.1', { kind: 'full_subgroup', easaGroup, ...propsAndClass }), true, `full_subgroup/${easaGroup}`);
      // full_group is NOT a valid substitute for a 2x subgroup per the mission brief
      assert.equal(canHold('B1.1', { kind: 'full_group', easaGroup, ...propsAndClass }), false, `full_group/${easaGroup} should not qualify`);
    }
  });

  await test('canHold — Group 3: full_group qualifies, subgroup-level scopes do not (the brief pairs group 3 with "full group", not "subgroup")', () => {
    const base = { aircraftClass: 'Aeroplane' as const, propulsion: 'piston' as const, easaGroup: '3' as const };
    assert.equal(canHold('B1.2', { kind: 'full_group', ...base }), true);
    assert.equal(canHold('B1.2', { kind: 'manufacturer_subgroup', manufacturer: 'Cessna', ...base }), false);
    assert.equal(canHold('B1.2', { kind: 'full_subgroup', ...base }), false);
  });

  await test('canHold — group validity is checked independently of class/propulsion: a valid group scope with the wrong class still fails', () => {
    const scope: HabilitationScope = {
      kind: 'full_group', easaGroup: '3', aircraftClass: 'Helicopter', propulsion: 'piston',
    };
    assert.equal(canHold('B1.2', scope), false); // B1.2 is Aeroplane-only — group being valid doesn't rescue a class mismatch
  });
}

main()
  .then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
  })
  .catch((err) => {
    console.error('Test runner crashed:', err);
    process.exit(1);
  });
