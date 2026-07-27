/**
 * V1-compatibility adapters for V2 data shapes.
 *
 * These are temporary bridges so existing V1 screens continue to work while
 * the hooks are migrated to V2 repositories internally.
 *
 * Remove each function as the screen that depends on it is migrated to V2 types.
 *
 * IMPORTANT: Never use these adapters to expose private fields before
 * status === 'accepted'. The callers are responsible for calling the right
 * adapter (safe vs unlocked).
 */

import {
  AvailabilityStatus,
  Availability,
  Technician,
  SafeTechnicianView,
  TechnicianAircraftExperience,
  TechnicianWithRelations,
  TechnicianProfile,
} from '../types/technician';
import { Company, CompanyProfile, CompanyProfileView } from '../types/company';
import { TechnicianDocument, Document } from '../types/document';
import { SafeTechnicianPreview, UnlockedTechnicianView } from '../types/privacy';
import { OfferRequest } from '../types/offerRequest';
import { MatchRequest, MatchRequestStatus } from '../types/matchRequest';
import { resolveLocationSnapshot } from '../constants/locationCities';
import { AircraftRatingIndex } from '../constants/aircraftTypeRatings';
import { TechnicianHabilitation } from '../types/technician';
import { AircraftTypeRatingCatalog } from '../types/catalog';

// A habilitation may now be rating-only (aircraftTypeCode undefined). For
// V1-shaped flat lists we fall back to the rating's aircraft family so
// legacy screens still see *some* aircraft label instead of `undefined`.
// ratingIndex is loaded by the caller (via catalogRepository /
// useAircraftTypeRatingsCatalog) — this stays a pure function, never a
// Supabase call of its own.
export function habilitationAircraftCodes(habilitations: TechnicianHabilitation[], ratingIndex: AircraftRatingIndex): string[] {
  const codes = new Set<string>();
  for (const h of habilitations) {
    if (h.aircraftTypeCode) codes.add(h.aircraftTypeCode);
    else if (h.aircraftTypeRatingId) {
      const rating = ratingIndex.get(h.aircraftTypeRatingId);
      if (rating) codes.add(rating.aircraftFamily);
    }
  }
  return [...codes];
}

// Fase 3b screens 3-4 — "Type ratings" labels (renamed from "Aircraft"),
// showing each EXACT rating's catalog displayName instead of the family/
// legacy-code strings habilitationAircraftCodes() above returns. Legacy
// habilitations (aircraftTypeCode only, no rating id) have no exact rating
// to show and are skipped — same as TypeRatingRequirementsEditor/
// HabilitationsEditor. Shared by search.tsx and the map (native + web) so
// both render the same labels from the same rule, never two independent
// copies.
export function resolveTypeRatingLabels(habilitations: TechnicianHabilitation[], ratingIndex: AircraftRatingIndex): string[] {
  const labels = new Set<string>();
  habilitations.forEach((h) => {
    if (!h.aircraftTypeRatingId) return;
    const rating = ratingIndex.get(h.aircraftTypeRatingId);
    if (rating) labels.add(rating.displayName);
  });
  return [...labels];
}

// Airplane/Helicopter/Mixed badge, derived from the 606-row catalog's own
// productType field — never a hardcoded aircraft category lookup. A
// habilitation with no resolvable rating, or a rating whose productType
// hasn't been backfilled, contributes nothing (never guessed).
export function resolveTechnicianProductTypes(
  habilitations: TechnicianHabilitation[],
  ratingIndex: AircraftRatingIndex,
): Set<NonNullable<AircraftTypeRatingCatalog['productType']>> {
  const types = new Set<NonNullable<AircraftTypeRatingCatalog['productType']>>();
  habilitations.forEach((h) => {
    if (!h.aircraftTypeRatingId) return;
    const productType = ratingIndex.get(h.aircraftTypeRatingId)?.productType;
    if (productType) types.add(productType);
  });
  return types;
}

// ---------------------------------------------------------------------------
// Availability helpers
// ---------------------------------------------------------------------------

/**
 * Derive V1 AvailabilityStatus from a V2 Availability object.
 * V2 uses `immediately: boolean`; V1 screens read `availability.status`.
 * During the migration, an explicit `status` may already exist on locally
 * edited profiles. Prefer it so "open_to_offers" can stand without a date.
 */
export function deriveAvailabilityStatus(avail: Availability): AvailabilityStatus {
  if (
    avail.status === 'available' ||
    avail.status === 'open_to_offers' ||
    avail.status === 'unavailable'
  ) {
    return avail.status;
  }
  if (avail.immediately) return 'available';
  if (avail.availableFrom) return 'open_to_offers';
  return 'unavailable';
}

/**
 * Merge V2 availability with the V1 `status` field so both APIs work on the
 * same object. Existing screens read `availability.status`; new code reads
 * `availability.immediately`.
 */
export function withAvailabilityStatus(avail: Availability): Availability {
  return { ...avail, status: deriveAvailabilityStatus(avail) };
}

// ---------------------------------------------------------------------------
// Experience helpers
// ---------------------------------------------------------------------------

/**
 * Compute a single yearsExperience number from a V2 aircraft-experience array.
 * Uses the maximum across all entries (hours converted at 2000 h/year).
 */
export function computeYearsExperience(experience: TechnicianAircraftExperience[]): number {
  if (!experience.length) return 0;
  return Math.max(
    0,
    ...experience.map((e) => (e.unit === 'years' ? e.value : Math.round(e.value / 2000))),
  );
}

// ---------------------------------------------------------------------------
// Location helpers
// ---------------------------------------------------------------------------

function compatLocation(reference: {
  locationCityId?: string;
  country?: string;
  city?: string;
  baseAirport?: string;
}) {
  const resolved = resolveLocationSnapshot(reference);

  return {
    locationCityId: resolved?.locationCityId ?? reference.locationCityId,
    country: resolved?.country ?? reference.country ?? '',
    city: resolved?.city ?? reference.city ?? '',
    baseAirport: resolved?.baseAirport ?? reference.baseAirport ?? '',
    latitude: resolved?.latitude,
    longitude: resolved?.longitude,
  };
}

// ---------------------------------------------------------------------------
// SafeTechnicianPreview  →  SafeTechnicianView (anonymous, no identity)
// ---------------------------------------------------------------------------

/**
 * Convert a V2 SafeTechnicianPreview to the V1 SafeTechnicianView shape.
 *
 * Safe for company views before acceptance:
 * - No firstName, lastName, email, phone
 * - No matchingScore (general search has no offer context)
 */
export function v2SafePreviewToSafeView(preview: SafeTechnicianPreview, ratingIndex: AircraftRatingIndex): SafeTechnicianView {
  const location = compatLocation(preview);

  return {
    id: preview.id,
    anonymousCode: preview.anonymousCode,
    locationCityId: location.locationCityId,
    country: location.country,
    city: location.city,
    baseAirport: location.baseAirport,
    latitude: location.latitude,
    longitude: location.longitude,
    licenseCategories: preview.licenses,
    aircraftTypes: habilitationAircraftCodes(preview.habilitations, ratingIndex),
    specialties: [],
    availability: withAvailabilityStatus(preview.availability),
    verificationStatus: preview.verificationStatus,
    profileCompleteness: 0,
    yearsExperience: computeYearsExperience(preview.aircraftExperience),
    // matchingScore intentionally omitted — no offer context in general search
  };
}

// ---------------------------------------------------------------------------
// UnlockedTechnicianView  →  SafeTechnicianView (identity visible)
// ---------------------------------------------------------------------------

/**
 * Convert a V2 UnlockedTechnicianView (post-acceptance) to SafeTechnicianView.
 * Only call this after canRevealIdentity() returns true.
 */
export function v2UnlockedViewToSafeView(view: UnlockedTechnicianView, ratingIndex: AircraftRatingIndex): SafeTechnicianView {
  return {
    ...v2SafePreviewToSafeView(view, ratingIndex),
    fullName: `${view.firstName} ${view.lastName}`,
    email: view.email,
    phone: view.phone,
  };
}

// ---------------------------------------------------------------------------
// TechnicianWithRelations  →  Technician (own profile or admin — identity always shown)
// ---------------------------------------------------------------------------

/**
 * Convert a full V2 TechnicianWithRelations to the V1 Technician type.
 * Always reveals identity — only call for own-profile or admin views.
 */
export function v2TechnicianToV1(tech: TechnicianWithRelations, ratingIndex: AircraftRatingIndex): Technician {
  const location = compatLocation(tech);

  return {
    id: tech.id,
    anonymousCode: tech.anonymousCode,
    fullName: `${tech.firstName} ${tech.lastName}`,
    email: tech.email,
    phone: tech.phone ?? '',
    locationCityId: location.locationCityId,
    country: location.country,
    city: location.city,
    baseAirport: location.baseAirport,
    latitude: location.latitude,
    longitude: location.longitude,
    licenseCategories: tech.licenses.map((l) => l.licenseCode),
    aircraftTypes: habilitationAircraftCodes(tech.habilitations, ratingIndex),
    specialties: [],
    availability: withAvailabilityStatus(tech.availability),
    verificationStatus: tech.verificationStatus,
    profileCompleteness: tech.profileCompleteness,
    yearsExperience: computeYearsExperience(tech.aircraftExperience),
  };
}

// ---------------------------------------------------------------------------
// CompanyProfile  →  Company (V1 compat)
// ---------------------------------------------------------------------------

/**
 * Convert a V2 CompanyProfile to the V1 Company shape.
 * V2 has no `website` field — it is set to an empty string.
 */
export function v2CompanyToV1(c: CompanyProfile | CompanyProfileView): Company {
  const location = compatLocation(c);

  return {
    id: c.id,
    companyName: c.name,
    locationCityId: location.locationCityId,
    country: location.country,
    city: location.city,
    website: '',
    companyType: c.companyType, // CompanyTypeCode ⊂ CompanyType union
    verificationStatus: c.verificationStatus,
    contactEmail: c.email,
  };
}

// ---------------------------------------------------------------------------
// OfferRequest  →  MatchRequest (V1 compat)
// ---------------------------------------------------------------------------

/**
 * Convert a V2 OfferRequest to the V1 MatchRequest shape for existing screens.
 *
 * Status mapping (V2 → V1):
 *   pending    → sent       (V1 screens filter by status === 'sent' for pending tab)
 *   accepted   → accepted
 *   rejected / expired / withdrawn → rejected
 *
 * This mapping is ONLY for V1 screen compatibility. V2 repositories always use
 * V2 status values internally. Never store the mapped status back to the DB.
 */
export function v2OfferRequestToMatchRequest(req: OfferRequest): MatchRequest {
  let status: MatchRequestStatus;
  if (req.status === 'pending') status = 'sent';
  else if (req.status === 'accepted') status = 'accepted';
  else status = 'rejected';

  return {
    id: req.id,
    companyId: req.companyId,
    technicianId: req.technicianId,
    status,
    identityRevealed: req.identityRevealed,
    createdAt: req.createdAt,
    message: req.message,
  };
}

// ---------------------------------------------------------------------------
// Document  →  TechnicianDocument (V1 compat)
// ---------------------------------------------------------------------------

/**
 * Strip storage and admin-internal V2 fields (storagePath, reviewedAt) that V1
 * screens don't need. Pass through expiresAt and rejectionReason so technician
 * screens can access them via the existing typecast pattern.
 */
export function v2DocumentToV1(doc: Document): TechnicianDocument {
  const result: TechnicianDocument = {
    id: doc.id,
    technicianId: doc.technicianId,
    type: doc.type,
    fileName: doc.fileName,
    status: doc.status,
    uploadedAt: doc.uploadedAt,
  };
  // Pass through display fields used by technician screens via typecast.
  // These are not on TechnicianDocument's TypeScript type but exist at runtime.
  if (doc.expiresAt !== undefined) (result as any).expiresAt = doc.expiresAt;
  if (doc.rejectionReason !== undefined) (result as any).rejectionReason = doc.rejectionReason;
  return result;
}
