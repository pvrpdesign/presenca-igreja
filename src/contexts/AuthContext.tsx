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
  authError: string | null;
  isLoading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const PROFILE_CACHE_KEY = "igreja-presenca.profile";
const AUTH_TIMEOUT_MS = 8000;
const PROFILE_TIMEOUT_MS = 6000;

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T | null> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  return Promise.race<T | null>([
    promise,
    new Promise<null>((resolve) => {
      timeout = setTimeout(() => resolve(null), timeoutMs);
    })
  ]).finally(() => {
    if (timeout) clearTimeout(timeout);
  });
}

function readCachedProfile(userId: string) {
  try {
    const rawProfile = window.localStorage.getItem(PROFILE_CACHE_KEY);
    if (!rawProfile) return null;

    const cachedProfile = JSON.parse(rawProfile) as Profile;
    return cachedProfile.id === userId ? cachedProfile : null;
  } catch {
    return null;
  }
}

function writeCachedProfile(profile: Profile | null) {
  try {
    if (profile) {
      window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
    } else {
      window.localStorage.removeItem(PROFILE_CACHE_KEY);
    }
  } catch {
    // Local storage can be blocked in some browsers. The app still works without the cache.
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [authError, setAuthError] = useState<string | null>(null);
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
      return null;
    }

    const nextProfile = data ?? null;
    setProfile(nextProfile);
    writeCachedProfile(nextProfile);
    return nextProfile;
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
      setAuthError(null);

      const sessionResponse = await withTimeout(
        supabase.auth.getSession(),
        AUTH_TIMEOUT_MS
      );

      if (!isMounted) return;

      if (!sessionResponse) {
        setAuthError("A conexão demorou demais para confirmar o login. Verifique a internet e tente atualizar a página.");
        setIsLoading(false);
        return;
      }

      const { data } = sessionResponse;
      setSession(data.session);

      if (data.session?.user.id) {
        const cachedProfile = readCachedProfile(data.session.user.id);

        if (cachedProfile) {
          setProfile(cachedProfile);
          setIsLoading(false);
          void loadProfile(data.session.user.id);
          return;
        }

        const nextProfile = await withTimeout(
          loadProfile(data.session.user.id),
          PROFILE_TIMEOUT_MS
        );

        if (!isMounted) return;

        if (!nextProfile) {
          setAuthError("O login foi encontrado, mas o perfil demorou para carregar. Atualize a página ou tente novamente em alguns segundos.");
        }
      }

      if (isMounted) setIsLoading(false);
    }

    bootstrap();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setAuthError(null);
      setSession(nextSession);
      if (nextSession?.user.id) {
        const cachedProfile = readCachedProfile(nextSession.user.id);
        if (cachedProfile) {
          setProfile(cachedProfile);
          setIsLoading(false);
        }
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
        writeCachedProfile(null);
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
    writeCachedProfile(null);
  }, []);

  const value = useMemo(
    () => ({
      authError,
      isLoading,
      session,
      profile,
      refreshProfile,
      signOut
    }),
    [authError, isLoading, profile, refreshProfile, session, signOut]
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
