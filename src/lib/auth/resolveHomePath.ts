// =============================================================================
// src/lib/auth/resolveHomePath.ts
// =============================================================================
// I/O half of the post-login routing: reads the profile, then delegates the
// decision to the pure `pickHomePath`. Kept in its own file so the pure module
// stays importable from vitest (`environment: "node"`, no Supabase client).
// =============================================================================

import { supabase } from "@/integrations/supabase/client";
import { pickHomePath } from "./homePath";

/** `/auth` only when there is genuinely no session to route. */
export async function resolveHomePath(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "/auth";

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, onboarding_completed")
    .eq("id", user.id)
    .maybeSingle();

  return pickHomePath({
    role: profile?.role ?? null,
    onboardingCompleted: profile?.onboarding_completed ?? null,
  });
}
