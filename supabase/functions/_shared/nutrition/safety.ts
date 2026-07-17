// supabase/functions/_shared/nutrition/safety.ts
// Engine-side safety gates, evaluated on the FINAL candidate (post-guardrail)
// because LEA depends on the final kcal. Active in every branch, cold start
// and fallback included. Details are Italian and coach-readable.

import type { NutritionConfig, SafetyGateHit, StrategyType, WeightTrend } from "./types.ts";

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

/**
 * Gates, in the task's order (c, d):
 * - unintended weight loss: declining trend at ≥ the configured rate while
 *   the strategy is NOT cut. Needs a defined trend (≥2 weigh-ins over the
 *   minimum span) so daily noise cannot fire it.
 * - low energy availability: only when a recent body-fat % exists.
 *   EA = (finalKcal − exercise_kcal_per_day_estimate) / FFM, strictly below
 *   the threshold gates (EA exactly at threshold passes).
 */
export function evaluateSafetyGates(args: {
  candidateKcal: number;
  strategy: StrategyType;
  weightKg: number;
  trend: WeightTrend | null;
  latestBodyFatPct: number | null;
  cfg: NutritionConfig;
}): SafetyGateHit[] {
  const { candidateKcal, strategy, weightKg, trend, latestBodyFatPct, cfg } = args;
  const hits: SafetyGateHit[] = [];

  if (strategy !== "cut" && trend != null) {
    const thresholdKgPerWeek = cfg.unintended_weight_loss_pct_per_week * weightKg;
    if (trend.obsKgPerWeek < -thresholdKgPerWeek) {
      hits.push({
        reason: "unintended_weight_loss",
        detail:
          `calo di ${round2(-trend.obsKgPerWeek)} kg/settimana con strategia ` +
          `"${strategy}" (soglia ${round2(thresholdKgPerWeek)} kg/settimana)`,
      });
    }
  }

  if (latestBodyFatPct != null && latestBodyFatPct > 0 && latestBodyFatPct < 100) {
    const ffmKg = weightKg * (1 - latestBodyFatPct / 100);
    if (ffmKg > 0) {
      const ea = (candidateKcal - cfg.exercise_kcal_per_day_estimate) / ffmKg;
      if (ea < cfg.low_energy_availability_kcal_per_kg_lbm) {
        hits.push({
          reason: "low_energy_availability",
          detail:
            `disponibilita' energetica ${round1(ea)} kcal/kg FFM sotto la soglia ` +
            `${cfg.low_energy_availability_kcal_per_kg_lbm} (FFM ${round1(ffmKg)} kg)`,
        });
      }
    }
  }

  return hits;
}
