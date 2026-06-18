import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ActiveProgramsCount {
  count: number;
  isLoading: boolean;
}

/**
 * Head-count of the coach's currently published program blocks, optionally
 * excluding the block being edited so re-publishing an existing program never
 * counts against itself. Backs the `max_active_programs` feature gate in the
 * ProgramBuilder. The queryKey shares the `["program-blocks", ...]` prefix that
 * `useSaveProgramBlock` already invalidates, so the count refreshes after each
 * publish. Empty-safe: returns 0 when unauthenticated or with no published block.
 */
export function useActiveProgramsCount(excludeBlockId?: string): ActiveProgramsCount {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ["program-blocks", user?.id, "count", excludeBlockId ?? null],
    queryFn: async (): Promise<number> => {
      if (!user?.id) return 0;
      const base = supabase
        .from("program_blocks")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", user.id)
        .eq("status", "published");
      const { count, error } = excludeBlockId ? await base.neq("id", excludeBlockId) : await base;
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  return { count: data ?? 0, isLoading };
}
