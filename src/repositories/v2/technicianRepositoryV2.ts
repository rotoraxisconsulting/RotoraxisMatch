import { supabase } from '../../lib/supabase';
import {
  TechnicianProfile,
  TechnicianWithRelations,
  AvailabilityStatus,
} from '../../types/technician';
import { SafeTechnicianPreview, TechnicianView, isUnlocked } from '../../types/privacy';
import { LicenseCode } from '../../types/catalog';
import { AircraftRatingIndex, buildAircraftRatingIndex, getAircraftFamilyKey, resolveLegacyCodeToFamilyKeys } from '../../constants/aircraftTypeRatings';
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
import { planLicenseRemoval, LicenseEntry } from '../../utils/licenseUpdatePlan';

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

// A habilitation covers a required family key either via its resolved
// rating (exact family match) or, for rows that only ever recorded a bare
// legacy code, via inclusive code->family resolution (see
// resolveLegacyCodeToFamilyKeys — a code that aliases several families
// counts for all of them, never a guessed single one). Same rule
// offerMatchExplain.ts's evaluateLegacyBroadMatch uses for the offer-side
// broad aircraft filter — one definition, reused, never a second one that
// could drift.
function habilitationCoversFamilyKey(
  h: { aircraftTypeCode?: string; aircraftTypeRatingId?: string },
  familyKey: string,
  ratingIndex: AircraftRatingIndex,
): boolean {
  if (h.aircraftTypeRatingId) {
    const rating = ratingIndex.get(h.aircraftTypeRatingId);
    if (rating && getAircraftFamilyKey(rating) === familyKey) return true;
  }
  if (h.aircraftTypeCode && resolveLegacyCodeToFamilyKeys(h.aircraftTypeCode, ratingIndex).has(familyKey)) return true;
  return false;
}

// Empty/undefined means "no filter on this dimension" (matches everything);
// non-empty means "must match at least one" (OR within the array). Same
// semantics useMapTechnicians.ts's own matchesAny() already used
// client-side — now the one place both search() callers (search screen,
// map) go through server-side, instead of each rolling its own post-filter.
function matchesAny<T>(selected: T[] | undefined, value: T | undefined): boolean {
  if (!selected || selected.length === 0) return true;
  return value !== undefined && selected.includes(value);
}

function matchesSearchFilters(
  preview: SafeTechnicianPreview,
  filters: {
    technicianType?: string;
    licenseCodes?: string[];
    aircraftFamilyKeys?: string[];
    country?: string;
    city?: string;
    verificationStatuses?: string[];
    availabilityStatuses?: AvailabilityStatus[];
    availableImmediately?: boolean;
  },
  ratingIndex: AircraftRatingIndex,
): boolean {
  if (filters.technicianType && preview.technicianType !== filters.technicianType) return false;
  if (filters.country && preview.country !== filters.country) return false;
  if (filters.city && preview.city !== filters.city) return false;
  if (!matchesAny(filters.verificationStatuses, preview.verificationStatus)) return false;
  if (!matchesAny(filters.availabilityStatuses, preview.availability.status)) return false;
  if (filters.availableImmediately === true && !preview.availability.immediately) return false;
  if (
    filters.licenseCodes && filters.licenseCodes.length > 0 &&
    !filters.licenseCodes.some((code) => preview.licenses.includes(code as LicenseCode))
  ) {
    return false;
  }
  if (
    filters.aircraftFamilyKeys && filters.aircraftFamilyKeys.length > 0 &&
    !preview.habilitations.some((h) =>
      filters.aircraftFamilyKeys!.some((key) => habilitationCoversFamilyKey(h, key, ratingIndex)),
    )
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

  /**
   * Upserts (insert-or-update-in-place) the technician's held licenses —
   * NEVER deletes. Callers that also save habilitations in the same flow
   * (e.g. the profile screen) must call this BEFORE replaceHabilitations(),
   * so a brand-new license code already has a row by the time a
   * habilitation references it — technician_habilitations' composite FK
   * (fk_technician_habilitations_license, migration 016/018) requires the
   * (technician_id, license_code) pair to pre-exist. Pair with
   * removeUnreferencedLicenses() for the deletion half.
   */
  async upsertLicenses(technicianId: string, entries: LicenseEntry[]): Promise<void> {
    if (entries.length === 0) return;
    const { error } = await supabase
      .from('technician_licenses')
      .upsert(
        entries.map((e) => ({
          technician_id: technicianId,
          license_code: e.code,
          issued_at: e.issuedAt ?? null,
          expires_at: e.expiresAt ?? null,
        })),
        { onConflict: 'technician_id,license_code' },
      );
    throwIfError(error);
  },

  /**
   * Deletes license rows the technician no longer wants (any existing code
   * absent from `nextCodes`) — but ONLY the ones no habilitation still
   * references; a delete-then-reinsert of a still-referenced row fails
   * outright against fk_technician_habilitations_license (see
   * upsertLicenses' comment), and deleting the technician's real
   * habilitations just to force the license delete through would be worse.
   * Call this AFTER replaceHabilitations() in any flow that saves both in
   * the same action, so the dependency check reflects the technician's
   * actual final state instead of a stale pre-save snapshot. Returns the
   * codes that could NOT be removed, so the caller can tell the technician
   * why instead of surfacing a DB error.
   */
  async removeUnreferencedLicenses(technicianId: string, nextCodes: string[]): Promise<{ blocked: string[] }> {
    const { data: existingRows, error: selectError } = await supabase
      .from('technician_licenses')
      .select('license_code')
      .eq('technician_id', technicianId);
    throwIfError(selectError);
    const existingCodes = (existingRows ?? []).map((r: any) => r.license_code as string);

    const nextSet = new Set(nextCodes);
    const candidateCodes = existingCodes.filter((c) => !nextSet.has(c));
    if (candidateCodes.length === 0) return { blocked: [] };

    const { data: depRows, error: depError } = await supabase
      .from('technician_habilitations')
      .select('license_code')
      .eq('technician_id', technicianId)
      .in('license_code', candidateCodes);
    throwIfError(depError);
    const dependentCodes = [...new Set((depRows ?? []).map((r: any) => r.license_code as string))];

    const plan = planLicenseRemoval(candidateCodes, dependentCodes);

    if (plan.deletes.length > 0) {
      const { error: deleteError } = await supabase
        .from('technician_licenses')
        .delete()
        .eq('technician_id', technicianId)
        .in('license_code', plan.deletes);
      throwIfError(deleteError);
    }

    return { blocked: plan.blocked };
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

  async search(filters: {
    technicianType?: string;
    licenseCodes?: string[];
    aircraftFamilyKeys?: string[];
    country?: string;
    city?: string;
    verificationStatuses?: string[];
    availabilityStatuses?: AvailabilityStatus[];
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
