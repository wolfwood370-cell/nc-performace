// supabase/functions/_shared/nutrition/macros.ts
// Macro split and the DERIVED calorie floor. No invented absolute floor: the
// minimum comes from the per-kg macro minimums of the strategy. The Atwater
// factors below are PHYSICAL constants (kcal per gram), not method numbers —
// this is their single named home in the engine.

import type { NutritionConfig, StrategyType } from "./types.ts";

export const ATWATER = {
  protein_kcal_per_g: 4,
  carb_kcal_per_g: 4,
  fat_kcal_per_g: 9,
} as const;

/**
 * Derived floor: (protein_strategy + fat_min + carb_min) per kg, in kcal.
 * The target NEVER goes below this, whatever the cap says.
 */
export function macroFloorKcal(
  cfg: NutritionConfig,
  strategy: StrategyType,
  weightKg: number,
): number {
  const split = cfg.macro_split_by_strategy[strategy];
  return (
    (split.protein_g_per_kg * ATWATER.protein_kcal_per_g +
      cfg.fat_min_g_per_kg * ATWATER.fat_kcal_per_g +
      cfg.carb_min_g_per_kg * ATWATER.carb_kcal_per_g) *
    weightKg
  );
}

/**
 * Macros for a final target: protein fixed per kg, fat = max(fat_min,
 * fat_pct share of kcal), carbs take the kcal remainder.
 */
export function macrosForTarget(
  cfg: NutritionConfig,
  strategy: StrategyType,
  weightKg: number,
  targetKcal: number,
): { protein_g: number; fat_g: number; carb_g: number } {
  const split = cfg.macro_split_by_strategy[strategy];
  const protein_g = Math.round(split.protein_g_per_kg * weightKg);
  const fatFromPct = (split.fat_pct * targetKcal) / ATWATER.fat_kcal_per_g;
  const fat_g = Math.max(Math.round(cfg.fat_min_g_per_kg * weightKg), Math.round(fatFromPct));
  const remainder =
    targetKcal - protein_g * ATWATER.protein_kcal_per_g - fat_g * ATWATER.fat_kcal_per_g;
  const carb_g = Math.max(0, Math.round(remainder / ATWATER.carb_kcal_per_g));
  return { protein_g, fat_g, carb_g };
}
