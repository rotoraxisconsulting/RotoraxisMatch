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
import { Company, CompanyProfile } from '../types/company';
import { TechnicianDocument, Document } from '../types/document';
import { SafeTechnicianPreview, UnlockedTechnicianView } from '../types/privacy';
import { OfferRequest } from '../types/offerRequest';
import { MatchRequest, MatchRequestStatus } from '../types/matchRequest';

// ---------------------------------------------------------------------------
// Availability helpers
// ---------------------------------------------------------------------------

/**
 * Derive V1 AvailabilityStatus from a V2 Availability object.
 * V2 uses `immediately: boolean`; V1 screens read `availability.status`.
 */
export function deriveAvailabilityStatus(avail: Availability): AvailabilityStatus {
  if (avail.immediately) return 'available';
  if (avail.availableFrom) return 'open_to_offers';
  return 'unavailable';
}

/**
 * Merge V2 availability with the V1 `status` field so both APIs work on the
 * same object. Existing screens read `availability.status`; new code reads
 * `availability.immediately`.
 */
function withStatus(avail: Availability): Availability {
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
// SafeTechnicianPreview  →  SafeTechnicianView (anonymous, no identity)
// ---------------------------------------------------------------------------

/**
 * Convert a V2 SafeTechnicianPreview to the V1 SafeTechnicianView shape.
 *
 * Safe for company views before acceptance:
 * - No firstName, lastName, email, phone
 * - No matchingScore (general search has no offer context)
 */
export function v2SafePreviewToSafeView(preview: SafeTechnicianPreview): SafeTechnicianView {
  return {
    id: preview.id,
    anonymousCode: preview.anonymousCode,
    country: preview.country,
    city: preview.city,
    baseAirport: preview.baseAirport ?? '',
    latitude: 0,
    longitude: 0,
    licenseCategories: preview.licenses,
    aircraftTypes: [...new Set(preview.habilitations.map((h) => h.aircraftTypeCode))],
    specialties: [],
    availability: withStatus(preview.availability),
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
export function v2UnlockedViewToSafeView(view: UnlockedTechnicianView): SafeTechnicianView {
  return {
    ...v2SafePreviewToSafeView(view),
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
export function v2TechnicianToV1(tech: TechnicianWithRelations): Technician {
  return {
    id: tech.id,
    anonymousCode: tech.anonymousCode,
    fullName: `${tech.firstName} ${tech.lastName}`,
    email: tech.email,
    phone: tech.phone ?? '',
    country: tech.country,
    city: tech.city,
    baseAirport: tech.baseAirport ?? '',
    latitude: tech.latitude ?? 0,
    longitude: tech.longitude ?? 0,
    licenseCategories: tech.licenses.map((l) => l.licenseCode),
    aircraftTypes: [...new Set(tech.habilitations.map((h) => h.aircraftTypeCode))],
    specialties: [],
    availability: withStatus(tech.availability),
    verificationStatus: tech.verificationStatus,
    profileCompleteness: tech.profileCompleteness,
    yearsExperience: computeYearsExperience(tech.aircraftExperience),
  };
}

// ---------------------------------------------------------------------------
// V1 Partial<Technician> patch  →  V2 TechnicianProfile patch (for updateProfile)
// ---------------------------------------------------------------------------

/**
 * Convert a V1 Partial<Technician> patch (from the edit profile screen) to a
 * V2 TechnicianProfile patch suitable for technicianRepositoryV2.update().
 *
 * fullName is split on the first space: "Carlos Rivera" → { firstName: "Carlos", lastName: "Rivera" }.
 * Fields that have no direct V2 equivalent (specialties, licenseCategories,
 * aircraftTypes) are silently ignored — they are managed as separate
 * relation records in V2 and cannot be patched this way.
 */
export function applyV1PatchToV2Profile(
  patch: Partial<Technician>,
  existingProfile: TechnicianProfile,
): Partial<Omit<TechnicianProfile, 'id' | 'userId' | 'createdAt'>> {
  const v2: Partial<Omit<TechnicianProfile, 'id' | 'userId' | 'createdAt'>> = {};

  if (patch.fullName !== undefined) {
    const parts = patch.fullName.trim().split(/\s+/);
    v2.firstName = parts[0] ?? '';
    v2.lastName = parts.slice(1).join(' ') || existingProfile.lastName;
  }
  if (patch.phone !== undefined) v2.phone = patch.phone || undefined;
  if (patch.city !== undefined) v2.city = patch.city;
  if (patch.country !== undefined) v2.country = patch.country;
  if (patch.baseAirport !== undefined) v2.baseAirport = patch.baseAirport || undefined;
  if (patch.latitude !== undefined) v2.latitude = patch.latitude;
  if (patch.longitude !== undefined) v2.longitude = patch.longitude;
  if (patch.availability !== undefined) v2.availability = patch.availability;
  if (patch.verificationStatus !== undefined) v2.verificationStatus = patch.verificationStatus;
  if (patch.profileCompleteness !== undefined) v2.profileCompleteness = patch.profileCompleteness;

  return v2;
}

// ---------------------------------------------------------------------------
// CompanyProfile  →  Company (V1 compat)
// ---------------------------------------------------------------------------

/**
 * Convert a V2 CompanyProfile to the V1 Company shape.
 * V2 has no `website` field — it is set to an empty string.
 */
export function v2CompanyToV1(c: CompanyProfile): Company {
  return {
    id: c.id,
    companyName: c.name,
    country: c.country,
    city: c.city,
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

/** Strip V2-only fields (storagePath, verifiedAt, verifiedBy, expiresAt). */
export function v2DocumentToV1(doc: Document): TechnicianDocument {
  return {
    id: doc.id,
    technicianId: doc.technicianId,
    type: doc.type,
    fileName: doc.fileName,
    status: doc.status,
    uploadedAt: doc.uploadedAt,
  };
}
