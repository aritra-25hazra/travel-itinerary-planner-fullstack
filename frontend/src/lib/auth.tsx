import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { authEnabled, supabase } from "./supabase";

interface AuthCtx {
  session: Session | null;
  loading: boolean;
  enabled: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>({
  session: null, loading: false, enabled: false,
  signIn: async () => "Auth not configured", signUp: async () => "Auth not configured", signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState<boolean>(authEnabled);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthCtx = {
    session,
    loading,
    enabled: authEnabled,
    signIn: async (email, password) => {
      if (!supabase) return "Auth not configured";
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      return error ? error.message : null;
    },
    signUp: async (email, password) => {
      if (!supabase) return "Auth not configured";
      const { error, data } = await supabase.auth.signUp({ email, password });
      if (error) return error.message;
      if (!data.session) return "Check your inbox to confirm your email, then sign in.";
      return null;
    },
    signOut: async () => {
      await supabase?.auth.signOut();
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
