import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { CompanyProfile, CompanyMember } from '../../types/company';

export interface CompanyWithMembers extends CompanyProfile {
  members: CompanyMember[];
}

export const companyRepositoryV2 = {
  async getAll(): Promise<CompanyProfile[]> {
    return await storageAdapter.get<CompanyProfile[]>(DB_KEYS.v2Companies) ?? [];
  },

  async getById(id: string): Promise<CompanyProfile | null> {
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

  async getCompanyForUser(userId: string): Promise<{ company: CompanyProfile; member: CompanyMember } | null> {
    const allMembers = await storageAdapter.get<CompanyMember[]>(DB_KEYS.v2CompanyMembers) ?? [];
    const member = allMembers.find((m) => m.userId === userId);
    if (!member) return null;
    const company = await this.getById(member.companyId);
    if (!company) return null;
    return { company, member };
  },

  async update(id: string, patch: Partial<Omit<CompanyProfile, 'id' | 'createdAt'>>): Promise<CompanyProfile | null> {
    const companies = await this.getAll();
    const idx = companies.findIndex((c) => c.id === id);
    if (idx === -1) return null;

    const updated: CompanyProfile = {
      ...companies[idx],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = [...companies];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Companies, next);
    return updated;
  },
};
