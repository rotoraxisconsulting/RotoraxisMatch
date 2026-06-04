import React, { createContext, useContext, useEffect, useState } from 'react';
import { AppRole, CompanyMemberRole } from '../types/enums';
import { supabase } from '../lib/supabase';
import { useAuth } from '../auth/AuthContext';

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
  sessionLoading: boolean;
}

const EMPTY_TECH: LocalTechnicianSession = {
  profileId: '',
  role: 'technician',
  technicianId: '',
};

const EMPTY_COMPANY: LocalCompanySession = {
  profileId: '',
  role: 'company_user',
  companyId: '',
  companyMemberId: '',
  companyMemberRole: 'viewer',
};

const EMPTY_ADMIN: LocalAdminSession = {
  profileId: '',
  role: 'admin',
};

const DEFAULT_VALUE: LocalSessionContextValue = {
  technician: EMPTY_TECH,
  company: EMPTY_COMPANY,
  admin: EMPTY_ADMIN,
  sessionLoading: true,
};

const SessionContext = createContext<LocalSessionContextValue>(DEFAULT_VALUE);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { profile, loading: authLoading } = useAuth();
  const [value, setValue] = useState<LocalSessionContextValue>(DEFAULT_VALUE);

  useEffect(() => {
    if (authLoading) return;

    if (!profile) {
      setValue({ ...DEFAULT_VALUE, sessionLoading: false });
      return;
    }

    setValue((prev) => ({ ...prev, sessionLoading: true }));

    if (profile.role === 'technician') {
      supabase
        .from('technician_profiles')
        .select('id')
        .eq('user_id', profile.id)
        .maybeSingle()
        .then(({ data }) => {
          setValue({
            technician: {
              profileId: profile.id,
              role: 'technician',
              technicianId: data?.id ?? '',
            },
            company: EMPTY_COMPANY,
            admin: EMPTY_ADMIN,
            sessionLoading: false,
          });
        });
    } else if (profile.role === 'company_user') {
      supabase
        .from('company_members')
        .select('id, company_id, role')
        .eq('user_id', profile.id)
        .maybeSingle()
        .then(({ data }) => {
          setValue({
            technician: EMPTY_TECH,
            company: {
              profileId: profile.id,
              role: 'company_user',
              companyId: data?.company_id ?? '',
              companyMemberId: data?.id ?? '',
              companyMemberRole: (data?.role as CompanyMemberRole) ?? 'viewer',
            },
            admin: EMPTY_ADMIN,
            sessionLoading: false,
          });
        });
    } else if (profile.role === 'admin') {
      setValue({
        technician: EMPTY_TECH,
        company: EMPTY_COMPANY,
        admin: { profileId: profile.id, role: 'admin' },
        sessionLoading: false,
      });
    } else {
      setValue({ ...DEFAULT_VALUE, sessionLoading: false });
    }
  }, [authLoading, profile?.id, profile?.role]);

  return (
    <SessionContext.Provider value={value}>
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
