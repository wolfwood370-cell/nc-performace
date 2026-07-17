// supabase/functions/_shared/nutrition/expenditure.ts
// Adaptive expenditure estimate: evidence from (mean intake, smoothed weight
// delta), smoothed update gated by confidence. Adherence-neutral by
// construction: no term ever compares intake against a PAST TARGET — real
// intake only informs the expenditure evidence.

import type { NutritionConfig, WeightTrend } from "./types.ts";

/**
 * Fixed by the config selector baseline_formula = "weight_kg_x22_activity":
 * the 22 is part of the formula's identity (like the Atwater factors), not a
 * tunable method number — tuning happens via default_activity_multiplier.
 */
export const BASELINE_KCAL_PER_KG = 22;

/** Cold-start / prior-less expenditure: round(weight × 22 × activity). */
export function baselineExpenditure(weightKg: number, cfg: NutritionConfig): number {
  return Math.round(weightKg * BASELINE_KCAL_PER_KG * cfg.default_activity_multiplier);
}

export interface ExpenditureUpdate {
  expenditureNewKcal: number;
  evidenceKcal: number | null;
  meanIntakeKcal: number | null;
  imputedDays: number;
}

/**
 * One weekly update step. Unlogged days are imputed AT THE CURRENT ESTIMATE
 * (expenditurePrevKcal) when the config says so — an unlogged day is treated
 * as "ate at maintenance", never as zero. Evidence needs a defined weight
 * trend; without one the estimate stays put.
 */
export function updateExpenditure(args: {
  intakeSeries: Array<number | null>;
  trend: WeightTrend | null;
  expenditurePrevKcal: number;
  confidence: number;
  cfg: NutritionConfig;
}): ExpenditureUpdate {
  const { intakeSeries, trend, expenditurePrevKcal, confidence, cfg } = args;

  const logged = intakeSeries.filter((v): v is number => v != null);
  let imputedDays = 0;
  let meanIntakeKcal: number | null = null;

  if (cfg.impute_unlogged_days) {
    imputedDays = intakeSeries.length - logged.length;
    if (intakeSeries.length > 0) {
      const total = logged.reduce((a, b) => a + b, 0) + imputedDays * expenditurePrevKcal;
      meanIntakeKcal = total / intakeSeries.length;
    }
  } else if (logged.length > 0) {
    meanIntakeKcal = logged.reduce((a, b) => a + b, 0) / logged.length;
  }

  if (trend == null || meanIntakeKcal == null || trend.spanDays <= 0) {
    return {
      expenditureNewKcal: expenditurePrevKcal,
      evidenceKcal: null,
      meanIntakeKcal,
      imputedDays,
    };
  }

  const evidenceKcal = meanIntakeKcal - (trend.deltaKg * cfg.kcal_per_kg) / trend.spanDays;
  const gain = cfg.expenditure_update_gain_base * confidence;
  const expenditureNewKcal = expenditurePrevKcal + gain * (evidenceKcal - expenditurePrevKcal);

  return { expenditureNewKcal, evidenceKcal, meanIntakeKcal, imputedDays };
}
