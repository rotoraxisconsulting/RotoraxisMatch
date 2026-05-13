import { storageAdapter } from '../storage/asyncStorageAdapter';
import { DB_KEYS } from '../storage/localDatabase';
import { TechnicianDocument, DocumentStatus } from '../types';

export const documentRepository = {
  async getAll(): Promise<TechnicianDocument[]> {
    const data = await storageAdapter.get<TechnicianDocument[]>(DB_KEYS.documents);
    return data ?? [];
  },

  async getByTechnician(technicianId: string): Promise<TechnicianDocument[]> {
    const all = await this.getAll();
    return all.filter((d) => d.technicianId === technicianId);
  },

  async getById(id: string): Promise<TechnicianDocument | null> {
    const all = await this.getAll();
    return all.find((d) => d.id === id) ?? null;
  },

  async add(data: Omit<TechnicianDocument, 'id' | 'uploadedAt'>): Promise<TechnicianDocument> {
    const all = await this.getAll();
    const doc: TechnicianDocument = {
      ...data,
      id: `doc-${Date.now()}`,
      uploadedAt: new Date().toISOString(),
    };
    await storageAdapter.set(DB_KEYS.documents, [...all, doc]);
    return doc;
  },

  async updateStatus(id: string, status: DocumentStatus): Promise<TechnicianDocument | null> {
    const all = await this.getAll();
    const index = all.findIndex((d) => d.id === id);
    if (index === -1) return null;
    const updated = { ...all[index], status };
    all[index] = updated;
    await storageAdapter.set(DB_KEYS.documents, all);
    return updated;
  },
};
