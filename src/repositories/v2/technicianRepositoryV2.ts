import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import {
  TechnicianProfile,
  TechnicianLicense,
  TechnicianHabilitation,
  TechnicianAircraftExperience,
  TechnicianWithRelations,
} from '../../types/technician';
import { SafeTechnicianPreview, UnlockedTechnicianView, TechnicianView } from '../../types/privacy';
import { OfferRequest, OfferApplication } from '../../types/offerRequest';
import { LicenseCode } from '../../types/catalog';
import { documentRepositoryV2 } from './documentRepositoryV2';

function computeAge(birthDate: string): number {
  const today = new Date();
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

export const technicianRepositoryV2 = {
  async getAll(): Promise<TechnicianProfile[]> {
    return await storageAdapter.get<TechnicianProfile[]>(DB_KEYS.v2TechnicianProfiles) ?? [];
  },

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

  async getSafeView(id: string): Promise<SafeTechnicianPreview | null> {
    const full = await this.getWithRelations(id);
    if (!full) return null;

    return {
      id: full.id,
      anonymousCode: full.anonymousCode,
      age: computeAge(full.birthDate),
      technicianType: full.technicianType,
      country: full.country,
      city: full.city,
      baseAirport: full.baseAirport,
      licenses: full.licenses.map((l) => l.licenseCode as LicenseCode),
      habilitations: full.habilitations,
      aircraftExperience: full.aircraftExperience,
      availability: full.availability,
      verificationStatus: full.verificationStatus,
    };
  },

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

    const updated: TechnicianProfile = {
      ...all[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = [...all];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2TechnicianProfiles, next);
    return updated;
  },

  async search(filters: {
    technicianType?: string;
    licenseCode?: string;
    aircraftTypeCode?: string;
    country?: string;
    city?: string;
    verificationStatus?: string;
    availableImmediately?: boolean;
  }): Promise<SafeTechnicianPreview[]> {
    const profiles = await this.getAll();
    const allLicenses = await storageAdapter.get<TechnicianLicense[]>(DB_KEYS.v2TechnicianLicenses) ?? [];
    const allHabilitations = await storageAdapter.get<TechnicianHabilitation[]>(DB_KEYS.v2TechnicianHabilitations) ?? [];

    const results: SafeTechnicianPreview[] = [];

    for (const profile of profiles) {
      if (filters.technicianType && profile.technicianType !== filters.technicianType) continue;
      if (filters.country && profile.country !== filters.country) continue;
      if (filters.city && profile.city !== filters.city) continue;
      if (filters.verificationStatus && profile.verificationStatus !== filters.verificationStatus) continue;
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
        country: profile.country,
        city: profile.city,
        baseAirport: profile.baseAirport,
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
