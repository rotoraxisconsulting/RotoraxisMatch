import { supabase } from '../../lib/supabase';
import {
  TechnicianProfile,
  TechnicianWithRelations,
  AvailabilityStatus,
} from '../../types/technician';
import { SafeTechnicianPreview, TechnicianView, isUnlocked } from '../../types/privacy';
import { LicenseCode } from '../../types/catalog';
import { AircraftRatingIndex, buildAircraftRatingIndex, ratingMatchesLegacyCode } from '../../constants/aircraftTypeRatings';
import { catalogRepository } from './catalogRepository';
import {
  DbRow,
  loadTechnicianRelations,
  mapPrivateTechnicianRow,
  mapPublicTechnicianRow,
  mapPublicTechnicianView,
  publicRowToPrivateCompat,
  throwIfError,
} from './supabaseMappers';
import { documentRepositoryV2 } from './documentRepositoryV2';

const PRIVATE_SELECT = `
  id, user_id, anonymous_code, first_name, last_name, email, phone, birth_date,
  technician_type, location_city_id, availability, verification_status,
  profile_completeness, social_links, created_at, updated_at
`;

const PUBLIC_SELECT = `
  id, anonymous_code, age, technician_type, location_city_id, country, city,
  base_airport, latitude, longitude, availability, verification_status,
  profile_completeness, first_name, last_name, email, phone, social_links
`;

function privatePatchToDb(patch: Partial<Omit<TechnicianProfile, 'id' | 'userId' | 'createdAt'>>): Record<string, unknown> {
  return {
    ...(patch.anonymousCode !== undefined ? { anonymous_code: patch.anonymousCode } : {}),
    ...(patch.firstName !== undefined ? { first_name: patch.firstName } : {}),
    ...(patch.lastName !== undefined ? { last_name: patch.lastName } : {}),
    ...(patch.email !== undefined ? { email: patch.email } : {}),
    ...(patch.phone !== undefined ? { phone: patch.phone ?? null } : {}),
    ...(patch.birthDate !== undefined ? { birth_date: patch.birthDate } : {}),
    ...(patch.technicianType !== undefined ? { technician_type: patch.technicianType } : {}),
    ...(patch.locationCityId !== undefined ? { location_city_id: patch.locationCityId } : {}),
    ...(patch.availability !== undefined ? {
      availability: {
        immediately: Boolean(patch.availability.immediately),
        available_from: patch.availability.availableFrom ?? null,
        contract_types: patch.availability.contractTypes ?? [],
      },
    } : {}),
    ...(patch.profileCompleteness !== undefined ? { profile_completeness: patch.profileCompleteness } : {}),
    ...(patch.socialLinks !== undefined ? { social_links: patch.socialLinks ?? null } : {}),
  };
}

function matchesSearchFilters(
  preview: SafeTechnicianPreview,
  filters: {
    technicianType?: string;
    licenseCode?: string;
    aircraftTypeCode?: string;
    country?: string;
    city?: string;
    verificationStatus?: string;
    availabilityStatus?: AvailabilityStatus;
    availableImmediately?: boolean;
  },
  ratingIndex: AircraftRatingIndex,
): boolean {
  if (filters.technicianType && preview.technicianType !== filters.technicianType) return false;
  if (filters.country && preview.country !== filters.country) return false;
  if (filters.city && preview.city !== filters.city) return false;
  if (filters.verificationStatus && preview.verificationStatus !== filters.verificationStatus) return false;
  if (filters.availabilityStatus && preview.availability.status !== filters.availabilityStatus) return false;
  if (filters.availableImmediately === true && !preview.availability.immediately) return false;
  if (filters.licenseCode && !preview.licenses.includes(filters.licenseCode as LicenseCode)) return false;
  if (
    filters.aircraftTypeCode &&
    !preview.habilitations.some((h) => {
      if (h.aircraftTypeCode === filters.aircraftTypeCode) return true;
      if (!h.aircraftTypeRatingId) return false;
      const rating = ratingIndex.get(h.aircraftTypeRatingId);
      return Boolean(rating) && ratingMatchesLegacyCode(rating!, filters.aircraftTypeCode as string);
    })
  ) {
    return false;
  }
  return true;
}

async function getPublicRow(id: string): Promise<DbRow | null> {
  const { data, error } = await supabase
    .from('technician_public_view')
    .select(PUBLIC_SELECT)
    .eq('id', id)
    .maybeSingle();
  throwIfError(error);
  return (data as DbRow | null) ?? null;
}

export const technicianRepositoryV2 = {
  async getAll(): Promise<TechnicianProfile[]> {
    const { data, error } = await supabase
      .from('technician_profiles')
      .select(PRIVATE_SELECT)
      .order('created_at', { ascending: false });
    throwIfError(error);
    const rows = (data ?? []) as DbRow[];
    return rows.map((row) => {
      const full = mapPrivateTechnicianRow(row);
      const { licenses: _licenses, habilitations: _habilitations, aircraftExperience: _aircraftExperience, ...profile } = full;
      return profile;
    });
  },

  async getPublicProfiles(): Promise<TechnicianProfile[]> {
    const { data, error } = await supabase
      .from('technician_public_view')
      .select(PUBLIC_SELECT)
      .eq('verification_status', 'verified');
    throwIfError(error);
    const rows = (data ?? []) as DbRow[];
    return rows.map((row) => {
      const full = publicRowToPrivateCompat(row);
      const { licenses: _licenses, habilitations: _habilitations, aircraftExperience: _aircraftExperience, ...profile } = full;
      return profile;
    });
  },

  async getById(id: string): Promise<TechnicianProfile | null> {
    const { data, error } = await supabase
      .from('technician_profiles')
      .select(PRIVATE_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (!error && data) {
      const full = mapPrivateTechnicianRow(data as DbRow);
      const { licenses: _licenses, habilitations: _habilitations, aircraftExperience: _aircraftExperience, ...profile } = full;
      return profile;
    }

    const publicRow = await getPublicRow(id);
    if (!publicRow) return null;
    const full = publicRowToPrivateCompat(publicRow);
    const { licenses: _licenses, habilitations: _habilitations, aircraftExperience: _aircraftExperience, ...profile } = full;
    return profile;
  },

  async getLicenses(technicianId: string) {
    const relations = await loadTechnicianRelations([technicianId]);
    return relations[technicianId]?.licenses ?? [];
  },

  async getHabilitations(technicianId: string) {
    const relations = await loadTechnicianRelations([technicianId]);
    return relations[technicianId]?.habilitations ?? [];
  },

  async getAircraftExperience(technicianId: string) {
    const relations = await loadTechnicianRelations([technicianId]);
    return relations[technicianId]?.aircraftExperience ?? [];
  },

  async getWithRelations(id: string): Promise<TechnicianWithRelations | null> {
    const relations = await loadTechnicianRelations([id]);
    const rel = relations[id];

    const { data, error } = await supabase
      .from('technician_profiles')
      .select(PRIVATE_SELECT)
      .eq('id', id)
      .maybeSingle();

    if (!error && data) return mapPrivateTechnicianRow(data as DbRow, rel);

    const publicRow = await getPublicRow(id);
    if (!publicRow) return null;
    return publicRowToPrivateCompat(publicRow, rel);
  },

  async getPublicWithRelations(id: string): Promise<TechnicianWithRelations | null> {
    const publicRow = await getPublicRow(id);
    if (!publicRow || publicRow.verification_status !== 'verified') return null;
    const relations = await loadTechnicianRelations([id]);
    return publicRowToPrivateCompat(publicRow, relations[id]);
  },

  async getSafeView(id: string): Promise<SafeTechnicianPreview | null> {
    const publicRow = await getPublicRow(id);
    if (!publicRow) return null;
    const relations = await loadTechnicianRelations([id]);
    return mapPublicTechnicianRow(publicRow, relations[id]);
  },

  async getViewForCompany(id: string, _companyId: string): Promise<TechnicianView | null> {
    const publicRow = await getPublicRow(id);
    if (!publicRow) return null;
    const relations = await loadTechnicianRelations([id]);
    const preview = mapPublicTechnicianView(publicRow, relations[id]);
    if (!isUnlocked(preview)) return preview;
    const documents = await documentRepositoryV2.getVerifiedForTechnician(id);
    return { ...preview, documents };
  },

  async update(id: string, patch: Partial<Omit<TechnicianProfile, 'id' | 'userId' | 'createdAt'>>): Promise<TechnicianProfile | null> {
    const { data, error } = await supabase
      .from('technician_profiles')
      .update(privatePatchToDb(patch))
      .eq('id', id)
      .select(PRIVATE_SELECT)
      .maybeSingle();
    throwIfError(error);
    if (!data) return null;
    const full = mapPrivateTechnicianRow(data as DbRow);
    const { licenses: _licenses, habilitations: _habilitations, aircraftExperience: _aircraftExperience, ...profile } = full;
    return profile;
  },

  async updateLicenses(technicianId: string, licenseCodes: string[]): Promise<void> {
    const { error: deleteError } = await supabase
      .from('technician_licenses')
      .delete()
      .eq('technician_id', technicianId);
    throwIfError(deleteError);

    if (licenseCodes.length === 0) return;
    const { error } = await supabase
      .from('technician_licenses')
      .insert(licenseCodes.map((code) => ({ technician_id: technicianId, license_code: code })));
    throwIfError(error);
  },

  /**
   * @deprecated Unsafe: a flat aircraft-type list has no way to say which
   * license each aircraft belongs to. The old implementation defaulted every
   * aircraft to the technician's *first* license, which silently created
   * false category+aircraft combinations (e.g. tagging a B2-only habilitation
   * as if it were held under B1.3). Use replaceHabilitations() instead, which
   * requires an explicit licenseCode per entry. This method is kept only so
   * legacy call sites still type-check; calling it always throws so it can
   * never re-create a false association.
   */
  async updateAircraftTypes(_technicianId: string, _aircraftTypeCodes: string[]): Promise<void> {
    throw new Error(
      'technicianRepositoryV2.updateAircraftTypes() is deprecated and unsafe — it cannot ' +
      'determine which license an aircraft type belongs to. Use replaceHabilitations() with ' +
      'explicit { licenseCode, aircraftTypeRatingId } pairs instead.',
    );
  },

  /**
   * Replaces a technician's normalized habilitations with an explicit set of
   * { licenseCode, aircraftTypeRatingId } pairs. Never infers or defaults the
   * license — every row must name its own category. Only rows that already
   * carry a rating id are replaced; legacy rows (aircraft_type_code only,
   * written before this rating catalog existed) are left untouched — they
   * are never auto-migrated to a specific rating.
   */
  async replaceHabilitations(
    technicianId: string,
    entries: {
      licenseCode: string;
      aircraftTypeRatingId: string;
      issuedAt?: string;
      expiresAt?: string;
      experienceYears?: number;
      isCurrent?: boolean;
    }[],
  ): Promise<void> {
    const { error: deleteError } = await supabase
      .from('technician_habilitations')
      .delete()
      .eq('technician_id', technicianId)
      .not('aircraft_type_rating_id', 'is', null);
    throwIfError(deleteError);

    if (entries.length === 0) return;
    const { error } = await supabase
      .from('technician_habilitations')
      .insert(
        entries.map((entry) => ({
          technician_id: technicianId,
          license_code: entry.licenseCode,
          aircraft_type_rating_id: entry.aircraftTypeRatingId,
          issued_at: entry.issuedAt ?? null,
          expires_at: entry.expiresAt ?? null,
          experience_years: entry.experienceYears ?? null,
          is_current: entry.isCurrent ?? true,
        })),
      );
    throwIfError(error);
  },

  /** Deletes a single habilitation row (legacy or normalized) by id. */
  async deleteHabilitation(id: string): Promise<void> {
    const { error } = await supabase.from('technician_habilitations').delete().eq('id', id);
    throwIfError(error);
  },

  async updateExperienceYears(technicianId: string, years: number): Promise<void> {
    const relations = await loadTechnicianRelations([technicianId]);
    const entries = relations[technicianId]?.aircraftExperience ?? [];
    if (entries.length === 0) return;

    const normalizedYears = Math.max(0, Math.round(years));
    const { error } = await supabase
      .from('technician_aircraft_experience')
      .update({ value: normalizedYears, unit: 'years' })
      .eq('technician_id', technicianId);
    throwIfError(error);
  },

  async search(filters: {
    technicianType?: string;
    licenseCode?: string;
    aircraftTypeCode?: string;
    country?: string;
    city?: string;
    verificationStatus?: string;
    availabilityStatus?: AvailabilityStatus;
    availableImmediately?: boolean;
  }): Promise<SafeTechnicianPreview[]> {
    const { data, error } = await supabase
      .from('technician_public_view')
      .select(PUBLIC_SELECT);
    throwIfError(error);

    const rows = (data ?? []) as DbRow[];
    const [relations, ratings] = await Promise.all([
      loadTechnicianRelations(rows.map((row) => row.id)),
      catalogRepository.getAircraftTypeRatings(),
    ]);
    const ratingIndex = buildAircraftRatingIndex(ratings);
    return rows
      .map((row) => mapPublicTechnicianRow(row, relations[row.id]))
      .filter((preview) => matchesSearchFilters(preview, filters, ratingIndex));
  },
};
