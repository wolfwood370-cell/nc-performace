// =============================================================================
// src/features/nutrition/useNutritionEntitlement.ts
// First micro-step of the F0 entitlement rewiring, scoped to ONE feature:
// reads tier_entitlements (config table, RLS SELECT authenticated) for the
// F0 profiles.tier enum. The legacy useFeatureAccess is intentionally NOT
// extended: it normalises the coach-side subscription_tier text and degrades
// 'monthly' to 'free' — wrong for athletes.
// This is a commercial/UX barrier ONLY. The DATA defense is the own-row RLS
// on nutrition_releases; any future WRITE (option B) must be gated
// server-side in the edge functions, never by this hook.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { log } from "@/lib/logger";

export function useNutritionEntitlement() {
  const { user, profile, loading: authLoading } = useAuth();
  const tier = profile?.tier ?? null;

  const query = useQuery({
    queryKey: ["tier-entitlement", "nutrition", tier],
    queryFn: async (): Promise<boolean> => {
      if (!tier) return false;
      const { data, error } = await supabase
        .from("tier_entitlements")
        .select("enabled")
        .eq("tier", tier)
        .eq("feature", "nutrition")
        .maybeSingle();
      if (error) {
        log.error("Error fetching nutrition entitlement:", error);
        throw error;
      }
      return data?.enabled === true;
    },
    enabled: !authLoading && !!user && tier !== null,
    staleTime: 10 * 60 * 1000,
  });

  return {
    // Fail-closed: no tier, missing row or query error all read as false.
    entitled: tier !== null && query.data === true,
    // Still loading while auth resolves, while this hook's own profile fetch
    // is in flight (each useAuth call has independent state), or while the
    // entitlement query runs. Prevents a spurious redirect in that window.
    isLoading: authLoading || (!!user && !profile) || (tier !== null && query.isPending),
    isError: query.isError,
  };
}
