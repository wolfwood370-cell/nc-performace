// supabase/functions/_shared/nutrition/types.ts
// Shared contracts for the PURE nutrition engine (twin of _shared/method/).
// No runtime logic here. The engine is deterministic: no Date.now / random /
// network / env access — "today" enters as an ISO parameter (todayIso).

export type StrategyType = "cut" | "bulk" | "maintain";

export interface MacroSplit {
  /** Share of target kcal coming from fat, in (0,1). */
  fat_pct: number;
  /** Grams of protein per kg of body weight. */
  protein_g_per_kg: number;
}

/**
 * Parsed method_config profile `nicolo_nutrition` (jsonb root key
 * "nutrition"), flattened. Parsing is STRICT (parseConfig.ts): every field is
 * REQUIRED — the seven v2 fields below are seeded by Cowork at go-live and the
 * engine fails loud if any is missing. Zero method numbers live in code.
 */
export interface NutritionConfig {
  kcal_per_kg: number;
  baseline_formula: "weight_kg_x22_activity";
  default_activity_multiplier: number;
  fat_min_g_per_kg: number;
  carb_min_g_per_kg: number;
  impute_unlogged_days: boolean;
  expenditure_estimator: "adaptive_ema";
  expenditure_window_days: number;
  weight_trend_half_life_days: number;
  expenditure_update_gain_base: number;
  min_logged_days_per_rolling_7: number;
  daily_adjustment_cap_kcal: number;
  max_weekly_calorie_adjustment_pct: number;
  diet_break_after_weeks: number;
  female_lifecycle_cap_multiplier: number;
  low_energy_availability_kcal_per_kg_lbm: number;
  /** Flattened from config.confidence.min_history_days_full_confidence. */
  min_history_days_full_confidence: number;
  macro_split_by_strategy: Record<StrategyType, MacroSplit>;
  /** maintain is implicitly 0. */
  target_weight_change_pct_per_week: { cut: number; bulk: number };
  // --- v2 fields (required, seeded by Cowork; values decided by Nick) ---
  exercise_kcal_per_day_estimate: number;
  unintended_weight_loss_pct_per_week: number;
  escalation_cap_multiplier: number;
  weight_noise_scale_kg: number;
  min_trend_span_days: number;
  release_chain_max_gap_days: number;
  /** Full weigh-in-density credit at 1 weigh-in every N days (review fix:
   * was a hard-coded /3 — method numbers live in config). */
  weigh_in_target_interval_days: number;
}

/** Row of public.nutrition_logs — only the columns the engine reads. */
export interface NutritionLogRow {
  date: string; // YYYY-MM-DD
  calories: number | null;
}

/** Row of public.body_measurements — only the columns the engine reads. */
export interface BodyMeasurementRow {
  date: string; // YYYY-MM-DD
  weight_kg: number | null;
  body_fat_percentage: number | null;
}

/** Row from the immutable nutrition_releases chain (most recent first). */
export interface NutritionReleaseRow {
  id: string;
  released_at: string; // ISO timestamptz
  /** Read defensively via readReleaseDocument (target.ts). */
  nutrition_document: unknown;
}

/** The active nutrition_plans row — only the columns the engine reads. */
export interface ActivePlanSnapshot {
  daily_calories: number;
  /** Validated against macro_split_by_strategy keys; unknown ⇒ escalation. */
  strategy_type: string;
}

export interface AthleteContext {
  /** athlete_cycle_settings.cycle_status (free text; see LIFECYCLE_CAPPED_STATUSES). */
  cycleStatus: string | null;
  /** True if a female_lifecycle_referral alert was EVER raised (one-shot). */
  lifecycleReferralAlreadySent: boolean;
}

export interface NutritionEngineInput {
  /** Current calendar day in Europe/Rome, "YYYY-MM-DD". */
  todayIso: string;
  config: NutritionConfig;
  athlete: AthleteContext;
  /** null ⇒ cold start (the I/O layer creates the first nutrition_plans row). */
  activePlan: ActivePlanSnapshot | null;
  /** Most recent first. The engine re-sorts internally for determinism. */
  previousReleases: NutritionReleaseRow[];
  logs: NutritionLogRow[];
  measurements: BodyMeasurementRow[];
  /** Earliest data date EVER for the athlete (logs or measurements), fetched
   * by the I/O layer: the arrays above only cover the window + one seed row,
   * so without this anchor the history-length confidence component saturates
   * at ~window+seed days. Optional: absent ⇒ derived from the arrays. */
  historyStartIso?: string | null;
}

/**
 * Released document. The first eleven keys are the EXACT task contract —
 * never rename or remove them; the last three are additive metadata.
 */
export interface NutritionDocument {
  daily_calories: number;
  protein_g: number;
  carbs_g: number;
  fats_g: number;
  expenditure_estimate: number;
  confidence: number; // 0..1
  logged_days: number;
  imputed_days: number;
  fallback_mode: boolean;
  cold_start: boolean;
  diet_break_suggested: boolean;
  // additive metadata
  strategy: StrategyType;
  computed_for_date: string;
  weight_kg_at_release: number;
}

export interface WeightTrend {
  emaStartKg: number;
  emaEndKg: number;
  deltaKg: number;
  /** Days between the first defined EMA point and the last observation. */
  spanDays: number;
  obsKgPerWeek: number;
  /** Mean |observation − pre-update EMA| over contributing observations. */
  noiseKg: number;
  /** Observations INSIDE the window (the pre-window seed excluded). */
  weighDays: number;
}

export interface ConfidenceComponents {
  logDensity: number;
  weightTrendSnr: number;
  historyLength: number;
  combined: number;
}

export type CappedBy = "daily_cap" | "weekly_pct_cap" | "macro_floor" | "lifecycle_cap";

/** Forensic diagnostics for safety_context / debugging. */
export interface NutritionAudit {
  expenditurePrevKcal: number;
  expenditureNewKcal: number;
  evidenceKcal: number | null;
  meanIntakeKcal: number | null;
  confidence: ConfidenceComponents;
  trend: WeightTrend | null;
  loggedDaysInWindow: number;
  loggedDaysLast7: number;
  imputedDays: number;
  fallbackMode: boolean;
  rawTargetKcal: number;
  cappedBy: CappedBy[];
  deficitStreakWeeks: number;
  /** True when the I/O layer must raise the one-shot lifecycle referral. */
  lifecycleReferralDue: boolean;
}

export type GateReason = "unintended_weight_loss" | "low_energy_availability";

export interface SafetyGateHit {
  reason: GateReason;
  /** Italian, coach-readable, includes the numbers and the threshold. */
  detail: string;
}

export type NutritionOutcome =
  | { status: "released"; document: NutritionDocument; audit: NutritionAudit }
  | {
      status: "gated";
      reason: GateReason;
      detail: string;
      /** What WOULD have been released — attached so the coach can see it. */
      candidate: NutritionDocument;
      audit: NutritionAudit;
    }
  | { status: "escalation"; reasons: string[]; audit: NutritionAudit | null }
  | { status: "no_baseline_data" };
