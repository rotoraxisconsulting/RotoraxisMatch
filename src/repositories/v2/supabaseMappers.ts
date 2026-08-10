import { supabase } from '../../lib/supabase';
import { resolveLocationSnapshot } from '../../constants/locationCities';
import { CompanyMember, CompanyProfileView } from '../../types/company';
import { Document, DocumentType } from '../../types/document';
import { CompanyMemberRole, DocumentStatus, OfferRequestStatus, OfferStatus, VerificationStatus } from '../../types/enums';
import { ContractTypeCode, LicenseCode, TechnicianTypeCode } from '../../types/catalog';
import {
  Availability,
  TechnicianHabilitation,
  TechnicianLicense,
  TechnicianProfile,
  TechnicianWithRelations,
} from '../../types/technician';
import { SafeTechnicianPreview, TechnicianView, UnlockedTechnicianView } from '../../types/privacy';
import { Offer, OfferProductType, OfferRequiredHabilitation, OfferWithRequirements } from '../../types/offer';
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

/**
 * Comprueba que una mutación afectó de verdad a alguna fila.
 *
 * `error === null` NO es prueba de que la escritura ocurrió: si RLS no deja
 * pasar la fila, PostgREST devuelve 0 filas y CERO error, y la UI informa de
 * un éxito que no existió. Es la clase 1 de la taxonomía de la auditoría y ya
 * mordió una vez de verdad (borrar una oferta "funcionaba" y la oferta
 * reaparecía en la lista — migración 026).
 *
 * Uso: añade `.select('id')` a la mutación y pásale el `data` resultante.
 * Sin ese `.select()` no hay nada que contar y este helper no sirve.
 *
 * El mensaje debe describir la ACCIÓN del usuario, no la fila: quien lo lee
 * está en una pantalla, no en una tabla.
 */
export function throwIfNoRows(
  data: unknown[] | null | undefined,
  message: string,
): void {
  if (!data || data.length === 0) throw new Error(message);
}

// Disponibilidad binaria (2026-07-29). `available_from` ya no se lee ni se
// escribe: la migración 041 lo retira de las filas existentes. No se deja un
// fallback "por si acaso" — sería justo el campo fantasma que esa migración
// existe para eliminar.
export function mapAvailability(value: unknown): Availability {
  const source = (value && typeof value === 'object' ? value : {}) as {
    immediately?: boolean;
    contract_types?: string[];
    contractTypes?: string[];
  };
  const immediately = Boolean(source.immediately);
  return {
    immediately,
    status: immediately ? 'open_to_offers' : 'unavailable',
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
    website: row.website ?? undefined,
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
    productType: row.product_type as OfferProductType,
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
  'requiredTechnicianTypes' | 'requiredLicenses' | 'requiredHabilitations'
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
    empty[id] = { requiredTechnicianTypes: [], requiredLicenses: [], requiredHabilitations: [] };
  }
  if (uniqueIds.length === 0) return empty;

  // Fase 5 (2026-08-04): aquí se leía también offer_required_aircraft_types
  // (el requisito aproximado por familia). Ese SELECT tenía un throwIfError
  // debajo, así que dropear la tabla con el lector vivo habría tumbado el
  // listado de ofertas entero — por eso el lector se va AQUÍ y el DROP va
  // después, en la migración 045.
  const [typesRes, licensesRes, habilitationsRes] = await Promise.all([
    supabase.from('offer_required_technician_types').select('offer_id, technician_type_code').in('offer_id', uniqueIds),
    supabase.from('offer_required_licenses').select('offer_id, license_code').in('offer_id', uniqueIds),
    supabase.from('offer_required_habilitations').select('offer_id, license_code, aircraft_type_rating_id, requirement_level, notes, created_at').in('offer_id', uniqueIds),
  ]);
  throwIfError(typesRes.error);
  throwIfError(licensesRes.error);
  throwIfError(habilitationsRes.error);

  for (const row of (typesRes.data ?? []) as DbRow[]) {
    empty[row.offer_id]?.requiredTechnicianTypes.push(row.technician_type_code as TechnicianTypeCode);
  }
  for (const row of (licensesRes.data ?? []) as DbRow[]) {
    empty[row.offer_id]?.requiredLicenses.push(row.license_code as LicenseCode);
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

/**
 * Tipos de perfil de un lote de técnicos, desde `technician_profile_types`
 * (migración 048).
 *
 * ES LA ÚNICA FUENTE que el código lee. La columna
 * `technician_profiles.technician_type` sigue existiendo y sigue
 * escribiéndose en el alta, pero NO se lee en ninguna parte: es una copia
 * del primer tipo, en espera de la migración que la retire. Leerla en
 * cualquier sitio reabriría exactamente el problema que la tabla puente
 * resuelve (un perfil con dos tipos que aparenta tener uno).
 *
 * `.order('type_code')` para que la lista se pinte siempre igual entre
 * pantallas y recargas — sin él, el orden lo decide Postgres y dos tarjetas
 * del mismo técnico pueden salir con los tipos permutados.
 */
export async function loadTechnicianProfileTypes(technicianIds: string[]): Promise<Record<string, TechnicianTypeCode[]>> {
  const uniqueIds = [...new Set(technicianIds)].filter(Boolean);
  const map: Record<string, TechnicianTypeCode[]> = {};
  for (const id of uniqueIds) map[id] = [];
  if (uniqueIds.length === 0) return map;

  const { data, error } = await supabase
    .from('technician_profile_types')
    .select('technician_id, type_code')
    .in('technician_id', uniqueIds)
    .order('type_code');
  throwIfError(error);
  for (const row of (data ?? []) as DbRow[]) {
    map[row.technician_id]?.push(row.type_code as TechnicianTypeCode);
  }
  return map;
}

export async function loadTechnicianRelations(technicianIds: string[]): Promise<Record<string, {
  licenses: TechnicianLicense[];
  habilitations: TechnicianHabilitation[];
  technicianTypes: TechnicianTypeCode[];
}>> {
  const uniqueIds = [...new Set(technicianIds)].filter(Boolean);
  const map: Record<string, {
    licenses: TechnicianLicense[];
    habilitations: TechnicianHabilitation[];
    technicianTypes: TechnicianTypeCode[];
  }> = {};
  for (const id of uniqueIds) map[id] = { licenses: [], habilitations: [], technicianTypes: [] };
  if (uniqueIds.length === 0) return map;

  const [licensesRes, habsRes, types] = await Promise.all([
    supabase.from('technician_licenses').select('id, technician_id, license_code, issued_at, expires_at, created_at').in('technician_id', uniqueIds),
    supabase.from('technician_habilitations').select('id, technician_id, license_code, aircraft_type_rating_id, experience_years, is_current, issued_at, expires_at, created_at').in('technician_id', uniqueIds),
    loadTechnicianProfileTypes(uniqueIds),
  ]);
  throwIfError(licensesRes.error);
  throwIfError(habsRes.error);
  for (const id of uniqueIds) map[id].technicianTypes = types[id] ?? [];

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
      aircraftTypeRatingId: row.aircraft_type_rating_id ?? undefined,
      experienceYears: row.experience_years ?? undefined,
      isCurrent: row.is_current ?? undefined,
      issuedAt: row.issued_at ?? undefined,
      expiresAt: row.expires_at ?? undefined,
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
    technicianTypes: relations?.technicianTypes ?? [],
    locationCityId: row.location_city_id,
    availability: mapAvailability(row.availability),
    yearsExperience: row.years_experience ?? undefined,
    verificationStatus: row.verification_status as VerificationStatus,
    socialLinks: row.social_links ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    licenses: relations?.licenses ?? [],
    habilitations: relations?.habilitations ?? [],
  };
}

export function mapPublicTechnicianRow(row: DbRow, relations?: Awaited<ReturnType<typeof loadTechnicianRelations>>[string]): SafeTechnicianPreview {
  const location = resolveLocationSnapshot({ locationCityId: row.location_city_id });
  return {
    id: row.id,
    anonymousCode: row.anonymous_code,
    technicianTypes: relations?.technicianTypes ?? [],
    locationCityId: row.location_city_id,
    country: row.country ?? location?.country ?? '',
    city: row.city ?? location?.city ?? '',
    baseAirport: row.base_airport ?? location?.baseAirport,
    latitude: row.latitude ?? location?.latitude,
    longitude: row.longitude ?? location?.longitude,
    licenses: (relations?.licenses ?? []).map((license) => license.licenseCode),
    habilitations: relations?.habilitations ?? [],
    yearsExperience: row.years_experience ?? undefined,
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
    // `technician_public_view` NO expone `birth_date` NI `age` (migración 040:
    // la edad se retiró del contrato público por ser característica protegida).
    // Aquí va cadena vacía, NUNCA una fecha inventada: el placeholder
    // '1970-01-01' que había antes producía "56 años" para TODOS los técnicos
    // que veía una empresa.
    birthDate: '',
    technicianTypes: relations?.technicianTypes ?? [],
    locationCityId: row.location_city_id,
    availability: mapAvailability(row.availability),
    yearsExperience: row.years_experience ?? undefined,
    verificationStatus: row.verification_status as VerificationStatus,
    socialLinks: row.social_links ?? undefined,
    createdAt: row.created_at ?? now,
    updatedAt: row.updated_at ?? now,
    licenses: relations?.licenses ?? [],
    habilitations: relations?.habilitations ?? [],
  };
}
