// supabase/functions/compute-nutrition-target/target/fetchInputs.ts
// Parallel data fetch for the pure engine: active plan, release chain (up to
// diet_break_after_weeks + 2 for the streak), 21-day intake and weight
// windows, the pre-window weight seed (EMA anchor + cold-start "last weight"
// even when older than the window), cycle status and the one-shot referral
// lookup (ANY historical row, dismissed included — deliberately stronger than
// the twin's live-only dedupe: the referral is informative, not an incident).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { addDays } from "../../_shared/nutrition/dailySeries.ts";
import type {
  ActivePlanSnapshot,
  BodyMeasurementRow,
  NutritionConfig,
  NutritionLogRow,
  NutritionReleaseRow,
} from "../../_shared/nutrition/types.ts";

export interface EngineInputsFetch {
  activePlan: ActivePlanSnapshot | null;
  previousReleases: NutritionReleaseRow[];
  logs: NutritionLogRow[];
  measurements: BodyMeasurementRow[];
  cycleStatus: string | null;
  lifecycleReferralAlreadySent: boolean;
  /** Earliest data date EVER (logs/measurements) — history-length anchor. */
  historyStartIso: string | null;
}

/** Hard backstop on the release-chain fetch: the real bound is the time
 * window below; this only guards against a pathological row count. */
const RELEASE_FETCH_BACKSTOP = 200;

export async function fetchEngineInputs(
  admin: SupabaseClient,
  cfg: NutritionConfig,
  todayIso: string,
  athleteId: string,
): Promise<{ ok: true; inputs: EngineInputsFetch } | { ok: false; code: string | undefined }> {
  const windowStart = addDays(todayIso, -cfg.expenditure_window_days);
  // Chain horizon by TIME, not by row count: a row limit assumes <=1 release
  // per week, but manual single-athlete runs add chain rows and would
  // silently under-count the diet-break streak (review 2026-07-17).
  const chainHorizon = addDays(
    todayIso,
    -(cfg.diet_break_after_weeks * 7 + cfg.release_chain_max_gap_days),
  );

  const [planQ, releasesQ, logsQ, weightsQ, seedQ, cycleQ, referralQ, firstLogQ, firstWeightQ] =
    await Promise.all([
      admin
        .from("nutrition_plans")
        .select("daily_calories, strategy_type")
        .eq("athlete_id", athleteId)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1),
      admin
        .from("nutrition_releases")
        .select("id, released_at, nutrition_document")
        .eq("athlete_id", athleteId)
        .gte("released_at", chainHorizon)
        .order("released_at", { ascending: false })
        .limit(RELEASE_FETCH_BACKSTOP),
      admin
        .from("nutrition_logs")
        .select("date, calories")
        .eq("athlete_id", athleteId)
        .gte("date", windowStart)
        .lte("date", todayIso),
      admin
        .from("body_measurements")
        .select("date, weight_kg, body_fat_percentage")
        .eq("athlete_id", athleteId)
        .gte("date", windowStart)
        .lte("date", todayIso),
      admin
        .from("body_measurements")
        .select("date, weight_kg, body_fat_percentage")
        .eq("athlete_id", athleteId)
        .lt("date", windowStart)
        .not("weight_kg", "is", null)
        .order("date", { ascending: false })
        .limit(1),
      admin
        .from("athlete_cycle_settings")
        .select("cycle_status")
        .eq("athlete_id", athleteId)
        .maybeSingle(),
      admin
        .from("coach_alerts")
        .select("id")
        .eq("athlete_id", athleteId)
        .eq("type", "female_lifecycle_referral")
        .limit(1),
      // History-length anchor: the true earliest data date ever (the window
      // fetch alone would cap the confidence history component — review fix).
      admin
        .from("nutrition_logs")
        .select("date")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: true })
        .limit(1),
      admin
        .from("body_measurements")
        .select("date")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: true })
        .limit(1),
    ]);

  const failed = [
    planQ,
    releasesQ,
    logsQ,
    weightsQ,
    seedQ,
    referralQ,
    firstLogQ,
    firstWeightQ,
  ].find((q) => q.error);
  if (failed || cycleQ.error) {
    return { ok: false, code: (failed?.error ?? cycleQ.error)?.code };
  }

  const firstDates = [firstLogQ.data?.[0]?.date, firstWeightQ.data?.[0]?.date].filter(
    (d): d is string => typeof d === "string",
  );
  const historyStartIso = firstDates.length > 0 ? firstDates.sort()[0] : null;

  return {
    ok: true,
    inputs: {
      activePlan: (planQ.data?.[0] as ActivePlanSnapshot | undefined) ?? null,
      previousReleases: (releasesQ.data ?? []) as NutritionReleaseRow[],
      logs: (logsQ.data ?? []) as NutritionLogRow[],
      measurements: [...(weightsQ.data ?? []), ...(seedQ.data ?? [])] as BodyMeasurementRow[],
      cycleStatus: cycleQ.data?.cycle_status ?? null,
      lifecycleReferralAlreadySent: (referralQ.data?.length ?? 0) > 0,
      historyStartIso,
    },
  };
}
