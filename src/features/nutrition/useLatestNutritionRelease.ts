// =============================================================================
// src/features/nutrition/useLatestNutritionRelease.ts
// Read-only data hook for the athlete nutrition screen. Two SELECTs in one
// queryFn (useAthleteHealthProfile pattern):
//   1. latest own nutrition_releases row (released_at desc, limit 1);
//   2. most recent UNREAD 'nutrition_review' notification (the pause signal).
// RLS (nutrition_releases_select_own / notifications own-row) is the defense;
// the .eq filters are scoping, not security. NO writes anywhere in this
// feature — the unread notification is intentionally NOT marked as read.
// =============================================================================

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { log } from "@/lib/logger";
import { NUTRITION_REVIEW_NOTIFICATION_TYPE } from "./describeRelease";
import type { NutritionReleaseDbRow } from "./types";

export interface LatestNutritionData {
  release: NutritionReleaseDbRow | null;
  /** created_at of the most recent unread 'nutrition_review' notification. */
  unreadReviewNoticeAt: string | null;
}

export function useLatestNutritionRelease() {
  const { user } = useAuth();

  const query = useQuery({
    queryKey: ["nutrition-release-latest", user?.id],
    queryFn: async (): Promise<LatestNutritionData> => {
      if (!user?.id) return { release: null, unreadReviewNoticeAt: null };

      const [releaseRes, noticeRes] = await Promise.all([
        supabase
          .from("nutrition_releases")
          .select("*")
          .eq("athlete_id", user.id)
          .order("released_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("notifications")
          .select("created_at")
          .eq("user_id", user.id)
          .eq("type", NUTRITION_REVIEW_NOTIFICATION_TYPE)
          .eq("read", false)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

      if (releaseRes.error) {
        log.error("Error fetching latest nutrition release:", releaseRes.error);
        throw releaseRes.error;
      }
      if (noticeRes.error) {
        log.error("Error fetching nutrition review notice:", noticeRes.error);
        throw noticeRes.error;
      }

      return {
        release: releaseRes.data ?? null,
        unreadReviewNoticeAt: noticeRes.data?.created_at ?? null,
      };
    },
    enabled: !!user?.id,
    // The safety-pause signal must not linger in the persisted IndexedDB
    // cache: override the global staleTime: Infinity and refetch on mount.
    staleTime: 5 * 60 * 1000,
    refetchOnMount: "always",
  });

  return {
    data: query.data,
    isLoading: query.isPending,
    isError: query.isError,
    refetch: query.refetch,
  };
}
