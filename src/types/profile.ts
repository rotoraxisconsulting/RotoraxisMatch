import { AppRole, UserStatus } from './enums';

export interface Profile {
  id: string; // = auth user id
  role: AppRole;
  status: UserStatus;
  createdAt: string; // ISO timestamp
}
