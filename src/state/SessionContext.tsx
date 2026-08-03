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

// Fase 5.4 — BLINDAJE DE DEUDA (2026-07-28). Las tres sesiones son
// `T | null`, nunca un objeto relleno de cadenas vacías.
//
// Por qué: el mismo crash —leer companyId/technicianId antes de que este
// contexto resolviera su propio fetch async contra
// `company_members`/`technician_profiles`— apareció TRES veces seguidas,
// pantalla a pantalla (offers list, offer detail, useMapTechnicians), antes
// de cerrarse en la raíz gateando CompanyLayout/TechnicianLayout también en
// `sessionLoading`. Ese gate cierra el bug activo, pero no impide que una
// ruta FUTURA fuera de esos dos layouts repita el error de `map.tsx` (la
// única que vivía fuera y hubo que mover a `app/company/map.tsx`).
//
// Un `companyId: ''` COMPILA y parece válido: se propaga hasta una query
// Supabase que devuelve 0 filas o revienta con un uuid inválido, lejos del
// origen. `null` no compila sin comprobarlo. El objetivo de este cambio es
// que el error salga en `tsc`, no en producción.
//
// NO reintroduzcas un EMPTY_* "para simplificar": esa constante ERA el bug.
export interface LocalSessionContextValue {
  technician: LocalTechnicianSession | null;
  company: LocalCompanySession | null;
  admin: LocalAdminSession | null;
  sessionLoading: boolean;
}

const DEFAULT_VALUE: LocalSessionContextValue = {
  technician: null,
  company: null,
  admin: null,
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
            // Sin fila en technician_profiles no hay sesión de técnico que
            // ofrecer. Antes esto producía `technicianId: ''`; ahora es
            // null y quien lo consuma tiene que decidir qué hacer.
            technician: data?.id
              ? { profileId: profile.id, role: 'technician', technicianId: data.id }
              : null,
            company: null,
            admin: null,
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
            technician: null,
            // Idem: sin membresía resuelta no hay sesión de empresa.
            company: data?.company_id && data?.id
              ? {
                  profileId: profile.id,
                  role: 'company_user',
                  companyId: data.company_id,
                  companyMemberId: data.id,
                  companyMemberRole: (data.role as CompanyMemberRole) ?? 'viewer',
                }
              : null,
            admin: null,
            sessionLoading: false,
          });
        });
    } else if (profile.role === 'admin') {
      setValue({
        technician: null,
        company: null,
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

// null mientras `sessionLoading`, y también cuando el perfil autenticado no
// tiene fila de técnico/miembro de empresa que resolver. Comprueba antes de
// desestructurar — `tsc` no te dejará no hacerlo, que es justo el punto.
export function useTechnicianSession(): LocalTechnicianSession | null {
  return useSession().technician;
}

export function useCompanySession(): LocalCompanySession | null {
  return useSession().company;
}
