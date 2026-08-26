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
import type { AthleteGateStatus, GateStatusProfile } from "@/lib/program/gateStatus";
import type { ConsentRow } from "../../../supabase/functions/release-autonomous-program/release/consents.ts";

export type { AthleteGateStatus } from "@/lib/program/gateStatus";

export type ProgramReleaseRow = Tables<"program_releases">;

const releaseKey = (athleteId: string | undefined) =>
  ["program-release", "latest", athleteId ?? "anon"] as const;
const gateStatusKey = (athleteId: string | undefined) =>
  ["program-release", "gate-status", athleteId ?? "anon"] as const;

/**
 * Derives the component-facing view from the RAW cached row, at READ time,
 * always with the CURRENT parser. The cache (and the IndexedDB persist that
 * dehydrates it) only ever holds what the queryFn returned — the Postgres
 * row — so a deploy can never rehydrate an object whose shape an older
 * build decided (defect measured 2026-08-25). Module-level on purpose:
 * `select` needs a stable reference or TanStack re-runs it on every render,
 * and ActiveWorkout re-renders every second for the timer.
 */
const selectLatestRelease = (
  row: ProgramReleaseRow | null,
): { release: ProgramReleaseRow; program: ReleaseProgramView | null } | null =>
  row === null ? null : { release: row, program: parseReleaseDocument(row.program_document) };

/** Latest release for the current athlete (null = none yet). */
export function useLatestReleaseQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: releaseKey(user?.id),
    // Returns ONLY what Postgres returned: the persisted cache must never
    // hold a shape this code decided — that is selectLatestRelease's job.
    queryFn: async (): Promise<ProgramReleaseRow | null> => {
      if (!user?.id) return null;
      const { data, error } = await supabase
        .from("program_releases")
        .select("*")
        .eq("athlete_id", user.id)
        .order("released_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      // maybeSingle's contract is row-or-null, but TanStack v5 refuses an
      // undefined query value outright: normalize so "no release yet" can
      // never become a query error.
      return data ?? null;
    },
    select: selectLatestRelease,
    enabled: Boolean(user?.id),
  });
}

/** Raw inputs of the gate mirror, exactly as Postgres returned them — the
 *  cached (and persisted) shape. Grouping the two result sets is the whole
 *  container; every DERIVED field stays out (that is selectGateStatus). */
interface GateStatusSource {
  profile: GateStatusProfile;
  consents: ConsentRow[];
}

/** Same contract as selectLatestRelease: derivation at read time with the
 *  current code, stable reference so it runs once per data change. */
const selectGateStatus = (source: GateStatusSource | null): AthleteGateStatus | null =>
  source === null ? null : deriveGateStatus(source.profile, source.consents);

/** Gate status for the current athlete (profile own-select + consents own-select). */
export function useAthleteGateStatusQuery() {
  const { user } = useAuth();
  return useQuery({
    queryKey: gateStatusKey(user?.id),
    queryFn: async (): Promise<GateStatusSource | null> => {
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
      return {
        profile: profileRes.data,
        consents: (consentsRes.data ?? []) as ConsentRow[],
      };
    },
    select: selectGateStatus,
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
  paymentRequired?: boolean;
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

/**
 * Grants the ai_processing consent via the server-authoritative RPC
 * record_consent (identity = auth.uid(), type whitelisted, version and
 * source pinned server-side — migration 20260716170000). On success the
 * gate-mirror query is invalidated so "consent required" re-derives; the
 * caller retries the release. Grant-only: revocation goes through the coach.
 */
export function useRecordConsentMutation() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      // record_consent is not in the generated types yet: types.ts is
      // regenerated only after the migration is applied (law #7). Drop the
      // casts with the post-apply regen.
      const { data, error } = await supabase.rpc(
        "record_consent" as never,
        { p_type: "ai_processing" } as never,
      );
      if (error) throw error;
      const res = data as unknown as { ok: boolean; error?: string } | null;
      if (!res?.ok) throw new Error(res?.error ?? "record_consent_failed");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: gateStatusKey(user?.id) });
    },
  });
}
