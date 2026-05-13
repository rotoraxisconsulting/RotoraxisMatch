import { storageAdapter } from '../storage/asyncStorageAdapter';
import { DB_KEYS } from '../storage/localDatabase';
import { MatchRequest, MatchRequestStatus } from '../types';

export const matchRequestRepository = {
  async getAll(): Promise<MatchRequest[]> {
    const data = await storageAdapter.get<MatchRequest[]>(DB_KEYS.matchRequests);
    return data ?? [];
  },

  async getByCompany(companyId: string): Promise<MatchRequest[]> {
    const all = await this.getAll();
    return all.filter((r) => r.companyId === companyId);
  },

  async getByTechnician(technicianId: string): Promise<MatchRequest[]> {
    const all = await this.getAll();
    return all.filter((r) => r.technicianId === technicianId);
  },

  async getById(id: string): Promise<MatchRequest | null> {
    const all = await this.getAll();
    return all.find((r) => r.id === id) ?? null;
  },

  async create(data: Omit<MatchRequest, 'id' | 'createdAt'>): Promise<MatchRequest> {
    const all = await this.getAll();
    const request: MatchRequest = {
      ...data,
      id: `mr-${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    await storageAdapter.set(DB_KEYS.matchRequests, [...all, request]);
    return request;
  },

  async updateStatus(
    id: string,
    status: MatchRequestStatus,
    identityRevealed?: boolean,
  ): Promise<MatchRequest | null> {
    const all = await this.getAll();
    const index = all.findIndex((r) => r.id === id);
    if (index === -1) return null;
    const updated: MatchRequest = {
      ...all[index],
      status,
      ...(identityRevealed !== undefined ? { identityRevealed } : {}),
    };
    all[index] = updated;
    await storageAdapter.set(DB_KEYS.matchRequests, all);
    return updated;
  },
};
