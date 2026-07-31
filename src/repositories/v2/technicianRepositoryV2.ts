import { supabase } from '../../lib/supabase';
import {
  TechnicianProfile,
  TechnicianWithRelations,
  AvailabilityStatus,
} from '../../types/technician';
import { SafeTechnicianPreview, TechnicianView, isUnlocked } from '../../types/privacy';
import { LicenseCode } from '../../types/catalog';
import { AircraftRatingIndex, buildAircraftRatingIndex, habilitationCoversFamilyKey } from '../../constants/aircraftTypeRatings';
import { catalogRepository } from './catalogRepository';
import {
  DbRow,
  loadTechnicianRelations,
  mapPrivateTechnicianRow,
  mapPublicTechnicianRow,
  mapPublicTechnicianView,
  publicRowToPrivateCompat,
  throwIfError,
  throwIfNoRows,
} from './supabaseMappers';
import { documentRepositoryV2 } from './documentRepositoryV2';
import { planLicenseRemoval, LicenseEntry } from '../../utils/licenseUpdatePlan';

const PRIVATE_SELECT = `
  id, user_id, anonymous_code, first_name, last_name, email, phone, birth_date,
  technician_type, location_city_id, availability, years_experience,
  verification_status, profile_completeness, social_links, created_at, updated_at
`;

const PUBLIC_SELECT = `
  id, anonymous_code, technician_type, location_city_id, country, city,
  base_airport, latitude, longitude, availability, years_experience,
  verification_status, profile_completeness, first_name, last_name, email,
  phone, social_links
`;

// Sub-fase de experiencia (2026-07-28) — FILTRO DURO, en el servidor.
//
// Traduce offer.minYearsExperience a un predicado de PostgREST, NO a un
// post-filtrado en JS. Es el unico filtro de este repositorio que corre de
// verdad en Postgres; los otros ocho siguen aplicandose en
// matchesSearchFilters() sobre las filas ya traidas (deuda inventariada en
// docs/MISSION_PART66.md, agravada por el tope de 1000 filas de PostgREST).
//
// La clausula `.is.null` NO es un detalle: ES la regla de producto "la
// ausencia de dato nunca penaliza", escrita en SQL. Excluye solo a quien
// tenga un valor DECLARADO por debajo del minimo; quien no ha declarado
// nada sigue apareciendo y la UI lo muestra como "not specified".
// Si alguna vez lo cambias a un `.gte()` a secas, estaras excluyendo
// silenciosamente a todo el que no haya rellenado el campo.
function applyMinYearsFilter<T extends { or: (f: string) => T }>(query: T, minYears?: number): T {
  if (!minYears || minYears <= 0) return query;
  return query.or(`years_experience.is.null,years_experience.gte.${minYears}`);
}

// ── Fase 5.6 (2026-07-28) — recorte visible en vez de silencioso ──────
//
// PostgREST corta cualquier respuesta en 1000 filas sin error ni aviso
// (comprobado: `Content-Range: 0-999/2500`). Las dos consultas de abajo
// traen filas de technician_public_view y aplican DESPUES, en JS, la mayor
// parte de sus filtros (matchesSearchFilters) — asi que un recorte no solo
// pierde resultados: hace que el filtro opere sobre un subconjunto
// arbitrario. Correctitud, no escalabilidad.
//
// MITIGACION, no arreglo. El arreglo de fondo es llevar los 8 filtros al
// servidor (backlog "search(): filtros a server-side", con alcance en
// docs/MISSION_PART66.md). Mientras tanto: rango explicito, conteo exacto,
// y un aviso ruidoso cuando el total supera lo traido.
//
// A diferencia del catalogo de ratings, aqui NO se lanza: dejar la busqueda
// inutilizable seria peor que devolver los primeros N con un aviso. Esa es
// justo la diferencia entre "un catalogo parcial es inservible" y "una
// busqueda parcial sigue sirviendo".
const TECHNICIAN_FETCH_LIMIT = 1000;

function warnIfTruncated(context: string, fetched: number, total: number | null): void {
  if (total === null || total <= fetched) return;
  console.warn(
    `[technicianRepositoryV2.${context}] Truncated: fetched ${fetched} of ${total} technicians ` +
      `(limit ${TECHNICIAN_FETCH_LIMIT}). Filters are applied client-side AFTER this fetch, so results ` +
      'are computed over a partial set. See docs/MISSION_PART66.md — backlog "search(): filtros a server-side".',
  );
}

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
      // Sólo `immediately` y `contract_types`. `status` es etiqueta de UI y
      // NUNCA se persiste; `available_from` se retiró en la 041.
      availability: {
        immediately: Boolean(patch.availability.immediately),
        contract_types: patch.availability.contractTypes ?? [],
      },
    } : {}),
    ...(patch.yearsExperience !== undefined ? { years_experience: patch.yearsExperience ?? null } : {}),
    ...(patch.profileCompleteness !== undefined ? { profile_completeness: patch.profileCompleteness } : {}),
    ...(patch.socialLinks !== undefined ? { social_links: patch.socialLinks ?? null } : {}),
  };
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
      const { licenses: _licenses, habilitations: _habilitations, ...profile } = full;
      return profile;
    });
  },

  async getPublicProfiles(minYearsExperience?: number): Promise<TechnicianProfile[]> {
    const { data, error, count } = await applyMinYearsFilter(
      supabase
        .from('technician_public_view')
        .select(PUBLIC_SELECT, { count: 'exact' })
        .eq('verification_status', 'verified'),
      minYearsExperience,
    ).range(0, TECHNICIAN_FETCH_LIMIT - 1);
    throwIfError(error);
    warnIfTruncated('getPublicProfiles', (data ?? []).length, count ?? null);
    const rows = (data ?? []) as DbRow[];
    return rows.map((row) => {
      const full = publicRowToPrivateCompat(row);
      const { licenses: _licenses, habilitations: _habilitations, ...profile } = full;
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
      const { licenses: _licenses, habilitations: _habilitations, ...profile } = full;
      return profile;
    }

    const publicRow = await getPublicRow(id);
    if (!publicRow) return null;
    const full = publicRowToPrivateCompat(publicRow);
    const { licenses: _licenses, habilitations: _habilitations, ...profile } = full;
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

  // getAircraftExperience() eliminado con la tabla (migracion 031). Tenia
  // cero call sites y la tabla cero filas: la mitad de lectura de una feature
  // cuya mitad de escritura nunca se construyo.

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
    const { licenses: _licenses, habilitations: _habilitations, ...profile } = full;
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
    const { data, error } = await supabase
      .from('technician_licenses')
      .upsert(
        entries.map((e) => ({
          technician_id: technicianId,
          license_code: e.code,
          issued_at: e.issuedAt ?? null,
          expires_at: e.expiresAt ?? null,
        })),
        { onConflict: 'technician_id,license_code' },
      )
      .select('license_code');
    throwIfError(error);
    // Hay entradas que escribir, así que 0 filas sólo puede significar que RLS
    // (tl_insert_own / tl_update_own) no dejó pasar ninguna — nunca un no-op
    // legítimo.
    throwIfNoRows(data, 'Could not save your licences — your session may have expired. Sign in again and retry.');
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
      const { data: deleted, error: deleteError } = await supabase
        .from('technician_licenses')
        .delete()
        .eq('technician_id', technicianId)
        .in('license_code', plan.deletes)
        .select('license_code');
      throwIfError(deleteError);
      // plan.deletes sale de filas que acabamos de leer, así que si no cae
      // ninguna es que RLS bloqueó el borrado, no que ya no estuvieran.
      throwIfNoRows(deleted, 'Could not remove the deselected licences — your session may have expired.');
    }

    return { blocked: plan.blocked };
  },

  /**
   * Replaces a technician's normalized habilitations with an explicit set of
   * { licenseCode, aircraftTypeRatingId } pairs. Never infers or defaults the
   * license — every row must name its own category.
   *
   * Fase 5.3 (2026-07-28): this used to spare rows without a rating id (the
   * legacy aircraft_type_code ones) from the delete. That exemption is gone
   * with the legacy catalog — every habilitation carries a rating id, and
   * migration 029 makes that a NOT NULL invariant.
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
    // SIN comprobación de filas, a propósito: un técnico que aún no tiene
    // ninguna habilitación borra CERO filas legítimamente, y es el caso normal
    // del primer guardado. Exigir >= 1 aquí convertiría el primer guardado de
    // todo técnico nuevo en un error. La red se pone en el INSERT de abajo,
    // que sí sabe cuántas filas debe producir.
    const { error: deleteError } = await supabase
      .from('technician_habilitations')
      .delete()
      .eq('technician_id', technicianId);
    throwIfError(deleteError);

    if (entries.length === 0) return;
    const { data, error } = await supabase
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
      )
      .select('id');
    throwIfError(error);
    // Aquí el delete ya se llevó las filas viejas: si el insert no entra, el
    // técnico se queda SIN habilitaciones y la pantalla diría "guardado".
    throwIfNoRows(data, 'Could not save your type ratings — your session may have expired. Sign in again and retry.');
  },

  /** Deletes a single habilitation row by id. */
  async deleteHabilitation(id: string): Promise<void> {
    const { data, error } = await supabase
      .from('technician_habilitations')
      .delete()
      .eq('id', id)
      .select('id');
    throwIfError(error);
    throwIfNoRows(data, 'Could not remove this type rating — it may no longer exist, or you may not have permission.');
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
    minYearsExperience?: number;
  }): Promise<SafeTechnicianPreview[]> {
    const { data, error, count } = await applyMinYearsFilter(
      supabase.from('technician_public_view').select(PUBLIC_SELECT, { count: 'exact' }),
      filters.minYearsExperience,
    ).range(0, TECHNICIAN_FETCH_LIMIT - 1);
    throwIfError(error);
    warnIfTruncated('search', (data ?? []).length, count ?? null);

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
