import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { CompanyProfile, CompanyMember, CompanyProfileView } from '../../types/company';
import { CompanyMemberRole } from '../../types/enums';
import { resolveLocationSnapshot } from '../../constants/locationCities';

export interface CompanyWithMembers extends CompanyProfileView {
  members: CompanyMember[];
}

type LegacyCompanyProfile = CompanyProfile & {
  country?: string;
  city?: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;
};

type CompanyProfilePatch = Partial<Omit<CompanyProfile, 'id' | 'createdAt'>> & {
  country?: string;
  city?: string;
  baseAirport?: string;
  latitude?: number;
  longitude?: number;
};

async function getStoredCompanies(): Promise<LegacyCompanyProfile[]> {
  return await storageAdapter.get<LegacyCompanyProfile[]>(DB_KEYS.v2Companies) ?? [];
}

function normalizeCompanyStorage(company: LegacyCompanyProfile): CompanyProfile {
  const location = resolveLocationSnapshot({
    locationCityId: company.locationCityId,
    country: company.country,
    city: company.city,
    baseAirport: company.baseAirport,
  });
  const { country, city, baseAirport, latitude, longitude, ...stored } = company;

  return {
    ...stored,
    locationCityId: location?.locationCityId ?? company.locationCityId,
  };
}

function toCompanyView(company: LegacyCompanyProfile): CompanyProfileView {
  const stored = normalizeCompanyStorage(company);
  const location = resolveLocationSnapshot({
    locationCityId: stored.locationCityId,
    country: company.country,
    city: company.city,
    baseAirport: company.baseAirport,
  });

  return {
    ...stored,
    country: location?.country ?? company.country ?? '',
    city: location?.city ?? company.city ?? '',
    baseAirport: location?.baseAirport ?? company.baseAirport,
    latitude: location?.latitude ?? company.latitude,
    longitude: location?.longitude ?? company.longitude,
  };
}

function storedPatch(patch: CompanyProfilePatch): Partial<Omit<CompanyProfile, 'id' | 'createdAt'>> {
  const { country, city, baseAirport, latitude, longitude, ...companyPatch } = patch;
  return companyPatch;
}

export const companyRepositoryV2 = {
  async getAll(): Promise<CompanyProfileView[]> {
    const companies = await getStoredCompanies();
    return companies.map(toCompanyView);
  },

  async getById(id: string): Promise<CompanyProfileView | null> {
    const companies = await this.getAll();
    return companies.find((c) => c.id === id) ?? null;
  },

  async getMembers(companyId: string): Promise<CompanyMember[]> {
    const members = await storageAdapter.get<CompanyMember[]>(DB_KEYS.v2CompanyMembers) ?? [];
    return members.filter((m) => m.companyId === companyId);
  },

  async getMemberByUserId(companyId: string, userId: string): Promise<CompanyMember | null> {
    const members = await this.getMembers(companyId);
    return members.find((m) => m.userId === userId) ?? null;
  },

  async getWithMembers(id: string): Promise<CompanyWithMembers | null> {
    const company = await this.getById(id);
    if (!company) return null;
    const members = await this.getMembers(id);
    return { ...company, members };
  },

  async getCompanyForUser(userId: string): Promise<{ company: CompanyProfileView; member: CompanyMember } | null> {
    const allMembers = await storageAdapter.get<CompanyMember[]>(DB_KEYS.v2CompanyMembers) ?? [];
    const member = allMembers.find((m) => m.userId === userId);
    if (!member) return null;
    const company = await this.getById(member.companyId);
    if (!company) return null;
    return { company, member };
  },

  async addMember(
    companyId: string,
    userId: string,
    role: CompanyMemberRole,
  ): Promise<CompanyMember> {
    const members = await storageAdapter.get<CompanyMember[]>(DB_KEYS.v2CompanyMembers) ?? [];
    const existing = members.find((m) => m.userId === userId);
    if (existing?.companyId === companyId) throw new Error('This user is already a member of this company.');
    if (existing) throw new Error('This user already belongs to a company in the MVP.');

    const newMember: CompanyMember = {
      id: `cm-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      companyId,
      userId,
      role,
      createdAt: new Date().toISOString(),
    };
    await storageAdapter.set(DB_KEYS.v2CompanyMembers, [...members, newMember]);
    return newMember;
  },

  async updateMemberRole(memberId: string, role: CompanyMemberRole): Promise<CompanyMember | null> {
    const members = await storageAdapter.get<CompanyMember[]>(DB_KEYS.v2CompanyMembers) ?? [];
    const idx = members.findIndex((m) => m.id === memberId);
    if (idx === -1) return null;

    const member = members[idx];
    // Prevent demoting the last admin
    if (member.role === 'admin' && role !== 'admin') {
      const adminCount = members.filter(
        (m) => m.companyId === member.companyId && m.role === 'admin',
      ).length;
      if (adminCount <= 1) throw new Error('Cannot demote the last admin of this company.');
    }

    const updated: CompanyMember = { ...member, role };
    const next = [...members];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2CompanyMembers, next);
    return updated;
  },

  async removeMember(memberId: string): Promise<void> {
    const members = await storageAdapter.get<CompanyMember[]>(DB_KEYS.v2CompanyMembers) ?? [];
    const member = members.find((m) => m.id === memberId);
    if (!member) throw new Error('Member not found.');

    // Prevent removing the last admin
    if (member.role === 'admin') {
      const adminCount = members.filter(
        (m) => m.companyId === member.companyId && m.role === 'admin',
      ).length;
      if (adminCount <= 1) throw new Error('Cannot remove the last admin of this company.');
    }

    await storageAdapter.set(
      DB_KEYS.v2CompanyMembers,
      members.filter((m) => m.id !== memberId),
    );
  },

  async update(id: string, patch: CompanyProfilePatch): Promise<CompanyProfileView | null> {
    const companies = await getStoredCompanies();
    const storedCompanies = companies.map(normalizeCompanyStorage);
    const idx = storedCompanies.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const existing = { ...companies[idx], ...storedCompanies[idx] };
    const patchLocation = resolveLocationSnapshot({
      locationCityId: patch.locationCityId ?? existing.locationCityId,
      country: patch.country,
      city: patch.city,
      baseAirport: patch.baseAirport,
    });

    const updated: CompanyProfile = normalizeCompanyStorage({
      ...existing,
      ...storedPatch(patch),
      locationCityId: patchLocation?.locationCityId ?? patch.locationCityId ?? existing.locationCityId,
      updatedAt: new Date().toISOString(),
    });
    const next = [...storedCompanies];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Companies, next);
    return toCompanyView(updated);
  },
};
