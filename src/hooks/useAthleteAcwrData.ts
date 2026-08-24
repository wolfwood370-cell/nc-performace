import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { acwrLookbackStartIso, computeAcwr, type AcwrComputation } from "@/lib/math/acwr";

interface WorkoutLogRow {
  id: string;
  /** Session RPE (CR-10) — the ONLY effort scale the load reads. The query
   *  deliberately does not fetch `rpe_global`: the per-set scale must never
   *  substitute the session one (scale error, not fallback). */
  srpe: number | null;
  duration_seconds: number | null;
  completed_at: string | null;
}

/** Pure adapter — this surface's ONLY route into the ACWR module. Maps raw
 *  `workout_logs` rows to module inputs and applies NO thresholds of its
 *  own; the parity test compares it with the other surfaces' adapters. */
export function athleteAcwrFromLogs(
  logs: ReadonlyArray<Pick<WorkoutLogRow, "srpe" | "duration_seconds" | "completed_at">>,
  todayIso: string,
): AcwrComputation {
  return computeAcwr(
    logs.map((log) => ({
      completedAt: log.completed_at,
      srpe: log.srpe,
      durationSeconds: log.duration_seconds,
    })),
    todayIso,
  );
}

export function useAthleteAcwrData(athleteId: string | undefined): {
  data: AcwrComputation | null;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useQuery({
    queryKey: ["athlete-acwr-data", athleteId],
    queryFn: async (): Promise<AcwrComputation> => {
      // Local calendar day — the same convention every load surface uses,
      // so the parity contract holds (same athlete, same today, same
      // outcome). The module itself takes "today" as an argument.
      const todayIso = format(new Date(), "yyyy-MM-dd");
      if (!athleteId) return athleteAcwrFromLogs([], todayIso);

      // Fetch bound from the module (day boundary, ACWR_LOOKBACK_DAYS
      // deep): the window is the module's contract, and a day boundary
      // keeps two surfaces mounted at different hours on the same universe.
      const { data: logs, error: logsError } = await supabase
        .from("workout_logs")
        .select("id, srpe, duration_seconds, completed_at")
        .eq("athlete_id", athleteId)
        .not("completed_at", "is", null)
        .gte("completed_at", acwrLookbackStartIso(todayIso))
        .order("completed_at", { ascending: false });

      if (logsError) throw logsError;

      return athleteAcwrFromLogs((logs ?? []) as WorkoutLogRow[], todayIso);
    },
    enabled: !!athleteId,
    staleTime: Infinity,
  });

  return {
    data: data ?? null,
    isLoading,
    error: error as Error | null,
  };
}
