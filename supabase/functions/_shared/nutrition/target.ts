// supabase/functions/_shared/nutrition/target.ts
// Strategy delta, weight-only fallback correction, the ABSOLUTE guardrails
// (escalation → cap → macro floor → round, in this order) and the deficit
// streak for the diet-break. The guardrails are the single choke point every
// branch (adaptive, fallback, cold start) must pass through.

import type { CappedBy, NutritionConfig, NutritionReleaseRow, StrategyType } from "./types.ts";
import { macroFloorKcal } from "./macros.ts";
import { daysBetween } from "./dailySeries.ts";

/** cycle_status values that halve the deficit and trigger the referral. */
export const LIFECYCLE_CAPPED_STATUSES: readonly string[] = ["assente_3m", "menopausa"];

export function isLifecycleCapped(cycleStatus: string | null): boolean {
  return cycleStatus != null && LIFECYCLE_CAPPED_STATUSES.includes(cycleStatus);
}

/** Desired weekly weight change in kg (signed), lifecycle cap applied to deficits. */
export function targetWeeklyWeightChangeKg(
  cfg: NutritionConfig,
  strategy: StrategyType,
  weightKg: number,
  cycleStatus: string | null,
): number {
  if (strategy === "cut") {
    const base = -cfg.target_weight_change_pct_per_week.cut * weightKg;
    return isLifecycleCapped(cycleStatus) ? base * cfg.female_lifecycle_cap_multiplier : base;
  }
  if (strategy === "bulk") return cfg.target_weight_change_pct_per_week.bulk * weightKg;
  return 0;
}

/** Daily kcal delta for the strategy; deficits halved on lifecycle statuses. */
export function strategyDeltaKcal(
  cfg: NutritionConfig,
  strategy: StrategyType,
  weightKg: number,
  cycleStatus: string | null,
): { deltaKcal: number; lifecycleCapped: boolean } {
  const weeklyKg = targetWeeklyWeightChangeKg(cfg, strategy, weightKg, cycleStatus);
  const deltaKcal = (weeklyKg * cfg.kcal_per_kg) / 7;
  const lifecycleCapped = strategy === "cut" && isLifecycleCapped(cycleStatus);
  return { deltaKcal, lifecycleCapped };
}

/**
 * Weight-only fallback correction: intake ≈ expenditure is assumed, the
 * target moves only by (observed − desired) weekly trend converted to kcal.
 * No trend ⇒ hold (0 correction).
 */
export function fallbackCorrectionKcal(
  cfg: NutritionConfig,
  strategy: StrategyType,
  weightKg: number,
  obsKgPerWeek: number | null,
  cycleStatus: string | null,
): number {
  if (obsKgPerWeek == null) return 0;
  const desired = targetWeeklyWeightChangeKg(cfg, strategy, weightKg, cycleStatus);
  const err = obsKgPerWeek - desired;
  return (-err * cfg.kcal_per_kg) / 7;
}

export interface GuardrailResult {
  finalKcal: number;
  cappedBy: CappedBy[];
  escalation: { reasons: string[] } | null;
}

/**
 * Order and precedence (declared):
 * 1. Escalation FIRST, on the RAW jump (the cap would hide it) — only within
 *    the same strategy: a legitimate strategy switch (maintain→cut) jumps by
 *    the full delta and must NOT escalate (the cap still phases it in).
 * 2. Anti-whiplash cap: capEff = min(daily cap, weekly % of previous target).
 * 3. Macro floor WINS over the cap (upwards): more food is never the danger.
 * 4. Rounding can never dip below the floor.
 * Cold start (prevTargetKcal null) skips 1–2 (nothing to jump from).
 */
export function applyGuardrails(args: {
  rawTargetKcal: number;
  prevTargetKcal: number | null;
  prevStrategy: StrategyType | null;
  strategy: StrategyType;
  weightKg: number;
  cfg: NutritionConfig;
}): GuardrailResult {
  const { rawTargetKcal, prevTargetKcal, prevStrategy, strategy, weightKg, cfg } = args;
  const cappedBy: CappedBy[] = [];
  const floor = macroFloorKcal(cfg, strategy, weightKg);
  let target = rawTargetKcal;
  let escalation: { reasons: string[] } | null = null;

  if (prevTargetKcal != null) {
    const capDaily = cfg.daily_adjustment_cap_kcal;
    const capPct = cfg.max_weekly_calorie_adjustment_pct * prevTargetKcal;
    const capEff = Math.min(capDaily, capPct);
    const jump = Math.abs(rawTargetKcal - prevTargetKcal);

    if (prevStrategy === strategy && jump > cfg.escalation_cap_multiplier * capEff) {
      escalation = {
        reasons: [
          `aggiustamento grezzo anomalo: ${Math.round(jump)} kcal supera ` +
            `${cfg.escalation_cap_multiplier}× il cap effettivo (${Math.round(capEff)} kcal)`,
        ],
      };
    }

    if (jump > capEff) {
      cappedBy.push(capDaily <= capPct ? "daily_cap" : "weekly_pct_cap");
      target = prevTargetKcal + Math.sign(rawTargetKcal - prevTargetKcal) * capEff;
    }
  }

  if (target < floor) {
    target = floor;
    cappedBy.push("macro_floor");
  }

  let finalKcal = Math.round(target);
  if (finalKcal < floor) finalKcal = Math.ceil(floor);

  return { finalKcal, cappedBy, escalation };
}

/** Defensive reader for a previous release's nutrition_document. */
export function readReleaseDocument(
  raw: unknown,
): { daily_calories: number; expenditure_estimate: number; strategy: StrategyType } | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  const cal = d.daily_calories;
  const exp = d.expenditure_estimate;
  const strategy = d.strategy;
  if (typeof cal !== "number" || !Number.isFinite(cal)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  if (strategy !== "cut" && strategy !== "bulk" && strategy !== "maintain") return null;
  return { daily_calories: cal, expenditure_estimate: exp, strategy };
}

/**
 * Consecutive deficit weeks from the immutable chain: walk the releases
 * (most recent first) while strategy === "cut" and the gap between adjacent
 * releases stays ≤ release_chain_max_gap_days (a longer silence breaks the
 * chain). Weeks = floor(days from the oldest chained release to today / 7) —
 * robust to irregular cadences, independent of the release count.
 */
export function deficitStreakWeeks(
  previousReleases: NutritionReleaseRow[],
  todayIso: string,
  cfg: NutritionConfig,
): number {
  let oldestDay: string | null = null;
  let prevDay = todayIso;
  for (const release of previousReleases) {
    const doc = readReleaseDocument(release.nutrition_document);
    if (!doc || doc.strategy !== "cut") break;
    const releaseDay = release.released_at.slice(0, 10);
    if (daysBetween(releaseDay, prevDay) > cfg.release_chain_max_gap_days) break;
    oldestDay = releaseDay;
    prevDay = releaseDay;
  }
  return oldestDay ? Math.floor(daysBetween(oldestDay, todayIso) / 7) : 0;
}
