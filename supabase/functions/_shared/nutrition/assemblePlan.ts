// supabase/functions/_shared/nutrition/assemblePlan.ts
// Orchestrator of the pure nutrition engine — the ONLY function the I/O layer
// calls. Deterministic: same input ⇒ same outcome (inputs are re-sorted
// internally, "today" is a parameter). Pipeline (binding order): strategy →
// last weight (→ no_baseline_data) → cold start? → series/trend/confidence →
// fallback? → expenditure → strategy delta (+lifecycle cap) → raw target →
// escalation → cap → macro floor → round → macros → diet-break streak →
// safety gates → released | gated. Consent and the has_pain safety capture
// are evaluated by the I/O layer BEFORE this engine runs (task order a→b).

import type {
  ActivePlanSnapshot,
  BodyMeasurementRow,
  NutritionAudit,
  NutritionDocument,
  NutritionEngineInput,
  NutritionOutcome,
  NutritionReleaseRow,
  StrategyType,
} from "./types.ts";
import {
  addDays,
  alphaFromHalfLife,
  buildIntakeSeries,
  buildWeightSeries,
  daysBetween,
  latestBodyFatWithin,
  latestWeightEntryBefore,
  latestWeightOnOrBefore,
  weightTrend,
} from "./dailySeries.ts";
import { computeConfidence } from "./confidence.ts";
import { baselineExpenditure, updateExpenditure } from "./expenditure.ts";
import { macrosForTarget } from "./macros.ts";
import {
  applyGuardrails,
  deficitStreakWeeks,
  fallbackCorrectionKcal,
  isLifecycleCapped,
  readReleaseDocument,
  strategyDeltaKcal,
} from "./target.ts";
import { evaluateSafetyGates } from "./safety.ts";
import { coldStartOutcome } from "./coldStart.ts";

/** Version of the nutrition_document shape written by this engine. */
export const NUTRITION_SCHEMA_VERSION = 1;

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

function countNonNull(series: Array<number | null>): number {
  return series.reduce<number>((n, v) => (v != null ? n + 1 : n), 0);
}

function isKnownStrategy(value: string, input: NutritionEngineInput): value is StrategyType {
  // Object.hasOwn, not `in`: a strategy_type like "constructor" must never
  // resolve through the prototype chain (hardening, review 2026-07-17).
  return Object.hasOwn(input.config.macro_split_by_strategy, value);
}

/** Earliest date across logs and measurements (history length anchor). */
function earliestDataDate(input: NutritionEngineInput): string | null {
  let earliest: string | null = null;
  for (const row of input.logs) {
    if (row.calories == null) continue;
    if (earliest == null || row.date < earliest) earliest = row.date;
  }
  for (const row of input.measurements) {
    if (row.weight_kg == null && row.body_fat_percentage == null) continue;
    if (earliest == null || row.date < earliest) earliest = row.date;
  }
  return earliest;
}

export function assembleNutritionPlan(input: NutritionEngineInput): NutritionOutcome {
  const cfg = input.config;
  const today = input.todayIso;

  // Deterministic ordering regardless of input order.
  const logs = [...input.logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const measurements: BodyMeasurementRow[] = [...input.measurements].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0,
  );
  const releases: NutritionReleaseRow[] = [...input.previousReleases].sort((a, b) =>
    a.released_at < b.released_at ? 1 : a.released_at > b.released_at ? -1 : 0,
  );

  // Cold start = no active plan AND no history: a missing plan with a live
  // chain must NOT re-baseline (it would bypass cap/escalation and wipe the
  // learned expenditure — review 2026-07-17, invariant 4). The chain steers.
  const coldStart = input.activePlan == null && releases.length === 0;
  const chainDoc = releases.length > 0 ? readReleaseDocument(releases[0].nutrition_document) : null;

  // Strategy: active plan wins; cold start FORCES maintain (task: baseline
  // before any diet); plan gone but chain alive → last released strategy.
  let strategy: StrategyType = "maintain";
  if (input.activePlan != null) {
    const declared = input.activePlan.strategy_type;
    if (!isKnownStrategy(declared, input)) {
      return { status: "escalation", reasons: [`strategia sconosciuta: ${declared}`], audit: null };
    }
    strategy = declared;
  } else if (!coldStart) {
    if (chainDoc == null) {
      // Chain exists but its latest document is unreadable and there is no
      // plan: no safe prev target/strategy to anchor the guardrails — bell.
      return {
        status: "escalation",
        reasons: ["piano attivo assente e ultimo rilascio illeggibile: nessun ancoraggio sicuro"],
        audit: null,
      };
    }
    strategy = chainDoc.strategy;
  }

  // Last known weight — without one there is nothing to compute from.
  const lastWeight = latestWeightOnOrBefore(measurements, today);
  if (lastWeight == null) return { status: "no_baseline_data" };

  // Series over the window [today − W, yesterday]: today's intake is
  // incomplete by definition and stays out (declared decision).
  const windowDays = cfg.expenditure_window_days;
  const endIso = addDays(today, -1);
  const startIso = addDays(today, -windowDays);
  const intakeSeries = buildIntakeSeries(logs, startIso, endIso);
  const weightSeries = buildWeightSeries(measurements, startIso, endIso);
  const seedEntry = latestWeightEntryBefore(measurements, startIso);
  const seed = seedEntry
    ? { kg: seedEntry.kg, offsetDays: Math.max(1, daysBetween(seedEntry.date, startIso)) }
    : null;
  const alpha = alphaFromHalfLife(cfg.weight_trend_half_life_days);
  const trend = weightTrend(weightSeries, alpha, seed, cfg.min_trend_span_days);

  // Smoothed weight for deltas/floor/macros when the trend exists; the raw
  // last measurement otherwise (and always at cold start).
  const weightForCalcs = trend?.emaEndKg ?? lastWeight.kg;

  const loggedDaysInWindow = countNonNull(intakeSeries);
  const loggedDaysLast7 = countNonNull(buildIntakeSeries(logs, addDays(today, -7), endIso));

  // True account-history anchor when the I/O layer provides it (the fetch
  // horizon is the window + one seed row: without historyStartIso the length
  // saturates around window+seed and a min_history > that would silently
  // become unreachable — review 2026-07-17).
  const earliestInInputs = earliestDataDate(input);
  const historyStart =
    input.historyStartIso != null &&
    (earliestInInputs == null || input.historyStartIso < earliestInInputs)
      ? input.historyStartIso
      : earliestInInputs;
  const historyDays = historyStart == null ? 0 : Math.max(0, daysBetween(historyStart, today));
  const confidence = computeConfidence({
    loggedDays: loggedDaysInWindow,
    windowDays,
    trend,
    historyDays,
    cfg,
  });

  const lifecycleReferralDue =
    isLifecycleCapped(input.athlete.cycleStatus) && !input.athlete.lifecycleReferralAlreadySent;
  const latestBodyFatPct = latestBodyFatWithin(measurements, startIso, today);

  // Cold start: extracted branch (coldStart.ts) — baseline maintain target.
  if (coldStart) {
    return coldStartOutcome({
      todayIso: today,
      cfg,
      lastWeightKg: lastWeight.kg,
      trend,
      confidence,
      loggedDaysInWindow,
      loggedDaysLast7,
      latestBodyFatPct,
      lifecycleReferralDue,
    });
  }

  // ------------------------------------------------------------ weekly update
  // By construction here: either the active plan exists, or chainDoc does
  // (plan-null + unreadable chain already escalated above).
  const prevDoc = chainDoc;
  const expenditurePrev = prevDoc?.expenditure_estimate ?? baselineExpenditure(weightForCalcs, cfg);
  const prevTarget =
    prevDoc?.daily_calories ?? (input.activePlan as ActivePlanSnapshot).daily_calories;
  const prevStrategy: StrategyType = prevDoc?.strategy ?? strategy;

  const fallbackMode = loggedDaysLast7 < cfg.min_logged_days_per_rolling_7;

  let expenditureNew = expenditurePrev;
  let evidenceKcal: number | null = null;
  let meanIntakeKcal: number | null = null;
  let imputedDays = 0;
  let rawTarget: number;
  let lifecycleCapped: boolean;

  if (fallbackMode) {
    // Intake ≈ expenditure: the estimate holds, only the weight trend steers.
    const correction = fallbackCorrectionKcal(
      cfg,
      strategy,
      weightForCalcs,
      trend?.obsKgPerWeek ?? null,
      input.athlete.cycleStatus,
    );
    rawTarget = prevTarget + correction;
    lifecycleCapped = strategy === "cut" && isLifecycleCapped(input.athlete.cycleStatus);
  } else {
    const update = updateExpenditure({
      intakeSeries,
      trend,
      expenditurePrevKcal: expenditurePrev,
      confidence: confidence.combined,
      cfg,
    });
    expenditureNew = update.expenditureNewKcal;
    evidenceKcal = update.evidenceKcal;
    meanIntakeKcal = update.meanIntakeKcal;
    imputedDays = update.imputedDays;
    const delta = strategyDeltaKcal(cfg, strategy, weightForCalcs, input.athlete.cycleStatus);
    lifecycleCapped = delta.lifecycleCapped;
    rawTarget = expenditureNew + delta.deltaKcal;
  }

  const guard = applyGuardrails({
    rawTargetKcal: rawTarget,
    prevTargetKcal: prevTarget,
    prevStrategy,
    strategy,
    weightKg: weightForCalcs,
    cfg,
  });

  const streak = deficitStreakWeeks(releases, today, cfg);
  const dietBreakSuggested = strategy === "cut" && streak >= cfg.diet_break_after_weeks;

  const audit: NutritionAudit = {
    expenditurePrevKcal: expenditurePrev,
    expenditureNewKcal: expenditureNew,
    evidenceKcal,
    meanIntakeKcal,
    confidence,
    trend,
    loggedDaysInWindow,
    loggedDaysLast7,
    imputedDays,
    fallbackMode,
    rawTargetKcal: rawTarget,
    cappedBy: lifecycleCapped ? [...guard.cappedBy, "lifecycle_cap"] : guard.cappedBy,
    deficitStreakWeeks: streak,
    lifecycleReferralDue,
  };

  if (guard.escalation != null) {
    return { status: "escalation", reasons: guard.escalation.reasons, audit };
  }

  const macros = macrosForTarget(cfg, strategy, weightForCalcs, guard.finalKcal);
  const document: NutritionDocument = {
    daily_calories: guard.finalKcal,
    protein_g: macros.protein_g,
    carbs_g: macros.carb_g,
    fats_g: macros.fat_g,
    expenditure_estimate: Math.round(expenditureNew),
    confidence: round3(confidence.combined),
    logged_days: loggedDaysInWindow,
    imputed_days: imputedDays,
    fallback_mode: fallbackMode,
    cold_start: false,
    diet_break_suggested: dietBreakSuggested,
    strategy,
    computed_for_date: today,
    weight_kg_at_release: round1(weightForCalcs),
  };

  const gates = evaluateSafetyGates({
    candidateKcal: guard.finalKcal,
    strategy,
    weightKg: weightForCalcs,
    trend,
    latestBodyFatPct,
    cfg,
  });
  if (gates.length > 0) {
    return {
      status: "gated",
      reason: gates[0].reason,
      detail: gates[0].detail,
      candidate: document,
      audit,
    };
  }
  return { status: "released", document, audit };
}
