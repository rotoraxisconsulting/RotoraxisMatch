import { useState, useEffect, useCallback } from 'react';
import {
  demoSessionRepository,
  DemoSession,
  UserRole,
} from '../repositories/demoSessionRepository';

interface UseDemoSessionReturn {
  session: DemoSession | null;
  loading: boolean;
  selectRole: (role: UserRole) => Promise<DemoSession>;
  clearSession: () => Promise<void>;
}

export function useDemoSession(): UseDemoSessionReturn {
  const [session, setSession] = useState<DemoSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    demoSessionRepository.get().then((s) => {
      setSession(s);
      setLoading(false);
    });
  }, []);

  const selectRole = useCallback(async (role: UserRole): Promise<DemoSession> => {
    const newSession = await demoSessionRepository.save(role);
    setSession(newSession);
    return newSession;
  }, []);

  const clearSession = useCallback(async (): Promise<void> => {
    await demoSessionRepository.clear();
    setSession(null);
  }, []);

  return { session, loading, selectRole, clearSession };
}
