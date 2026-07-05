"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import type { Profile } from "@/lib/types";

type AuthContextValue = {
  isLoading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, role, created_at")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      console.error(error);
      setProfile(null);
      return;
    }

    setProfile(data ?? null);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!session?.user.id) return;
    await loadProfile(session.user.id);
  }, [loadProfile, session?.user.id]);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    let isMounted = true;

    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!isMounted) return;

      setSession(data.session);
      if (data.session?.user.id) {
        await loadProfile(data.session.user.id);
      }

      if (isMounted) setIsLoading(false);
    }

    bootstrap();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      if (nextSession?.user.id) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
      setIsLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      isLoading,
      session,
      profile,
      refreshProfile,
      signOut
    }),
    [isLoading, profile, refreshProfile, session, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
