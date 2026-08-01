/**
 * src/hooks/useCoachData.tsx
 * ---------------------------------------------------------------------------
 * The coach roster query, and nothing else.
 *
 * This file used to also hold `useCoachDashboardData()` — an 8-rule triage
 * (no_checkin, low_readiness, pain_reported, high_stress, low_mood,
 * digestion_issues, overreaching_risk, active_injury) — and a `useCoachData()`
 * convenience wrapper. Neither was exported and neither had a call site: the
 * triage never ran for a single athlete. Retired on 2026-08-01 (census
 * `docs/CENSIMENTO-AVVISI-COACH.md` §1.A) rather than rewired, because
 * rewiring would have inherited its measured defects — an unbounded, unfiltered
 * `daily_readiness` fetch of art. 9 data persisted to IndexedDB, no own
 * `staleTime`, a 28-day window frozen outside the query key, and a UTC `today`
 * — and would have added a fourth parallel triage with thresholds of its own
 * next to `useCoachDashboardMetrics` and `useAthletesRiskOverview`.
 *
 * What the coach actually sees today comes from those live hooks; the
 * server-side escalation channel has its own surface in `CoachAlertsPanel`.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";

interface Athlete {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  coach_id: string | null;
}

export function useCoachAthletes() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ["coach-athletes", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("coach_id", user.id)
        .eq("role", "athlete");

      if (error) throw error;
      return data as Athlete[];
    },
    enabled: !!user && profile?.role === "coach",
  });
}
