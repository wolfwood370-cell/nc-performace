// =============================================================================
// src/hooks/athlete/useAthleteReadinessHooks.ts
// =============================================================================
// React Query hooks for athlete daily readiness — replaces the prior
// in-memory Zustand mock. The `daily_readiness` table has a UNIQUE
// (athlete_id, date) constraint, so submission is an upsert keyed on that
// pair. Reads are date-scoped so the dashboard's "is today completed?"
// gate is a one-row lookup.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";

export type DailyReadinessRow = Tables<"daily_readiness">;

const readinessKey = (athleteId: string | undefined, date: string) =>
  ["daily-readiness", athleteId ?? "anon", date] as const;

/**
 * Fetch a single day's readiness row for the current athlete.
 *
 * Returns `null` when no row exists (i.e. the check-in hasn't been done
 * yet). Consumers should treat `null` as "not completed today".
 *
 * `opts.staleTime` lets a consumer opt out of the app-wide fresh-forever
 * cache (global staleTime Infinity + IndexedDB persist). The daily
 * check-in seeds a clinical answer (has_pain) from this row: with
 * staleTime 0 the row is re-read from the server whenever the observer
 * lands on the key — including the switch from the pre-auth "anon" key
 * to the real one — instead of trusting whatever another tab, device or
 * session left in the persisted cache.
 */
export function useDailyReadinessQuery(date: string, opts?: { staleTime?: number }) {
  const { user } = useAuth();
  return useQuery({
    queryKey: readinessKey(user?.id, date),
    queryFn: async (): Promise<DailyReadinessRow | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("daily_readiness")
        .select("*")
        .eq("athlete_id", user.id)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return data ?? null;
    },
    enabled: Boolean(user?.id),
    ...opts,
  });
}

/**
 * Payload for a daily readiness submission. Mirrors the database column
 * names so callers can pass exactly what the DB stores.
 *
 * `date` defaults to today (caller can override for backfill).
 */
export interface SubmitReadinessInput {
  date?: string;
  fatigue_score?: number | null;
  sleep_quality?: number | null;
  stress_level?: number | null;
  mood?: number | null;
  digestion?: number | null;
  energy?: number | null;
  sleep_hours?: number | null;
  has_pain?: boolean | null;
  soreness_map?: TablesInsert<"daily_readiness">["soreness_map"];
  notes?: string | null;
  score?: number | null;
  body_weight?: number | null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Upsert today's (or any date's) readiness row for the current athlete.
 * Conflicting on (athlete_id, date) so re-submission on the same day
 * overwrites instead of erroring.
 */
export function useSubmitReadinessMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SubmitReadinessInput) => {
      if (!user?.id) throw new Error("Non autenticato.");
      const date = input.date ?? todayIso();
      const payload: TablesInsert<"daily_readiness"> = {
        athlete_id: user.id,
        date,
        fatigue_score: input.fatigue_score ?? null,
        sleep_quality: input.sleep_quality ?? null,
        stress_level: input.stress_level ?? null,
        mood: input.mood ?? null,
        digestion: input.digestion ?? null,
        energy: input.energy ?? null,
        sleep_hours: input.sleep_hours ?? null,
        has_pain: input.has_pain ?? null,
        soreness_map: input.soreness_map ?? null,
        notes: input.notes ?? null,
        score: input.score ?? null,
        body_weight: input.body_weight ?? null,
      };
      const { data, error } = await supabase
        .from("daily_readiness")
        .upsert(payload, { onConflict: "athlete_id,date" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({
        queryKey: readinessKey(user?.id, row.date),
      });
    },
    onError: (error: Error) => {
      toast.error("Salvataggio Prontezza fallito", {
        description: error.message,
      });
    },
  });
}
