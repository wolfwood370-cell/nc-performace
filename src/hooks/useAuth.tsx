import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { LOGIN_OTP_TYPE, normalizeOtpInput } from "@/lib/auth/otp";

interface Profile {
  id: string;
  role: "coach" | "athlete";
  full_name: string | null;
  coach_id: string | null;
  avatar_url: string | null;
  one_rm_data: Record<string, number>;
  onboarding_completed: boolean;
  subscription_status: string | null;
  subscription_tier: string | null;
  coaching_mode: Database["public"]["Enums"]["coaching_mode"] | null;
  tier: Database["public"]["Enums"]["tier"] | null;
  objective: Database["public"]["Enums"]["objective"] | null;
}

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
  });
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mountedRef.current) return;
      setState((prev) => ({ ...prev, session, user: session?.user ?? null }));

      if (session?.user) {
        // Fetch profile - use setTimeout to avoid race condition
        setTimeout(async () => {
          if (!mountedRef.current) return;
          const { data: profile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", session.user.id)
            .maybeSingle();

          if (!mountedRef.current) return;
          setState((prev) => ({
            ...prev,
            profile: profile as Profile | null,
            loading: false,
          }));
        }, 0);
      } else {
        setState((prev) => ({ ...prev, profile: null, loading: false }));
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      if (!session) {
        setState((prev) => ({ ...prev, loading: false }));
      }
    });

    return () => {
      mountedRef.current = false;
      subscription.unsubscribe();
    };
  }, []);

  const signUp = async (email: string, password: string, fullName: string) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
        data: {
          // No role here: handle_new_user ignores client-supplied roles —
          // public signups are always athletes, coaches are created admin-side.
          full_name: fullName,
        },
      },
    });

    if (error) throw error;
    return data;
  };

  /**
   * Passwordless sign-in with the code delivered by `request-login-link`.
   * The email itself is sent by that edge function (Resend, NC-brand domain),
   * NOT by `signInWithOtp` — one source only, so a login never produces two
   * different emails.
   */
  const verifyOtp = async (email: string, token: string) => {
    const { data, error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: normalizeOtpInput(token),
      type: LOGIN_OTP_TYPE,
    });

    if (error) throw error;
    return data;
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;

    // Clear Zustand persisted state
    try {
      localStorage.removeItem("active-workout-storage");
    } catch {
      /* ignore */
    }

    // Clear offline sync queue
    try {
      localStorage.removeItem("offline_workout_queue");
      localStorage.removeItem("last_feedback_timestamp");
    } catch {
      /* ignore */
    }

    // Clear the intake draft: it holds health answers (art. 9) and must not
    // survive a logout on a shared device. Key literal pinned by
    // src/features/intake/__tests__/config.test.ts against store.ts.
    try {
      localStorage.removeItem("intake_draft_v1");
    } catch {
      /* ignore */
    }

    // Clear IndexedDB offline storage
    try {
      const dbs = await indexedDB.databases();
      for (const db of dbs) {
        if (db.name) indexedDB.deleteDatabase(db.name);
      }
    } catch {
      /* ignore */
    }

    // Hard reload to fully reset JS memory
    window.location.href = "/auth";
  };

  return {
    ...state,
    signUp,
    signIn,
    verifyOtp,
    signOut,
    isCoach: state.profile?.role === "coach",
    isAthlete: state.profile?.role === "athlete",
  };
}
