import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { NutritionConfigError, parseNutritionConfig } from "./parseConfig.ts";
import { rawConfig } from "./nutritionConfig.fixture.ts";

Deno.test("config nicolo_nutrition completo (v1+v2) → valori esatti", () => {
  const cfg = parseNutritionConfig(rawConfig());
  assertEquals(cfg.kcal_per_kg, 7700);
  assertEquals(cfg.expenditure_update_gain_base, 0.25);
  assertEquals(cfg.max_weekly_calorie_adjustment_pct, 0.06);
  assertEquals(cfg.macro_split_by_strategy.cut, { fat_pct: 0.2, protein_g_per_kg: 2.3 });
  assertEquals(cfg.min_history_days_full_confidence, 21);
  // v2: il valore LEA e' 300 per decisione esplicita di Nick (0 indebolirebbe il gate)
  assertEquals(cfg.exercise_kcal_per_day_estimate, 300);
  assertEquals(cfg.unintended_weight_loss_pct_per_week, 0.0075);
  assertEquals(cfg.escalation_cap_multiplier, 3);
  assertEquals(cfg.weight_noise_scale_kg, 1);
  assertEquals(cfg.min_trend_span_days, 7);
  assertEquals(cfg.release_chain_max_gap_days, 14);
  assertEquals(cfg.weigh_in_target_interval_days, 3);
});

const TOP_LEVEL_REQUIRED = [
  "kcal_per_kg",
  "baseline_formula",
  "default_activity_multiplier",
  "fat_min_g_per_kg",
  "carb_min_g_per_kg",
  "impute_unlogged_days",
  "expenditure_estimator",
  "expenditure_window_days",
  "weight_trend_half_life_days",
  "expenditure_update_gain_base",
  "min_logged_days_per_rolling_7",
  "daily_adjustment_cap_kcal",
  "max_weekly_calorie_adjustment_pct",
  "diet_break_after_weeks",
  "female_lifecycle_cap_multiplier",
  "low_energy_availability_kcal_per_kg_lbm",
  "confidence",
  "macro_split_by_strategy",
  "target_weight_change_pct_per_week",
  "exercise_kcal_per_day_estimate",
  "unintended_weight_loss_pct_per_week",
  "escalation_cap_multiplier",
  "weight_noise_scale_kg",
  "min_trend_span_days",
  "release_chain_max_gap_days",
  "weigh_in_target_interval_days",
];

Deno.test("ogni campo obbligatorio rimosso → NutritionConfigError col nome del campo", () => {
  for (const field of TOP_LEVEL_REQUIRED) {
    const raw = rawConfig();
    delete raw.nutrition[field];
    const err = assertThrows(() => parseNutritionConfig(raw), NutritionConfigError);
    if (!err.message.includes(field)) {
      throw new Error(`campo ${field}: messaggio senza nome campo (${err.message})`);
    }
  }
});

Deno.test("campi annidati obbligatori rimossi → errore", () => {
  const noHistory = rawConfig();
  delete (noHistory.nutrition.confidence as Record<string, unknown>)
    .min_history_days_full_confidence;
  assertThrows(() => parseNutritionConfig(noHistory), NutritionConfigError);

  const noMaintain = rawConfig();
  delete (noMaintain.nutrition.macro_split_by_strategy as Record<string, unknown>).maintain;
  assertThrows(() => parseNutritionConfig(noMaintain), NutritionConfigError);

  const noCutPct = rawConfig();
  delete (noCutPct.nutrition.target_weight_change_pct_per_week as Record<string, unknown>).cut;
  assertThrows(() => parseNutritionConfig(noCutPct), NutritionConfigError);
});

Deno.test("chiave radice nutrition assente → errore", () => {
  assertThrows(() => parseNutritionConfig({}), NutritionConfigError);
  assertThrows(() => parseNutritionConfig(null), NutritionConfigError);
});

Deno.test("valori fuori range → errore", () => {
  const zeroGain = rawConfig();
  zeroGain.nutrition.expenditure_update_gain_base = 0;
  assertThrows(() => parseNutritionConfig(zeroGain), NutritionConfigError);

  const fatPctTooHigh = rawConfig();
  (
    fatPctTooHigh.nutrition.macro_split_by_strategy as Record<string, Record<string, unknown>>
  ).cut.fat_pct = 1.2;
  assertThrows(() => parseNutritionConfig(fatPctTooHigh), NutritionConfigError);

  const windowZero = rawConfig();
  windowZero.nutrition.expenditure_window_days = 0;
  assertThrows(() => parseNutritionConfig(windowZero), NutritionConfigError);

  const badFormula = rawConfig();
  badFormula.nutrition.baseline_formula = "mifflin";
  assertThrows(() => parseNutritionConfig(badFormula), NutritionConfigError);

  const multiplierOne = rawConfig();
  multiplierOne.nutrition.escalation_cap_multiplier = 1;
  assertThrows(() => parseNutritionConfig(multiplierOne), NutritionConfigError);
});

Deno.test("campi extra ignorati (forward-compat del seed)", () => {
  const raw = rawConfig();
  raw.nutrition._note = "seed inattivo";
  raw.nutrition.future_field = 42;
  const cfg = parseNutritionConfig(raw);
  assertEquals(cfg.kcal_per_kg, 7700);
});
