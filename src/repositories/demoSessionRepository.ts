import { storageAdapter } from '../storage/asyncStorageAdapter';
import { UserRole, DemoSession } from '../types/session';

export type { UserRole, DemoSession };

const STORAGE_KEY = 'demo_session_v1';

export const demoSessionRepository = {
  async get(): Promise<DemoSession | null> {
    return storageAdapter.get<DemoSession>(STORAGE_KEY);
  },

  async save(role: UserRole): Promise<DemoSession> {
    const session: DemoSession = {
      role,
      sessionId: `demo_${Date.now()}`,
      startedAt: new Date().toISOString(),
    };
    await storageAdapter.set(STORAGE_KEY, session);
    return session;
  },

  async clear(): Promise<void> {
    await storageAdapter.remove(STORAGE_KEY);
  },
};
