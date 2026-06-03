import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import {
  TechnicianProfile,
  TechnicianLicense,
  TechnicianHabilitation,
  TechnicianAircraftExperience,
  TechnicianWithRelations,
  AvailabilityStatus,
} from '../../types/technician';
import { SafeTechnicianPreview, UnlockedTechnicianView, TechnicianView } from '../../types/privacy';
import { OfferRequest, OfferApplication } from '../../types/offerRequest';
import { LicenseCode } from '../../types/catalog';
import { Profile } from '../../types/profile';
import { withAvailabilityStatus } from '../../utils/v2CompatAdapters';
import { documentRepositoryV2 } from './documentRepositoryV2';
import { resolveLocationSnapshot } from '../../constants/locationCities';

function computeAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function normalizeProfile<T extends TechnicianProfile>(profile: T): T {
  const {
    country: _legacyCountry,
    city: _legacyCity,
    baseAirport: _legacyBaseAirport,
    latitude: _legacyLatitude,
    longitude: _legacyLongitude,
    ...profileWithoutLegacyCoordinates
  } = profile as T & {
    country?: string;
    city?: string;
    baseAirport?: string;
    latitude?: number;
    longitude?: number;
  };
  const location = resolveLocationSnapshot({
    locationCityId: profile.locationCityId,
    country: _legacyCountry,
    city: _legacyCity,
    baseAirport: _legacyBaseAirport,
  });

  return {
    ...profileWithoutLegacyCoordinates,
    locationCityId: location?.locationCityId ?? profile.locationCityId,
    availability: withAvailabilityStatus(profile.availability),
  } as T;
}

async function getActiveUserIds(): Promise<Set<string>> {
  const profiles = await storageAdapter.get<Profile[]>(DB_KEYS.v2Profiles) ?? [];
  return new Set(
    (profiles as Profile[])
      .filter((profile) => profile.role === 'technician' && profile.status === 'active')
      .map((profile) => profile.id),
  );
}

function isPublicTechnician(profile: TechnicianProfile, activeUserIds: Set<string>): boolean {
  return profile.verificationStatus === 'verified' && activeUserIds.has(profile.userId);
}

function toSafeTechnicianPreview(
  full: TechnicianWithRelations,
): SafeTechnicianPreview {
  const location = resolveLocationSnapshot(full);

  return {
    id: full.id,
    anonymousCode: full.anonymousCode,
    age: computeAge(full.birthDate),
    technicianType: full.technicianType,
    locationCityId: location?.locationCityId ?? full.locationCityId,
    country: location?.country ?? '',
    city: location?.city ?? '',
    baseAirport: location?.baseAirport,
    latitude: location?.latitude,
    longitude: location?.longitude,
    licenses: full.licenses.map((l) => l.licenseCode as LicenseCode),
    habilitations: full.habilitations,
    aircraftExperience: full.aircraftExperience,
    availability: full.availability,
    verificationStatus: full.verificationStatus,
  };
}

export const technicianRepositoryV2 = {
  // =========================================================================
  // INTERNAL-ONLY methods — return TechnicianProfile (full private record).
  // DO NOT call these from company-facing screens or hooks.
  // Use getSafeView() / getViewForCompany() / search() for company contexts.
  //
  // Future Supabase: these map to direct SELECT on technician_profiles.
  // Company users never have RLS access to that table directly — they go
  // through technician_public_view or get_unlocked_technician() RPC.
  // =========================================================================

  async getAll(): Promise<TechnicianProfile[]> {
    const profiles = await storageAdapter.get<TechnicianProfile[]>(DB_KEYS.v2TechnicianProfiles) ?? [];
    return profiles.map(normalizeProfile);
  },

  /** Internal: returns full profiles with private fields. Admin and technician own-profile use only. */
  async getPublicProfiles(): Promise<TechnicianProfile[]> {
    const [profiles, activeUserIds] = await Promise.all([
      this.getAll(),
      getActiveUserIds(),
    ]);
    return profiles.filter((profile) => isPublicTechnician(profile, activeUserIds));
  },

  /** Internal: returns full private TechnicianProfile. Never pass to company-facing code. */
  async getById(id: string): Promise<TechnicianProfile | null> {
    const all = await this.getAll();
    return all.find((t) => t.id === id) ?? null;
  },

  async getLicenses(technicianId: string): Promise<TechnicianLicense[]> {
    const all = await storageAdapter.get<TechnicianLicense[]>(DB_KEYS.v2TechnicianLicenses) ?? [];
    return all.filter((l) => l.technicianId === technicianId);
  },

  async getHabilitations(technicianId: string): Promise<TechnicianHabilitation[]> {
    const all = await storageAdapter.get<TechnicianHabilitation[]>(DB_KEYS.v2TechnicianHabilitations) ?? [];
    return all.filter((h) => h.technicianId === technicianId);
  },

  async getAircraftExperience(technicianId: string): Promise<TechnicianAircraftExperience[]> {
    const all = await storageAdapter.get<TechnicianAircraftExperience[]>(DB_KEYS.v2TechnicianAircraftExperience) ?? [];
    return all.filter((e) => e.technicianId === technicianId);
  },

  /** Internal: full TechnicianWithRelations including private fields. Technician/admin/matching use only. */
  async getWithRelations(id: string): Promise<TechnicianWithRelations | null> {
    const profile = await this.getById(id);
    if (!profile) return null;
    const [licenses, habilitations, aircraftExperience] = await Promise.all([
      this.getLicenses(id),
      this.getHabilitations(id),
      this.getAircraftExperience(id),
    ]);
    return { ...profile, licenses, habilitations, aircraftExperience };
  },

  /** Internal: same as getWithRelations but only for verified+active profiles. Used by matching utils. */
  async getPublicWithRelations(id: string): Promise<TechnicianWithRelations | null> {
    const [profile, activeUserIds] = await Promise.all([
      this.getById(id),
      getActiveUserIds(),
    ]);
    if (!profile || !isPublicTechnician(profile, activeUserIds)) return null;

    const [licenses, habilitations, aircraftExperience] = await Promise.all([
      this.getLicenses(id),
      this.getHabilitations(id),
      this.getAircraftExperience(id),
    ]);
    return { ...profile, licenses, habilitations, aircraftExperience };
  },

  // =========================================================================
  // COMPANY-SAFE methods — return SafeTechnicianPreview / TechnicianView.
  // Private fields (firstName, lastName, email, phone, birthDate, socialLinks,
  // documents) are never present in the returned object before acceptance.
  //
  // Future Supabase mapping:
  //   getSafeView()        →  SELECT from technician_public_view (private cols NULL until accepted)
  //   getViewForCompany()  →  get_unlocked_technician(tech_id) RPC (returns unlocked shape if accepted)
  //   search()             →  search_technicians_public(filters) RPC
  // =========================================================================

  /**
   * Returns a SafeTechnicianPreview (TechnicianPublicPreviewDTO) for a company view.
   * No private fields — safe to render on any company screen regardless of acceptance state.
   */
  async getSafeView(id: string): Promise<SafeTechnicianPreview | null> {
    const full = await this.getPublicWithRelations(id);
    if (!full) return null;
    return toSafeTechnicianPreview(full);
  },

  /**
   * Returns either a SafeTechnicianPreview or UnlockedTechnicianView depending on whether
   * the given company has an accepted offer record with this technician.
   *
   * This is the single entry-point for company detail screens (application detail, chat).
   * Always use this — never build the view manually in a screen.
   *
   * Future Supabase: replaced by get_unlocked_technician(tech_id) RPC which performs
   * the same accepted-record check server-side via offer_accepted_between().
   */
  async getViewForCompany(id: string, companyId: string): Promise<TechnicianView | null> {
    const safeView = await this.getSafeView(id);
    if (!safeView) return null;

    const [requests, applications] = await Promise.all([
      storageAdapter.get<OfferRequest[]>(DB_KEYS.v2OfferRequests) ?? [],
      storageAdapter.get<OfferApplication[]>(DB_KEYS.v2OfferApplications) ?? [],
    ]);

    const hasAccepted =
      (requests as OfferRequest[]).some(
        (r) => r.companyId === companyId && r.technicianId === id && r.status === 'accepted',
      ) ||
      (applications as OfferApplication[]).some(
        (a) => a.companyId === companyId && a.technicianId === id && a.status === 'accepted',
      );

    if (!hasAccepted) return safeView;

    const [profile, documents] = await Promise.all([
      this.getById(id) as Promise<TechnicianProfile>,
      documentRepositoryV2.getVerifiedForTechnician(id),
    ]);

    const unlocked: UnlockedTechnicianView = {
      ...safeView,
      firstName: profile.firstName,
      lastName: profile.lastName,
      email: profile.email,
      phone: profile.phone,
      socialLinks: profile.socialLinks,
      documents,
    };
    return unlocked;
  },

  async update(id: string, patch: Partial<Omit<TechnicianProfile, 'id' | 'userId' | 'createdAt'>>): Promise<TechnicianProfile | null> {
    const all = await this.getAll();
    const idx = all.findIndex((t) => t.id === id);
    if (idx === -1) return null;

    const updated: TechnicianProfile = normalizeProfile({
      ...all[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    const next = [...all];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2TechnicianProfiles, next);
    return updated;
  },

  async updateLicenses(technicianId: string, licenseCodes: string[]): Promise<void> {
    const all = await storageAdapter.get<TechnicianLicense[]>(DB_KEYS.v2TechnicianLicenses) ?? [];
    const kept = (all as TechnicianLicense[]).filter((l) => l.technicianId !== technicianId);
    const now = new Date().toISOString();
    const added: TechnicianLicense[] = licenseCodes.map((code, i) => ({
      id: `lic-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      technicianId,
      licenseCode: code as LicenseCode,
      createdAt: now,
    }));
    await storageAdapter.set(DB_KEYS.v2TechnicianLicenses, [...kept, ...added]);
  },

  async updateAircraftTypes(technicianId: string, aircraftTypeCodes: string[]): Promise<void> {
    const [allHabs, allLics] = await Promise.all([
      storageAdapter.get<TechnicianHabilitation[]>(DB_KEYS.v2TechnicianHabilitations) ?? [],
      storageAdapter.get<TechnicianLicense[]>(DB_KEYS.v2TechnicianLicenses) ?? [],
    ]);
    const kept = (allHabs as TechnicianHabilitation[]).filter((h) => h.technicianId !== technicianId);
    const myLics = (allLics as TechnicianLicense[]).filter((l) => l.technicianId === technicianId);
    const defaultLicenseCode: LicenseCode = myLics[0]?.licenseCode ?? ('B1.1' as LicenseCode);
    const now = new Date().toISOString();
    const added: TechnicianHabilitation[] = aircraftTypeCodes.map((code, i) => ({
      id: `hab-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      technicianId,
      licenseCode: defaultLicenseCode,
      aircraftTypeCode: code,
      createdAt: now,
    }));
    await storageAdapter.set(DB_KEYS.v2TechnicianHabilitations, [...kept, ...added]);
  },

  async updateExperienceYears(technicianId: string, years: number): Promise<void> {
    const all = await storageAdapter.get<TechnicianAircraftExperience[]>(DB_KEYS.v2TechnicianAircraftExperience) ?? [];
    const normalizedYears = Math.max(0, Math.round(years));
    const entries = (all as TechnicianAircraftExperience[]).filter((e) => e.technicianId === technicianId);

    if (entries.length === 0) {
      // No per-aircraft experience rows exist for this technician.
      // Do NOT create a fallback row with a non-catalog code such as 'GENERAL'.
      // Flat yearsExperience is a V1/demo display adapter — it cannot create new V2 experience rows.
      // To add aircraft experience, use a V2 experience editor with a real aircraftTypeCode from the catalog.
      // Future Supabase: technician_aircraft_experience.aircraft_type_code has a FK → aircraft_types.code.
      return;
    }

    const toYears = (entry: TechnicianAircraftExperience) => (
      entry.unit === 'years' ? entry.value : Math.round(entry.value / 2000)
    );
    const primary = [...entries].sort((a, b) => toYears(b) - toYears(a))[0];

    const next = (all as TechnicianAircraftExperience[]).map((entry) => {
      if (entry.technicianId !== technicianId) return entry;
      if (entry.id === primary.id || toYears(entry) > normalizedYears) {
        return { ...entry, value: normalizedYears, unit: 'years' as const };
      }
      return entry;
    });

    await storageAdapter.set(DB_KEYS.v2TechnicianAircraftExperience, next);
  },

  /**
   * Returns SafeTechnicianPreview[] (TechnicianPublicPreviewDTO[]) matching the given filters.
   * No private fields in any result — safe for the company search screen.
   *
   * Future Supabase: replaced by search_technicians_public(filters) RPC which runs the same
   * filter logic in SQL and returns rows from technician_public_view.
   */
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
    const profiles = await this.getPublicProfiles();
    const allLicenses = await storageAdapter.get<TechnicianLicense[]>(DB_KEYS.v2TechnicianLicenses) ?? [];
    const allHabilitations = await storageAdapter.get<TechnicianHabilitation[]>(DB_KEYS.v2TechnicianHabilitations) ?? [];

    const results: SafeTechnicianPreview[] = [];

    for (const profile of profiles) {
      const location = resolveLocationSnapshot(profile);
      if (filters.technicianType && profile.technicianType !== filters.technicianType) continue;
      if (filters.country && location?.country !== filters.country) continue;
      if (filters.city && location?.city !== filters.city) continue;
      if (filters.verificationStatus && profile.verificationStatus !== filters.verificationStatus) continue;
      if (filters.availabilityStatus && profile.availability.status !== filters.availabilityStatus) continue;
      if (filters.availableImmediately === true && !profile.availability.immediately) continue;

      const techLicenses = (allLicenses as TechnicianLicense[]).filter((l) => l.technicianId === profile.id);
      if (filters.licenseCode && !techLicenses.some((l) => l.licenseCode === filters.licenseCode)) continue;

      const techHabilitations = (allHabilitations as TechnicianHabilitation[]).filter((h) => h.technicianId === profile.id);
      if (filters.aircraftTypeCode && !techHabilitations.some((h) => h.aircraftTypeCode === filters.aircraftTypeCode)) continue;

      const allExp = await storageAdapter.get<TechnicianAircraftExperience[]>(DB_KEYS.v2TechnicianAircraftExperience) ?? [];
      const techExp = (allExp as TechnicianAircraftExperience[]).filter((e) => e.technicianId === profile.id);

      results.push({
        id: profile.id,
        anonymousCode: profile.anonymousCode,
        age: computeAge(profile.birthDate),
        technicianType: profile.technicianType,
        locationCityId: location?.locationCityId ?? profile.locationCityId,
        country: location?.country ?? '',
        city: location?.city ?? '',
        baseAirport: location?.baseAirport,
        latitude: location?.latitude,
        longitude: location?.longitude,
        licenses: techLicenses.map((l) => l.licenseCode as LicenseCode),
        habilitations: techHabilitations,
        aircraftExperience: techExp,
        availability: profile.availability,
        verificationStatus: profile.verificationStatus,
      });
    }

    return results;
  },
};
