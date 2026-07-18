// =============================================================================
// supabase/functions/submit-intake/index.ts
// =============================================================================
// I/O boundary of the intake submit (Fase 1 backbone). The AUTHENTICATED
// athlete posts the questionnaire payload; this function:
//   1. authenticates the JWT and loads the athlete profile (mode, coach);
//   2. validates the payload against the contract whitelists (intake/validate.ts);
//   3. runs the deterministic modules (semaforo/DCA/objective/neurotype) —
//      server-side and authoritative: the client can never claim a "green";
//   4. rejects minors WITHOUT persisting health data (decision C 2026-07-13);
//   5. calls the PRIVATE RPC submit_intake (service-role only) for the
//      all-or-nothing transaction;
//   6. returns { ok, gate } — a blocking gate is an EXPLICIT response, never
//      a silent success.
// Error hygiene (art. 9): no payload values in logs or error bodies — machine
// codes and field paths only.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { evaluateDca } from "./intake/dca.ts";
import { evaluateSafety } from "./intake/semaforo.ts";
import type { CoachingMode } from "./intake/semaforo.ts";
import { deriveArena } from "./intake/objective.ts";
import { scoreNeurotype } from "./intake/neurotype.ts";
import { experienceForColumn, SCHEMA_VERSION, validateIntakePayload } from "./intake/validate.ts";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";

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

const MAX_BODY_BYTES = 120_000;

/** Full years between an ISO yyyy-mm-dd birth date and `now` (UTC). */
function ageInYears(birthDate: string, now: Date): number {
  const [y, m, d] = birthDate.split("-").map(Number);
  let age = now.getUTCFullYear() - y;
  const monthDiff = now.getUTCMonth() + 1 - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < d)) age -= 1;
  return age;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) {
      console.error("submit-intake: missing Supabase env vars");
      return json({ ok: false, error: "server_misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ ok: false, error: "unauthorized" }, 401);

    const supabaseUser = createClient(SUPABASE_URL, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();
    if (authError || !user) return json({ ok: false, error: "unauthorized" }, 401);

    const admin = createClient(SUPABASE_URL, secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, role, coach_id, full_name, coaching_mode, onboarding_data")
      .eq("id", user.id)
      .single();
    if (profileError || !profile) {
      console.error("submit-intake: profile lookup failed", { code: profileError?.code });
      return json({ ok: false, error: "profile_not_found" }, 403);
    }
    if (profile.role !== "athlete") return json({ ok: false, error: "athletes_only" }, 403);

    const onboardingData = (profile.onboarding_data ?? {}) as Record<string, unknown>;
    if ("intake" in onboardingData) return json({ ok: false, error: "already_submitted" }, 409);

    const raw = await req.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: "payload_too_large" }, 413);
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }

    // coaching_mode not yet set (legacy invite) -> coached (coach oversight).
    const mode: CoachingMode = profile.coaching_mode === "autonomous" ? "autonomous" : "coached";

    const validated = validateIntakePayload(body, mode);
    if (!validated.ok) {
      return json(
        {
          ok: false,
          error: validated.error,
          ...(validated.field ? { field: validated.field } : {}),
        },
        400,
      );
    }
    const { intakeRecord, consents, consentVersion, injuries, cycle, extract } = validated.data;

    // --- Date boundary: age / minor gate (reject, no health data persisted) --
    const now = new Date();
    const age = ageInYears(extract.birthDate, now);
    if (age > 120) {
      return json(
        { ok: false, error: "invalid_payload", field: "intake.anagrafica.birth_date" },
        400,
      );
    }
    if (age < 18) {
      // Lean audit + coach alert only (age is not art. 9 data); best effort.
      await admin.from("audit_log").insert({
        actor_id: user.id,
        actor_role: "athlete",
        action: "intake_rejected",
        entity_type: "profile",
        entity_id: user.id,
        metadata: { schema_version: SCHEMA_VERSION, reason: "minor" },
      });
      if (profile.coach_id) {
        await admin.from("coach_alerts").insert({
          coach_id: profile.coach_id,
          athlete_id: user.id,
          type: "routed_out",
          severity: "high",
          message: `${profile.full_name ?? "L'atleta"}: intake respinto — requisito di età non soddisfatto. Nessun dato salute registrato.`,
          link: `/coach/athletes/${user.id}`,
        });
      }
      return json({ ok: false, gate: { level: "red", routedOut: true, reasons: ["minor"] } }, 200);
    }

    // --- Deterministic modules (server-side, authoritative) ------------------
    const dca = evaluateDca(extract.dca);
    const safety = evaluateSafety({
      mode,
      athleteName: profile.full_name ?? "",
      age,
      parq: extract.parq,
      painNow: extract.painNow,
      painGesture: extract.painGesture,
      weightLossUnintentional: extract.weightLossUnintentional,
      conditionDiagnosed: extract.conditionDiagnosed,
      medicationsReported: extract.medicationsReported,
      dcaFlag: dca.flag,
      pregnancy: (cycle?.pregnancy ?? null) as "si" | "no" | "na" | null,
      cycleStatus: cycle?.cycle_status ?? null,
      stressLevel: extract.stressLevel,
      sleepQuality: extract.sleepQuality,
    });
    const arena = extract.objective ? deriveArena(extract.objective, extract.arenaCtx) : null;
    const neuro = extract.neurotypeAnswers ? scoreNeurotype(extract.neurotypeAnswers) : null;
    const experienceLevel = experienceForColumn(extract.experienceLevel);

    const finalRecord: Record<string, unknown> = {
      ...intakeRecord,
      schema_version: SCHEMA_VERSION,
      submitted_at: now.toISOString(),
      mode,
      dca: { ...extract.dca, flag: dca.flag },
      safety: {
        level: safety.level,
        routed_out: safety.routedOut,
        reasons: safety.reasons,
        yellow: safety.yellowSignals,
      },
      ...(arena ? { arena_seed: arena } : {}),
      ...(neuro
        ? {
            neurotype: {
              answers: intakeRecord.neurotype_answers,
              totals: neuro.totals,
              primary: neuro.primary,
              secondary: neuro.secondary,
              margin: neuro.margin,
              close_call: neuro.closeCall,
            },
          }
        : {}),
    };
    delete finalRecord.neurotype_answers; // consolidated under neurotype.answers

    const computed = {
      intake_record: finalRecord,
      profile: {
        ...(extract.objective ? { objective: extract.objective } : {}),
        ...(experienceLevel ? { experience_level: experienceLevel } : {}),
        ...(neuro ? { neurotype: neuro.primary } : {}),
        medical_clearance_required: safety.medicalClearanceRequired,
        red_flags: safety.redFlags,
      },
      alerts: safety.alerts,
      audit_metadata: {
        schema_version: SCHEMA_VERSION,
        gate_level: safety.level,
        routed_out: safety.routedOut,
        reasons_count: safety.reasons.length,
        alerts_count: safety.alerts.length,
      },
    };

    const { data: rpcData, error: rpcError } = await admin.rpc("submit_intake", {
      p_athlete_id: user.id,
      p_payload: {
        schema_version: SCHEMA_VERSION,
        intake: intakeRecord,
        consents,
        consent_version: consentVersion,
        injuries,
        ...(cycle ? { cycle } : {}),
      },
      p_computed: computed,
    });

    if (rpcError) {
      // The RPC re-raises a FIXED message (lesson 0004): the code is safe to log.
      console.error("submit-intake: rpc failed", { code: rpcError.code });
      return json({ ok: false, error: "internal" }, 500);
    }
    const result = rpcData as { ok: boolean; error?: string } | null;
    if (!result?.ok) {
      const errCode = result?.error ?? "internal";
      const status =
        errCode === "already_submitted"
          ? 409
          : errCode === "invalid_athlete"
            ? 403
            : errCode === "missing_required_consents" || errCode === "invalid_payload"
              ? 400
              : 500;
      return json({ ok: false, error: errCode }, status);
    }

    return json(
      {
        ok: true,
        gate: {
          level: safety.level,
          routedOut: safety.routedOut,
          reasons: safety.reasons,
          yellow: safety.yellowSignals,
        },
      },
      200,
    );
  } catch (err) {
    // Never log the payload — machine message only (art. 9 hygiene).
    console.error(
      "submit-intake: unexpected error",
      err instanceof Error ? err.message : "unknown",
    );
    return json({ ok: false, error: "internal" }, 500);
  }
});
