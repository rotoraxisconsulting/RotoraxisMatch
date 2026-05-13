import { storageAdapter } from '../storage/asyncStorageAdapter';
import { DB_KEYS } from '../storage/localDatabase';
import { Company } from '../types';

export const companyRepository = {
  async getAll(): Promise<Company[]> {
    const data = await storageAdapter.get<Company[]>(DB_KEYS.companies);
    return data ?? [];
  },

  async getById(id: string): Promise<Company | null> {
    const all = await this.getAll();
    return all.find((c) => c.id === id) ?? null;
  },

  async update(id: string, patch: Partial<Company>): Promise<Company | null> {
    const all = await this.getAll();
    const index = all.findIndex((c) => c.id === id);
    if (index === -1) return null;
    const updated = { ...all[index], ...patch };
    all[index] = updated;
    await storageAdapter.set(DB_KEYS.companies, all);
    return updated;
  },
};
