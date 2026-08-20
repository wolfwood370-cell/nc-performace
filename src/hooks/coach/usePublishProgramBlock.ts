// =============================================================================
// src/hooks/coach/usePublishProgramBlock.ts
// =============================================================================
// React Query mutation for the coach release: invokes publish-program-block
// with { block_id, dates } and relays its ok / gate / error contract. The
// server builds the document from the SAVED draft — the client sends only the
// block id and the coach-confirmed session dates (SessionDateInput comes from
// the shared pure module, so client and server cannot drift on the shape).
// =============================================================================

import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { SessionDateInput } from "../../../supabase/functions/_shared/program/coachRelease.ts";

export interface PublishProgramInput {
  blockId: string;
  dates: SessionDateInput[];
}

/** Response contract of publish-program-block (callers branch on ok/gate). */
export interface PublishProgramResponse {
  ok: boolean;
  release_id?: string;
  released_at?: string;
  superseded?: boolean;
  gate?: boolean;
  reason?: string;
  error?: string;
  message?: string;
}

export function usePublishProgramBlock() {
  return useMutation({
    mutationFn: async ({
      blockId,
      dates,
    }: PublishProgramInput): Promise<PublishProgramResponse> => {
      const { data, error } = await supabase.functions.invoke("publish-program-block", {
        body: { block_id: blockId, dates },
      });
      if (error) {
        // Non-2xx -> FunctionsHttpError: the structured body (e.g. the 409
        // gate/publish_conflict contract) lives on the Response in
        // error.context — same pattern as useProgramRelease.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            return (await ctx.json()) as PublishProgramResponse;
          } catch {
            throw error;
          }
        }
        throw error;
      }
      return data as PublishProgramResponse;
    },
  });
}
