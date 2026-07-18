import { supabase } from '../../lib/supabase';
import { resolveLocationSnapshot } from '../../constants/locationCities';
import { CompanyMember, CompanyProfileView } from '../../types/company';
import { Document, DocumentType } from '../../types/document';
import { CompanyMemberRole, DocumentStatus, OfferRequestStatus, OfferStatus, VerificationStatus } from '../../types/enums';
import { ContractTypeCode, LicenseCode, TechnicianTypeCode } from '../../types/catalog';
import {
  Availability,
  TechnicianAircraftExperience,
  TechnicianHabilitation,
  TechnicianLicense,
  TechnicianProfile,
  TechnicianWithRelations,
} from '../../types/technician';
import { SafeTechnicianPreview, TechnicianView, UnlockedTechnicianView } from '../../types/privacy';
import { Offer, OfferRequiredHabilitation, OfferWithRequirements } from '../../types/offer';
import { OfferApplication, OfferRequest } from '../../types/offerRequest';
import { ChatMessage, ChatRoom } from '../../types/chat';
import { SenderRole } from '../../types/enums';
import { CatalogRequest } from '../../types/catalogRequest';
import { RequirementLevel } from '../../types/catalog';

export type DbRow = Record<string, any>;

export function firstJoin(row: unknown): DbRow | null {
  if (!row) return null;
  if (Array.isArray(row)) return (row[0] as DbRow | undefined) ?? null;
  return row as DbRow;
}

export function throwIfError(error: { message?: string } | null | undefined): void {
  if (error) throw new Error(error.message ?? 'Supabase request failed.');
}

export function mapAvailability(value: unknown): Availability {
  const source = (value && typeof value === 'object' ? value : {}) as {
    immediately?: boolean;
    available_from?: string | null;
    availableFrom?: string | null;
    contract_types?: string[];
    contractTypes?: string[];
  };
  const immediately = Boolean(source.immediately);
  const availableFrom = source.available_from ?? source.availableFrom ?? undefined;
  return {
    immediately,
    status: immediately ? 'available' : availableFrom ? 'open_to_offers' : 'unavailable',
    availableFrom: availableFrom ?? undefined,
    contractTypes: (source.contract_types ?? source.contractTypes ?? []) as Availability['contractTypes'],
  };
}

export function mapCompanyRow(row: DbRow): CompanyProfileView {
  const loc = firstJoin(row.location_airports);
  const fallback = resolveLocationSnapshot({ locationCityId: row.location_city_id });
  return {
    id: row.id,
    name: row.name,
    locationCityId: row.location_city_id,
    phone: row.phone ?? undefined,
    email: row.email,
    companyType: row.company_type,
    verificationStatus: row.verification_status as VerificationStatus,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    country: loc?.country_name ?? fallback?.country ?? '',
    city: loc?.city ?? fallback?.city ?? '',
    baseAirport: loc?.iata ?? loc?.icao ?? fallback?.baseAirport,
    latitude: loc?.latitude ?? fallback?.latitude,
    longitude: loc?.longitude ?? fallback?.longitude,
  };
}

export function mapCompanyMemberRow(row: DbRow): CompanyMember {
  const profileJoin = row.profiles as { email?: string } | null | undefined;
  return {
    id: row.id,
    companyId: row.company_id,
    userId: row.user_id,
    role: row.role as CompanyMemberRole,
    displayName: row.display_name ?? undefined,
    email: profileJoin?.email ?? undefined,
    createdAt: row.created_at,
  };
}

export function mapDocumentRow(row: DbRow): Document {
  return {
    id: row.id,
    technicianId: row.technician_id,
    type: row.type as DocumentType,
    fileName: row.file_name,
    storagePath: row.storage_path,
    status: row.status as DocumentStatus,
    uploadedAt: row.uploaded_at,
    reviewedAt: row.reviewed_at ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    expiresAt: row.expires_at ?? undefined,
  };
}

export function mapOfferRow(row: DbRow): Offer {
  return {
    id: row.id,
    companyId: row.company_id,
    title: row.title,
    description: row.description,
    contractType: row.contract_type as ContractTypeCode,
    locationCityId: row.location_city_id,
    locationCountry: row.location_country,
    locationCity: row.location_city,
    locationBaseAirport: row.location_base_airport ?? undefined,
    minYearsExperience: row.min_years_experience ?? 0,
    status: row.status as OfferStatus,
    visible: Boolean(row.visible),
    expiresAt: row.expires_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

type OfferRequirementsPick = Pick<
  OfferWithRequirements,
  'requiredTechnicianTypes' | 'requiredLicenses' | 'requiredAircraftTypes' | 'requiredHabilitations'
>;

export function mapOfferRequiredHabilitationRow(row: DbRow): OfferRequiredHabilitation {
  return {
    offerId: row.offer_id,
    licenseCode: row.license_code as LicenseCode,
    aircraftTypeRatingId: row.aircraft_type_rating_id,
    requirementLevel: row.requirement_level as RequirementLevel,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

export async function loadOfferRequirements(offerIds: string[]): Promise<Record<string, OfferRequirementsPick>> {
  const uniqueIds = [...new Set(offerIds)].filter(Boolean);
  const empty: Record<string, OfferRequirementsPick> = {};
  for (const id of uniqueIds) {
    empty[id] = { requiredTechnicianTypes: [], requiredLicenses: [], requiredAircraftTypes: [], requiredHabilitations: [] };
  }
  if (uniqueIds.length === 0) return empty;

  const [typesRes, licensesRes, aircraftRes, habilitationsRes] = await Promise.all([
    supabase.from('offer_required_technician_types').select('offer_id, technician_type_code').in('offer_id', uniqueIds),
    supabase.from('offer_required_licenses').select('offer_id, license_code').in('offer_id', uniqueIds),
    supabase.from('offer_required_aircraft_types').select('offer_id, aircraft_type_code').in('offer_id', uniqueIds),
    supabase.from('offer_required_habilitations').select('offer_id, license_code, aircraft_type_rating_id, requirement_level, notes, created_at').in('offer_id', uniqueIds),
  ]);
  throwIfError(typesRes.error);
  throwIfError(licensesRes.error);
  throwIfError(aircraftRes.error);
  throwIfError(habilitationsRes.error);

  for (const row of (typesRes.data ?? []) as DbRow[]) {
    empty[row.offer_id]?.requiredTechnicianTypes.push(row.technician_type_code as TechnicianTypeCode);
  }
  for (const row of (licensesRes.data ?? []) as DbRow[]) {
    empty[row.offer_id]?.requiredLicenses.push(row.license_code as LicenseCode);
  }
  for (const row of (aircraftRes.data ?? []) as DbRow[]) {
    empty[row.offer_id]?.requiredAircraftTypes.push(row.aircraft_type_code);
  }
  for (const row of (habilitationsRes.data ?? []) as DbRow[]) {
    empty[row.offer_id]?.requiredHabilitations.push(mapOfferRequiredHabilitationRow(row));
  }
  return empty;
}

export function withRequirements(offer: Offer, reqs?: OfferRequirementsPick): OfferWithRequirements {
  return {
    ...offer,
    requiredTechnicianTypes: reqs?.requiredTechnicianTypes ?? [],
    requiredLicenses: reqs?.requiredLicenses ?? [],
    requiredAircraftTypes: reqs?.requiredAircraftTypes ?? [],
    requiredHabilitations: reqs?.requiredHabilitations ?? [],
  };
}

export function mapOfferRequestRow(row: DbRow): OfferRequest {
  return {
    kind: 'direct_offer',
    id: row.id,
    companyId: row.company_id,
    technicianId: row.technician_id,
    offerId: row.offer_id ?? undefined,
    status: row.status as OfferRequestStatus,
    identityRevealed: Boolean(row.identity_revealed),
    documentsUnlocked: Boolean(row.documents_unlocked),
    message: row.message ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapOfferApplicationRow(row: DbRow): OfferApplication {
  return {
    kind: 'application',
    id: row.id,
    technicianId: row.technician_id,
    offerId: row.offer_id,
    companyId: row.company_id,
    status: row.status as OfferRequestStatus,
    identityRevealed: Boolean(row.identity_revealed),
    documentsUnlocked: Boolean(row.documents_unlocked),
    coverNote: row.cover_note ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapChatRoomRow(row: DbRow): ChatRoom {
  return {
    id: row.id,
    offerRequestId: row.offer_request_id ?? undefined,
    offerApplicationId: row.offer_application_id ?? undefined,
    technicianId: row.technician_id,
    companyId: row.company_id,
    createdAt: row.created_at,
  };
}

export function mapChatMessageRow(row: DbRow): ChatMessage {
  return {
    id: row.id,
    chatRoomId: row.chat_room_id,
    senderUserId: row.sender_user_id,
    senderCompanyMemberId: row.sender_company_member_id ?? undefined,
    senderRole: row.sender_role as SenderRole,
    body: row.body,
    sentAt: row.sent_at,
  };
}

export async function loadTechnicianRelations(technicianIds: string[]): Promise<Record<string, {
  licenses: TechnicianLicense[];
  habilitations: TechnicianHabilitation[];
  aircraftExperience: TechnicianAircraftExperience[];
}>> {
  const uniqueIds = [...new Set(technicianIds)].filter(Boolean);
  const map: Record<string, {
    licenses: TechnicianLicense[];
    habilitations: TechnicianHabilitation[];
    aircraftExperience: TechnicianAircraftExperience[];
  }> = {};
  for (const id of uniqueIds) map[id] = { licenses: [], habilitations: [], aircraftExperience: [] };
  if (uniqueIds.length === 0) return map;

  const [licensesRes, habsRes, expRes] = await Promise.all([
    supabase.from('technician_licenses').select('id, technician_id, license_code, issued_at, expires_at, created_at').in('technician_id', uniqueIds),
    supabase.from('technician_habilitations').select('id, technician_id, license_code, aircraft_type_code, aircraft_type_rating_id, experience_years, is_current, issued_at, expires_at, created_at').in('technician_id', uniqueIds),
    supabase.from('technician_aircraft_experience').select('id, technician_id, aircraft_type_code, value, unit, created_at').in('technician_id', uniqueIds),
  ]);
  throwIfError(licensesRes.error);
  throwIfError(habsRes.error);
  throwIfError(expRes.error);

  for (const row of (licensesRes.data ?? []) as DbRow[]) {
    map[row.technician_id]?.licenses.push({
      id: row.id,
      technicianId: row.technician_id,
      licenseCode: row.license_code,
      issuedAt: row.issued_at ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      createdAt: row.created_at,
    });
  }
  for (const row of (habsRes.data ?? []) as DbRow[]) {
    map[row.technician_id]?.habilitations.push({
      id: row.id,
      technicianId: row.technician_id,
      licenseCode: row.license_code,
      aircraftTypeCode: row.aircraft_type_code ?? undefined,
      aircraftTypeRatingId: row.aircraft_type_rating_id ?? undefined,
      experienceYears: row.experience_years ?? undefined,
      isCurrent: row.is_current ?? undefined,
      issuedAt: row.issued_at ?? undefined,
      expiresAt: row.expires_at ?? undefined,
      createdAt: row.created_at,
    });
  }
  for (const row of (expRes.data ?? []) as DbRow[]) {
    map[row.technician_id]?.aircraftExperience.push({
      id: row.id,
      technicianId: row.technician_id,
      aircraftTypeCode: row.aircraft_type_code,
      value: row.value ?? 0,
      unit: row.unit,
      createdAt: row.created_at,
    });
  }
  return map;
}

export function mapPrivateTechnicianRow(row: DbRow, relations?: Awaited<ReturnType<typeof loadTechnicianRelations>>[string]): TechnicianWithRelations {
  return {
    id: row.id,
    userId: row.user_id,
    anonymousCode: row.anonymous_code,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? undefined,
    birthDate: row.birth_date ?? '1970-01-01',
    technicianType: row.technician_type,
    locationCityId: row.location_city_id,
    availability: mapAvailability(row.availability),
    verificationStatus: row.verification_status as VerificationStatus,
    profileCompleteness: row.profile_completeness ?? 0,
    socialLinks: row.social_links ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    licenses: relations?.licenses ?? [],
    habilitations: relations?.habilitations ?? [],
    aircraftExperience: relations?.aircraftExperience ?? [],
  };
}

export function mapPublicTechnicianRow(row: DbRow, relations?: Awaited<ReturnType<typeof loadTechnicianRelations>>[string]): SafeTechnicianPreview {
  const location = resolveLocationSnapshot({ locationCityId: row.location_city_id });
  return {
    id: row.id,
    anonymousCode: row.anonymous_code,
    age: row.age ?? 0,
    technicianType: row.technician_type,
    locationCityId: row.location_city_id,
    country: row.country ?? location?.country ?? '',
    city: row.city ?? location?.city ?? '',
    baseAirport: row.base_airport ?? location?.baseAirport,
    latitude: row.latitude ?? location?.latitude,
    longitude: row.longitude ?? location?.longitude,
    licenses: (relations?.licenses ?? []).map((license) => license.licenseCode),
    habilitations: relations?.habilitations ?? [],
    aircraftExperience: relations?.aircraftExperience ?? [],
    availability: mapAvailability(row.availability),
    verificationStatus: row.verification_status as VerificationStatus,
  };
}

export function mapPublicTechnicianView(row: DbRow, relations?: Awaited<ReturnType<typeof loadTechnicianRelations>>[string], documents: Document[] = []): TechnicianView {
  const preview = mapPublicTechnicianRow(row, relations);
  if (!row.first_name || !row.last_name || !row.email) return preview;
  const unlocked: UnlockedTechnicianView = {
    ...preview,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone ?? undefined,
    socialLinks: row.social_links ?? undefined,
    documents,
  };
  return unlocked;
}

export function mapCatalogRequestRow(row: DbRow): CatalogRequest {
  return {
    id: row.id,
    requestedBy: row.requested_by,
    rawText: row.raw_text,
    context: row.context ?? undefined,
    status: row.status,
    resolvedAircraftTypeRatingId: row.resolved_aircraft_type_rating_id ?? undefined,
    adminNotes: row.admin_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicRowToPrivateCompat(row: DbRow, relations?: Awaited<ReturnType<typeof loadTechnicianRelations>>[string]): TechnicianWithRelations {
  const now = new Date().toISOString();
  return {
    id: row.id,
    userId: row.user_id ?? '',
    anonymousCode: row.anonymous_code,
    firstName: row.first_name ?? '',
    lastName: row.last_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? undefined,
    birthDate: '1970-01-01',
    technicianType: row.technician_type,
    locationCityId: row.location_city_id,
    availability: mapAvailability(row.availability),
    verificationStatus: row.verification_status as VerificationStatus,
    profileCompleteness: row.profile_completeness ?? 0,
    socialLinks: row.social_links ?? undefined,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
    licenses: relations?.licenses ?? [],
    habilitations: relations?.habilitations ?? [],
    aircraftExperience: relations?.aircraftExperience ?? [],
  };
}
