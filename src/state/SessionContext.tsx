import React, { createContext, useContext } from 'react';
import { AppRole, CompanyMemberRole } from '../types/enums';

export interface LocalTechnicianSession {
  profileId: string;
  role: Extract<AppRole, 'technician'>;
  technicianId: string;
}

export interface LocalCompanySession {
  profileId: string;
  role: Extract<AppRole, 'company_user'>;
  companyId: string;
  companyMemberId: string;
  companyMemberRole: CompanyMemberRole;
}

export interface LocalAdminSession {
  profileId: string;
  role: Extract<AppRole, 'admin'>;
}

export interface LocalSessionContextValue {
  technician: LocalTechnicianSession;
  company: LocalCompanySession;
  admin: LocalAdminSession;
}

const LOCAL_SESSION: LocalSessionContextValue = {
  technician: {
    profileId: 'prof-t001',
    role: 'technician',
    technicianId: 'tech-001',
  },
  company: {
    profileId: 'prof-c001a',
    role: 'company_user',
    companyId: 'comp-001',
    companyMemberId: 'cm-001',
    companyMemberRole: 'admin',
  },
  admin: {
    profileId: 'prof-admin01',
    role: 'admin',
  },
};

const SessionContext = createContext<LocalSessionContextValue>(LOCAL_SESSION);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  return (
    <SessionContext.Provider value={LOCAL_SESSION}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): LocalSessionContextValue {
  return useContext(SessionContext);
}

export function useTechnicianSession(): LocalTechnicianSession {
  return useSession().technician;
}

export function useCompanySession(): LocalCompanySession {
  return useSession().company;
}

export function useAdminSession(): LocalAdminSession {
  return useSession().admin;
}
