// Test fixture: parsed NutritionConfig with the REAL nicolo_nutrition values
// (v1 seed + the seven v2 fields with the values proposed to Nick, including
// exercise_kcal_per_day_estimate = 300 — his explicit LEA correction). Tests
// override single fields to keep hand-computed pins small.

import type { NutritionConfig } from "./types.ts";

export function testConfig(overrides: Partial<NutritionConfig> = {}): NutritionConfig {
  return {
    kcal_per_kg: 7700,
    baseline_formula: "weight_kg_x22_activity",
    default_activity_multiplier: 1.7,
    fat_min_g_per_kg: 0.5,
    carb_min_g_per_kg: 1,
    impute_unlogged_days: true,
    expenditure_estimator: "adaptive_ema",
    expenditure_window_days: 21,
    weight_trend_half_life_days: 10,
    expenditure_update_gain_base: 0.25,
    min_logged_days_per_rolling_7: 4,
    daily_adjustment_cap_kcal: 150,
    max_weekly_calorie_adjustment_pct: 0.06,
    diet_break_after_weeks: 12,
    female_lifecycle_cap_multiplier: 0.5,
    low_energy_availability_kcal_per_kg_lbm: 30,
    min_history_days_full_confidence: 21,
    macro_split_by_strategy: {
      cut: { fat_pct: 0.2, protein_g_per_kg: 2.3 },
      bulk: { fat_pct: 0.25, protein_g_per_kg: 1.7 },
      maintain: { fat_pct: 0.25, protein_g_per_kg: 1.7 },
    },
    target_weight_change_pct_per_week: { cut: 0.0075, bulk: 0.0025 },
    exercise_kcal_per_day_estimate: 300,
    unintended_weight_loss_pct_per_week: 0.0075,
    escalation_cap_multiplier: 3,
    weight_noise_scale_kg: 1,
    min_trend_span_days: 7,
    release_chain_max_gap_days: 14,
    weigh_in_target_interval_days: 3,
    ...overrides,
  };
}

/** Raw jsonb shape as stored in method_config.config (root key "nutrition"). */
export function rawConfig(): { nutrition: Record<string, unknown> } {
  return {
    nutrition: {
      kcal_per_kg: 7700,
      baseline_formula: "weight_kg_x22_activity",
      default_activity_multiplier: 1.7,
      fat_min_g_per_kg: 0.5,
      carb_min_g_per_kg: 1,
      impute_unlogged_days: true,
      expenditure_estimator: "adaptive_ema",
      expenditure_window_days: 21,
      weight_trend_half_life_days: 10,
      expenditure_update_gain_base: 0.25,
      min_logged_days_per_rolling_7: 4,
      daily_adjustment_cap_kcal: 150,
      max_weekly_calorie_adjustment_pct: 0.06,
      diet_break_after_weeks: 12,
      female_lifecycle_cap_multiplier: 0.5,
      low_energy_availability_kcal_per_kg_lbm: 30,
      confidence: {
        from: ["logged_density", "weight_trend_snr", "history_length"],
        min_history_days_full_confidence: 21,
      },
      macro_split_by_strategy: {
        cut: { fat_pct: 0.2, protein_g_per_kg: 2.3 },
        bulk: { fat_pct: 0.25, protein_g_per_kg: 1.7 },
        maintain: { fat_pct: 0.25, protein_g_per_kg: 1.7 },
      },
      target_weight_change_pct_per_week: { cut: 0.0075, bulk: 0.0025 },
      exercise_kcal_per_day_estimate: 300,
      unintended_weight_loss_pct_per_week: 0.0075,
      escalation_cap_multiplier: 3,
      weight_noise_scale_kg: 1,
      min_trend_span_days: 7,
      release_chain_max_gap_days: 14,
      weigh_in_target_interval_days: 3,
    },
  };
}
