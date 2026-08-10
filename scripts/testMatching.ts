// Standalone tests — no Supabase/DB connection required. Exercises the pure
// functions in src/utils/offerMatchExplain.ts, src/constants/aircraftTypeRatings.ts,
// and src/repositories/v2/aircraftTypeRatingsCache.ts against small
// in-memory fixtures.
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
import { calculateOfferTechnicianMatch, getMatchLabel, applyScoreCeilings, getMatchScoreWeights } from '../src/utils/offerMatchExplain';
import { OfferWithRequirements, OfferRequiredHabilitation } from '../src/types/offer';
import { TechnicianWithRelations, TechnicianHabilitation, TechnicianLicense, TechnicianAircraftExperience } from '../src/types/technician';
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
import { planLicenseRemoval } from '../src/utils/licenseUpdatePlan';
import { getFamilies, getByProductType, searchRatings, resolveAircraftCategoryForFamilyKeys } from '../src/constants/aircraftTypeRatingViews';
import { getAircraftFamilyKey } from '../src/constants/aircraftTypeRatings';
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
import { isLicensedTechnicianType, offerTargetsLicensedProfiles } from '../src/constants/technicianTypes';
import { planOfferTechnicianTypeToggle } from '../src/utils/offerTechnicianTypePlan';
import { findOrphanedLicenses } from '../src/constants/licenses';
import { getMatchDisplayLabel } from '../src/utils/offerMatchExplain';
import { GENERAL_COMPATIBILITY_LABEL } from '../src/types/matching';
import { Technician } from '../src/types';
import {
  parseYearsExperience,
  validateSignupYearsExperience,
  validateProfileYearsExperience,
} from '../src/utils/yearsExperienceValidation';

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
    // El scorer no lee productType (la 047 restringe qué se puede PEDIR, no
    // cómo se puntúa); está aquí porque el tipo lo exige, no porque estos
    // tests dependan de su valor.
    productType: 'Aeroplane',
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
    technicianTypes: ['mechanic'],
    locationCityId: 'airport:YYYY',
    availability: { immediately: true, contractTypes: ['permanent'] },
    verificationStatus: 'pending',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    licenses: [],
    habilitations: [],
    aircraftExperience: [],
    ...overrides,
  };
}

// Fase 6 tanda B. Existe para poder ASEVERAR que el scorer la ignora: sin un
// constructor, "ningún score cambia" sería una afirmación sin prueba.
function makeAircraftExperience(aircraftTypeRatingId: string, years?: number): TechnicianAircraftExperience {
  return {
    id: `exp-${aircraftTypeRatingId}-${years ?? 'na'}`,
    technicianId: 'tech-test',
    aircraftTypeRatingId,
    years,
    createdAt: '2026-01-01T00:00:00.000Z',
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

  // Fase 5 (2026-08-04) — Cases 5, 5b, 5c and 5d lived here and are gone with
  // offer.requiredAircraftTypes (the approximate by-family requirement). All
  // four exercised evaluateLegacyBroadMatch's two aircraft-bearing branches,
  // which no longer exist: an offer cannot state an aircraft requirement
  // approximately anymore, only exactly as a license+rating pair.
  //
  // The same-row invariant Case 5 guarded (a license and an aircraft only
  // count when held in the SAME technician_habilitations row — see CLAUDE.md)
  // is NOT left uncovered: it now lives exclusively in the exact path, where
  // "Matching — Case 2: no false combination across categories" above asserts
  // exactly that, and Case 5b's family-vs-engine coverage is Case 3's job.

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

  await test('Fase 2 — T1 (exact rating) awards the full habilitation weight (45)', () => {
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.habilitation, 45, 'T1 must award the full habilitation weight');
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
      result.breakdown.habilitation > 0 && result.breakdown.habilitation < 45,
      `T2 must award a partial habilitation weight strictly between 0 and 45, got ${result.breakdown.habilitation}`,
    );
    assert.ok(result.clarifications.some((c) => c.includes('Same family, different engine')));
  });

  await test('Fase 5.3 — T3 is GONE: a habilitation with no rating id awards zero, never approximate credit', () => {
    // This replaces the two former T3 tests ("legacy code match scores below
    // T2" and "T3 is family-based since migration 022"). The tier had one
    // possible input — the legacy aircraftTypeCode column — which migration
    // 029 drops. A row that names no catalog rating is now indistinguishable
    // from no evidence at all, and must never produce the 0.29 credit or the
    // "Approximate match without engine data" clarification T3 used to emit.
    const offer = makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'preferred')] });
    const technician = makeTechnician({ licenses: [makeLicense('B1.1')], habilitations: [makeHab('B1.1')] });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);

    assert.equal(result.breakdown.habilitation, 0, 'a rating-less habilitation must award zero habilitation credit');
    assert.ok(
      !result.clarifications.some((c) => c.includes('Approximate match without engine data')),
      'the T3 clarification must never be emitted again',
    );
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
      availability: { immediately: false, contractTypes: ['short_term'] },
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const perfectProfileNoRating = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
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
    assert.equal(result.breakdown.habilitation, 45, 'undefined experienceYears/isCurrent must not reduce the T1 score');
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

  // ── Fase 5.3 — broad-only match no longer scores like an exact one ────
  // Before this change evaluateLegacyBroadMatch's outcome awarded FULL
  // habilitation + license credit (35 + 20), identical to a confirmed
  // exact rating. The existing Case 5* tests only ever asserted
  // `level === 'legacy'`, never the score — which is exactly why this bug
  // survived: the branch had zero score coverage. These tests pin it.

  await test('Fase 5.3 — CHECKPOINT 2 band regression: an exact mandatory match still reaches Excellent (unchanged by the broad-branch rework)', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      minYearsExperience: 1,
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.level, 'exact');
    assert.equal(result.mandatoryMissing.length, 0);
    assert.equal(result.breakdown.habilitation, 45, 'exact match keeps the full habilitation weight');
    assert.ok(result.total >= 80, `exact match must stay in the Excellent band, got ${result.total}`);
    assert.equal(result.label, 'Excellent match');
  });

  // Fase 5 (2026-08-04) — the sibling test that asserted the
  // 'legacy_aircraft_confirmed' tier scored 26 (round(45 * 0.57)) is gone with
  // that tier: it could only ever be reached through requiredAircraftTypes.
  // 0.29 below and BROAD_ONLY_CAP are deliberately unchanged.

  await test('Fase 5 — a license-only requirement scores at the category fraction, with its own clarification', () => {
    const licenseOnlyOffer = makeOffer({ requiredLicenses: ['B1.1'] as any });
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const licenseOnly = calculateOfferTechnicianMatch(licenseOnlyOffer, technician, RATING_INDEX);
    assert.equal(licenseOnly.level, 'legacy');
    assert.equal(licenseOnly.breakdown.habilitation, 13, 'round(45 * 0.29) — BROAD_TIER_FRACTIONS.legacy_category_only');
    assert.equal(licenseOnly.breakdown.license, 20);
    assert.ok(
      licenseOnly.clarifications.includes('Category-only match — no specific aircraft requirement to verify.'),
      'the reduced score must be explained, not appear as an unexplained number',
    );
  });

  await test('Fase 5 — holding the category alone stays far below a confirmed exact rating for the same weight', () => {
    // The ordering the mission's business principle demands, now that the
    // approximate middle tier is gone: category-only (0.29) must never come
    // close to an exact rating (1.0) on the habilitation axis.
    const technician = makeTechnician({
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const categoryOnly = calculateOfferTechnicianMatch(
      makeOffer({ requiredLicenses: ['B1.1'] as any }), technician, RATING_INDEX,
    );
    const exact = calculateOfferTechnicianMatch(
      makeOffer({ requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] }), technician, RATING_INDEX,
    );
    assert.equal(exact.breakdown.habilitation, 45);
    assert.ok(
      exact.breakdown.habilitation > categoryOnly.breakdown.habilitation * 3,
      `an exact rating must dominate a category-only match, got ${exact.breakdown.habilitation} vs ${categoryOnly.breakdown.habilitation}`,
    );
  });

  await test('Fase 5.3 — a perfect broad-only match is capped below Excellent (BROAD_ONLY_CAP), and says why', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      minYearsExperience: 1,
      requiredLicenses: ['B1.1'] as any,
    });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      locationCityId: 'airport:TEST',
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.ok(result.total <= 79, `a broad-only match must never reach Excellent, got ${result.total}`);
    assert.notEqual(result.label, 'Excellent match');
    assert.ok(result.clarifications.includes('Category-only match — no specific aircraft requirement to verify.'));
  });

  await test('Fase 5.3 — applyScoreCeilings: most restrictive ceiling always wins, in any combination', () => {
    // `hasBlocker` joined this object when BLOCKER_CAP was added — the flags
    // param is deliberately all-required (a forgotten flag would silently
    // mean "no cap", and the ladder is most-restrictive-wins). Only the
    // fixture gained the field; every expectation below is unchanged.
    const none = { isBroadOnlyMatch: false, hasMandatoryUnmet: false, isZeroQualification: false, hasBlocker: false };
    assert.equal(applyScoreCeilings(100, none), 100, 'no ceiling applies to a confirmed exact match');
    assert.equal(applyScoreCeilings(100, { ...none, isBroadOnlyMatch: true }), 79);
    assert.equal(applyScoreCeilings(100, { ...none, hasMandatoryUnmet: true }), 59);
    assert.equal(applyScoreCeilings(100, { ...none, isZeroQualification: true }), 39);
    assert.equal(applyScoreCeilings(100, { ...none, hasBlocker: true }), 19);
    // Overlaps — the stricter one wins regardless of declaration order.
    assert.equal(
      applyScoreCeilings(100, { ...none, isBroadOnlyMatch: true, hasMandatoryUnmet: true }),
      59,
      'broad-only (79) + mandatory unmet (59) must land on 59, not 79',
    );
    assert.equal(applyScoreCeilings(100, { ...none, isBroadOnlyMatch: true, hasMandatoryUnmet: true, isZeroQualification: true }), 39);
    assert.equal(
      applyScoreCeilings(100, { isBroadOnlyMatch: true, hasMandatoryUnmet: true, isZeroQualification: true, hasBlocker: true }),
      19,
      'the blocker cap is the tightest rung — it wins over all three qualification ceilings',
    );
    // A ceiling never RAISES a score that was already below it.
    assert.equal(applyScoreCeilings(20, { ...none, isBroadOnlyMatch: true, hasMandatoryUnmet: true, isZeroQualification: true }), 20);
    assert.equal(applyScoreCeilings(5, { ...none, hasBlocker: true }), 5);
  });

  await test('Fase 5.3 — real overlap: a broad-only offer the technician cannot satisfy hits the stricter ceiling, not BROAD_ONLY_CAP', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      minYearsExperience: 1,
      requiredLicenses: ['B1.1'] as any,
    });
    const technician = makeTechnician({
      // Fase 5: the fixture used to hold B1.1 and fail on a separate aircraft
      // requirement. With the aircraft half gone, holding B1.1 would now be a
      // category match — so the technician holds a DIFFERENT category, which
      // is what "cannot satisfy" has to mean for a license-only offer.
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      licenses: [makeLicense('B2')],
      habilitations: [],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.habilitation, 0);
    assert.ok(result.total <= 39, `zero qualification must win over the broad ceiling, got ${result.total}`);
    assert.equal(result.label, 'Weak match');
  });

  // The needs_review labeling test that lived here is gone with T3 and with
  // the column itself (migration 029). It asserted that a flagged legacy row
  // scored identically to an unflagged one and only differed in its
  // clarification text — neither row shape can exist anymore.

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
    assert.equal(result.breakdown.habilitation, 45);
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
    assert.ok(result.breakdown.habilitation < 45 && result.breakdown.habilitation > 0, `expected a slight cut, got ${result.breakdown.habilitation}`);
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

  // ── resolveAircraftCategoryForFamilyKeys (Fase 5.3 — replaces the
  // deleted constants/aircraftTypes.ts's inferAircraftCategory() for
  // app/technician/offers/index.tsx's Airplane/Helicopter filter, now that
  // offer.requiredAircraftTypes stores family keys, migration 022) ──────

  await test('resolveAircraftCategoryForFamilyKeys — empty list is null, never a guessed category', () => {
    assert.equal(resolveAircraftCategoryForFamilyKeys(FIXTURES, []), null);
  });

  await test('resolveAircraftCategoryForFamilyKeys — a single Aeroplane family key resolves to "airplane"', () => {
    const key = getAircraftFamilyKey({ manufacturer: 'Airbus', aircraftFamily: 'A318/A319/A320/A321' });
    assert.equal(resolveAircraftCategoryForFamilyKeys(FIXTURES, [key]), 'airplane');
  });

  await test('resolveAircraftCategoryForFamilyKeys — a single Helicopter family key resolves to "helicopter"', () => {
    const key = getAircraftFamilyKey({ manufacturer: 'Leonardo', aircraftFamily: 'AW139' });
    assert.equal(resolveAircraftCategoryForFamilyKeys(FIXTURES, [key]), 'helicopter');
  });

  await test('resolveAircraftCategoryForFamilyKeys — mixing an Aeroplane and a Helicopter family key resolves to "mixed"', () => {
    const airplaneKey = getAircraftFamilyKey({ manufacturer: 'Boeing', aircraftFamily: '777' });
    const helicopterKey = getAircraftFamilyKey({ manufacturer: 'Leonardo', aircraftFamily: 'AW139' });
    assert.equal(resolveAircraftCategoryForFamilyKeys(FIXTURES, [airplaneKey, helicopterKey]), 'mixed');
  });

  await test('resolveAircraftCategoryForFamilyKeys — a family key not in the loaded catalog is never guessed into a category', () => {
    assert.equal(resolveAircraftCategoryForFamilyKeys(FIXTURES, ['Nonexistent::Family']), null);
  });

  await test('resolveAircraftCategoryForFamilyKeys — regression: the real live offer 922c1206\'s 3 helicopter family keys all resolve to "helicopter" (verified against rotoaxismatch-dev 2026-07-27)', () => {
    const ratings = [
      makeRating({ id: 'fx-as350', manufacturer: 'Airbus Helicopters', aircraftFamily: 'Eurocopter AS 350', productType: 'Helicopter', displayName: 'Eurocopter AS 350', commercialAliases: ['AS350'] }),
      makeRating({ id: 'fx-ec135', manufacturer: 'Airbus Helicopters', aircraftFamily: 'Eurocopter EC 135', productType: 'Helicopter', displayName: 'Eurocopter EC 135', commercialAliases: ['EC135'] }),
      makeRating({ id: 'fx-s76c', manufacturer: 'Sikorsky', aircraftFamily: 'Sikorsky S-76C', productType: 'Helicopter', displayName: 'Sikorsky S-76C', commercialAliases: ['S-76C'] }),
    ];
    const familyKeys = [
      'Airbus Helicopters::Eurocopter AS 350',
      'Airbus Helicopters::Eurocopter EC 135',
      'Sikorsky::Sikorsky S-76C',
    ];
    assert.equal(resolveAircraftCategoryForFamilyKeys(ratings, familyKeys), 'helicopter');
  });

  // ── getAircraftFamilyKey (migration 022) ─────────────────────────────
  // The three resolveLegacyCodeToFamilyKeys tests that lived here went with
  // the function itself (Fase 5.3) — nothing resolves a bare aircraft code
  // to a family anymore.

  await test('getAircraftFamilyKey matches the key getFamilies() groups by — never allowed to drift apart', () => {
    const groups = getFamilies(FIXTURES);
    const a320Group = groups.find((g) => g.aircraftFamily === 'A318/A319/A320/A321')!;
    assert.equal(getAircraftFamilyKey(FIXTURES.find((r) => r.id === 'fx-a320-cfm56')!), a320Group.key);
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
  // The five tests that lived here went with src/utils/aircraftRatingBackfillPlan.ts
  // and scripts/backfillLegacyAircraftRatings.ts (Fase 5.3, 2026-07-28).
  // They covered resolving a legacy aircraft code to a rating — mapped /
  // ambiguous / no_match / collision_avoided. With the aircraft_types
  // catalog retired outright there are no legacy codes left to resolve, so
  // the planner, the script and its npm entry are all gone.

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
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'pending', 'application'));
    assert.doesNotThrow(() => assertOfferRelationTransition('accepted', 'accepted', 'application'));
  });

  await test('assertOfferRelationTransition — pending can move to any terminal or accepted state', () => {
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'accepted', 'application'));
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'rejected', 'application'));
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'expired', 'application'));
    assert.doesNotThrow(() => assertOfferRelationTransition('pending', 'withdrawn', 'application'));
  });

  await test('assertOfferRelationTransition — terminal statuses never transition anywhere else (one-shot by design)', () => {
    assert.throws(() => assertOfferRelationTransition('accepted', 'rejected', 'application'));
    assert.throws(() => assertOfferRelationTransition('rejected', 'pending', 'application'));
    assert.throws(() => assertOfferRelationTransition('expired', 'accepted', 'application'));
  });

  await test('assertOfferRelationTransition — withdrawn -> pending SI se permite: retirarse no veta (2026-07-28)', () => {
    // Retirarse (el tecnico se echa atras) y ser rechazado (la empresa dice
    // no) son cosas distintas. Que la primera vetara de por vida era un
    // efecto colateral de H6, no una decision.
    assert.doesNotThrow(() => assertOfferRelationTransition('withdrawn', 'pending', 'application'));
  });

  await test('assertOfferRelationTransition — withdrawn NO puede saltar directamente a accepted ni a otro terminal', () => {
    // Reactivar devuelve la fila a 'pending' y desde ahi el flujo normal
    // decide. Nunca un atajo a aceptada.
    assert.throws(() => assertOfferRelationTransition('withdrawn', 'accepted', 'application'));
    assert.throws(() => assertOfferRelationTransition('withdrawn', 'rejected', 'application'));
    assert.throws(() => assertOfferRelationTransition('withdrawn', 'expired', 'application'));
  });

  await test('assertOfferRelationTransition — withdrawn->pending es SOLO para aplicaciones, nunca para ofertas directas', () => {
    // offer_applications tiene UNIQUE TOTAL (technician_id, offer_id): reactivar
    // es la unica via de volver a aplicar. offer_requests tiene un unico PARCIAL
    // sobre estados activos, asi que la empresa crea una fila nueva — reactivar
    // ahi seria maquinaria inalcanzable y chocaria con ese indice.
    assert.doesNotThrow(() => assertOfferRelationTransition('withdrawn', 'pending', 'application'));
    assert.throws(
      () => assertOfferRelationTransition('withdrawn', 'pending', 'direct_offer'),
      /send a new one instead/,
      'una oferta directa retirada NO se reactiva',
    );
  });

  await test('evaluateApplicationConflict — una aplicacion retirada NO bloquea: permite reactivar', () => {
    assert.equal(evaluateApplicationConflict(null, { status: 'withdrawn' }), null);
  });

  await test('evaluateApplicationConflict — rejected SIGUE bloqueando (asimetria deliberada)', () => {
    const msg = evaluateApplicationConflict(null, { status: 'rejected' });
    assert.ok(msg && msg.includes('decided'), `rejected debe bloquear con mensaje propio, got ${msg}`);
    assert.ok(evaluateApplicationConflict(null, { status: 'expired' }), 'expired tambien bloquea');
  });

  await test('evaluateApplicationConflict — una oferta directa activa bloquea la reactivacion de una retirada', () => {
    // El orden de las comprobaciones importa: si la empresa mando una oferta
    // directa DESPUES de la retirada, volver a aplicar sigue bloqueado.
    const msg = evaluateApplicationConflict({ status: 'pending' }, { status: 'withdrawn' });
    assert.ok(msg && msg.includes('direct offer'), `la oferta directa activa debe ganar, got ${msg}`);
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

  await test('evaluateApplicationConflict — rejected bloquea reapply; withdrawn ya NO (cambio 2026-07-28)', () => {
    // Este test afirmaba que withdrawn Y rejected bloqueaban por igual. Era
    // el efecto colateral de H6 que se corrigio: retirarse no veta.
    const withdrawn = evaluateApplicationConflict(undefined, { status: 'withdrawn' });
    const rejected = evaluateApplicationConflict(undefined, { status: 'rejected' });
    assert.equal(withdrawn, null, 'una retirada permite volver a aplicar (reactiva la fila)');
    assert.equal(rejected, 'You already applied to this offer previously — re-applying is not available once an application has been decided.');
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

  // ── Contract fit (antes "Availability") — B3, 2026-07-29 ──────────────
  await test('Contract fit — contract_types VACIO significa "abierto a cualquiera" y puntua COMPLETO', () => {
    const offer = makeOffer({ contractType: 'permanent' });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: [] },
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    const weights = getMatchScoreWeights(offer);
    assert.equal(result.breakdown.contractFit, weights.contractFit,
      'no declarar tipos de contrato es un campo OPCIONAL vacio: nunca debe penalizar');
  });

  await test('Contract fit — declarar tipos y que NINGUNO coincida es el unico caso que puntua cero', () => {
    const offer = makeOffer({ contractType: 'permanent' });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['short_term'] },
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.contractFit, 0);
  });

  await test('Contract fit — declarar un tipo que SI coincide puntua completo', () => {
    const offer = makeOffer({ contractType: 'permanent' });
    const technician = makeTechnician({
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['short_term', 'permanent'] },
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.equal(result.breakdown.contractFit, getMatchScoreWeights(offer).contractFit);
  });

  await test('Contract fit — la DISPONIBILIDAD no puntua: immediately no mueve el score', () => {
    const offer = makeOffer({ contractType: 'permanent' });
    const base = { verificationStatus: 'verified' as const, licenses: [], habilitations: [] };
    const abierto = makeTechnician({ ...base, availability: { immediately: true, contractTypes: ['permanent'] } });
    const cerrado = makeTechnician({ ...base, availability: { immediately: false, contractTypes: ['permanent'] } });
    const a = calculateOfferTechnicianMatch(offer, abierto, RATING_INDEX);
    const b = calculateOfferTechnicianMatch(offer, cerrado, RATING_INDEX);
    assert.equal(a.total, b.total,
      'la disponibilidad es filtro y etiqueta, nunca puntos: un estado binario no debe mover un ranking');
  });

  await test('Contract fit — Option A es NEUTRAL en bandas: no declarar puntua igual que declarar y coincidir', () => {
    // El invariante que importa, afirmado sin depender de que el catalogo de
    // localizaciones resuelva estas fixtures: la regla del conjunto vacio no
    // puede mover ninguna banda documentada, porque todas se midieron con
    // "perfil perfecto" — que ya incluia esta fila al maximo. Lo unico que
    // cambia es quien ANTES sacaba cero por no rellenar un campo opcional.
    const offer = makeOffer({
      contractType: 'permanent',
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const base = {
      verificationStatus: 'verified' as const,
      licenses: [makeLicense('B1.1')],
      habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
    };
    const sinDeclarar = calculateOfferTechnicianMatch(
      offer, makeTechnician({ ...base, availability: { immediately: true, contractTypes: [] } }), RATING_INDEX);
    const declarado = calculateOfferTechnicianMatch(
      offer, makeTechnician({ ...base, availability: { immediately: true, contractTypes: ['permanent'] } }), RATING_INDEX);
    assert.equal(sinDeclarar.total, declarado.total, 'la banda superior no debe depender de un campo opcional');
    assert.equal(sinDeclarar.label, declarado.label);
    assert.equal(sinDeclarar.label, 'Excellent match');
  });

  // ── Blockers — hard disqualifiers (BLOCKER_CAP = 19) ─────────────────
  // Distinct from mandatoryMissing: that one says the qualification evidence
  // is weak, these say the pair should not exist at all. Both rules live in
  // the pure function, never in a matchingV2.ts wrapper — see Case 8.

  const EXACT_A320 = {
    licenses: [makeLicense('B1.1')],
    habilitations: [makeHab('B1.1', { aircraftTypeRatingId: 'fx-a320-cfm56' })],
  };

  await test('Blockers — Case 1: right technician type + exact rating produces no blocker at all', () => {
    const offer = makeOffer({
      requiredTechnicianTypes: ['mechanic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({ technicianTypes: ['mechanic'], ...EXACT_A320 });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);
    assert.deepEqual(result.blockers, [], 'a matching type must never be a blocker');
    assert.equal(result.level, 'exact');
    assert.ok(
      result.matches.some((m) => m.includes('Mechanic')),
      'a satisfied type requirement must be surfaced by its catalog LABEL, never the raw code',
    );
    assert.ok(!result.matches.some((m) => m.includes('mechanic')), 'the raw code must not leak into user-facing text');
  });

  await test('Blockers — Case 2: wrong technician type blocks even with an exact rating, and caps the total at 19', () => {
    const offer = makeOffer({
      requiredTechnicianTypes: ['avionic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({ technicianTypes: ['mechanic'], ...EXACT_A320 });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);

    assert.equal(result.blockers.length, 1, 'exactly one blocker — the type');
    assert.ok(
      result.blockers[0].includes('Avionics Technician') && result.blockers[0].includes('Mechanic'),
      `the blocker must name both sides with catalog labels, got: ${result.blockers[0]}`,
    );
    assert.ok(result.total <= 19, `BLOCKER_CAP must apply, got ${result.total}`);
    // The qualification itself is untouched — a blocker caps the total, it
    // never rewrites the breakdown into a fake "no qualification" story.
    assert.equal(result.breakdown.habilitation, 45, 'the exact rating still scores in the breakdown');
    assert.equal(result.level, 'exact');
    assert.equal(result.mandatoryMissing.length, 0, 'a type blocker is not a missing qualification');
  });

  await test('Blockers — Case 3: an empty requiredTechnicianTypes does not restrict the type and leaves the score untouched', () => {
    const base = {
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    };
    const technician = makeTechnician({ technicianTypes: ['mechanic'], verificationStatus: 'verified', ...EXACT_A320 });
    const unrestricted = calculateOfferTechnicianMatch(makeOffer({ ...base, requiredTechnicianTypes: [] }), technician, RATING_INDEX);
    const restrictedAndMet = calculateOfferTechnicianMatch(
      makeOffer({ ...base, requiredTechnicianTypes: ['mechanic'] }),
      technician,
      RATING_INDEX,
    );

    assert.deepEqual(unrestricted.blockers, [], 'an offer that never named a type cannot disqualify one');
    assert.equal(unrestricted.total, restrictedAndMet.total, 'not restricting the type must score exactly like satisfying it');
    assert.equal(unrestricted.label, 'Excellent match');
    assert.ok(
      !unrestricted.matches.some((m) => m.startsWith('Technician type:')),
      'no match line either — claiming a match for a requirement the offer never stated is noise',
    );
  });

  // ── Fase 6 tanda B: la experiencia declarada NO puntúa (todavía) ──────
  //
  // Criterio de verificación de la tanda, escrito como test: "al desplegar B,
  // ningún score debe moverse". Que el scorer la mire es la Tanda E, y
  // depende del interruptor de certificación que llega en la C.
  await test('Experiencia sin licencia — declararla no mueve NI UN PUNTO del score', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      requiredTechnicianTypes: ['mechanic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const base = { technicianTypes: ['mechanic' as const], verificationStatus: 'verified' as const, ...EXACT_A320 };

    const sinExperiencia = makeTechnician(base);
    const conExperiencia = makeTechnician({
      ...base,
      aircraftExperience: [
        makeAircraftExperience('fx-a320-cfm56', 15),
        makeAircraftExperience('fx-b737-cfm56', 8),
        makeAircraftExperience('fx-ec135-arrius'),
      ],
    });

    const a = calculateOfferTechnicianMatch(offer, sinExperiencia, RATING_INDEX);
    const b = calculateOfferTechnicianMatch(offer, conExperiencia, RATING_INDEX);

    assert.equal(a.total, b.total, 'el total no puede moverse');
    assert.deepEqual(a.breakdown, b.breakdown, 'ni un solo componente del desglose');
    assert.deepEqual(a.matches, b.matches, 'ni aparecer como línea de match');
    assert.deepEqual(a.blockers, b.blockers, 'ni como blocker');
    assert.equal(a.label, b.label);
  });

  await test('Experiencia sin licencia — un perfil SIN NINGUNA licencia sigue puntuando como hoy', () => {
    // El caso que motiva la tanda: 15 años de A320 y cero licencias. Puede
    // DECLARARLO (eso es lo nuevo), pero frente a una oferta que exige
    // certificar sigue cayendo en ZERO_QUALIFICATION_CAP exactamente igual
    // que antes de existir la tabla. Si este número se mueve, la tanda B ha
    // tocado el scorer sin querer.
    const offer = makeOffer({
      requiredTechnicianTypes: ['mechanic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const sinNada = makeTechnician({ technicianTypes: ['mechanic'], verificationStatus: 'verified' });
    const soloExperiencia = makeTechnician({
      technicianTypes: ['mechanic'],
      verificationStatus: 'verified',
      aircraftExperience: [makeAircraftExperience('fx-a320-cfm56', 15)],
    });

    const a = calculateOfferTechnicianMatch(offer, sinNada, RATING_INDEX);
    const b = calculateOfferTechnicianMatch(offer, soloExperiencia, RATING_INDEX);
    assert.equal(a.total, b.total, 'declarar experiencia no rescata a quien no tiene la licencia');
    assert.ok(b.total <= 39, `ZERO_QUALIFICATION_CAP debe seguir aplicando, got ${b.total}`);
  });

  await test('Experiencia sin licencia — el modelo admite la regla de la Tanda E sin duplicar filas', () => {
    // NO se implementa aquí: sólo se comprueba que el modelo la PERMITE.
    // "Tener licencia en una aeronave cuenta también como experiencia en
    // ella, nunca al revés" se resuelve como unión de conjuntos sobre el
    // MISMO aircraft_type_rating_id, sin copiar ninguna fila a la otra tabla.
    const tecnico = makeTechnician({
      ...EXACT_A320, // habilitación B1.1 sobre fx-a320-cfm56
      aircraftExperience: [makeAircraftExperience('fx-b737-cfm56', 8)],
    });

    const union = new Set([
      ...tecnico.habilitations.map((h) => h.aircraftTypeRatingId),
      ...tecnico.aircraftExperience.map((e) => e.aircraftTypeRatingId),
    ]);
    assert.deepEqual([...union].sort(), ['fx-a320-cfm56', 'fx-b737-cfm56']);
    assert.equal(
      tecnico.aircraftExperience.length,
      1,
      'la habilitación NO se copia a la tabla de experiencia: la unión se calcula en lectura, no se persiste',
    );
  });

  // ── Fase 6 tanda A: varios tipos por técnico ──────────────────────────
  await test('Tipos múltiples — un técnico con dos tipos casa con las ofertas de AMBOS', () => {
    const base = { requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] };
    const dual = makeTechnician({
      technicianTypes: ['avionic', 'mechanic'],
      verificationStatus: 'verified',
      ...EXACT_A320,
    });

    for (const wanted of ['mechanic', 'avionic'] as const) {
      const result = calculateOfferTechnicianMatch(
        makeOffer({ ...base, requiredTechnicianTypes: [wanted] }),
        dual,
        RATING_INDEX,
      );
      assert.deepEqual(result.blockers, [], `un perfil que incluye "${wanted}" no puede quedar bloqueado`);
      assert.ok(
        result.matches.some((m) => m.startsWith('Technician type:')),
        `la línea de match del tipo debe aparecer para "${wanted}"`,
      );
    }

    // Y la otra mitad de la intersección: un tipo que NO tiene sigue
    // bloqueando. "Varios tipos" no puede degenerar en "casa con todo".
    const unrelated = calculateOfferTechnicianMatch(
      makeOffer({ ...base, requiredTechnicianTypes: ['painter'] }),
      dual,
      RATING_INDEX,
    );
    assert.equal(unrelated.blockers.length, 1, 'un tipo que no tiene sigue siendo blocker');
  });

  await test('Tipos múltiples — el score de un perfil de UN SOLO tipo no cambia respecto a hoy', () => {
    // El criterio de verificación de la tanda, escrito como test: añadir un
    // segundo tipo IRRELEVANTE para la oferta no puede mover ni un punto.
    const base = {
      contractType: 'permanent' as const,
      requiredTechnicianTypes: ['mechanic' as const],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    };
    const single = makeTechnician({ technicianTypes: ['mechanic'], verificationStatus: 'verified', ...EXACT_A320 });
    const withExtra = makeTechnician({
      technicianTypes: ['mechanic', 'painter'],
      verificationStatus: 'verified',
      ...EXACT_A320,
    });

    const a = calculateOfferTechnicianMatch(makeOffer(base), single, RATING_INDEX);
    const b = calculateOfferTechnicianMatch(makeOffer(base), withExtra, RATING_INDEX);
    assert.equal(a.total, b.total, 'un tipo extra irrelevante no puede mover el total');
    assert.deepEqual(a.breakdown, b.breakdown, 'ni el desglose');
    // La línea de match nombra SOLO lo que casa, no la lista entera.
    assert.deepEqual(a.matches, b.matches, 'la línea de match nombra sólo el tipo pedido, no los que sobran');
  });

  await test('Blockers — Case 4: fewer declared years than the offer minimum is a blocker (and exactly the minimum is not)', () => {
    const offer = makeOffer({ minYearsExperience: 5, requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });

    const below = calculateOfferTechnicianMatch(makeOffer({ ...offer }), makeTechnician({ yearsExperience: 2, ...EXACT_A320 }), RATING_INDEX);
    assert.equal(below.blockers.length, 1, 'a declared 2 against a required 5 must block');
    assert.ok(below.blockers[0].includes('5') && below.blockers[0].includes('2'), `blocker must state both numbers, got: ${below.blockers[0]}`);
    assert.ok(below.total <= 19, `BLOCKER_CAP must apply, got ${below.total}`);
    assert.equal(below.breakdown.habilitation, 45, 'experience still does not touch the breakdown — it blocks or it says nothing');

    const atMinimum = calculateOfferTechnicianMatch(offer, makeTechnician({ yearsExperience: 5, ...EXACT_A320 }), RATING_INDEX);
    assert.deepEqual(atMinimum.blockers, [], 'meeting the minimum exactly is meeting it — the comparison is strict "<"');
  });

  await test('Blockers — Case 5: NOT declaring years is never a blocker, however high the offer minimum (absent data never penalizes)', () => {
    const offer = makeOffer({ minYearsExperience: 5, requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    // yearsExperience left undefined — "not declared", deliberately distinct
    // from a declared 0. Same product rule the server-side prefilter encodes
    // as `years_experience.is.null OR >= N` (applyMinYearsFilter).
    const technician = makeTechnician({ verificationStatus: 'verified', ...EXACT_A320 });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);

    assert.deepEqual(result.blockers, [], 'an undeclared optional field must never disqualify');
    assert.equal(result.label, 'Excellent match', 'and it must not cap the score either');

    // A DECLARED 0 is a different fact and does block — the distinction is
    // the whole reason yearsExperience is nullable rather than defaulted.
    const declaredZero = calculateOfferTechnicianMatch(offer, makeTechnician({ yearsExperience: 0, ...EXACT_A320 }), RATING_INDEX);
    assert.equal(declaredZero.blockers.length, 1, 'a declared 0 is data, not absence of data');
  });

  await test('Blockers — Case 6: minYearsExperience = 0 means the offer sets no minimum, so nothing is evaluated', () => {
    const offer = makeOffer({ minYearsExperience: 0, requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')] });
    const undeclared = calculateOfferTechnicianMatch(offer, makeTechnician({ ...EXACT_A320 }), RATING_INDEX);
    assert.deepEqual(undeclared.blockers, []);
    const declaredZero = calculateOfferTechnicianMatch(offer, makeTechnician({ yearsExperience: 0, ...EXACT_A320 }), RATING_INDEX);
    assert.deepEqual(declaredZero.blockers, [], 'no minimum to fall below — 0 < 0 is false');
  });

  await test('Blockers — Case 7: a blocker plus zero qualification lands on the tightest ceiling (19), not the qualification one (39)', () => {
    const offer = makeOffer({
      contractType: 'permanent',
      requiredTechnicianTypes: ['avionic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({
      technicianTypes: ['mechanic'],
      verificationStatus: 'verified',
      availability: { immediately: true, contractTypes: ['permanent'] },
      licenses: [],
      habilitations: [],
    });
    const result = calculateOfferTechnicianMatch(offer, technician, RATING_INDEX);

    assert.equal(result.breakdown.habilitation, 0);
    assert.ok(result.blockers.length > 0);
    assert.ok(result.mandatoryMissing.length > 0, 'both mechanisms fire at once here — they are independent');
    // The raw sum is verified(15) + contractFit(15) = 30 at least, so
    // ZERO_QUALIFICATION_CAP (39) alone would not have reduced it at all.
    // Landing on 19 proves the blocker rung is what applied.
    assert.equal(result.total, 19, `expected BLOCKER_CAP to win over every qualification ceiling, got ${result.total}`);
    assert.equal(result.label, 'Weak match');
  });

  await test('Blockers — Case 8: the same pair evaluated in both directions yields identical blockers', () => {
    // Both matchingV2.ts wrappers (getTechnicianMatchesForOffer, company →
    // technicians; getOfferMatchesForTechnician, technician → offers) call
    // this same pure function — the wrappers are not imported here because
    // they pull in the Supabase repositories, which this standalone runner
    // deliberately has no connection for. The invariant under test is
    // exactly why both rules were implemented in the pure function instead
    // of in a wrapper: a rule added to one wrapper would apply to one
    // direction and to none of the ~12 direct call sites in app/.
    const offer = makeOffer({
      requiredTechnicianTypes: ['avionic'],
      minYearsExperience: 5,
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const technician = makeTechnician({ technicianTypes: ['mechanic'], yearsExperience: 2, ...EXACT_A320 });

    // Company side: one offer scored against a list of technicians.
    const companyDirection = [technician].map((t) => calculateOfferTechnicianMatch(offer, t, RATING_INDEX))[0];
    // Technician side: one technician scored against a list of offers.
    const technicianDirection = [offer].map((o) => calculateOfferTechnicianMatch(o, technician, RATING_INDEX))[0];

    assert.deepEqual(companyDirection.blockers, technicianDirection.blockers);
    assert.equal(companyDirection.total, technicianDirection.total);
    assert.equal(companyDirection.blockers.length, 2, 'both rules fire independently — wrong type AND too few declared years');
  });

  await test('Blockers — order: a blocked pair sinks to the bottom of the existing total-descending sort, with no special-casing', () => {
    // Verifies the claim BLOCKER_CAP relies on (matchingV2.ts sorts by
    // `b.score.total - a.score.total` and was deliberately NOT changed): at
    // 19, a blocked pair ranks below every unblocked one — including a
    // technician with zero qualification, whose own ceiling is 39.
    const offer = makeOffer({
      contractType: 'permanent',
      requiredTechnicianTypes: ['avionic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const blockedButPerfectlyQualified = makeTechnician({
      id: 'tech-blocked',
      technicianTypes: ['mechanic'], // the offer is for avionics
      verificationStatus: 'verified',
      ...EXACT_A320,
    });
    const eligibleButUnqualified = makeTechnician({
      id: 'tech-unqualified',
      technicianTypes: ['avionic'],
      verificationStatus: 'verified',
      licenses: [],
      habilitations: [],
    });

    const ranked = [blockedButPerfectlyQualified, eligibleButUnqualified]
      .map((t) => calculateOfferTechnicianMatch(offer, t, RATING_INDEX))
      .sort((a, b) => b.total - a.total); // the exact sort matchingV2.ts uses

    assert.equal(ranked[ranked.length - 1].technicianId, 'tech-blocked', 'the blocked pair must rank last on score alone');
    assert.ok(
      ranked[0].total > ranked[1].total,
      `an eligible-but-unqualified technician (${ranked[0].total}) must outrank a blocked one (${ranked[1].total})`,
    );
  });

  // ── Licensed vs non-licensed profiles ────────────────────────────────
  // EASA Part-66 licences and type ratings only exist for the types that
  // certify work. `requiresLicense` in the technician type catalog is the
  // single switch; these tests pin what reads it.

  await test('Licensed types — requiresLicense drives the split, per catalog row', () => {
    assert.equal(isLicensedTechnicianType('mechanic'), true);
    assert.equal(isLicensedTechnicianType('avionic'), true);
    assert.equal(isLicensedTechnicianType('pilot'), true, 'inactive in the pickers, but still a licensed type');
    assert.equal(isLicensedTechnicianType('sheet_metal_worker'), false);
    assert.equal(isLicensedTechnicianType('painter'), false);
    assert.equal(isLicensedTechnicianType('composite'), false);
  });

  await test('Licensed types — an unknown code is treated as licensed, never as a reason to hide a qualification section', () => {
    assert.equal(isLicensedTechnicianType('not_in_the_catalog'), true);
  });

  await test('Licensed types — an offer with no declared type does not restrict the Part-66 axis (current behaviour)', () => {
    assert.equal(offerTargetsLicensedProfiles({ requiredTechnicianTypes: [] }), true);
  });

  await test('Licensed types — an offer for non-licensed trades has no Part-66 axis; one licensed type is enough to keep it', () => {
    assert.equal(offerTargetsLicensedProfiles({ requiredTechnicianTypes: ['painter', 'composite'] }), false);
    assert.equal(offerTargetsLicensedProfiles({ requiredTechnicianTypes: ['mechanic'] }), true);
    assert.equal(
      offerTargetsLicensedProfiles({ requiredTechnicianTypes: ['painter', 'mechanic'] }),
      true,
      'a mixed row (only possible from data predating the rule) must keep its requirements visible, not hide them',
    );
  });

  await test('Type selection — mixing a licensed and a non-licensed type is refused with a message, selection unchanged', () => {
    const plan = planOfferTechnicianTypeToggle({ current: ['mechanic'], code: 'painter', part66RequirementCount: 0 });
    assert.deepEqual(plan.next, ['mechanic'], 'a refused tap must not alter the selection');
    assert.ok(plan.error && plan.error.includes('Painter') && plan.error.includes('Mechanic'), plan.error ?? 'expected an error');
  });

  await test('Type selection — going non-licensed with Part-66 requirements still on the form is refused, not silently cleared', () => {
    const plan = planOfferTechnicianTypeToggle({ current: [], code: 'painter', part66RequirementCount: 2 });
    assert.deepEqual(plan.next, []);
    assert.ok(plan.error && plan.error.includes('2'), 'the message must say how many requirements are in the way');

    const clean = planOfferTechnicianTypeToggle({ current: [], code: 'painter', part66RequirementCount: 0 });
    assert.deepEqual(clean.next, ['painter']);
    assert.equal(clean.error, undefined);
  });

  await test('Type selection — deselecting is always allowed, even when it would otherwise be refused', () => {
    // Otherwise a company that reached a mixed state (older data) could
    // never get out of it: every tap refused, including the undo.
    const plan = planOfferTechnicianTypeToggle({ current: ['painter', 'mechanic'], code: 'painter', part66RequirementCount: 5 });
    assert.deepEqual(plan.next, ['mechanic']);
    assert.equal(plan.error, undefined);
  });

  await test('Type selection — several types of the same family stack normally', () => {
    const first = planOfferTechnicianTypeToggle({ current: ['mechanic'], code: 'avionic', part66RequirementCount: 3 });
    assert.deepEqual(first.next, ['mechanic', 'avionic']);
    const second = planOfferTechnicianTypeToggle({ current: ['painter'], code: 'composite', part66RequirementCount: 0 });
    assert.deepEqual(second.next, ['painter', 'composite']);
  });

  await test('Copy — a non-licensed offer reads "General compatibility", never a technical match label', () => {
    const score = calculateOfferTechnicianMatch(
      makeOffer({ requiredTechnicianTypes: ['painter'] }),
      makeTechnician({ technicianTypes: ['painter'], verificationStatus: 'verified' }),
      RATING_INDEX,
    );
    assert.equal(
      getMatchDisplayLabel({ requiredTechnicianTypes: ['painter'] }, score),
      GENERAL_COMPATIBILITY_LABEL,
      'nothing about the technician\'s qualification was confirmed, because there was nothing to confirm',
    );
    // The scoring itself is untouched — it already lands in the
    // no-requirements branch on its own, which is why this is copy only.
    assert.equal(score.breakdown.habilitation, 0);
    assert.equal(score.breakdown.license, 0);
    assert.ok(score.total <= 75, `the no-requirements ceiling still applies, got ${score.total}`);
  });

  await test('Copy — a licensed offer keeps its real band label', () => {
    const offer = makeOffer({
      requiredTechnicianTypes: ['mechanic'],
      requiredHabilitations: [makeHabReq('B1.1', 'fx-a320-cfm56', 'mandatory')],
    });
    const score = calculateOfferTechnicianMatch(
      offer,
      makeTechnician({ technicianTypes: ['mechanic'], verificationStatus: 'verified', ...EXACT_A320 }),
      RATING_INDEX,
    );
    assert.equal(getMatchDisplayLabel(offer, score), score.label);
    assert.equal(score.label, 'Excellent match');
    // An offer that names no type at all is unchanged too.
    assert.equal(getMatchDisplayLabel(makeOffer({}), score), score.label);
  });

  // ── Years of experience: required at signup, never erasable ──────────

  await test('Years — signup with no years declared is rejected client-side', () => {
    assert.ok(validateSignupYearsExperience(''), 'an empty field must be rejected');
    assert.ok(validateSignupYearsExperience('   '), 'whitespace is still empty');
    assert.equal(parseYearsExperience(''), null, 'and it never parses into a number');
  });

  await test('Years — signup with 0 years is ACCEPTED: 0 is a declaration, not a blank', () => {
    assert.equal(validateSignupYearsExperience('0'), null);
    assert.equal(parseYearsExperience('0'), 0, 'must be the number 0, never null — null would mean "not declared"');
  });

  await test('Years — saving the profile with the years field emptied is rejected', () => {
    assert.ok(validateProfileYearsExperience(''), 'a technician must not be able to erase it back to "not declared"');
    assert.equal(validateProfileYearsExperience('0'), null, 'but 0 is still a valid answer here too');
    assert.equal(validateProfileYearsExperience('8'), null);
  });

  await test('Years — the accepted range matches chk_technician_years_experience_range (0..70)', () => {
    assert.equal(parseYearsExperience('70'), 70);
    assert.equal(parseYearsExperience('71'), null);
    assert.equal(parseYearsExperience('99'), null);
    assert.equal(parseYearsExperience('-1'), null);
    assert.equal(parseYearsExperience('8 years'), null, 'a typo is not a declaration');
    assert.equal(parseYearsExperience('4.5'), null, 'the column is an integer');
    assert.equal(parseYearsExperience('  5  '), 5, 'surrounding whitespace is tolerated');
  });

  // ── Fase 6 tanda A: licencias huérfanas al quitar un tipo ─────────────
  await test('Huérfanas — quitar "mechanic" conservando "avionic": B1.3 entra, B2 no', () => {
    // El ejemplo exacto de la decisión del 2026-08-10.
    assert.deepEqual(
      findOrphanedLicenses(['B1.3', 'B2'], ['mechanic', 'avionic'], ['avionic']),
      ['B1.3'],
    );
  });

  await test('Huérfanas — C no tiene rama y NUNCA queda huérfana, con ninguna combinación de tipos', () => {
    // C es supervisión de mantenimiento base: la sostienen tanto perfiles B1
    // como B2. Asignarle una rama la declararía huérfana al quitar esa rama
    // cuando la otra sigue sosteniéndola. Si alguien se la asigna "para
    // completar el mapa", este test se cae — que es el punto.
    const combinaciones: [string[], string[]][] = [
      [['mechanic', 'avionic'], ['painter']],
      [['mechanic'], ['avionic']],
      [['avionic'], ['mechanic']],
      [['mechanic', 'avionic'], ['mechanic']],
      [['mechanic', 'avionic'], ['avionic']],
    ];
    for (const [previos, siguientes] of combinaciones) {
      assert.deepEqual(
        findOrphanedLicenses(['C'], previos, siguientes),
        [],
        `C no puede quedar huérfana pasando de ${previos} a ${siguientes}`,
      );
    }
  });

  await test('Huérfanas — A1–A4, B3 y L son rama mecánica y sí entran', () => {
    // A1–A4 van con su B1 correspondiente, B3 es mecánico de pistón, y L
    // (light aircraft) es trabajo de célula y motor. Corrección del
    // 2026-08-10 sobre un primer reparto que los dejaba sin rama.
    assert.deepEqual(
      findOrphanedLicenses(['A1', 'A2', 'A3', 'A4', 'B3', 'L'], ['mechanic'], ['painter']),
      ['A1', 'A2', 'A3', 'A4', 'B3', 'L'],
    );
  });

  await test('Huérfanas — quitar el último tipo licenciado arrastra todo menos C', () => {
    assert.deepEqual(
      findOrphanedLicenses(['B1.1', 'B2', 'C', 'L'], ['mechanic', 'avionic'], ['painter']),
      ['B1.1', 'B2', 'L'],
    );
  });

  await test('Huérfanas — sin tipos quitados, o sin licencias afectadas, no se pregunta nada', () => {
    // AÑADIR un tipo nunca dispara la pregunta.
    assert.deepEqual(findOrphanedLicenses(['B1.1'], ['mechanic'], ['mechanic', 'painter']), []);
    // Quitar un tipo que no reclama ninguna licencia tampoco.
    assert.deepEqual(findOrphanedLicenses(['B1.1'], ['mechanic', 'painter'], ['mechanic']), []);
    // Ni quitar un tipo cuando el técnico no tiene esas licencias.
    assert.deepEqual(findOrphanedLicenses(['B2'], ['mechanic', 'avionic'], ['avionic']), []);
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
