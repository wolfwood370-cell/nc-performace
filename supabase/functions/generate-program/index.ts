import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    // SECURITY GATE — must run before any expensive work (DB reads, OpenAI API
    // calls). Order: header → JWT → role → ownership. Each step is a hard 401/403
    // because `verify_jwt = false` at the gateway means this code is the only
    // line of defense for paid AI invocations.
    // -------------------------------------------------------------------------
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error("[generate-program] Missing Supabase env vars");
      return new Response(JSON.stringify({ error: "Configurazione server mancante" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // User-scoped client → validates the JWT and resolves auth.uid() for RPCs.
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
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
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch athlete profile.
    const { data: profile } = await supabase
      .from("profiles")
      .select("coach_id, full_name, onboarding_data, one_rm_data")
      .eq("id", athlete_id)
      .single();

    if (!profile || profile.coach_id !== user.id) {
      return new Response(JSON.stringify({ error: "Accesso negato" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athleteName = profile.full_name || "Atleta";
    const onboarding = profile.onboarding_data as Record<string, unknown> | null;
    const trainingAge = (onboarding?.training_age as string) || "sconosciuta";
    const gender = (onboarding?.gender as string) || "unknown";

    // Fetch injuries
    const { data: injuries } = await supabase
      .from("injuries")
      .select("body_zone, description, status")
      .eq("athlete_id", athlete_id)
      .eq("status", "active");

    // Parse 1RM data
    const oneRmData = profile.one_rm_data as Record<string, unknown> | null;
    let oneRmSection = "Nessun dato 1RM disponibile.";
    if (oneRmData && typeof oneRmData === "object") {
      const entries = Object.entries(oneRmData)
        .filter(
          ([_, v]) => v && typeof v === "object" && (v as Record<string, unknown>).estimated_1rm,
        )
        .map(([name, v]) => `${name}: ${(v as Record<string, unknown>).estimated_1rm} kg`)
        .join(", ");
      if (entries) oneRmSection = entries;
    }

    // If 'continue' mode, fetch last 4 weeks of workout data
    let performanceContext = "";
    if (mode === "continue") {
      const fourWeeksAgo = new Date();
      fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);

      const { data: recentLogs } = await supabase
        .from("workout_logs")
        .select(
          `
          completed_at, rpe_global, srpe, duration_minutes, status,
          workout_exercises (exercise_name, mean_velocity_ms, sets_data)
        `,
        )
        .eq("athlete_id", athlete_id)
        .eq("status", "completed")
        .gte("completed_at", fourWeeksAgo.toISOString())
        .order("completed_at", { ascending: true });

      if (recentLogs && recentLogs.length > 0) {
        let totalVolume = 0;
        let totalSessions = recentLogs.length;
        let rpeSum = 0;
        let rpeCount = 0;
        const exerciseVolumes: Record<string, number> = {};
        const exerciseVelocities: Record<string, { sum: number; count: number }> = {};

        recentLogs.forEach((log) => {
          if (log.rpe_global) {
            rpeSum += log.rpe_global;
            rpeCount++;
          }
          const exercises = log.workout_exercises as Array<{
            exercise_name: string;
            mean_velocity_ms: number | null;
            sets_data: Array<{ weight_kg?: number; reps?: number }>;
          }>;
          exercises?.forEach((ex) => {
            if (Array.isArray(ex.sets_data)) {
              ex.sets_data.forEach((s) => {
                const vol = (Number(s.weight_kg) || 0) * (Number(s.reps) || 0);
                totalVolume += vol;
                exerciseVolumes[ex.exercise_name] = (exerciseVolumes[ex.exercise_name] || 0) + vol;
              });
            }
            if (ex.mean_velocity_ms && Number(ex.mean_velocity_ms) > 0) {
              if (!exerciseVelocities[ex.exercise_name])
                exerciseVelocities[ex.exercise_name] = { sum: 0, count: 0 };
              exerciseVelocities[ex.exercise_name].sum += Number(ex.mean_velocity_ms);
              exerciseVelocities[ex.exercise_name].count++;
            }
          });
        });

        const avgRpe = rpeCount > 0 ? (rpeSum / rpeCount).toFixed(1) : "N/D";
        const topExercises = Object.entries(exerciseVolumes)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([name, vol]) => `${name}: ${Math.round(vol)} kg volume`)
          .join("; ");

        const velocityTrends = Object.entries(exerciseVelocities)
          .map(([name, d]) => `${name}: ${(d.sum / d.count).toFixed(3)} m/s media`)
          .join("; ");

        performanceContext = `
DATI ULTIME 4 SETTIMANE (modalità Progressione):
- Sessioni totali: ${totalSessions}
- Volume totale: ${Math.round(totalVolume).toLocaleString()} kg
- RPE medio: ${avgRpe}
- Top esercizi per volume: ${topExercises}
- Velocità medie VBT: ${velocityTrends || "Nessun dato VBT"}
ISTRUZIONE: Identifica alzate stagnanti dalla velocità e dal volume e suggerisci variazioni.`;
      }
    }

    const injurySection =
      injuries && injuries.length > 0
        ? `INFORTUNI ATTIVI:\n${injuries.map((i) => `- ${i.body_zone}: ${i.description || "Non specificato"}`).join("\n")}\nIMPORTANTE: Evita esercizi che stressano direttamente queste zone.`
        : "Nessun infortunio attivo.";

    const modeInstruction =
      mode === "new"
        ? "Modalità NUOVA SCHEDA: L'atleta è nuovo o riprende da zero. Concentrati su assessment, baseline, e progressione graduale. NON prescrivere test 1RM per principianti — usa RPE per auto-regolazione."
        : "Modalità PROGRESSIONE: L'atleta ha uno storico. Analizza i dati forniti, identifica punti deboli e alzate stagnanti, e proponi variazioni intelligenti per rompere i plateau.";

    const systemPrompt = `Sei un Coach di Forza & Condizionamento d'élite. Genera programmi di allenamento settimanali strutturati.

${modeInstruction}

CONTESTO ATLETA:
- Nome: ${athleteName}
- Genere: ${gender}
- Età di allenamento: ${trainingAge}
- Equipment disponibile: ${equipment || "Completo (palestra attrezzata)"}
- Obiettivo del blocco: ${focus_goal}
- Frequenza richiesta: ${days_per_week} giorni/settimana
- 1RM stimati: ${oneRmSection}
${injurySection}
${performanceContext}

REGOLE DI OUTPUT:
1. Genera ESATTAMENTE ${days_per_week} giorni di allenamento per UNA settimana.
2. I nomi degli esercizi DEVONO essere in inglese (standard internazionale: "Back Squat", "Bench Press", "Romanian Deadlift").
3. Le note DEVONO essere in italiano.
4. Usa RPE per auto-regolazione (range 6-9).
5. Il carico (load) deve essere espresso come percentuale del 1RM (es: "70%") o come RPE-based (es: "RPE 7").
6. Ogni giorno deve avere tra 4 e 8 esercizi.
7. Il rest è in secondi (60-300).
8. Bilancia i gruppi muscolari attraverso la settimana.
9. Includi sempre un warm-up funzionale come primo esercizio di ogni giorno.`;

    const userPrompt = `Genera il programma settimanale. Rispondi SOLO con la funzione tool call.`;

    const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI non configurata (OPENAI_API_KEY mancante)" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.2",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_program",
              description: "Submit the generated weekly training program",
              parameters: {
                type: "object",
                properties: {
                  days: {
                    type: "array",
                    description: "Array of training days",
                    items: {
                      type: "object",
                      properties: {
                        day_index: { type: "number", description: "Day of week 0=Mon to 6=Sun" },
                        day_name: { type: "string", description: "Italian day name" },
                        focus: {
                          type: "string",
                          description: "Day focus in Italian (es: 'Forza Lower Body')",
                        },
                        exercises: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              name: { type: "string", description: "Exercise name in English" },
                              sets: { type: "number" },
                              reps: {
                                type: "string",
                                description: "Rep scheme (e.g. '8', '8-12', '5x5')",
                              },
                              load: {
                                type: "string",
                                description: "Load prescription (e.g. '70%', 'RPE 7', 'BW')",
                              },
                              rpe: {
                                type: "number",
                                description: "Target RPE 1-10, null if not applicable",
                              },
                              rest_seconds: {
                                type: "number",
                                description: "Rest between sets in seconds",
                              },
                              notes: { type: "string", description: "Coaching notes in Italian" },
                            },
                            required: ["name", "sets", "reps", "load", "rest_seconds", "notes"],
                            additionalProperties: false,
                          },
                        },
                      },
                      required: ["day_index", "day_name", "focus", "exercises"],
                      additionalProperties: false,
                    },
                  },
                  rationale: {
                    type: "string",
                    description:
                      "Brief rationale for the program design in Italian (2-3 sentences)",
                  },
                },
                required: ["days", "rationale"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_program" } },
      }),
    });

    if (!aiResponse.ok) {
      const status = aiResponse.status;
      if (status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite richieste AI raggiunto. Riprova tra qualche minuto." }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (status === 402) {
        return new Response(JSON.stringify({ error: "Crediti AI esauriti." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("OpenAI error:", status, errText);
      return new Response(JSON.stringify({ error: "Errore gateway AI" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "AI non ha generato un programma valido" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const program = JSON.parse(toolCall.function.arguments);

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
