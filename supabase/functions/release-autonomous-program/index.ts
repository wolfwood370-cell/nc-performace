// =============================================================================
// supabase/functions/release-autonomous-program/index.ts
// =============================================================================
// AUTONOMOUS release of the athlete's first program (slice 2026-07-15).
// The AUTHENTICATED athlete asks for their program; this function:
//   1. authenticates the JWT and enforces the autonomous precondition
//      (role=athlete AND coaching_mode='autonomous' AND onboarding_completed);
//   2. idempotency: an existing release -> 409, never a re-roll;
//   3. runs the PURE gate (release/decide.ts): consent art. 22 (3 types) ->
//      full clinical sequence -> traffic light -> general zone; a missing
//      consent returns { consentRequired } plus a BEST-EFFORT audit_log row
//      (art. 22 trail — an audit failure never hides the consent prompt);
//   4. on STOP: guaranteed escalation (coach_alerts with a non-null recipient,
//      SAFETY_NET_COACH_ID as fallback) + audit_log, then an EXPLICIT blocking
//      response — a failed alert insert is a 5xx, never a silent success;
//   5. on pass: assembles the week with the SHARED deterministic engine
//      (_shared/method — same brain as the Coached path, untouched), applies
//      the conservative first block when self-efficacy is low, and inserts the
//      IMMUTABLE program_releases row (append-only ledger, art. 22) + audit.
// Callers branch on ok/gate — never on the HTTP status (STOPs are 200).
// Error hygiene (art. 9): machine codes only in logs and error bodies.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { assembleWeek, buildExcludedZones } from "../_shared/method/assembleWeek.ts";
import { hasGeneralBlock } from "../_shared/method/zoneMap.ts";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";
import { hasActiveAccess } from "../_shared/billing.ts";
import { buildConsentBlockedAudit, buildStopAlert, decideGate, stopFor } from "./release/decide.ts";
import type { ConsentRow, StopDecision } from "./release/decide.ts";
import { goalForObjective } from "./release/objectiveDriver.ts";
import { parseIntakeInputs } from "./release/intakeInputs.ts";
import {
  applyConservativeFirstBlock,
  buildProgramDocument,
  buildSafetyContext,
  CONFIG_VERSION,
  isConservativeFirstBlock,
  PROGRAM_SCHEMA_VERSION,
  validateProgramDocument,
} from "./release/buildRelease.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/**
 * Guaranteed escalation for a STOP: coach_alerts (recipient never null) then
 * audit_log, then the blocking 200. Any write failure -> 5xx: alertRaised must
 * always be truthful and the art. 22 trail complete.
 */
async function respondStop(
  admin: SupabaseClient,
  athleteId: string,
  athleteName: string,
  coachId: string | null,
  stop: StopDecision,
): Promise<Response> {
  const recipient = coachId ?? Deno.env.get("SAFETY_NET_COACH_ID") ?? null;
  if (!recipient) {
    console.error("[release-autonomous-program] no alert recipient (SAFETY_NET_COACH_ID unset)");
    return json({ ok: false, error: "escalation_failed" }, 500);
  }
  const alert = buildStopAlert(stop.reason, athleteName);
  // Dedupe (review 2026-07-15): while an autonomous_gate_stop alert is still
  // undismissed, repeated attempts must not flood the coach — the live alert
  // IS the guaranteed escalation (alertRaised stays truthful). Once the coach
  // dismisses it, a new attempt raises a fresh one. On lookup failure we fall
  // through to insert: a duplicate beats a lost escalation.
  const { data: liveAlert, error: liveAlertError } = await admin
    .from("coach_alerts")
    .select("id")
    .eq("athlete_id", athleteId)
    .eq("type", alert.type)
    .eq("dismissed", false)
    .limit(1);
  const alreadyEscalated = !liveAlertError && (liveAlert?.length ?? 0) > 0;
  if (!alreadyEscalated) {
    const { error: alertError } = await admin.from("coach_alerts").insert({
      coach_id: recipient,
      athlete_id: athleteId,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
      link: `/coach/athletes/${athleteId}`,
    });
    if (alertError) {
      console.error("[release-autonomous-program] alert insert failed", { code: alertError.code });
      return json({ ok: false, error: "escalation_failed" }, 500);
    }
  }
  const { error: auditError } = await admin.from("audit_log").insert({
    actor_id: athleteId,
    actor_role: "athlete",
    action: "autonomous_release_blocked",
    entity_type: "profile",
    entity_id: athleteId,
    metadata: { reason: stop.reason, severity: stop.severity },
  });
  if (auditError) {
    // Alert is out (safety first) but the forensic trail is incomplete: fail loud.
    console.error("[release-autonomous-program] audit insert failed", { code: auditError.code });
    return json({ ok: false, error: "internal" }, 500);
  }
  return json(
    {
      ok: false,
      gate: true,
      reason: stop.reason,
      alertRaised: true,
      ...(stop.medicalReferral ? { medicalReferral: true } : {}),
    },
    200,
  );
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) {
      console.error("[release-autonomous-program] missing Supabase env vars");
      return json({ ok: false, error: "server_misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);

    const userClient = createClient(SUPABASE_URL, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "unauthorized" }, 401);

    // Body: PROFILE-DRIVEN input — the athlete sends no load/objective params.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    const mode = (body as Record<string, unknown> | null)?.mode;
    if (mode !== "new") return json({ ok: false, error: "invalid_mode" }, 400); // v1: 'new' only

    // Service client AFTER identity is established (privileged reads/writes
    // below are the single audited point of the autonomous path).
    const admin = createClient(SUPABASE_URL, secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select(
        "id, role, coach_id, full_name, coaching_mode, onboarding_completed, onboarding_data, objective, experience_level, neurotype, one_rm_data, fms_exclusion_zones, red_flags, medical_clearance_required, access_until",
      )
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      console.error("[release-autonomous-program] profile lookup failed", {
        code: profileError?.code,
      });
      return json({ ok: false, error: "profile_not_found" }, 403);
    }

    // Autonomous precondition (invariant 3): coaching_mode NULL -> 403.
    if (profile.role !== "athlete") return json({ ok: false, error: "athletes_only" }, 403);
    if (profile.coaching_mode !== "autonomous") {
      return json({ ok: false, error: "not_autonomous" }, 403);
    }
    if (profile.onboarding_completed !== true) {
      return json({ ok: false, error: "onboarding_incomplete" }, 403);
    }

    // Payment gate (2026-07-26): the SAME predicate the FE mirror re-exports
    // (single rule in _shared/billing.ts, reader of access_until). Refused
    // BEFORE anything is served or written. 403 like the sibling precondition
    // refusals above; the caller branches on the BODY flag, never on the HTTP
    // status (header contract). Additive: no existing field changes shape.
    if (!hasActiveAccess(profile, new Date())) {
      return json({ ok: false, error: "payment_required", paymentRequired: true }, 403);
    }

    // Idempotency (D3/FIX-M7): the active program is the DERIVED tail of the
    // chain — any existing row means one exists. No re-roll, no mutation.
    const { data: existing, error: existingError } = await admin
      .from("program_releases")
      .select("id, released_at")
      .eq("athlete_id", user.id)
      .order("released_at", { ascending: false })
      .limit(1);
    if (existingError) {
      console.error("[release-autonomous-program] release lookup failed", {
        code: existingError.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }
    if (existing && existing.length > 0) {
      return json(
        {
          ok: false,
          alreadyActive: true,
          error: "Hai già un programma attivo",
          release_id: existing[0].id,
        },
        409,
      );
    }

    // Consent ledger (art. 22) — raw rows; latest-per-type resolves in decide.
    const { data: consentRows, error: consentsError } = await admin
      .from("consents")
      .select("consent_type, granted, created_at, version")
      .eq("athlete_id", user.id);
    if (consentsError) {
      console.error("[release-autonomous-program] consents lookup failed", {
        code: consentsError.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }

    // Current injuries -> excluded zones, same semantics as the Coached path.
    const { data: injuries, error: injuriesError } = await admin
      .from("injuries")
      .select("body_zone, status")
      .eq("athlete_id", user.id)
      .in("status", ["in_rehab", "chronic"]);
    if (injuriesError) {
      console.error("[release-autonomous-program] injuries lookup failed", {
        code: injuriesError.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }
    const excludedZones = buildExcludedZones(
      (profile.fms_exclusion_zones as string[] | null) ?? null,
      (injuries ?? [])
        .map((i: { body_zone: unknown; status: unknown }) => ({
          zone: String(i.body_zone ?? ""),
          status: String(i.status ?? ""),
        }))
        .filter((i) => i.zone),
    );

    const intake = parseIntakeInputs(profile.onboarding_data);
    const athleteName = (profile.full_name as string | null) ?? "";

    // --- The gate (pure): consent -> clinical -> traffic light -> general ---
    const decision = decideGate({
      consentRows: (consentRows ?? []) as ConsentRow[],
      medicalClearanceRequired: profile.medical_clearance_required === true,
      redFlags: profile.red_flags,
      safety: intake.safety,
      generalBlock: hasGeneralBlock(excludedZones),
    });

    if (decision.outcome === "consent_required") {
      // Art. 22 compliance trail: prove the automated release was refused for
      // missing consent. Best-effort by design: no escalation rides on this
      // row and an audit hiccup must never hide the consent prompt (unlike
      // STOPs, where fail-loud protects alertRaised).
      const { error: auditError } = await admin
        .from("audit_log")
        .insert(buildConsentBlockedAudit(user.id, decision.missing));
      if (auditError) {
        console.error("[release-autonomous-program] consent audit insert failed", {
          code: auditError.code,
        });
      }
      return json({ ok: false, consentRequired: true, missing: decision.missing }, 200);
    }
    if (decision.outcome === "stop") {
      return respondStop(admin, user.id, athleteName, profile.coach_id, decision);
    }

    // --- Assembly via the SHARED engine (Coached brain, zero duplication) ---
    // Exercise library: the athlete's coach or the safety-net coach (method #1).
    const libraryOwner = profile.coach_id ?? Deno.env.get("SAFETY_NET_COACH_ID") ?? null;
    if (!libraryOwner) {
      console.error("[release-autonomous-program] no library owner (SAFETY_NET_COACH_ID unset)");
      return json({ ok: false, error: "server_misconfigured" }, 500);
    }
    const { data: exerciseRows, error: exercisesError } = await admin
      .from("exercises")
      .select(
        "id, os_id, name, exercise_family, movement_pattern, patterns, equipment, execution_mode, suited_rep_range, fatigue_cost, technical_complexity, laterality, stability_demand, body_position, lift_phase, muscles, secondary_muscles, attributes",
      )
      .eq("coach_id", libraryOwner)
      .eq("archived", false)
      .order("id", { ascending: true });
    if (exercisesError) {
      console.error("[release-autonomous-program] exercises fetch failed", {
        code: exercisesError.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }

    const goal = goalForObjective(profile.objective as string | null);
    const program = assembleWeek({
      focusGoal: goal,
      daysPerWeek: intake.daysPerWeek,
      equipmentRaw: intake.equipmentRaw,
      mode: "new",
      experienceLevel: (profile.experience_level as string | null) ?? null,
      trainingAge: intake.trainingAge,
      neurotype: (profile.neurotype as string | null) ?? null,
      excludedZones,
      oneRmData: (profile.one_rm_data as Record<string, unknown> | null) ?? null,
      candidates: (exerciseRows ?? []) as Parameters<typeof assembleWeek>[0]["candidates"],
    });

    // Vitality guard: an empty week is a gated STOP (escalated), never a release.
    if (program.days.every((d) => d.exercises.length === 0)) {
      return respondStop(admin, user.id, athleteName, profile.coach_id, stopFor("settimana_vuota"));
    }

    // Readiness rule v1: recorded always, shrinks volume only when confidence is low.
    const conservative = isConservativeFirstBlock(intake.readiness);
    const finalProgram = conservative ? applyConservativeFirstBlock(program) : program;

    const document = buildProgramDocument(finalProgram, goal);
    if (!validateProgramDocument(document)) {
      // Internal bug: the row is refused at the boundary (invariant D3).
      console.error("[release-autonomous-program] program document failed validation");
      return json({ ok: false, error: "internal" }, 500);
    }

    const healthConsent = (consentRows ?? [])
      .filter((c: { consent_type: string }) => c.consent_type === "health_required")
      .sort((a: { created_at: string }, b: { created_at: string }) =>
        a.created_at < b.created_at ? 1 : -1,
      )[0] as { version?: string } | undefined;
    const safetyContext = buildSafetyContext({
      consentVersion: healthConsent?.version ?? null,
      safetyLevelSnapshot: decision.safetyLevelSnapshot,
      excludedZones,
      readiness: intake.readiness,
      conservativeApplied: conservative,
      objective: (profile.objective as string | null) ?? null,
      goalDriver: goal,
      daysPerWeek: intake.daysPerWeek,
      equipmentItems: intake.equipmentItems,
      experienceLevel: (profile.experience_level as string | null) ?? null,
      neurotype: (profile.neurotype as string | null) ?? null,
    });

    // --- The immutable release (append-only ledger, trigger-enforced) --------
    const { data: release, error: releaseError } = await admin
      .from("program_releases")
      .insert({
        athlete_id: user.id,
        released_by: "engine",
        coaching_mode: "autonomous",
        schema_version: PROGRAM_SCHEMA_VERSION,
        config_version: CONFIG_VERSION,
        program_document: document,
        safety_context: safetyContext,
        supersedes_id: null,
      })
      .select("id, released_at")
      .single();
    if (releaseError || !release) {
      // Unique root index = race lost against a concurrent first release.
      if (releaseError?.code === "23505") {
        return json({ ok: false, alreadyActive: true, error: "Hai già un programma attivo" }, 409);
      }
      console.error("[release-autonomous-program] release insert failed", {
        code: releaseError?.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }

    const { error: auditError } = await admin.from("audit_log").insert({
      actor_id: user.id,
      actor_role: "athlete",
      action: "autonomous_release",
      entity_type: "program_release",
      entity_id: release.id,
      metadata: {
        schema_version: PROGRAM_SCHEMA_VERSION,
        config_version: CONFIG_VERSION,
        conservative_applied: conservative,
      },
    });
    if (auditError) {
      // The release row exists (immutable); an incomplete art. 22 trail is
      // still a hard error — the client will find the release via 409/query.
      console.error("[release-autonomous-program] audit insert failed", { code: auditError.code });
      return json({ ok: false, error: "internal" }, 500);
    }

    return json({ ok: true, release_id: release.id, released_at: release.released_at }, 200);
  } catch (err) {
    console.error(
      "[release-autonomous-program] unexpected error",
      err instanceof Error ? err.message : "unknown",
    );
    return json({ ok: false, error: "internal" }, 500);
  }
});
