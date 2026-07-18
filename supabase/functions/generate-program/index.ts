import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  assembleWeek,
  buildExcludedZones,
  NO_CANDIDATES_ERROR,
  safetyGate,
} from "../_shared/method/assembleWeek.ts";
import type { CandidateRow } from "../_shared/method/assembleWeek.ts";
import { hasGeneralBlock } from "../_shared/method/zoneMap.ts";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // -------------------------------------------------------------------------
    // SECURITY GATE — must run before any expensive work (DB reads, program
    // assembly). Order: header → JWT → role → ownership. The gateway already
    // rejects callers without a valid JWT (verify_jwt = true — see
    // supabase/config.toml [functions.generate-program]); these in-function
    // checks are defense in depth (safe if the flag is ever toggled off) and
    // give us user.id for role/ownership enforcement and logging.
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    if (!supabaseUrl) {
      console.error("[generate-program] Missing Supabase env vars");
      return new Response(JSON.stringify({ error: "Configurazione server mancante" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client → validates the JWT and resolves auth.uid() for RPCs.
    const userClient = createClient(supabaseUrl, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: userData, error: authError } = await userClient.auth.getUser();
    const user = userData?.user;
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strict role gate: caller MUST be a coach. We read role via the
    // user-scoped client so RLS still applies (defense in depth — if the
    // caller could somehow read their own profile but not be a coach,
    // this still rejects them).
    const { data: callerProfile, error: callerProfileError } = await userClient
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (callerProfileError || !callerProfile) {
      console.error("[generate-program] Caller profile lookup failed", callerProfileError);
      return new Response(
        JSON.stringify({ error: "Impossibile verificare il ruolo del chiamante" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (callerProfile.role !== "coach") {
      return new Response(JSON.stringify({ error: "Solo i coach possono generare programmi" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Now safe to parse the body.
    let body: {
      athlete_id?: unknown;
      focus_goal?: unknown;
      days_per_week?: unknown;
      equipment?: unknown;
      mode?: unknown;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "JSON non valido" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athlete_id = typeof body.athlete_id === "string" ? body.athlete_id : null;
    const focus_goal = typeof body.focus_goal === "string" ? body.focus_goal : null;
    const days_per_week = typeof body.days_per_week === "number" ? body.days_per_week : null;
    const equipment = typeof body.equipment === "string" ? body.equipment : null;
    const mode = body.mode === "new" || body.mode === "continue" ? body.mode : null;

    if (!athlete_id || !focus_goal || !days_per_week || !mode) {
      return new Response(JSON.stringify({ error: "Parametri mancanti" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ownership gate: confirm the target athlete is in the caller's roster
    // via the SECURITY DEFINER helper (avoids RLS recursion and is the same
    // function used by every other coach RLS policy).
    const { data: ownsAthlete, error: ownsError } = await userClient.rpc("is_coach_of_athlete", {
      p_athlete_id: athlete_id,
    });

    if (ownsError) {
      console.error("[generate-program] is_coach_of_athlete failed", ownsError);
      return new Response(
        JSON.stringify({ error: "Impossibile verificare la relazione coach-atleta" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (ownsAthlete !== true) {
      return new Response(JSON.stringify({ error: "Accesso negato: atleta non in roster" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Service client for the data fetches that follow. Authorization has now
    // been fully established above — service-role reads from here on are
    // intentional (we need fields like onboarding_data that the caller's RLS
    // already permits via the coach relationship).
    const supabase = createClient(supabaseUrl, secretKey());

    // Fetch athlete profile — i campi letti dal motore deterministico (S0/S1/S3).
    const { data: profile } = await supabase
      .from("profiles")
      .select(
        "coach_id, onboarding_data, one_rm_data, neurotype, experience_level, fms_exclusion_zones, red_flags, medical_clearance_required",
      )
      .eq("id", athlete_id)
      .single();

    if (!profile || profile.coach_id !== user.id) {
      return new Response(JSON.stringify({ error: "Accesso negato" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // S0 — Gate di sicurezza del metodo: la sicurezza chiude PRIMA dell'obiettivo.
    // Clearance medica richiesta o red flags presenti -> nessuna generazione.
    const gate = safetyGate({
      medicalClearanceRequired: profile.medical_clearance_required === true,
      redFlags: profile.red_flags,
    });
    if (gate.blocked) {
      // 200 con { error, gate } e NESSUN campo days (deciso con Nick): l'hook FE
      // fa `if (data.error) throw` -> toast col motivo esatto, onSuccess non
      // parte, la settimana del builder NON viene sostituita. `gate: true`
      // resta nel body per una futura UI dedicata.
      return new Response(JSON.stringify({ error: gate.reason, gate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Infortuni IN CORSO. Stati validi del CHECK: in_rehab | recovered | chronic
    // ('recovered' non esclude). NB: lo stub filtrava status='active', che non
    // esiste nello schema — bug corretto qui.
    const { data: injuries } = await supabase
      .from("injuries")
      .select("body_zone, status")
      .eq("athlete_id", athlete_id)
      .in("status", ["in_rehab", "chronic"]);

    // Zone escluse (S0): unione fms_exclusion_zones + zone degli infortuni in
    // corso, risolte con tier per stato (in_rehab/fms = aggressivo, chronic = moderato).
    const excludedZones = buildExcludedZones(
      (profile.fms_exclusion_zones as string[] | null) ?? null,
      (injuries ?? [])
        .map((i: { body_zone: unknown; status: unknown }) => ({
          zone: String(i.body_zone ?? ""),
          status: String(i.status ?? ""),
        }))
        .filter((i) => i.zone),
    );

    // Zona 'general' (esclusione FMS grossolana): rimando come il gate clearance.
    // 200 error-shaped (come safetyGate) -> il FE non sostituisce la settimana.
    if (hasGeneralBlock(excludedZones)) {
      return new Response(
        JSON.stringify({
          error:
            "Atleta con esclusione 'general': rimando allo specialista prima della generazione",
          gate: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Libreria esercizi del coach: i candidati per la selezione (S4).
    // NB: il fetch workout_logs dello stub e' stato rimosso — nutriva solo il
    // prompt LLM; tornera' col loop RTS (autoregolazione a settimane).
    const { data: exerciseRows, error: exercisesError } = await supabase
      .from("exercises")
      .select(
        "id, os_id, name, exercise_family, movement_pattern, patterns, equipment, execution_mode, suited_rep_range, fatigue_cost, technical_complexity, laterality, stability_demand, body_position, lift_phase, muscles, secondary_muscles, attributes",
      )
      .eq("coach_id", user.id)
      .eq("archived", false)
      .order("id", { ascending: true });

    if (exercisesError) {
      console.error("[generate-program] exercises fetch failed", exercisesError);
      return new Response(JSON.stringify({ error: "Impossibile leggere la libreria esercizi" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const onboarding = profile.onboarding_data as Record<string, unknown> | null;

    // Forma B deterministica del metodo (5 strati) — modulo puro, niente AI.
    const program = assembleWeek({
      focusGoal: focus_goal,
      daysPerWeek: days_per_week,
      equipmentRaw: equipment,
      mode,
      experienceLevel: (profile.experience_level as string | null) ?? null,
      trainingAge:
        typeof onboarding?.training_age === "string" ? (onboarding.training_age as string) : null,
      neurotype: (profile.neurotype as string | null) ?? null,
      excludedZones,
      oneRmData: (profile.one_rm_data as Record<string, unknown> | null) ?? null,
      candidates: (exerciseRows ?? []) as unknown as CandidateRow[],
    });

    // Guard di vitalità: settimana completamente vuota (libreria vuota o tutto
    // escluso dai filtri) -> stessa risposta error-shaped del gate, così il FE
    // non sostituisce mai la settimana del builder con il nulla.
    if (program.days.every((d) => d.exercises.length === 0)) {
      return new Response(JSON.stringify({ error: NO_CANDIDATES_ERROR, gate: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(program), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("generate-program error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
