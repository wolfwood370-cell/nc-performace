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
//
// The tier alone is NOT the answer (fix 2026-07-20): profiles.tier is written at
// INVITE time, so an autonomous athlete who has never paid already carries
// tier='monthly' and used to see this feature for free. The entitlement is
// therefore the tier map AND an account that is currently entitled to something —
// see hasActiveAccess, which also keeps coached athletes (billed off-platform, no
// Stripe subscription) from being locked out.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hasActiveAccess } from "@/lib/billing/access";
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
    // Fail-closed: no tier, missing row, query error or an account that is not
    // currently entitled to anything all read as false.
    entitled: tier !== null && query.data === true && hasActiveAccess(profile, new Date()),
    // Still loading while auth resolves, while this hook's own profile fetch
    // is in flight (each useAuth call has independent state), or while the
    // entitlement query runs. Prevents a spurious redirect in that window.
    isLoading: authLoading || (!!user && !profile) || (tier !== null && query.isPending),
    isError: query.isError,
  };
}
