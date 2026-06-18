/**
 * src/hooks/useCoachTrainingBlocks.ts
 * ---------------------------------------------------------------------------
 * Returns the training phases ("blocks") owned by the current coach,
 * shaped for `TrainingBlocksTimeline` consumption.
 *
 * Closes audit finding M3 (replaced the former MOCK_BLOCKS placeholder data).
 *
 * The underlying table is `training_phases` (already in schema). This hook
 * joins to `profiles` for the athlete display name so the timeline can
 * label each block without a second query.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

/** Shape consumed by `TrainingBlocksTimeline`. */
export interface TrainingBlock {
  id: string;
  name: string;
  focusType: string;
  startDate: Date;
  endDate: Date;
  athleteName: string | null;
  athleteId: string;
}

export function useCoachTrainingBlocks() {
  const { user, profile } = useAuth();
  const isCoach = !!user && profile?.role === "coach";

  const query = useQuery({
    queryKey: ["coach-training-blocks", user?.id],
    queryFn: async (): Promise<TrainingBlock[]> => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("training_phases")
        .select(
          `
          id,
          name,
          focus_type,
          start_date,
          end_date,
          athlete_id,
          profiles!training_phases_athlete_id_fkey(full_name)
        `,
        )
        .eq("coach_id", user.id)
        .order("start_date", { ascending: true });

      if (error) throw error;

      // Supabase types the join loosely (`profiles` can be object or array
      // depending on FK shape). Narrow inline to the only field we read.
      type Row = {
        id: string;
        name: string;
        focus_type: string;
        start_date: string;
        end_date: string;
        athlete_id: string;
        profiles: { full_name: string | null } | null;
      };

      return ((data ?? []) as unknown as Row[]).map((row) => ({
        id: row.id,
        name: row.name,
        focusType: row.focus_type,
        startDate: new Date(row.start_date),
        endDate: new Date(row.end_date),
        athleteName: row.profiles?.full_name ?? null,
        athleteId: row.athlete_id,
      }));
    },
    enabled: isCoach,
    staleTime: 60_000,
  });

  return {
    blocks: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error as Error | null,
  };
}
