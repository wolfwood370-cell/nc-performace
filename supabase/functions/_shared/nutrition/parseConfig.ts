// supabase/functions/_shared/nutrition/parseConfig.ts
// STRICT parser for method_config profile `nicolo_nutrition` (jsonb root key
// "nutrition"). Every field is REQUIRED and range-checked: a missing or
// malformed field throws NutritionConfigError with the field name — no silent
// defaults on safety-critical numbers (decision Nick 2026-07-17: config v2
// carries ALL method numbers, code carries none).

import type { MacroSplit, NutritionConfig, StrategyType } from "./types.ts";

export class NutritionConfigError extends Error {
  readonly field: string;

  constructor(field: string, message: string) {
    super(`config.nutrition.${field}: ${message}`);
    this.name = "NutritionConfigError";
    this.field = field;
  }
}

interface NumberRange {
  min?: number;
  exclusiveMin?: number;
  max?: number;
  integer?: boolean;
}

function requireRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NutritionConfigError(field, "oggetto mancante o malformato");
  }
  return value as Record<string, unknown>;
}

function requireNumber(
  obj: Record<string, unknown>,
  field: string,
  range: NumberRange = {},
): number {
  const value = obj[lastSegment(field)];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new NutritionConfigError(field, "numero mancante o non finito");
  }
  if (range.integer && !Number.isInteger(value)) {
    throw new NutritionConfigError(field, "deve essere un intero");
  }
  if (range.min !== undefined && value < range.min) {
    throw new NutritionConfigError(field, `deve essere >= ${range.min}`);
  }
  if (range.exclusiveMin !== undefined && value <= range.exclusiveMin) {
    throw new NutritionConfigError(field, `deve essere > ${range.exclusiveMin}`);
  }
  if (range.max !== undefined && value > range.max) {
    throw new NutritionConfigError(field, `deve essere <= ${range.max}`);
  }
  return value;
}

function requireBoolean(obj: Record<string, unknown>, field: string): boolean {
  const value = obj[lastSegment(field)];
  if (typeof value !== "boolean") {
    throw new NutritionConfigError(field, "booleano mancante");
  }
  return value;
}

function requireLiteral<T extends string>(
  obj: Record<string, unknown>,
  field: string,
  literal: T,
): T {
  const value = obj[lastSegment(field)];
  if (value !== literal) {
    throw new NutritionConfigError(field, `valore non supportato (atteso "${literal}")`);
  }
  return literal;
}

function lastSegment(field: string): string {
  const parts = field.split(".");
  return parts[parts.length - 1];
}

function parseMacroSplit(raw: unknown, field: string): MacroSplit {
  const obj = requireRecord(raw, field);
  return {
    fat_pct: requireNumber(obj, `${field}.fat_pct`, { exclusiveMin: 0, max: 0.99 }),
    protein_g_per_kg: requireNumber(obj, `${field}.protein_g_per_kg`, { exclusiveMin: 0 }),
  };
}

const STRATEGIES: readonly StrategyType[] = ["cut", "bulk", "maintain"];

/**
 * Parses the raw jsonb of method_config.config for profile nicolo_nutrition.
 * Throws NutritionConfigError on any missing/malformed field.
 */
export function parseNutritionConfig(raw: unknown): NutritionConfig {
  const root = requireRecord(raw, "(root)");
  const n = requireRecord(root.nutrition, "nutrition");

  const confidence = requireRecord(n.confidence, "confidence");

  const splitsRaw = requireRecord(n.macro_split_by_strategy, "macro_split_by_strategy");
  const splits = {} as Record<StrategyType, MacroSplit>;
  for (const strategy of STRATEGIES) {
    splits[strategy] = parseMacroSplit(splitsRaw[strategy], `macro_split_by_strategy.${strategy}`);
  }

  const pctRaw = requireRecord(
    n.target_weight_change_pct_per_week,
    "target_weight_change_pct_per_week",
  );

  return {
    kcal_per_kg: requireNumber(n, "kcal_per_kg", { exclusiveMin: 0 }),
    baseline_formula: requireLiteral(n, "baseline_formula", "weight_kg_x22_activity"),
    default_activity_multiplier: requireNumber(n, "default_activity_multiplier", { min: 1 }),
    fat_min_g_per_kg: requireNumber(n, "fat_min_g_per_kg", { exclusiveMin: 0 }),
    carb_min_g_per_kg: requireNumber(n, "carb_min_g_per_kg", { exclusiveMin: 0 }),
    impute_unlogged_days: requireBoolean(n, "impute_unlogged_days"),
    expenditure_estimator: requireLiteral(n, "expenditure_estimator", "adaptive_ema"),
    expenditure_window_days: requireNumber(n, "expenditure_window_days", { min: 7, integer: true }),
    weight_trend_half_life_days: requireNumber(n, "weight_trend_half_life_days", {
      exclusiveMin: 0,
    }),
    expenditure_update_gain_base: requireNumber(n, "expenditure_update_gain_base", {
      exclusiveMin: 0,
      max: 1,
    }),
    min_logged_days_per_rolling_7: requireNumber(n, "min_logged_days_per_rolling_7", {
      min: 0,
      max: 7,
      integer: true,
    }),
    daily_adjustment_cap_kcal: requireNumber(n, "daily_adjustment_cap_kcal", { exclusiveMin: 0 }),
    max_weekly_calorie_adjustment_pct: requireNumber(n, "max_weekly_calorie_adjustment_pct", {
      exclusiveMin: 0,
      max: 1,
    }),
    diet_break_after_weeks: requireNumber(n, "diet_break_after_weeks", { min: 1, integer: true }),
    female_lifecycle_cap_multiplier: requireNumber(n, "female_lifecycle_cap_multiplier", {
      exclusiveMin: 0,
      max: 1,
    }),
    low_energy_availability_kcal_per_kg_lbm: requireNumber(
      n,
      "low_energy_availability_kcal_per_kg_lbm",
      { exclusiveMin: 0 },
    ),
    min_history_days_full_confidence: requireNumber(
      confidence,
      "confidence.min_history_days_full_confidence",
      { min: 1, integer: true },
    ),
    macro_split_by_strategy: splits,
    target_weight_change_pct_per_week: {
      cut: requireNumber(pctRaw, "target_weight_change_pct_per_week.cut", { exclusiveMin: 0 }),
      bulk: requireNumber(pctRaw, "target_weight_change_pct_per_week.bulk", { exclusiveMin: 0 }),
    },
    // v2 fields — REQUIRED (fail loud until Cowork seeds profile v2)
    exercise_kcal_per_day_estimate: requireNumber(n, "exercise_kcal_per_day_estimate", { min: 0 }),
    unintended_weight_loss_pct_per_week: requireNumber(n, "unintended_weight_loss_pct_per_week", {
      exclusiveMin: 0,
    }),
    escalation_cap_multiplier: requireNumber(n, "escalation_cap_multiplier", { exclusiveMin: 1 }),
    weight_noise_scale_kg: requireNumber(n, "weight_noise_scale_kg", { exclusiveMin: 0 }),
    min_trend_span_days: requireNumber(n, "min_trend_span_days", { min: 1, integer: true }),
    release_chain_max_gap_days: requireNumber(n, "release_chain_max_gap_days", {
      min: 7,
      integer: true,
    }),
    weigh_in_target_interval_days: requireNumber(n, "weigh_in_target_interval_days", {
      min: 1,
      integer: true,
    }),
  };
}
