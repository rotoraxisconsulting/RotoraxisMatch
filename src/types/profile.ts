import { AppRole, UserStatus } from './enums';

export interface Profile {
  id: string; // = auth user id
  /** SERVER-ASSIGNED — set by auth trigger on registration; only admin can change after creation */
  role: AppRole;
  /** SERVER-MANAGED — set by admin (block/suspend) or auth flow; not directly writable by the owner */
  status: UserStatus;
  createdAt: string; // ISO timestamp
}
