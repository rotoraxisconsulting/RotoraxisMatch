# TypeScript Types V2 — RotoraxisMatch

These are the canonical TypeScript types for V2.
When implementing, place these in `src/types/` split by domain file.

---

## Status types

```ts
// src/types/enums.ts

export type AppRole = 'technician' | 'company_user' | 'admin';

export type UserStatus =
  | 'pending_verification'
  | 'active'
  | 'blocked'
  | 'suspended';

export type VerificationStatus = 'pending' | 'verified' | 'rejected';
// NOTE: 'unverified' was a V1 legacy value and is NOT part of V2 VerificationStatus.
// If old persisted data contains 'unverified', use mapLegacyVerificationStatusToV2()
// (also exported from enums.ts) which maps it to 'pending'.

export type DocumentStatus = 'pending' | 'verified' | 'rejected' | 'expired';

export type OfferRequestStatus =
  | 'pending'
  | 'accepted'
  | 'rejected'
  | 'expired'    // set server-side when the offer expires without response
  | 'withdrawn'; // voluntary cancellation by the initiating party

export type OfferStatus = 'draft' | 'published' | 'closed' | 'expired';

export type CompanyMemberRole = 'admin' | 'recruiter' | 'viewer';

export type ExperienceUnit = 'hours' | 'years';

export type SenderRole = 'technician' | 'company';
```

---

## Catalog types

```ts
// src/types/catalog.ts

export type TechnicianTypeCode =
  | 'mechanic'
  | 'avionic'
  | 'sheet_metal_worker'
  | 'painter'
  | 'composite'
  | 'pilot';  // standby — not active in V2 UI

export type LicenseCode =
  | 'A1' | 'A2' | 'A3' | 'A4'
  | 'B1.1' | 'B1.2' | 'B1.3' | 'B1.4'
  | 'B2' | 'B2L' | 'B3' | 'L' | 'C';

export type ContractTypeCode = 'permanent' | 'long_term' | 'short_term';

export type CompanyTypeCode =
  | 'MRO'
  | 'airline'
  | 'recruitment_agency'
  | 'helicopter_operator'
  | 'other';

export interface TechnicianTypeCatalog {
  code: TechnicianTypeCode;
  label: string;
  requiresLicense: boolean;
  isActive: boolean;
  sortOrder: number;
}

export interface LicenseCategoryCatalog {
  code: LicenseCode;
  label: string;
  categoryGroup: string;  // 'A' | 'B1' | 'B2' | 'B3' | 'L' | 'C'
  sortOrder: number;
}

export type AircraftCategory = 'airplane' | 'helicopter';

export interface AircraftTypeCatalog {
  code: string;
  label: string;
  manufacturer?: string;
  aircraftFamily?: string;
  aircraftCategory: AircraftCategory;  // 'airplane' | 'helicopter'
  isActive: boolean;
}

export interface CompanyTypeCatalog {
  code: CompanyTypeCode;
  label: string;
  sortOrder: number;
}

export interface ContractTypeCatalog {
  code: ContractTypeCode;
  label: string;
  sortOrder: number;
}
```

---

## Profile

```ts
// src/types/profile.ts

import { AppRole, UserStatus } from './enums';

export interface Profile {
  id: string;           // = auth user id
  role: AppRole;
  status: UserStatus;
  createdAt: string;    // ISO timestamp
}
```

---

## Technician

```ts
// src/types/technician.ts

import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';
import { VerificationStatus } from './enums';

export interface Availability {
  immediately: boolean;
  availableFrom?: string;         // ISO date
  contractTypes: ContractTypeCode[];
}

export interface TechnicianLicense {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface TechnicianHabilitation {
  id: string;
  technicianId: string;
  licenseCode: LicenseCode;
  aircraftTypeCode: string;
  issuedAt?: string;
  expiresAt?: string;
  createdAt: string;
}

export interface TechnicianAircraftExperience {
  id: string;
  technicianId: string;
  // Must reference a valid aircraft_types.code. Generic codes such as 'GENERAL' are not valid.
  // If no aircraft type is known, do not create a row — no fallback/generic code is allowed.
  aircraftTypeCode: string;
  value: number;
  unit: 'hours' | 'years';
  createdAt: string;
}

export interface SocialLinks {
  linkedin?: string;
  [key: string]: string | undefined;
}

// Full technician profile — contains private fields.
// Never send this to a company without the privacy filter.
export interface TechnicianProfile {
  id: string;
  userId: string;
  anonymousCode: string;

  // Private
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  birthDate: string;            // ISO date — compute age, never expose raw

  // Public
  technicianType: TechnicianTypeCode;
  // Location FK only. Country, city, base airport and coordinates are derived
  // from the canonical location catalog when building views.
  // Required: every persisted technician profile must reference a valid location_airports entry.
  locationCityId: string;

  availability: Availability;
  verificationStatus: VerificationStatus;
  profileCompleteness: number;  // 0–100

  // Optional / unlocked post-acceptance
  socialLinks?: SocialLinks;

  createdAt: string;
  updatedAt: string;
}

// Convenience type for a technician with their related rows loaded
export interface TechnicianWithRelations extends TechnicianProfile {
  licenses: TechnicianLicense[];
  habilitations: TechnicianHabilitation[];
  aircraftExperience: TechnicianAircraftExperience[];
}
```

---

## Privacy views

```ts
// src/types/privacy.ts

import {
  TechnicianTypeCode,
  LicenseCode,
  ContractTypeCode,
} from './catalog';
import { VerificationStatus } from './enums';
import {
  TechnicianHabilitation,
  TechnicianAircraftExperience,
  Availability,
  SocialLinks,
} from './technician';
import { Document } from './document';

// What a company sees BEFORE offer acceptance.
// No real identity, no documents, age derived (not birthDate).
// matchingScore is NOT a field here — scores are always offer-specific.
// Use calculateOfferTechnicianMatch(offer, technician) to get a MatchScore.
export interface SafeTechnicianPreview {
  id: string;
  anonymousCode: string;
  age: number;                          // derived from birthDate
  technicianType: TechnicianTypeCode;
  locationCityId: string;               // required — derived from persisted TechnicianProfile.locationCityId
  country: string;
  city: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;
  licenses: LicenseCode[];
  habilitations: TechnicianHabilitation[];
  aircraftExperience: TechnicianAircraftExperience[];
  availability: Availability;
  verificationStatus: VerificationStatus;
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

// Union type for use in UI components
export type TechnicianView = SafeTechnicianPreview | UnlockedTechnicianView;

export function isUnlocked(view: TechnicianView): view is UnlockedTechnicianView {
  return 'firstName' in view;
}
```

---

## Company

```ts
// src/types/company.ts

import { CompanyTypeCode } from './catalog';
import { VerificationStatus, CompanyMemberRole } from './enums';

export interface CompanyProfile {
  id: string;
  name: string;
  locationCityId: string;               // required — every persisted company must reference a valid location_airports entry
  phone?: string;
  email: string;
  companyType: CompanyTypeCode;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

// Read model enriched from location_airports.
export interface CompanyProfileView extends CompanyProfile {
  country: string;
  city: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;
}

export interface CompanyMember {
  id: string;
  companyId: string;
  userId: string; // MVP: one company membership per company user.
  role: CompanyMemberRole;
  createdAt: string;
}
```

---

## Offers

```ts
// src/types/offer.ts

import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';
import { OfferStatus } from './enums';

export interface Offer {
  id: string;
  companyId: string;
  title: string;
  description: string;
  contractType: ContractTypeCode;
  locationCityId: string;
  // Controlled snapshot copied from the canonical location catalog.
  locationCountry: string;
  locationCity: string;
  locationBaseAirport?: string;
  minYearsExperience: number;
  status: OfferStatus;
  visible: boolean;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

// Offer with requirements loaded from relation tables
export interface OfferWithRequirements extends Offer {
  requiredTechnicianTypes: TechnicianTypeCode[];
  requiredLicenses: LicenseCode[];
  requiredAircraftTypes: string[];
}
```

---

## Offer requests and applications

```ts
// src/types/offerRequest.ts

import { OfferRequestStatus } from './enums';

// Company sends a direct offer to a specific technician.
// IMPORTANT: identityRevealed and documentsUnlocked are read-only for the frontend.
// They are set server-side by the on_offer_accepted trigger. Never write these fields from the app.
export interface OfferRequest {
  kind: 'direct_offer';         // discriminant — always present, identifies type in mixed lists
  id: string;
  companyId: string;
  technicianId: string;
  offerId?: string;             // optional link to a published offer
  status: OfferRequestStatus;
  identityRevealed: boolean;    // READ-ONLY — set server-side on acceptance
  documentsUnlocked: boolean;   // READ-ONLY — set server-side on acceptance
  message?: string;
  createdAt: string;
  updatedAt: string;
}

// Technician applies to a published offer.
// IMPORTANT: identityRevealed and documentsUnlocked are read-only for the frontend.
// They are set server-side by the on_offer_accepted trigger. Never write these fields from the app.
export interface OfferApplication {
  kind: 'application';          // discriminant — always present, identifies type in mixed lists
  id: string;
  technicianId: string;
  offerId: string;
  companyId: string;            // denormalized
  status: OfferRequestStatus;
  identityRevealed: boolean;    // READ-ONLY — set server-side on acceptance
  documentsUnlocked: boolean;   // READ-ONLY — set server-side on acceptance
  coverNote?: string;
  createdAt: string;
  updatedAt: string;
}

// Unified type for mixed inbox lists (technician or company).
// Always use the `kind` field to discriminate — never rely on field presence checks.
export type OfferInboxRecord = OfferRequest | OfferApplication;

export function isDirectOffer(record: OfferInboxRecord): record is OfferRequest {
  return record.kind === 'direct_offer';
}

export function isApplication(record: OfferInboxRecord): record is OfferApplication {
  return record.kind === 'application';
}
```

---

## Chat

```ts
// src/types/chat.ts

import { SenderRole } from './enums';

export interface ChatRoom {
  id: string;
  offerRequestId?: string;
  offerApplicationId?: string;
  technicianId: string;
  companyId: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  chatRoomId: string;
  senderUserId: string;
  senderCompanyMemberId?: string;
  senderRole: SenderRole;
  body: string;
  sentAt: string;
}
```

---

## Documents

```ts
// src/types/document.ts

import { DocumentStatus } from './enums';

export type DocumentType =
  | 'license'
  | 'medical'
  | 'id'
  | 'training'
  | 'resume'
  | 'other';

export interface Document {
  id: string;
  technicianId: string;
  type: DocumentType;
  fileName: string;
  storagePath: string;    // local path in demo; Supabase Storage path later
  status: DocumentStatus;
  uploadedAt: string;
  reviewedAt?: string;      // set when admin changes status (verified / rejected / expired); cleared on reset to pending
  rejectionReason?: string; // set when status becomes rejected; cleared on all other transitions
  expiresAt?: string;
}
```

---

## Activity

```ts
// src/types/activity.ts

export type ActivityType =
  | 'application_received'
  | 'application_accepted'
  | 'application_rejected'
  | 'direct_offer_received'
  | 'direct_offer_accepted'
  | 'direct_offer_rejected'
  | 'chat_message_received';

export type ActivityRecipientScope = 'technician' | 'company';

export type ActivityEntityType =
  | 'offer_request'
  | 'offer_application'
  | 'chat_message';

export interface ActivityEvent {
  id: string;
  type: ActivityType;
  recipientScope: ActivityRecipientScope;
  recipientTechnicianId?: string;
  recipientCompanyId?: string;
  actorProfileId?: string;
  entityType: ActivityEntityType;
  entityId: string;
  offerId?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface ActivityRead {
  activityEventId: string;
  profileId: string;
  readAt: string;
}

// Local demo compatibility model.
// Supabase should use ActivityEvent + ActivityRead instead.
export interface ActivityItem {
  id: string;
  type: ActivityType;
  recipientRole: 'technician' | 'company';
  recipientId: string;
  entityId: string;
  read: boolean;
  createdAt: string;
}
```

---

## Search filters

```ts
// src/types/filters.ts

import { TechnicianTypeCode, LicenseCode, ContractTypeCode } from './catalog';
import { VerificationStatus } from './enums';

// Filters used when a company searches technicians
export interface TechnicianSearchFilters {
  technicianTypes?: TechnicianTypeCode[];
  licenses?: LicenseCode[];
  aircraftTypes?: string[];
  contractTypes?: ContractTypeCode[];
  country?: string;
  city?: string;
  verifiedOnly?: boolean;
  availableImmediately?: boolean;
  minYearsExperience?: number;
}

// Filters used when a technician searches published offers
export interface OfferSearchFilters {
  contractTypes?: ContractTypeCode[];
  requiredLicenses?: LicenseCode[];
  requiredAircraftTypes?: string[];
  technicianTypes?: TechnicianTypeCode[];
  country?: string;
  city?: string;
}
```

---

## Matching

```ts
// src/types/matching.ts

// A MatchScore is ALWAYS tied to a specific offer + technician pair.
// It is never stored on a technician_profile row.
export interface MatchScore {
  offerId: string;      // the offer this score belongs to
  technicianId: string; // the technician this score belongs to
  total: number;        // 0–100
  label: MatchLabel;
  breakdown: {
    verified: number;
    habilitation: number;
    license: number;
    availability: number;
    experience: number;
    location: number;
  };
}

export type MatchLabel = 'Excellent match' | 'Strong match' | 'Partial match' | 'Low match';
```

---

## Index barrel

```ts
// src/types/index.ts

export * from './enums';
export * from './catalog';
export * from './profile';
export * from './technician';
export * from './privacy';
export * from './company';
export * from './offer';
export * from './offerRequest';
export * from './chat';
export * from './document';
export * from './activity';
export * from './filters';
export * from './matching';
```
