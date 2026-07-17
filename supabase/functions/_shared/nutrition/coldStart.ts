// supabase/functions/_shared/nutrition/coldStart.ts
// Cold-start branch: no active plan → first baseline target. Strategy is
// FORCED to maintain (task: the baseline precedes any diet), macros from the
// maintain split. Floor and safety gates still apply; cap/escalation cannot
// (there is no previous target to jump from).

import type {
  ConfidenceComponents,
  NutritionAudit,
  NutritionConfig,
  NutritionDocument,
  NutritionOutcome,
  WeightTrend,
} from "./types.ts";
import { baselineExpenditure } from "./expenditure.ts";
import { macrosForTarget } from "./macros.ts";
import { applyGuardrails } from "./target.ts";
import { evaluateSafetyGates } from "./safety.ts";

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}

function round3(x: number): number {
  return Math.round(x * 1000) / 1000;
}

export function coldStartOutcome(args: {
  todayIso: string;
  cfg: NutritionConfig;
  lastWeightKg: number;
  trend: WeightTrend | null;
  confidence: ConfidenceComponents;
  loggedDaysInWindow: number;
  loggedDaysLast7: number;
  latestBodyFatPct: number | null;
  lifecycleReferralDue: boolean;
}): NutritionOutcome {
  const {
    todayIso,
    cfg,
    lastWeightKg,
    trend,
    confidence,
    loggedDaysInWindow,
    loggedDaysLast7,
    latestBodyFatPct,
    lifecycleReferralDue,
  } = args;

  const baseline = baselineExpenditure(lastWeightKg, cfg);
  const guard = applyGuardrails({
    rawTargetKcal: baseline,
    prevTargetKcal: null,
    prevStrategy: null,
    strategy: "maintain",
    weightKg: lastWeightKg,
    cfg,
  });
  const macros = macrosForTarget(cfg, "maintain", lastWeightKg, guard.finalKcal);

  const document: NutritionDocument = {
    daily_calories: guard.finalKcal,
    protein_g: macros.protein_g,
    carbs_g: macros.carb_g,
    fats_g: macros.fat_g,
    expenditure_estimate: baseline,
    confidence: round3(confidence.combined),
    logged_days: loggedDaysInWindow,
    imputed_days: 0,
    fallback_mode: false,
    cold_start: true,
    diet_break_suggested: false,
    strategy: "maintain",
    computed_for_date: todayIso,
    weight_kg_at_release: round1(lastWeightKg),
  };

  const audit: NutritionAudit = {
    expenditurePrevKcal: baseline,
    expenditureNewKcal: baseline,
    evidenceKcal: null,
    meanIntakeKcal: null,
    confidence,
    trend,
    loggedDaysInWindow,
    loggedDaysLast7,
    imputedDays: 0,
    fallbackMode: false,
    rawTargetKcal: baseline,
    cappedBy: guard.cappedBy,
    deficitStreakWeeks: 0,
    lifecycleReferralDue,
  };

  const gates = evaluateSafetyGates({
    candidateKcal: guard.finalKcal,
    strategy: "maintain",
    weightKg: lastWeightKg,
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
