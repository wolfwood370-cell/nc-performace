// =============================================================================
// supabase/functions/publish-program-block/index.ts
// =============================================================================
// COACH release of a program block (slice 2026-08-20): the missing channel
// between program_blocks (the coach's mutable draft) and program_releases
// (the immutable ledger the athlete reads). The AUTHENTICATED coach sends
// { block_id, dates }; this function:
//   1. authenticates the JWT and requires role=coach;
//   2. loads the draft, refusing to reveal other coaches' rows (404, not 403);
//   3. verifies the athlete belongs to the coach's roster;
//   4. refuses to sign 'coached' for an autonomous athlete (409 gate);
//   5. runs the SHARED clinical gate (safetyGate — CORE §0.2: reds stop the
//      coach exactly like they stop the engine) on the LIVE profile columns;
//      a STOP writes a coach_alerts row and NOTHING else — never silent;
//   6. builds the v2 document SERVER-SIDE from the saved draft (the client
//      chooses only the dates), validates it at the write boundary;
//   7. chains onto the current tail (supersedes_id) and INSERTs the immutable
//      row: released_by='coach', schema_version=2 — the column value and the
//      in-document version come from the same constant.
// Callers branch on ok/gate — machine codes only in bodies and logs (art. 9).
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { GATE_CLEARANCE_REASON, safetyGate } from "../_shared/method/assembleWeek.ts";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";
import {
  buildCoachProgramDocument,
  COACH_CONFIG_VERSION,
  COACH_PROGRAM_SCHEMA_VERSION,
  isIsoDate,
  sessionIdFor,
  validateCoachProgramDocument,
} from "../_shared/program/coachRelease.ts";
import type { CoachBlockWeek, SessionDateInput } from "../_shared/program/coachRelease.ts";

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Parsed request body; null = malformed (caller answers 400 invalid_input). */
function parseBody(body: unknown): { blockId: string; dates: SessionDateInput[] } | null {
  if (typeof body !== "object" || body === null) return null;
  const blockId = (body as Record<string, unknown>).block_id;
  const rawDates = (body as Record<string, unknown>).dates;
  if (typeof blockId !== "string" || !UUID_RE.test(blockId)) return null;
  if (!Array.isArray(rawDates) || rawDates.length === 0) return null;
  const dates: SessionDateInput[] = [];
  for (const entry of rawDates) {
    if (typeof entry !== "object" || entry === null) return null;
    const sessionId = (entry as Record<string, unknown>).session_id;
    const date = (entry as Record<string, unknown>).date;
    if (typeof sessionId !== "string" || typeof date !== "string") return null;
    dates.push({ session_id: sessionId, date });
  }
  return { blockId, dates };
}

/**
 * Mirrors the publish dialog's rules on the server (defense in depth): every
 * NON-EMPTY session covered exactly once (an empty session is not a delivery
 * and gets no date), calendar-valid unique dates, none before start_date.
 * Returns null when valid, else the machine reason for the log.
 */
function datesProblem(
  dates: SessionDateInput[],
  weeks: CoachBlockWeek[],
  startDate: string,
): string | null {
  const expected = new Set<string>();
  for (const week of weeks) {
    const sessions = [...week.sessions].sort((a, b) => a.order - b.order);
    sessions.forEach((session, idx) => {
      if (!Array.isArray(session.exercises) || session.exercises.length === 0) return;
      expected.add(sessionIdFor(week.order, idx + 1));
    });
  }
  if (dates.length !== expected.size) return "session_count_mismatch";
  const seenSessions = new Set<string>();
  const seenDates = new Set<string>();
  for (const d of dates) {
    if (!expected.has(d.session_id)) return "unknown_session_id";
    if (seenSessions.has(d.session_id)) return "duplicate_session_id";
    seenSessions.add(d.session_id);
    if (!isIsoDate(d.date)) return "invalid_date";
    if (seenDates.has(d.date)) return "duplicate_date";
    seenDates.add(d.date);
    if (d.date < startDate) return "date_before_start";
  }
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    if (!SUPABASE_URL) {
      console.error("[publish-program-block] missing Supabase env vars");
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

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return json({ ok: false, error: "invalid_json" }, 400);
    }
    const input = parseBody(rawBody);
    if (!input) return json({ ok: false, error: "invalid_input" }, 400);

    // Service client AFTER identity is established (same posture as the
    // autonomous twin: privileged reads/writes below are the audited point).
    const admin = createClient(SUPABASE_URL, secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // --- 1. Identity: coaches only ---------------------------------------
    // A transient lookup failure is a 500, not a role refusal: a legitimate
    // coach must never read "coaches_only" for an infrastructure hiccup.
    const { data: coachProfile, error: coachError } = await admin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (coachError) {
      console.error("[publish-program-block] coach profile lookup failed", {
        code: coachError.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }
    if (!coachProfile || coachProfile.role !== "coach") {
      return json({ ok: false, error: "coaches_only" }, 403);
    }

    // --- 2. Draft ownership -----------------------------------------------
    // A coach_id mismatch answers the SAME 404 as a missing row: no response
    // may reveal that another coach's draft exists.
    const { data: block, error: blockError } = await admin
      .from("program_blocks")
      .select("id, coach_id, athlete_id, name, goal, start_date, data, updated_at")
      .eq("id", input.blockId)
      .maybeSingle();
    if (blockError) {
      console.error("[publish-program-block] block lookup failed", { code: blockError.code });
      return json({ ok: false, error: "internal" }, 500);
    }
    if (!block || block.coach_id !== user.id) {
      return json({ ok: false, error: "block_not_found" }, 404);
    }
    if (!block.athlete_id) return json({ ok: false, error: "no_athlete_assigned" }, 400);

    // --- 3. Roster: the athlete must be THIS coach's ----------------------
    const { data: athlete, error: athleteError } = await admin
      .from("profiles")
      .select("coach_id, coaching_mode, medical_clearance_required, red_flags")
      .eq("id", block.athlete_id)
      .maybeSingle();
    if (athleteError) {
      console.error("[publish-program-block] athlete lookup failed", { code: athleteError.code });
      return json({ ok: false, error: "internal" }, 500);
    }
    if (!athlete || athlete.coach_id !== user.id) {
      return json({ ok: false, error: "not_your_athlete" }, 403);
    }

    // --- 4. Mode: never sign 'coached' over an autonomous profile ---------
    // (coaching_mode null contradicts nothing and passes.)
    if (athlete.coaching_mode === "autonomous") {
      return json({ ok: false, gate: true, reason: "athlete_is_autonomous" }, 409);
    }

    // --- 5. Clinical gate (CORE §0.2) — the SHARED pure gate, LIVE columns -
    const gate = safetyGate({
      medicalClearanceRequired: athlete.medical_clearance_required === true,
      redFlags: athlete.red_flags,
    });
    if (gate.blocked) {
      const reason = gate.reason === GATE_CLEARANCE_REASON ? "clearance_required" : "red_flags";
      // Escalation must be truthful: alert first, fail loud if it cannot be
      // written. Dedupe mirrors the twin: a live undismissed alert IS the
      // escalation — repeated publish attempts must not flood the coach.
      const { data: liveAlert, error: liveAlertError } = await admin
        .from("coach_alerts")
        .select("id")
        .eq("athlete_id", block.athlete_id)
        .eq("type", "coach_release_gate_stop")
        .eq("dismissed", false)
        .limit(1);
      const alreadyEscalated = !liveAlertError && (liveAlert?.length ?? 0) > 0;
      if (!alreadyEscalated) {
        // No clinical detail in the message (art. 9): the machine reason in
        // the response is for the UI branch, the message stays generic.
        const { error: alertError } = await admin.from("coach_alerts").insert({
          coach_id: user.id,
          athlete_id: block.athlete_id,
          type: "coach_release_gate_stop",
          severity: "high",
          message:
            "Consegna bloccata dal gate di sicurezza: serve una valutazione prima di rilasciare un programma a questo atleta.",
          link: `/coach/athletes/${block.athlete_id}`,
        });
        if (alertError) {
          console.error("[publish-program-block] alert insert failed", {
            code: alertError.code,
          });
          return json({ ok: false, error: "escalation_failed" }, 500);
        }
      }
      return json({ ok: false, gate: true, reason }, 409);
    }

    // --- 6. The yellow traffic light does NOT block here ------------------
    // CORE §0.3: in Coached the yellow is co-managed BY the coach — this
    // release IS that manual act. Adding a semaforo check here would not
    // harden the gate, it would break the invariant. Do not "fix" this.

    // --- 7. Build the document SERVER-SIDE from the saved draft -----------
    const draft = block.data as { weeks?: unknown; description?: unknown } | null;
    if (!draft || !Array.isArray(draft.weeks)) {
      console.error("[publish-program-block] draft document malformed");
      return json({ ok: false, error: "internal" }, 500);
    }
    const weeks = draft.weeks as CoachBlockWeek[];

    const dateIssue = datesProblem(input.dates, weeks, block.start_date);
    if (dateIssue) {
      console.warn("[publish-program-block] dates refused", { reason: dateIssue });
      return json({ ok: false, error: "invalid_dates" }, 400);
    }

    let document: ReturnType<typeof buildCoachProgramDocument>;
    try {
      document = buildCoachProgramDocument(
        {
          block_id: block.id,
          block_updated_at: block.updated_at,
          name: block.name,
          goal: block.goal,
          start_date: block.start_date,
          description: typeof draft.description === "string" ? draft.description : null,
          weeks,
        },
        input.dates,
      );
    } catch (err) {
      console.error(
        "[publish-program-block] document build failed",
        err instanceof Error ? err.message : "unknown",
      );
      return json({ ok: false, error: "internal" }, 500);
    }
    const validation = validateCoachProgramDocument(document);
    if (!validation.ok) {
      // Internal bug: the reason goes to the logs, never to the body.
      console.error("[publish-program-block] document failed validation", {
        errors: validation.errors.slice(0, 10),
      });
      return json({ ok: false, error: "internal" }, 500);
    }

    // --- 8. Chain: read the current tail ----------------------------------
    const { data: tailRows, error: tailError } = await admin
      .from("program_releases")
      .select("id")
      .eq("athlete_id", block.athlete_id)
      .order("released_at", { ascending: false })
      .limit(1);
    if (tailError) {
      console.error("[publish-program-block] tail lookup failed", { code: tailError.code });
      return json({ ok: false, error: "internal" }, 500);
    }
    const tail = tailRows && tailRows.length > 0 ? tailRows[0] : null;
    const superseded = tail !== null;

    // --- 9./10. INSERT the immutable row (append-only ledger) -------------
    const safetyContext = {
      schema: 1,
      released_by_coach_id: user.id,
      source: { block_id: block.id, block_updated_at: block.updated_at },
      clinical: {
        medical_clearance_required: false,
        red_flags_blocking: false,
        yellow_not_blocking_in_coached: true,
      },
      mapping: { version: COACH_CONFIG_VERSION, dates_chosen_by_coach: true },
    };
    const { data: release, error: releaseError } = await admin
      .from("program_releases")
      .insert({
        athlete_id: block.athlete_id,
        released_by: "coach",
        coaching_mode: "coached",
        schema_version: COACH_PROGRAM_SCHEMA_VERSION,
        config_version: COACH_CONFIG_VERSION,
        program_document: document,
        safety_context: safetyContext,
        supersedes_id: tail?.id ?? null,
      })
      .select("id, released_at")
      .single();
    if (releaseError || !release) {
      // 23505 = a concurrent publish won the race. NO automatic retry: two
      // identical rows in an immutable ledger cannot be removed again.
      if (releaseError?.code === "23505") {
        return json(
          {
            ok: false,
            error: "publish_conflict",
            message: "Qualcuno ha appena consegnato: ricarica e riprova.",
          },
          409,
        );
      }
      console.error("[publish-program-block] release insert failed", {
        code: releaseError?.code,
      });
      return json({ ok: false, error: "internal" }, 500);
    }

    // --- 11. Audit trail — best-effort by mandate -------------------------
    // The immutable row already exists: an audit failure is logged loud but
    // never turns a completed release into an error (slice spec §4.1.11).
    const { error: auditError } = await admin.from("audit_log").insert({
      actor_id: user.id,
      actor_role: "coach",
      action: "coach_release",
      entity_type: "program_release",
      entity_id: release.id,
      metadata: {
        schema_version: COACH_PROGRAM_SCHEMA_VERSION,
        config_version: COACH_CONFIG_VERSION,
        superseded,
      },
    });
    if (auditError) {
      console.error("[publish-program-block] audit insert failed", { code: auditError.code });
    }

    // --- 12. Response ------------------------------------------------------
    return json(
      { ok: true, release_id: release.id, released_at: release.released_at, superseded },
      200,
    );
  } catch (err) {
    console.error(
      "[publish-program-block] unexpected error",
      err instanceof Error ? err.message : "unknown",
    );
    return json({ ok: false, error: "internal" }, 500);
  }
});
