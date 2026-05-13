export type UserRole = 'technician' | 'company' | 'admin';

export interface DemoSession {
  role: UserRole;
  sessionId: string;
  startedAt: string;
}
