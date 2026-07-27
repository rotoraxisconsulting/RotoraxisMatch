import { VerificationStatus } from './enums'; // owned by enums.ts — not re-exported here
import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';

// --- V1 compat types ---

// Corrected 2026-07-27 (docs/PHASE5_INVENTORY.md item f): this was marked as
// legacy on the assumption that `immediately: boolean` would replace it. It
// doesn't — `immediately` is a LOSSY one-way projection of `status`
// (v2CompatAdapters.ts: 'available'->true, but 'open_to_offers' AND
// 'unavailable' both collapse to false), not an equivalent. The 3-state
// filter this type backs (available/open_to_offers/unavailable) is an
// active Fase 3b product feature — technicianRepositoryV2.search()'s
// availabilityStatuses filter, used live by both the search and map
// screens. `status` is the source of truth; `immediately` is a derived
// convenience for the "available right now" case only. Confirmed staying
// — not legacy, not a Fase 5 cleanup target.
export type AvailabilityStatus = 'available' | 'open_to_offers' | 'unavailable';

// `immediately` (V2) and `status` (V2, see the correction above — NOT V1
// legacy despite the historical field name) coexist on purpose: `status`
// is the source of truth for the 3-state availability facet, `immediately`
// is a derived boolean convenience for a single common filter case.
export interface Availability {
  immediately?: boolean;
  status?: AvailabilityStatus;
  availableFrom?: string;
  // Fase 5.3 — narrowed from (ContractType | ContractTypeCode)[] now that
  // the V1 ContractType half (deleted, zero real consumers confirmed) is
  // gone. Every write path (app/technician/profile.tsx) already only ever
  // produces ContractTypeCode values via constants/contractTypes.ts's
  // CONTRACT_TYPES; this is a type-level correction, not a runtime change
  // — old persisted JSON isn't affected either way.
  contractTypes: ContractTypeCode[];
}

/**
 * V1-shaped type, kept alive on purpose via v2CompatAdapters.ts
 * (v2TechnicianToV1). This is the real, working form-state shape behind
 * app/technician/profile.tsx (the entire technician profile screen) and
 * the admin dashboard/technician-list screens today — NOT dead code and
 * NOT safely deletable as a quick cleanup (confirmed by consumer grep,
 * docs/PHASE5_INVENTORY.md item c, 2026-07-26). Retiring it in favor of
 * TechnicianProfile everywhere is tracked as its own future mission ("V2 UI
 * migration — retire v2CompatAdapters", see docs/MISSION_PART66.md
 * backlog), not part of the Part-66 coherence mission's Fase 5.
 */
export interface Technician {
  id: string;
  anonymousCode: string;
  fullName: string;
  email: string;
  phone: string;
  locationCityId?: string;
  country: string;
  city: string;
  baseAirport: string;
  latitude?: number;
  longitude?: number;
  licenseCategories: string[];
  aircraftTypes: string[];
  specialties: string[];
  availability: Availability;
  verificationStatus: VerificationStatus;
  profileCompleteness: number;
  yearsExperience: number;
}

/**
 * V1-shaped type, kept alive on purpose via v2CompatAdapters.ts
 * (v2SafePreviewToSafeView / v2UnlockedViewToSafeView). This is the real,
 * working shape behind company/search.tsx, both map implementations
 * (TechnicianMap.native.tsx / TechnicianMapLeafletImpl.tsx),
 * useCompanyDashboard.ts, useMapTechnicians.ts, and useTechnicianSearch.ts
 * today — NOT dead code and NOT safely deletable as a quick cleanup
 * (consumer grep refreshed after the dead V1 cards/modals were removed,
 * 2026-07-27). Retiring it in favor of
 * SafeTechnicianPreview/UnlockedTechnicianView (privacy.ts) everywhere is
 * tracked as its own future mission ("V2 UI migration — retire
 * v2CompatAdapters", see docs/MISSION_PART66.md backlog), not part of the
 * Part-66 coherence mission's Fase 5.
 */
export type SafeTechnicianView = Omit<Technician, 'fullName' | 'email' | 'phone'> & {
  matchingScore?: number;
  fullName?: string;
  email?: string;
  phone?: string;
};

// --- V2 types ---

export interface TechnicianLicense {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

// A habilitation row always carries an explicit licenseCode — category and
// aircraft/rating are never inferred by combining independent lists.
//
// aircraftTypeRatingId: normalized exact aircraft+engine rating (FK into
//   aircraft_type_ratings, e.g. "Airbus A320 family — CFM56"). New/edited
//   rows created via technicianRepositoryV2.replaceHabilitations() always
//   set this.
// aircraftTypeCode: legacy/general aircraft code with no motorization info.
//   Present on rows written before this rating catalog existed; kept
//   readable, never auto-migrated to a specific rating unless unambiguous
//   (see docs/archive/AIRCRAFT_TYPE_RATINGS_IMPLEMENTATION_REPORT.md).
// At least one of the two is always set (DB CHECK constraint).
// experienceYears / isCurrent are optional, per-rating declarations —
// independent of technicianAircraftExperience (which is per legacy
// aircraft_type_code, not per exact rating).
export interface TechnicianHabilitation {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  aircraftTypeCode?: string;
  aircraftTypeRatingId?: string;
  experienceYears?: number;
  isCurrent?: boolean;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
  // Migration 027 — set by scripts/backfillLegacyAircraftRatings.ts when a
  // legacy aircraftTypeCode resolved to zero or multiple catalog ratings
  // and was left unmigrated on purpose. Only meaningful when
  // aircraftTypeRatingId is unset; matching (offerMatchExplain.ts) reads
  // this to label a T3/approximate match as explicitly "needs review"
  // instead of silently trusting it.
  needsReview: boolean;
}

export interface TechnicianAircraftExperience {
  id: string;
  technicianId: string;
  aircraftTypeCode: string;
  value: number;
  unit: 'hours' | 'years';
  createdAt: string;
}

export interface SocialLinks {
  linkedin?: string;
  [key: string]: string | undefined;
}

/**
 * Full private technician profile — the authoritative internal record.
 * Contains ALL fields including private identity data (firstName, lastName,
 * email, phone, birthDate, socialLinks).
 *
 * Usage rules:
 *   ✓ Technician own-profile screens (app/technician/*)
 *   ✓ Admin screens (app/admin/*)
 *   ✓ Repository internals (reading/writing the local store)
 *   ✗ Company-facing screens — must use SafeTechnicianPreview or UnlockedTechnicianView
 *
 * Future Supabase: this type maps to a direct SELECT on technician_profiles.
 * Companies never receive this shape — they receive technician_public_view rows
 * (private fields gated by CASE WHEN offer_accepted_between()).
 */
export interface TechnicianProfile {
  id: string;
  userId: string;
  anonymousCode: string;

  // Private
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate: string; // ISO date — compute age, never expose raw

  // Public
  technicianType: TechnicianTypeCode;
  // Location FK only. Country, city, base airport and coordinates are derived
  // from the canonical location catalog when building views.
  // Required: every persisted technician profile must reference a valid location_airports entry.
  locationCityId: string;

  availability: Availability;
  /** ADMIN-ONLY in Supabase — technician cannot write this field; set via admin-only RLS policy */
  verificationStatus: VerificationStatus;
  profileCompleteness: number;

  socialLinks?: SocialLinks;

  createdAt: string;
  updatedAt: string;
}

export interface TechnicianWithRelations extends TechnicianProfile {
  licenses: TechnicianLicense[];
  habilitations: TechnicianHabilitation[];
  aircraftExperience: TechnicianAircraftExperience[];
}
