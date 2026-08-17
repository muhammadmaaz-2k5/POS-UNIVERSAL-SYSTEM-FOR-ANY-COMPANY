'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Company, CompanyMember, UserRole } from '@/lib/types';

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  loading: boolean;
  companies: Company[];
  activeCompany: Company | null;
  activeMembership: CompanyMember | null;
  activeRole: UserRole | null;
  setActiveCompanyId: (id: string) => void;
  refreshCompanies: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [activeCompanyId, setActiveCompanyIdState] = useState<string | null>(null);
  const [activeMembership, setActiveMembership] = useState<CompanyMember | null>(null);

  const loadCompanies = useCallback(async (userId: string) => {
    const { data: memberships } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId);

    if (!memberships || memberships.length === 0) {
      setCompanies([]);
      setActiveCompanyIdState(null);
      return;
    }

    const companyIds = memberships.map((m) => m.company_id);
    const { data: companyData } = await supabase
      .from('companies')
      .select('*')
      .in('id', companyIds)
      .order('created_at', { ascending: true });

    setCompanies(companyData || []);

    if (companyData && companyData.length > 0) {
      const stored = typeof window !== 'undefined' ? localStorage.getItem('activeCompanyId') : null;
      const found = stored && companyData.find((c) => c.id === stored);
      setActiveCompanyIdState(found ? found.id : companyData[0].id);
    } else {
      setActiveCompanyIdState(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mounted) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadCompanies(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      (async () => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          await loadCompanies(session.user.id);
        } else {
          setCompanies([]);
          setActiveCompanyIdState(null);
          setActiveMembership(null);
        }
        setLoading(false);
      })();
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [loadCompanies]);

  // Fetch membership when active company changes
  useEffect(() => {
    if (!user || !activeCompanyId) {
      setActiveMembership(null);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('company_members')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', activeCompanyId)
        .maybeSingle();
      setActiveMembership(data);
    })();
  }, [user, activeCompanyId]);

  const setActiveCompanyId = useCallback((id: string) => {
    setActiveCompanyIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('activeCompanyId', id);
    }
  }, []);

  const refreshCompanies = useCallback(async () => {
    if (user) await loadCompanies(user.id);
  }, [user, loadCompanies]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setCompanies([]);
    setActiveCompanyIdState(null);
    setActiveMembership(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem('activeCompanyId');
    }
  }, []);

  const activeCompany = companies.find((c) => c.id === activeCompanyId) ?? null;
  const activeRole = activeMembership?.role ?? null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        companies,
        activeCompany,
        activeMembership,
        activeRole,
        setActiveCompanyId,
        refreshCompanies,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
