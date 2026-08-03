/**
 * Privacy DTO types for company-facing technician views.
 *
 * SECURITY NOTE: These DTOs prevent accidental private field access in React code.
 * They are NOT the security boundary. The Supabase boundary enforces real access control:
 *   - Row-level Security on technician_profiles (row access)
 *   - technician_public_view (column-level privacy via CASE WHEN offer_accepted_between())
 *   - get_unlocked_technician() RPC (requires accepted status, checked server-side)
 *
 * In the live app the privacy gate is applied at two entry points:
 *   - technicianRepositoryV2.getViewForCompany() — company screens
 *   - canRevealIdentity() + getUnlockedTechnicianView() / getSafeTechnicianPreview()
 *     (privacyV2.ts) — the search, map and dashboard hooks, which already hold the
 *     acceptance records and build the view themselves.
 * Both populate these same DTOs from view/RPC responses.
 *
 * Future Supabase mapping:
 *   SafeTechnicianPreview / TechnicianPublicPreviewDTO  →  technician_public_view / search_technicians_public()
 *   UnlockedTechnicianView / TechnicianUnlockedDTO      →  get_unlocked_technician() (requires accepted status)
 *
 * Company-facing code must NEVER consume TechnicianProfile or TechnicianWithRelations directly.
 * Go through technicianRepositoryV2.getViewForCompany(), or — when the caller already holds
 * the acceptance records — through canRevealIdentity() plus getUnlockedTechnicianView() /
 * getSafeTechnicianPreview() (privacyV2.ts), so the privacy gate is always applied.
 */

import { TechnicianTypeCode, LicenseCode } from './catalog';
import { VerificationStatus } from './enums';
import {
  TechnicianHabilitation,
  Availability,
  SocialLinks,
} from './technician';
import { Document } from './document';

// What a company sees BEFORE offer acceptance.
// No real identity, no documents, NO age (migración 040 — ver abajo).
export interface SafeTechnicianPreview {
  id: string;
  anonymousCode: string;
  // SIN edad, a propósito (migración 040). La edad es característica protegida
  // en normativa laboral europea: mostrarla al empleador durante el cribado es
  // riesgo de discriminación, e incoherente con anonimizar el nombre justo para
  // reducir sesgo. No aporta al cribado — licencias, type ratings y años de
  // experiencia cubren lo relevante. `birthDate` nunca sale, ni derivada.
  technicianType: TechnicianTypeCode;
  // Required: derived from the persisted locationCityId on the underlying TechnicianProfile.
  locationCityId: string;
  country: string;
  city: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;
  licenses: LicenseCode[];
  habilitations: TechnicianHabilitation[];
  // Años declarados — visual y filtrable, nunca puntuable. undefined = no
  // declarado, se muestra "not specified".
  yearsExperience?: number;
  availability: Availability;
  verificationStatus: VerificationStatus;
  // matchingScore is NOT stored here — use calculateOfferTechnicianMatch(offer, technician, ratingIndex) instead.
  // A score only exists in the context of a specific offer+technician pair.
}

// What a company sees AFTER offer acceptance.
// Full identity + documents unlocked.
export interface UnlockedTechnicianView extends SafeTechnicianPreview {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  socialLinks?: SocialLinks;
  documents: Document[];
}

export type TechnicianView = SafeTechnicianPreview | UnlockedTechnicianView;

export function isUnlocked(view: TechnicianView): view is UnlockedTechnicianView {
  return 'firstName' in view;
}

// ---------------------------------------------------------------------------
// DTO name aliases — same types, names that make the intent explicit at call sites.
//
// TechnicianPublicPreviewDTO  — use this name when the context is "data the company
//   receives from a search or listing before any acceptance".
//
// TechnicianUnlockedDTO — use this name when the context is "data the company
//   receives after an accepted offer_request or offer_application".
//
// Both aliases are re-exported from src/types/index.ts so screens can import either
// the canonical interface name or the DTO alias — whichever reads more clearly.
// ---------------------------------------------------------------------------
export type TechnicianPublicPreviewDTO = SafeTechnicianPreview;
export type TechnicianUnlockedDTO = UnlockedTechnicianView;
