import { useMemo, useCallback } from "react";
import { useAuth } from "@/hooks/useAuth";

// ---------------------------------------------------------------------------
// Tier type & limits configuration
// ---------------------------------------------------------------------------

export type SubscriptionTier = "free" | "basic" | "pro";

/** Numeric-limit features – value = max allowed per period */
const NUMERIC_LIMITS = {
  ai_vision_daily: { free: 0, basic: 5, pro: 999 },
  ai_chat_daily: { free: 0, basic: 5, pro: 50 },
  max_active_programs: { free: 1, basic: 3, pro: 999 },
} as const;

/** Boolean-gate features – value = whether the tier has access */
const BOOLEAN_GATES = {
  video_feedback: { free: false, basic: false, pro: true },
} as const;

type NumericFeature = keyof typeof NUMERIC_LIMITS;
type BooleanFeature = keyof typeof BOOLEAN_GATES;
export type Feature = NumericFeature | BooleanFeature;

// ---------------------------------------------------------------------------
// Helper to normalise the tier coming from the profile
// ---------------------------------------------------------------------------

function normaliseTier(raw: string | null | undefined): SubscriptionTier {
  if (!raw) return "free";
  const lower = raw.toLowerCase();
  if (lower === "pro" || lower === "premium") return "pro";
  if (lower === "basic") return "basic";
  return "free";
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useFeatureAccess() {
  const { profile } = useAuth();

  const tier = useMemo<SubscriptionTier>(
    () => normaliseTier(profile?.subscription_tier),
    [profile?.subscription_tier],
  );

  /**
   * Check whether the current tier has access to a feature.
   * For numeric features this returns `limit > 0`.
   * For boolean features it returns the gate value directly.
   */
  const canAccess = useCallback(
    (feature: Feature): boolean => {
      if (feature in BOOLEAN_GATES) {
        return BOOLEAN_GATES[feature as BooleanFeature][tier];
      }
      if (feature in NUMERIC_LIMITS) {
        return NUMERIC_LIMITS[feature as NumericFeature][tier] > 0;
      }
      return false;
    },
    [tier],
  );

  /**
   * Return the numeric limit for a feature on the current tier.
   * Returns 0 for boolean-gate features or unknown features.
   */
  const getLimit = useCallback(
    (feature: Feature): number => {
      if (feature in NUMERIC_LIMITS) {
        return NUMERIC_LIMITS[feature as NumericFeature][tier];
      }
      return 0;
    },
    [tier],
  );

  return { tier, canAccess, getLimit };
}
