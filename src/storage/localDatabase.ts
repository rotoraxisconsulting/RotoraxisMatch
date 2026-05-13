import { storageAdapter } from './asyncStorageAdapter';
import technicianSeeds from '../data/technicians.json';
import companySeeds from '../data/companies.json';
import matchRequestSeeds from '../data/matchRequests.json';
import documentSeeds from '../data/documents.json';

export const DB_KEYS = {
  initialized: 'db:initialized',
  technicians: 'db:technicians',
  companies: 'db:companies',
  matchRequests: 'db:matchRequests',
  documents: 'db:documents',
} as const;

export const localDatabase = {
  async isInitialized(): Promise<boolean> {
    const flag = await storageAdapter.get<boolean>(DB_KEYS.initialized);
    return flag === true;
  },

  async initializeFromSeeds(): Promise<void> {
    const already = await this.isInitialized();
    if (already) return;
    await this.resetToSeeds();
  },

  async resetToSeeds(): Promise<void> {
    await storageAdapter.set(DB_KEYS.technicians, technicianSeeds);
    await storageAdapter.set(DB_KEYS.companies, companySeeds);
    await storageAdapter.set(DB_KEYS.matchRequests, matchRequestSeeds);
    await storageAdapter.set(DB_KEYS.documents, documentSeeds);
    await storageAdapter.set(DB_KEYS.initialized, true);
  },
};
