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
import { missingReleaseConsents } from "../../../supabase/functions/release-autonomous-program/release/consents.ts";
import type { ConsentRow } from "../../../supabase/functions/release-autonomous-program/release/consents.ts";

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

export interface AthleteGateStatus {
  coachingMode: "coached" | "autonomous" | null;
  onboardingCompleted: boolean;
  /** Release consents not currently granted (display-only mirror of the gate). */
  missingConsents: string[];
  /** Structured clinical/gate signals present -> a review is pending. */
  pendingReview: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Display-only mirror of the edge gate on the same structured fields. */
export function deriveGateStatus(
  profile: {
    coaching_mode: string | null;
    onboarding_completed: boolean | null;
    medical_clearance_required: boolean | null;
    red_flags: unknown;
    onboarding_data: unknown;
  },
  consents: ConsentRow[],
): AthleteGateStatus {
  const flags = isObj(profile.red_flags) ? profile.red_flags : {};
  const redFlagsBlocking =
    flags.medical_clearance_required === true ||
    (Array.isArray(flags.medical_yes_questions) && flags.medical_yes_questions.length > 0);
  const od = isObj(profile.onboarding_data) ? profile.onboarding_data : {};
  const intake = isObj(od.intake) ? od.intake : null;
  const safety = intake && isObj(intake.safety) ? intake.safety : null;
  const yellow = Array.isArray(safety?.yellow) ? safety.yellow : [];
  const pendingReview =
    profile.medical_clearance_required === true ||
    redFlagsBlocking ||
    intake === null ||
    safety === null ||
    safety.level !== "green" ||
    yellow.length > 0;
  return {
    coachingMode:
      profile.coaching_mode === "autonomous" || profile.coaching_mode === "coached"
        ? profile.coaching_mode
        : null,
    onboardingCompleted: profile.onboarding_completed === true,
    missingConsents: missingReleaseConsents(consents),
    pendingReview,
  };
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
