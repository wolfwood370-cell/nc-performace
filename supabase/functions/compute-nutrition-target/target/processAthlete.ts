// supabase/functions/compute-nutrition-target/target/processAthlete.ts
// Per-athlete I/O pipeline (service_role): consent gate -> has_pain safety
// capture -> parallel fetches -> PURE engine -> writes. Order a→b from the
// task is binding: no release without consent AND a clean capture. Writes:
// nutrition_plans ONLY at cold start (never UPDATE), nutrition_releases
// append-only with supersedes_id, coach_alerts with a guaranteed recipient
// (SAFETY_NET_COACH_ID fallback) and the twin's live-alert dedupe, plus the
// athlete-facing nutrition_review notification (raised on blocking gates,
// marked read on a clean release — target/notifications.ts).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  assembleNutritionPlan,
  NUTRITION_SCHEMA_VERSION,
} from "../../_shared/nutrition/assemblePlan.ts";
import { isNutritionConsentGranted } from "../../_shared/nutrition/consents.ts";
import { fetchEngineInputs } from "./fetchInputs.ts";
import type { NutritionConfig, NutritionOutcome } from "../../_shared/nutrition/types.ts";
import { alertForGate, lifecycleReferralAlert } from "./alerts.ts";
import type { NutritionAlertContent, NutritionGateReason } from "./alerts.ts";
import { clearAthleteReview, notifyAthleteReview } from "./notifications.ts";

const FN = "[compute-nutrition-target]";

export interface AthleteRow {
  id: string;
  coach_id: string | null;
  full_name: string | null;
}

/** Single-athlete result — the task's 4-state contract plus a terminal error. */
export type SingleResult =
  | {
      status: "released";
      release_id: string;
      daily_calories: number;
      protein_g: number;
      carbs_g: number;
      fats_g: number;
      expenditure_estimate: number;
      confidence: number;
      fallback_mode: boolean;
      cold_start: boolean;
      diet_break_suggested: boolean;
      config_version: string;
    }
  | { status: "gate"; reason: NutritionGateReason }
  | { status: "no_baseline_data" }
  | { status: "conflict" }
  | { status: "error"; error: string };

/** Best-effort forensic audit row (blocked paths); released path is fail-loud. */
async function insertAudit(
  admin: SupabaseClient,
  athleteId: string,
  action: string,
  metadata: Record<string, unknown>,
): Promise<boolean> {
  const { error } = await admin.from("audit_log").insert({
    actor_id: athleteId,
    actor_role: "system", // the weekly job acts, not the athlete (twin uses "athlete")
    action,
    entity_type: action === "nutrition_target_released" ? "nutrition_release" : "profile",
    entity_id: (metadata.release_id as string | undefined) ?? athleteId,
    metadata,
  });
  if (error) console.error(`${FN} audit insert failed`, { code: error.code, action });
  return !error;
}

/**
 * Guaranteed escalation: recipient never null, live-alert dedupe (same type,
 * dismissed=false -> skip; a lookup error falls through to the insert — a
 * duplicate beats a lost escalation). Returns false only when the alert could
 * not be raised at all.
 */
async function raiseAlert(
  admin: SupabaseClient,
  athlete: AthleteRow,
  content: NutritionAlertContent,
  dedupeAcrossDismissed = false,
): Promise<boolean> {
  const recipient = athlete.coach_id ?? Deno.env.get("SAFETY_NET_COACH_ID") ?? null;
  if (!recipient) {
    console.error(`${FN} no alert recipient (SAFETY_NET_COACH_ID unset)`);
    return false;
  }
  let lookup = admin
    .from("coach_alerts")
    .select("id")
    .eq("athlete_id", athlete.id)
    .eq("type", content.type)
    .limit(1);
  if (!dedupeAcrossDismissed) lookup = lookup.eq("dismissed", false);
  const { data: existing, error: lookupError } = await lookup;
  if (!lookupError && existing && existing.length > 0) return true; // live alert IS the escalation
  const { error } = await admin.from("coach_alerts").insert({
    coach_id: recipient,
    athlete_id: athlete.id,
    type: content.type,
    severity: content.severity,
    message: content.message,
    link: `/coach/athletes/${athlete.id}`,
  });
  if (error) {
    console.error(`${FN} alert insert failed`, { code: error.code, type: content.type });
    return false;
  }
  return true;
}

/** Blocking gate: alert (fail-loud) + best-effort athlete notification and
 * audit + explicit response. `extra` lands in the audit metadata — e.g. the
 * candidate document the engine attached, so the coach can inspect what WOULD
 * have been released. */
async function respondGate(
  admin: SupabaseClient,
  athlete: AthleteRow,
  reason: NutritionGateReason,
  detail?: string,
  extra?: Record<string, unknown>,
): Promise<SingleResult> {
  const content = alertForGate(reason, athlete.full_name ?? "Atleta", detail);
  if (content) {
    const raised = await raiseAlert(admin, athlete, content);
    if (!raised) return { status: "error", error: "escalation_failed" };
    // Hold-only athlete pause (never on the release path's lifecycle
    // referral), and only AFTER the coach escalation stood.
    await notifyAthleteReview(admin, athlete.id);
  }
  await insertAudit(admin, athlete.id, "nutrition_target_blocked", {
    reason,
    ...(detail ? { detail } : {}),
    ...(extra ?? {}),
  });
  return { status: "gate", reason };
}

export async function processAthlete(
  admin: SupabaseClient,
  cfg: NutritionConfig,
  configVersion: string,
  todayIso: string,
  athlete: AthleteRow,
): Promise<SingleResult> {
  // (a) consent nutrition_advice — latest ledger row must grant it.
  const { data: consentRows, error: consentError } = await admin
    .from("consents")
    .select("consent_type, granted, created_at")
    .eq("athlete_id", athlete.id)
    .eq("consent_type", "nutrition_advice");
  if (consentError) return { status: "error", error: "internal" };
  if (!isNutritionConsentGranted(consentRows ?? [])) {
    return respondGate(admin, athlete, "consent");
  }

  // (b) safety capture: LATEST daily_readiness row, has_pain gates (decision
  // Nick 2026-07-17 — no recency window; weekly_checkins carries no safety
  // fields today and is declared un-evaluated in safety_context).
  const { data: readiness, error: readinessError } = await admin
    .from("daily_readiness")
    .select("date, has_pain")
    .eq("athlete_id", athlete.id)
    .order("date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (readinessError) return { status: "error", error: "internal" };
  if (readiness?.has_pain === true) {
    return respondGate(admin, athlete, "safety_capture", `check-in del ${readiness.date}`);
  }

  // (c) parallel fetches for the engine (target/fetchInputs.ts).
  const fetched = await fetchEngineInputs(admin, cfg, todayIso, athlete.id);
  if (!fetched.ok) {
    console.error(`${FN} fetch failed`, { code: fetched.code });
    return { status: "error", error: "internal" };
  }
  const inputs = fetched.inputs;
  const outcome: NutritionOutcome = assembleNutritionPlan({
    todayIso,
    config: cfg,
    athlete: {
      cycleStatus: inputs.cycleStatus,
      lifecycleReferralAlreadySent: inputs.lifecycleReferralAlreadySent,
    },
    activePlan: inputs.activePlan,
    previousReleases: inputs.previousReleases,
    logs: inputs.logs,
    measurements: inputs.measurements,
    historyStartIso: inputs.historyStartIso,
  });

  if (outcome.status === "no_baseline_data") return { status: "no_baseline_data" };
  if (outcome.status === "escalation") {
    return respondGate(admin, athlete, "anomalous_adjustment", outcome.reasons.join("; "), {
      raw_target_kcal: outcome.audit?.rawTargetKcal ?? null,
    });
  }
  if (outcome.status === "gated") {
    return respondGate(admin, athlete, outcome.reason, outcome.detail, {
      candidate: outcome.candidate,
    });
  }

  const doc = outcome.document;

  // Cold start: the ONE write ever on nutrition_plans (coach_id is NOT NULL).
  if (doc.cold_start) {
    const planCoach = athlete.coach_id ?? Deno.env.get("SAFETY_NET_COACH_ID") ?? null;
    if (!planCoach) {
      console.error(`${FN} cold start without coach recipient (SAFETY_NET_COACH_ID unset)`);
      return { status: "error", error: "server_misconfigured" };
    }
    const { error: planError } = await admin.from("nutrition_plans").insert({
      athlete_id: athlete.id,
      coach_id: planCoach,
      daily_calories: doc.daily_calories,
      protein_g: doc.protein_g,
      carbs_g: doc.carbs_g,
      fats_g: doc.fats_g,
      strategy_type: "maintain",
      active: true,
      notes:
        "Baseline automatica (cold start): suggerimento adattivo iniziale del motore nutrizionale.",
    });
    if (planError) {
      console.error(`${FN} cold-start plan insert failed`, { code: planError.code });
      return { status: "error", error: "internal" }; // no release without its plan
    }
  }

  const safetyContext = {
    gate_outcome: "released",
    consent: "granted",
    safety_capture: {
      source: "daily_readiness",
      checkin_present: readiness != null,
      latest_date: readiness?.date ?? null,
      // Faithful ledger: null when never reported — the gate only blocks on
      // === true, but "false" must not be forged out of missing data.
      has_pain: readiness?.has_pain ?? null,
      weekly_checkins_evaluated: false, // no safety fields today (declared)
    },
    config_profile: "nicolo_nutrition",
    config_version: configVersion,
    capped_by: outcome.audit.cappedBy,
    evidence_kcal: outcome.audit.evidenceKcal,
    confidence_components: outcome.audit.confidence,
    deficit_streak_weeks: outcome.audit.deficitStreakWeeks,
    lifecycle_referral_due: outcome.audit.lifecycleReferralDue,
  };

  const { data: release, error: releaseError } = await admin
    .from("nutrition_releases")
    .insert({
      athlete_id: athlete.id,
      released_by: "engine",
      coaching_mode: "autonomous",
      schema_version: NUTRITION_SCHEMA_VERSION,
      config_version: configVersion,
      nutrition_document: doc,
      safety_context: safetyContext,
      fallback_mode: doc.fallback_mode,
      cold_start: doc.cold_start,
      supersedes_id: inputs.previousReleases[0]?.id ?? null,
    })
    .select("id")
    .single();
  if (releaseError) {
    if (releaseError.code === "23505") return { status: "conflict" }; // root or chain race
    console.error(`${FN} release insert failed`, { code: releaseError.code });
    return { status: "error", error: "internal" };
  }

  // A clean release resolves the athlete review pause. Placed BEFORE the
  // fail-loud audit below: a late audit failure must not leave the duplicate
  // guard stale (an unread row would silently swallow the next block's notify).
  await clearAthleteReview(admin, athlete.id);

  // One-shot lifecycle referral: best-effort, never voids the release.
  if (outcome.audit.lifecycleReferralDue) {
    await raiseAlert(admin, athlete, lifecycleReferralAlert(athlete.full_name ?? "Atleta"), true);
  }

  // Forensic trail of the release: fail loud (the row exists, the trail must too).
  const audited = await insertAudit(admin, athlete.id, "nutrition_target_released", {
    release_id: release.id,
    schema_version: NUTRITION_SCHEMA_VERSION,
    config_version: configVersion,
    cold_start: doc.cold_start,
    fallback_mode: doc.fallback_mode,
  });
  if (!audited) return { status: "error", error: "internal" };

  return {
    status: "released",
    release_id: release.id,
    daily_calories: doc.daily_calories,
    protein_g: doc.protein_g,
    carbs_g: doc.carbs_g,
    fats_g: doc.fats_g,
    expenditure_estimate: doc.expenditure_estimate,
    confidence: doc.confidence,
    fallback_mode: doc.fallback_mode,
    cold_start: doc.cold_start,
    diet_break_suggested: doc.diet_break_suggested,
    config_version: configVersion,
  };
}
