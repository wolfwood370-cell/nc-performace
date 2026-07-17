// supabase/functions/compute-nutrition-target/index.ts
// =============================================================================
// Weekly ADAPTIVE nutrition target for AUTONOMOUS athletes (closed loop):
//   1. auth: verify_jwt=true at the gateway + in-function exact match against
//      SUPABASE_SERVICE_ROLE_KEY — only the scheduled job (or an operator with
//      the service key) may invoke; a user JWT gets 403;
//   2. config: method_config profile `nicolo_nutrition`, is_active=true ONLY —
//      the go-live switch is Cowork's activation, service_role does NOT bypass
//      it (503 config_missing before activation); STRICT parse (v2 fields
//      required) -> 500 config_invalid;
//   3. body { athlete_id? }: present -> single athlete (task contract);
//      absent -> batch over all eligible autonomous athletes;
//   4. per athlete (target/processAthlete.ts): consent -> has_pain capture ->
//      pure engine (_shared/nutrition) -> guardrails -> immutable
//      nutrition_releases row (supersedes chain) + guaranteed escalations.
// Copy is Italian and adherence-neutral: an adaptive SUGGESTION, never a
// prescribed diet. Machine codes only in logs and error bodies (art. 9).
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { parseNutritionConfig, NutritionConfigError } from "../_shared/nutrition/parseConfig.ts";
import { romeDayFromDate } from "../_shared/nutrition/romeDate.ts";
import { processAthlete } from "./target/processAthlete.ts";
import type { AthleteRow, SingleResult } from "./target/processAthlete.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const FN = "[compute-nutrition-target]";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONCURRENCY = 3; // twin: generate-batch-checkins

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/** HTTP mapping of a single-athlete result (statuses stay in the body). */
function respondSingle(result: SingleResult): Response {
  if (result.status === "conflict") return json(result, 409);
  if (result.status === "error") return json({ ok: false, error: result.error }, 500);
  return json(result, 200);
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      console.error(`${FN} missing Supabase env vars`);
      return json({ ok: false, error: "server_misconfigured" }, 500);
    }

    // Service-role-only gate: exact string match is the strongest possible
    // discriminator (a user JWT can never equal the service key; no claim
    // parsing surface). The gateway already verified the JWT signature.
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
    if (!token) return json({ ok: false, error: "unauthorized" }, 401);
    if (token !== SERVICE_ROLE_KEY) return json({ ok: false, error: "forbidden" }, 403);

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Body: optional { athlete_id } — absent/empty body means batch.
    let athleteId: string | null = null;
    const rawBody = await req.text();
    if (rawBody.trim().length > 0) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(rawBody);
      } catch {
        return json({ ok: false, error: "invalid_json" }, 400);
      }
      const candidate = (parsed as Record<string, unknown>)?.athlete_id;
      if (candidate != null) {
        if (typeof candidate !== "string" || !UUID_RE.test(candidate)) {
          return json({ ok: false, error: "invalid_athlete_id" }, 400);
        }
        athleteId = candidate;
      }
    }

    // Config: active profile only — activation IS the go-live switch.
    const { data: configRow, error: configError } = await admin
      .from("method_config")
      .select("version, config")
      .eq("profile_name", "nicolo_nutrition")
      .eq("is_active", true)
      .maybeSingle();
    if (configError) {
      console.error(`${FN} config fetch failed`, { code: configError.code });
      return json({ ok: false, error: "internal" }, 500);
    }
    if (!configRow) return json({ ok: false, error: "config_missing" }, 503);

    let cfg;
    try {
      cfg = parseNutritionConfig(configRow.config);
    } catch (err) {
      const field = err instanceof NutritionConfigError ? err.field : "unknown";
      console.error(`${FN} config invalid`, { field });
      return json({ ok: false, error: "config_invalid" }, 500);
    }
    const configVersion = `nicolo_nutrition@v${configRow.version}`;
    const todayIso = romeDayFromDate(new Date());

    // ---------------------------------------------------------------- single
    if (athleteId != null) {
      const { data: profile, error: profileError } = await admin
        .from("profiles")
        .select("id, coach_id, full_name, role, coaching_mode, onboarding_completed")
        .eq("id", athleteId)
        .maybeSingle();
      if (profileError) return json({ ok: false, error: "internal" }, 500);
      if (!profile) return json({ ok: false, error: "athlete_not_found" }, 404);
      if (
        profile.role !== "athlete" ||
        profile.coaching_mode !== "autonomous" ||
        profile.onboarding_completed !== true
      ) {
        return json({ ok: false, error: "not_eligible" }, 403);
      }
      const result = await processAthlete(
        admin,
        cfg,
        configVersion,
        todayIso,
        profile as AthleteRow,
      );
      return respondSingle(result);
    }

    // ----------------------------------------------------------------- batch
    const { data: athletes, error: athletesError } = await admin
      .from("profiles")
      .select("id, coach_id, full_name")
      .eq("role", "athlete")
      .eq("coaching_mode", "autonomous")
      .eq("onboarding_completed", true);
    if (athletesError) {
      console.error(`${FN} athlete selection failed`, { code: athletesError.code });
      return json({ ok: false, error: "internal" }, 500);
    }

    const rows = (athletes ?? []) as AthleteRow[];
    const results: Array<{ athlete_id: string } & SingleResult> = [];
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const chunk = rows.slice(i, i + CONCURRENCY);
      const settled = await Promise.all(
        chunk.map(async (athlete) => {
          try {
            const result = await processAthlete(admin, cfg, configVersion, todayIso, athlete);
            return { athlete_id: athlete.id, ...result };
          } catch (err) {
            // Per-athlete isolation: one failure never stops the batch.
            console.error(`${FN} athlete processing crashed`, {
              athleteId: athlete.id,
              message: err instanceof Error ? err.message : "unknown",
            });
            return { athlete_id: athlete.id, status: "error", error: "internal" } as const;
          }
        }),
      );
      results.push(...settled);
    }

    const released = results.filter((r) => r.status === "released").length;
    return json({
      message: `Elaborati ${results.length} atleti (${released} rilasci)`,
      count: results.length,
      results,
    });
  } catch (err) {
    console.error(`${FN} error`, { message: err instanceof Error ? err.message : "unknown" });
    return json({ ok: false, error: "internal" }, 500);
  }
});
