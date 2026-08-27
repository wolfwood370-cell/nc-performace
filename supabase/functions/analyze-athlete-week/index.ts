import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
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
    const { athlete_id } = await req.json();
    if (!athlete_id) {
      return new Response(JSON.stringify({ error: "athlete_id richiesto" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, secretKey());

    const userClient = createClient(supabaseUrl, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
    } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Non autenticato" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch athlete profile with gender
    const { data: athleteProfile } = await supabase
      .from("profiles")
      .select("coach_id, full_name, onboarding_data")
      .eq("id", athlete_id)
      .single();

    if (!athleteProfile || athleteProfile.coach_id !== user.id) {
      return new Response(JSON.stringify({ error: "Accesso negato" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const athleteName = athleteProfile.full_name || "Atleta";
    // Extract gender from onboarding_data or default to unknown
    const onboardingData = athleteProfile.onboarding_data as Record<string, unknown> | null;
    const athleteGender = (onboardingData?.gender as string) || "unknown";

    // Date range
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekStart = weekAgo.toISOString().split("T")[0];
    const today = now.toISOString().split("T")[0];

    // Fetch data in parallel
    const [workoutResult, cycleResult, readinessResult] = await Promise.all([
      supabase
        .from("workout_logs")
        .select(
          `
          id, completed_at, srpe, status,
          workout_exercises (
            exercise_name, mean_velocity_ms, peak_velocity_ms, rom_cm, calc_power_watts, sets_data
          )
        `,
        )
        .eq("athlete_id", athlete_id)
        .gte("completed_at", weekAgo.toISOString())
        .order("completed_at", { ascending: true }),

      athleteGender === "female"
        ? supabase
            .from("daily_cycle_logs")
            .select("date, current_phase, symptom_tags, notes")
            .eq("athlete_id", athlete_id)
            .gte("date", weekStart)
            .lte("date", today)
            .order("date", { ascending: true })
        : Promise.resolve({ data: null }),

      supabase
        .from("daily_readiness")
        .select("date, score, sleep_quality, energy, mood, stress_level, sleep_hours, body_weight")
        .eq("athlete_id", athlete_id)
        .gte("date", weekStart)
        .lte("date", today)
        .order("date", { ascending: true }),
    ]);

    const workoutLogs = workoutResult.data;
    const cycleLogs = cycleResult.data;
    const readinessData = readinessResult.data;

    // Aggregate workout data
    const completedWorkouts = (workoutLogs || []).filter((w) => w.status === "completed");
    const totalSessions = completedWorkouts.length;

    let totalVelocityPoints = 0;
    let sumVelocity = 0;
    let totalVolume = 0;
    const exerciseSummaries: Record<
      string,
      { count: number; avgVelocity: number; velocitySum: number }
    > = {};

    completedWorkouts.forEach((log) => {
      const exercises = log.workout_exercises as Array<{
        exercise_name: string;
        mean_velocity_ms: number | null;
        sets_data: Array<{ weight_kg?: number; reps?: number }>;
      }>;

      exercises?.forEach((ex) => {
        if (Array.isArray(ex.sets_data)) {
          ex.sets_data.forEach((s) => {
            totalVolume += (Number(s.weight_kg) || 0) * (Number(s.reps) || 0);
          });
        }
        if (ex.mean_velocity_ms && Number(ex.mean_velocity_ms) > 0) {
          const v = Number(ex.mean_velocity_ms);
          sumVelocity += v;
          totalVelocityPoints++;
          if (!exerciseSummaries[ex.exercise_name]) {
            exerciseSummaries[ex.exercise_name] = { count: 0, avgVelocity: 0, velocitySum: 0 };
          }
          exerciseSummaries[ex.exercise_name].count++;
          exerciseSummaries[ex.exercise_name].velocitySum += v;
        }
      });
    });

    Object.keys(exerciseSummaries).forEach((k) => {
      const s = exerciseSummaries[k];
      s.avgVelocity = Math.round((s.velocitySum / s.count) * 1000) / 1000;
    });

    const avgVelocity =
      totalVelocityPoints > 0
        ? Math.round((sumVelocity / totalVelocityPoints) * 1000) / 1000
        : null;
    // A missing RPE is an absence, not a 0: it must leave numerator AND
    // denominator, or the weekly mean silently drops. Zero valid values →
    // null, rendered as "N/D" by the template below.
    // Reads srpe — the session column the athlete writes since B-22;
    // rpe_global is legacy and no longer written.
    const rpeValues = completedWorkouts.map((w) => w.srpe).filter((r): r is number => r != null);
    const avgRpe =
      rpeValues.length > 0
        ? Math.round((rpeValues.reduce((s, r) => s + r, 0) / rpeValues.length) * 10) / 10
        : null;

    const vbtDetail = Object.entries(exerciseSummaries)
      .map(([name, s]) => `${name}: ${s.avgVelocity} m/s media (${s.count} set)`)
      .join("; ");

    // Readiness summary
    const avgReadiness =
      readinessData && readinessData.length > 0
        ? Math.round(readinessData.reduce((s, r) => s + (r.score || 0), 0) / readinessData.length)
        : null;
    const avgSleep =
      readinessData && readinessData.length > 0
        ? Math.round(
            (readinessData.reduce((s, r) => s + (r.sleep_hours || 0), 0) / readinessData.length) *
              10,
          ) / 10
        : null;

    // Cycle data (only for female)
    let cycleSection = "";
    if (athleteGender === "female" && cycleLogs && cycleLogs.length > 0) {
      const cyclePhases = cycleLogs.map((c) => c.current_phase);
      const predominantPhase = cyclePhases
        .sort(
          (a, b) =>
            cyclePhases.filter((v) => v === a).length - cyclePhases.filter((v) => v === b).length,
        )
        .pop();
      const symptoms = cycleLogs.flatMap((c) => c.symptom_tags || []);
      cycleSection = `
CICLO MESTRUALE:
- Fase predominante: ${predominantPhase ?? "Non tracciato"}
- Sintomi riportati: ${symptoms.length > 0 ? symptoms.join(", ") : "Nessuno"}`;
    }

    // Build data context
    const dataContext = `
DATI SETTIMANA (${weekStart} → ${today}) per ${athleteName}:
Genere atleta: ${athleteGender}

ALLENAMENTO:
- Sessioni completate: ${totalSessions}
- Volume totale: ${Math.round(totalVolume).toLocaleString()} kg
- RPE medio sessione: ${avgRpe ?? "N/D"}

VBT (Velocity Based Training):
- Velocità media concentrica globale: ${avgVelocity ?? "Nessun dato VBT"} m/s
- Dettaglio per esercizio: ${vbtDetail || "Nessun dato VBT registrato"}

READINESS:
- Score medio: ${avgReadiness ?? "N/D"}/100
- Sonno medio: ${avgSleep ?? "N/D"} ore
${cycleSection}
`.trim();

    // Gender guardrail
    const genderGuardrail =
      athleteGender === "male"
        ? `REGOLA CRITICA: L'atleta è MASCHIO. NON menzionare MAI ciclo mestruale, fasi ormonali, ormoni femminili, o sintomi legati al ciclo. Parole PROIBITE: Luteal, Follicolare, Mestruale, Ovulatoria, Ciclo mestruale, Periodo. La sezione "Stato Fisiologico" deve analizzare SOLO sonno, stress, energia e recupero.`
        : `L'atleta è FEMMINA. Nella sezione "Stato Fisiologico & Readiness" puoi includere l'analisi della fase del ciclo mestruale se i dati sono disponibili.`;

    const systemPrompt = `Sei un Direttore delle Prestazioni d'élite (Sports Scientist) per un servizio di coaching high-ticket.
Analizzi i dati settimanali degli atleti e produci report strutturati, scientifici e azionabili.

${genderGuardrail}

REGOLE:
1. Rispondi ESCLUSIVAMENTE in italiano professionale/scientifico.
2. Sii diretto e assertivo nel tono — questo è un report per un coach professionista.
3. NON usare emoji nel corpo del testo.
4. NON generare una lista di azioni separate. Integra le raccomandazioni nella Strategia Operativa.
5. Il report DEVE seguire ESATTAMENTE questa struttura Markdown:

### 📉 Diagnosi del Carico & VBT
(Analizza volume, intensità, e trend di velocità. Correla VBT con RPE e carico.)

### 🧬 Stato Fisiologico & Readiness
(Analizza sonno, stress, recupero. Se femmina e dati disponibili, correla con fase del ciclo.)

### 🎯 Strategia Operativa
(Un paragrafo narrativo con le raccomandazioni strategiche concrete per la prossima settimana. Es: "Mantenere l'intensità ma ridurre il volume del 20%...")`;

    const userPrompt = `Analizza questi dati e genera il report strutturato.
Assegna anche un punteggio sentiment da 0.0 (critico) a 1.0 (eccellente).

${dataContext}`;

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
        model: "gpt-5.4-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "submit_analysis",
              description: "Submit the weekly athlete analysis report",
              parameters: {
                type: "object",
                properties: {
                  insight_text: {
                    type: "string",
                    description:
                      "Full markdown report with 3 sections: Diagnosi del Carico & VBT, Stato Fisiologico & Readiness, Strategia Operativa",
                  },
                  sentiment_score: {
                    type: "number",
                    description: "Score from 0.0 (critical) to 1.0 (excellent)",
                  },
                },
                required: ["insight_text", "sentiment_score"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "submit_analysis" } },
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
        return new Response(
          JSON.stringify({ error: "Crediti AI esauriti. Contatta il supporto." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
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
    let analysis: { insight_text: string; sentiment_score: number };

    if (toolCall?.function?.arguments) {
      analysis = JSON.parse(toolCall.function.arguments);
    } else {
      const content = aiData.choices?.[0]?.message?.content || "";
      analysis = {
        insight_text:
          content || "Analisi non disponibile. Dati insufficienti per questa settimana.",
        sentiment_score: 0.5,
      };
    }

    analysis.sentiment_score = Math.max(0, Math.min(1, analysis.sentiment_score));

    // Save — action_items defaults to empty array in DB
    const { data: inserted, error: insertError } = await supabase
      .from("athlete_ai_insights")
      .insert({
        athlete_id,
        coach_id: user.id,
        week_start_date: weekStart,
        insight_text: analysis.insight_text,
        action_items: [],
        sentiment_score: analysis.sentiment_score,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(JSON.stringify({ error: "Errore salvataggio analisi" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(inserted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-athlete-week error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Errore sconosciuto" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
