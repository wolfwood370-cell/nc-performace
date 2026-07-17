// supabase/functions/_shared/nutrition/confidence.ts
// Confidence of the expenditure evidence, in [0,1]. Three components (the
// config's confidence.from list) combined by GEOMETRIC MEAN: a zero component
// zeroes the whole (no weigh-ins ⇒ gain 0, by design) while moderate
// components punish less than min() would. Declared trade-off: the "SNR"
// component measures weight-STREAM quality (density × noise penalty), not
// |trend|/noise — a true SNR would freeze the update exactly at maintenance,
// when the loop needs it most.

import type { ConfidenceComponents, NutritionConfig, WeightTrend } from "./types.ts";

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

export function computeConfidence(args: {
  loggedDays: number;
  windowDays: number;
  trend: WeightTrend | null;
  /** Days since the first data point ever (logs or measurements). */
  historyDays: number;
  cfg: NutritionConfig;
}): ConfidenceComponents {
  const { loggedDays, windowDays, trend, historyDays, cfg } = args;

  // Full credit at the config's own rolling pace: windowDays × (minPer7 / 7).
  const densityTargetDays = (windowDays * cfg.min_logged_days_per_rolling_7) / 7;
  const logDensity = clamp01(densityTargetDays > 0 ? loggedDays / densityTargetDays : 1);

  let weightTrendSnr = 0;
  if (trend) {
    const weighTargetDays = windowDays / 3; // full credit at ~1 weigh-in every 3 days
    const density = clamp01(weighTargetDays > 0 ? trend.weighDays / weighTargetDays : 1);
    const noisePenalty = 1 / (1 + trend.noiseKg / cfg.weight_noise_scale_kg);
    weightTrendSnr = clamp01(density * noisePenalty);
  }

  const historyLength = clamp01(historyDays / cfg.min_history_days_full_confidence);

  const combined = clamp01(Math.cbrt(logDensity * weightTrendSnr * historyLength));
  return { logDensity, weightTrendSnr, historyLength, combined };
}
