/**
 * V2 privacy guard utilities.
 *
 * All functions are pure — they take pre-loaded data as parameters.
 * No I/O, no AsyncStorage calls. This keeps them composable with any hook or screen.
 *
 * Core rule: status === 'accepted' is the source of truth for identity and document access.
 * identityRevealed/documentsUnlocked are READ-ONLY flags set server-side (or by the local
 * acceptance trigger). Never use those booleans alone as the gate — always check status.
 *
 * If a record has identityRevealed: true but status !== 'accepted', treat as locked.
 */

import { OfferRequest, OfferApplication } from '../types/offerRequest';
import {
  TechnicianWithRelations,
} from '../types/technician';
import { SafeTechnicianPreview, UnlockedTechnicianView, TechnicianView } from '../types/privacy';
import { Document } from '../types/document';
import { LicenseCode } from '../types/catalog';

// ---------------------------------------------------------------------------
// Age
// ---------------------------------------------------------------------------

/**
 * Derive integer age from an ISO date string.
 * Never expose the raw birthDate in safe company views — only pass the return value.
 */
export function calculateAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ---------------------------------------------------------------------------
// Shared params type for all three gate functions
// ---------------------------------------------------------------------------

export interface AcceptanceCheckParams {
  companyId: string;
  technicianId: string;
  offerRequests: OfferRequest[];
  offerApplications: OfferApplication[];
}

/**
 * Returns true if at least one accepted offer record exists between this company and technician.
 * Checks status === 'accepted' — does NOT rely on identityRevealed or documentsUnlocked alone.
 */
function hasAcceptedRecord({ companyId, technicianId, offerRequests, offerApplications }: AcceptanceCheckParams): boolean {
  const acceptedRequest = offerRequests.some(
    (r) => r.companyId === companyId && r.technicianId === technicianId && r.status === 'accepted',
  );
  if (acceptedRequest) return true;

  return offerApplications.some(
    (a) => a.companyId === companyId && a.technicianId === technicianId && a.status === 'accepted',
  );
}

// ---------------------------------------------------------------------------
// Gate functions
// ---------------------------------------------------------------------------

/**
 * True if the company may see the technician's real identity (firstName, lastName, email, phone, socialLinks).
 * Only unlocked after an accepted direct offer or accepted application.
 */
export function canRevealIdentity(params: AcceptanceCheckParams): boolean {
  return hasAcceptedRecord(params);
}

/**
 * True if the company may access the technician's documents.
 * Only unlocked after acceptance — same condition as identity.
 */
export function canAccessDocuments(params: AcceptanceCheckParams): boolean {
  return hasAcceptedRecord(params);
}

/**
 * True if the company may open a chat with the technician.
 * Chat is only available after an accepted offer.
 */
export function canOpenChat(params: AcceptanceCheckParams): boolean {
  return hasAcceptedRecord(params);
}

// ---------------------------------------------------------------------------
// View builders
// ---------------------------------------------------------------------------

/**
 * Builds a SafeTechnicianPreview — the anonymous company view before acceptance.
 *
 * Includes: id, anonymousCode, age (derived), technicianType, country, city,
 *           baseAirport, licenses, habilitations, aircraftExperience, availability, verificationStatus.
 *
 * Excludes: firstName, lastName, email, phone, birthDate, socialLinks, documents, matchingScore.
 */
export function getSafeTechnicianPreview(technician: TechnicianWithRelations): SafeTechnicianPreview {
  return {
    id: technician.id,
    anonymousCode: technician.anonymousCode,
    age: calculateAge(technician.birthDate),
    technicianType: technician.technicianType,
    country: technician.country,
    city: technician.city,
    baseAirport: technician.baseAirport,
    licenses: technician.licenses.map((l) => l.licenseCode as LicenseCode),
    habilitations: technician.habilitations,
    aircraftExperience: technician.aircraftExperience,
    availability: technician.availability,
    verificationStatus: technician.verificationStatus,
  };
}

/**
 * Builds an UnlockedTechnicianView — the full company view after acceptance.
 * Extends SafeTechnicianPreview with identity fields and documents.
 * Only call this when canRevealIdentity() returns true.
 */
export function getUnlockedTechnicianView(
  technician: TechnicianWithRelations,
  documents: Document[],
): UnlockedTechnicianView {
  return {
    ...getSafeTechnicianPreview(technician),
    firstName: technician.firstName,
    lastName: technician.lastName,
    email: technician.email,
    phone: technician.phone,
    socialLinks: technician.socialLinks,
    documents,
  };
}

// ---------------------------------------------------------------------------
// Combined view selector
// ---------------------------------------------------------------------------

export interface GetTechnicianViewParams extends AcceptanceCheckParams {
  technicianWithRelations: TechnicianWithRelations;
  documents: Document[];
}

/**
 * Returns the correct view of a technician for a given company.
 *
 * - If the company has an accepted record with this technician → UnlockedTechnicianView
 * - Otherwise → SafeTechnicianPreview
 *
 * This is the single entry-point hooks and screens should call — never build the view manually.
 *
 * @example
 * // Locked (no accepted record):
 * //   { id, anonymousCode, age: 34, technicianType: 'mechanic', country: 'France', ... }
 *
 * @example
 * // Unlocked (accepted offer exists):
 * //   { id, anonymousCode, age: 34, ..., firstName: 'Carlos', lastName: 'Rivera', email: '...', documents: [...] }
 */
export function getTechnicianViewForCompany(params: GetTechnicianViewParams): TechnicianView {
  const { technicianWithRelations, documents, ...checkParams } = params;

  if (canRevealIdentity(checkParams)) {
    return getUnlockedTechnicianView(technicianWithRelations, documents);
  }

  return getSafeTechnicianPreview(technicianWithRelations);
}
