import { storageAdapter } from '../../storage/asyncStorageAdapter';
import { DB_KEYS } from '../../storage/localDatabase';
import { Document } from '../../types/document';
import { DocumentStatus } from '../../types/enums';

export const documentRepositoryV2 = {
  async getAll(): Promise<Document[]> {
    return await storageAdapter.get<Document[]>(DB_KEYS.v2Documents) ?? [];
  },

  async getById(id: string): Promise<Document | null> {
    const docs = await this.getAll();
    return docs.find((d) => d.id === id) ?? null;
  },

  async getForTechnician(technicianId: string): Promise<Document[]> {
    const docs = await this.getAll();
    return docs.filter((d) => d.technicianId === technicianId);
  },

  async getVerifiedForTechnician(technicianId: string): Promise<Document[]> {
    const docs = await this.getForTechnician(technicianId);
    return docs.filter((d) => d.status === 'verified');
  },

  async updateStatus(
    id: string,
    status: DocumentStatus,
    verifiedBy?: string,
  ): Promise<Document | null> {
    const docs = await this.getAll();
    const idx = docs.findIndex((d) => d.id === id);
    if (idx === -1) return null;

    const updated: Document = {
      ...docs[idx],
      status,
      ...(status === 'verified' && verifiedBy
        ? { verifiedAt: new Date().toISOString(), verifiedBy }
        : {}),
    };

    const next = [...docs];
    next[idx] = updated;
    await storageAdapter.set(DB_KEYS.v2Documents, next);
    return updated;
  },

  async add(doc: Document): Promise<Document> {
    const docs = await this.getAll();
    const next = [...docs, doc];
    await storageAdapter.set(DB_KEYS.v2Documents, next);
    return doc;
  },

  async remove(id: string): Promise<boolean> {
    const docs = await this.getAll();
    const next = docs.filter((d) => d.id !== id);
    if (next.length === docs.length) return false;
    await storageAdapter.set(DB_KEYS.v2Documents, next);
    return true;
  },
};
