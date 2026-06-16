// =============================================================================
// src/hooks/useGenerateProgram.ts
// =============================================================================
// Invoca la edge function `generate-program` (gpt-5.2) e ritorna la scheda
// settimanale generata. Pattern mutuato da AiInsightCard.tsx: gestione di
// `error` ed `data?.error`, toast d'errore, `isPending` per disabilitare il
// trigger. Il success (applicazione al builder + toast) è gestito dal chiamante.
// =============================================================================

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { AiProgramResponse } from "@/lib/program/aiProgramMapper";

export interface GenerateProgramParams {
  athlete_id: string;
  focus_goal: string;
  days_per_week: number;
  equipment?: string;
  mode: "new" | "continue";
}

export function useGenerateProgram() {
  return useMutation<AiProgramResponse, Error, GenerateProgramParams>({
    mutationFn: async (params) => {
      const { data, error } = await supabase.functions.invoke("generate-program", {
        body: params,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data as AiProgramResponse;
    },
    onError: (err) => {
      const message =
        err instanceof Error ? err.message : "Errore durante la generazione del programma";
      toast.error("Errore IA", { description: message });
    },
  });
}
