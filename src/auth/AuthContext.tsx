import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AppRole, UserStatus } from '../types/enums';

export interface SupabaseProfile {
  id: string;
  role: AppRole;
  status: UserStatus;
  created_at: string;
}

interface AuthContextValue {
  session: Session | null;
  profile: SupabaseProfile | null;
  /** True until initial session restore + optional profile fetch completes */
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<SupabaseProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Restore existing session on app start
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      if (s) {
        fetchProfile(s.user.id);
      } else {
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, s) => {
        setSession(s);
        if (s) {
          await ensureRoleProfile(s.user);
          fetchProfile(s.user.id);
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // Called on every SIGNED_IN event. When email confirmation is enabled,
  // data.session is null at signUp() time so the RPC is skipped there.
  // This function detects that gap and creates the role profile on first login.
  async function ensureRoleProfile(user: User): Promise<void> {
    const meta = user.user_metadata ?? {};
    const role = meta.role as string | undefined;
    if (!role) return;

    try {
      if (role === 'technician') {
        const { data } = await supabase
          .from('technician_profiles')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!data) {
          await supabase.rpc('signup_technician', {
            p_first_name: meta.first_name ?? '',
            p_last_name: meta.last_name ?? '',
            p_birth_date: meta.birth_date ?? '',
            p_technician_type: meta.technician_type ?? '',
            // Fase 6 tanda A. `?? null` y no `?? []`: una cuenta creada
            // antes de que el alta preguntara por varios tipos sólo tiene el
            // singular en su metadata, y NULL es justo lo que hace que el
            // RPC caiga en ARRAY[p_technician_type] — el array vacío también
            // caería ahí, pero NULL lo dice sin ambigüedad. Sin este
            // parámetro, quien confirme el email después de este despliegue
            // se crearía con un solo tipo aunque hubiese elegido tres.
            p_technician_types: meta.technician_types ?? null,
            p_location_city_id: meta.location_city_id ?? '',
            // `?? null` rather than `?? 0`: an account created before the
            // signup form asked for this has no value in its metadata, and
            // NULL means "not declared" — which never penalizes the
            // technician. Defaulting to 0 would invent a declaration of "no
            // experience" and get them filtered out of every offer with a
            // minimum. The signup form makes this required for new accounts;
            // this branch only runs for metadata written before that.
            p_years_experience: meta.years_experience ?? null,
          });
        }
      } else if (role === 'company_user') {
        const { data } = await supabase
          .from('company_members')
          .select('id')
          .eq('user_id', user.id)
          .maybeSingle();
        if (!data) {
          await supabase.rpc('signup_company', {
            p_company_name: meta.company_name ?? '',
            p_company_type: meta.company_type ?? '',
            p_location_city_id: meta.location_city_id ?? '',
          });
        }
      }
    } catch {
      // Best-effort: never block auth flow if profile creation fails
    }
  }

  async function fetchProfile(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, role, status, created_at')
      .eq('id', userId)
      .single();

    if (!error && data) {
      setProfile(data as SupabaseProfile);
    }
    setLoading(false);
  }

  async function signIn(
    email: string,
    password: string
  ): Promise<{ error: string | null }> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: error.message };
    return { error: null };
  }

  async function signOut(): Promise<void> {
    setLoading(true);
    // scope: 'local' clears only this device's session.
    // Using 'global' would sign the user out of all their devices,
    // which is undesirable when two people share one device.
    await supabase.auth.signOut({ scope: 'local' });
  }

  return (
    <AuthContext.Provider value={{ session, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}
