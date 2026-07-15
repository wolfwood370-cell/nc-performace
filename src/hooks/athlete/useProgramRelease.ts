// =============================================================================
// src/hooks/athlete/useProgramRelease.ts
// =============================================================================
// React Query hooks for the athlete's program release (program_releases,
// RLS select-own). Replaces the Training Hub mock. The ACTIVE program is the
// derived tail of the chain: latest released_at (v1: at most one row).
//
// The status derivation for athletes WITHOUT a release is display-only:
// it mirrors the release gate's structured inputs (clearance, red_flags,
// intake safety, consents) so the page can say "in attesa di revisione" /
// "consenso richiesto" without calling the edge function — which stays the
// single AUTHORITATIVE gate on every generate attempt. No clinical detail
// reaches the UI (art. 9): booleans only.
// =============================================================================

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";
import { parseReleaseDocument } from "@/lib/program/releaseView";
import type { ReleaseProgramView } from "@/lib/program/releaseView";
import { deriveGateStatus } from "@/lib/program/gateStatus";
import type { AthleteGateStatus } from "@/lib/program/gateStatus";
import type { ConsentRow } from "../../../supabase/functions/release-autonomous-program/release/consents.ts";

export type { AthleteGateStatus } from "@/lib/program/gateStatus";

export type ProgramReleaseRow = Tables<"program_releases">;

const releaseKey = (athleteId: string | undefined) =>
  ["program-release", "latest", athleteId ?? "anon"] as const;
const gateStatusKey = (athleteId: string | undefined) =>
  ["program-release", "gate-status", athleteId ?? "anon"] as const;

/** Latest release for the current athlete (null = none yet). */
export function useLatestReleaseQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: releaseKey(user?.id),
    queryFn: async (): Promise<{
      release: ProgramReleaseRow;
      program: ReleaseProgramView | null;
    } | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("program_releases")
        .select("*")
        .eq("athlete_id", user.id)
        .order("released_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return { release: data, program: parseReleaseDocument(data.program_document) };
    },
    enabled: Boolean(user?.id),
  });
}

/** Gate status for the current athlete (profile own-select + consents own-select). */
export function useAthleteGateStatusQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: gateStatusKey(user?.id),
    queryFn: async (): Promise<AthleteGateStatus | null> => {
      if (!user?.id) return null;
      const [profileRes, consentsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "coaching_mode, onboarding_completed, medical_clearance_required, red_flags, onboarding_data",
          )
          .eq("id", user.id)
          .single(),
        supabase
          .from("consents")
          .select("consent_type, granted, created_at")
          .eq("athlete_id", user.id),
      ]);
      if (profileRes.error) throw profileRes.error;
      if (consentsRes.error) throw consentsRes.error;
      return deriveGateStatus(profileRes.data, (consentsRes.data ?? []) as ConsentRow[]);
    },
    enabled: Boolean(user?.id),
  });
}

/** Response contract of release-autonomous-program (callers branch on ok/gate). */
export interface ReleaseResponse {
  ok: boolean;
  release_id?: string;
  released_at?: string;
  gate?: boolean;
  reason?: string;
  alertRaised?: boolean;
  medicalReferral?: boolean;
  consentRequired?: boolean;
  missing?: string[];
  alreadyActive?: boolean;
  error?: string;
}

/**
 * Asks the engine for the first autonomous release. The edge function is the
 * authoritative gate: this mutation only relays its ok/gate/consent outcome
 * and refreshes the queries so the page state stays derived, never guessed.
 */
export function useRequestReleaseMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<ReleaseResponse> => {
      const { data, error } = await supabase.functions.invoke("release-autonomous-program", {
        body: { mode: "new" },
      });
      if (error) {
        // Non-2xx -> FunctionsHttpError: the structured body (e.g. the 409
        // alreadyActive contract) lives on the Response in error.context.
        const ctx = (error as { context?: Response }).context;
        if (ctx && typeof ctx.json === "function") {
          try {
            return (await ctx.json()) as ReleaseResponse;
          } catch {
            throw error;
          }
        }
        throw error;
      }
      return data as ReleaseResponse;
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: releaseKey(user?.id) });
      queryClient.invalidateQueries({ queryKey: gateStatusKey(user?.id) });
    },
  });
}
