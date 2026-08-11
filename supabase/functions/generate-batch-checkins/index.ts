import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const DAYS_IT = ["Domenica", "Lunedì", "Martedì", "Mercoledì", "Giovedì", "Venerdì", "Sabato"];

/**
 * Calculate week boundaries in Europe/Rome timezone to avoid UTC midnight edge cases.
 * Returns Monday 00:00 → Sunday 23:59 in local time, formatted as YYYY-MM-DD.
 */
function getItalianWeekBounds() {
  // Create a date string in Europe/Rome timezone
  const now = new Date();
  const romeFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Rome",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const romeDateStr = romeFormatter.format(now); // YYYY-MM-DD
  const romeDate = new Date(romeDateStr + "T12:00:00"); // noon to avoid DST issues

  const romeDay = romeDate.getDay(); // 0=Sun
  const mondayOffset = romeDay === 0 ? -6 : 1 - romeDay;
  const weekStart = new Date(romeDate);
  weekStart.setDate(romeDate.getDate() + mondayOffset);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const fmt = (d: Date) => d.toISOString().split("T")[0];

  // Get localized day name and time
  const timeFormatter = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const dayFormatter = new Intl.DateTimeFormat("it-IT", {
    timeZone: "Europe/Rome",
    weekday: "long",
  });

  return {
    weekStartStr: fmt(weekStart),
    weekEndStr: fmt(weekEnd),
    todayStr: romeDateStr,
    dayName: dayFormatter.format(now),
    timeStr: timeFormatter.format(now),
    localDay: romeDay, // 0=Sun, 6=Sat
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing auth" }), {
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
      error: authError,
    } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const coachId = user.id;

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", coachId)
      .single();

    if (profile?.role !== "coach") {
      return new Response(JSON.stringify({ error: "Not a coach" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: athletes } = await supabase
      .from("profiles")
      .select("id, full_name")
      .eq("coach_id", coachId)
      .eq("role", "athlete");

    if (!athletes?.length) {
      return new Response(JSON.stringify({ message: "No athletes found", count: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use Italian timezone for week boundaries
    const { weekStartStr, weekEndStr, todayStr, dayName, timeStr, localDay } =
      getItalianWeekBounds();

    const athleteIds = athletes.map((a) => a.id);

    const [logsRes, nutritionRes] = await Promise.all([
      supabase
        .from("workout_logs")
        .select(
          "athlete_id, completed_at, rpe_global, duration_minutes, total_load_au, status, scheduled_date, srpe",
        )
        .in("athlete_id", athleteIds)
        .gte("scheduled_date", weekStartStr)
        .lte("scheduled_date", weekEndStr),
      supabase
        .from("nutrition_logs")
        .select("athlete_id, calories, protein, carbs, fats, date")
        .in("athlete_id", athleteIds)
        .gte("date", weekStartStr)
        .lte("date", weekEndStr),
    ]);

    const allLogs = logsRes.data || [];
    const nutritionLogs = nutritionRes.data || [];

    const openaiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openaiKey) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const CONCURRENCY = 3;
    const results: { athlete_id: string; status: string }[] = [];

    // Determine if we should summarize full week or ongoing
    const isSundayOrMonday = localDay === 0 || localDay === 1;

    for (let i = 0; i < athletes.length; i += CONCURRENCY) {
      const batch = athletes.slice(i, i + CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (athlete) => {
          try {
            const athleteLogs = allLogs.filter((l) => l.athlete_id === athlete.id);
            const athleteNutrition = nutritionLogs.filter((n) => n.athlete_id === athlete.id);

            const completed = athleteLogs.filter((l) => l.status === "completed");
            const missed = athleteLogs.filter(
              (l) =>
                l.status === "missed" ||
                (l.status === "scheduled" && l.scheduled_date && l.scheduled_date < todayStr),
            );
            const remaining = athleteLogs.filter(
              (l) => l.status === "scheduled" && l.scheduled_date && l.scheduled_date >= todayStr,
            );

            const completedCount = completed.length;
            const missedCount = missed.length;
            const remainingCount = remaining.length;
            const totalScheduled = completedCount + missedCount + remainingCount;
            const compliance =
              totalScheduled > 0 ? Math.round((completedCount / totalScheduled) * 100) : 0;

            const totalVolume = completed.reduce((sum, l) => sum + (l.total_load_au || 0), 0);
            // A missing RPE is an absence, not a 0: it must leave numerator
            // AND denominator, or the weekly mean silently drops. Zero valid
            // values → the existing "N/A" sentinel (already guarded by the
            // FE before Number()).
            const rpeValues = completed
              .map((l) => l.rpe_global)
              .filter((r): r is number => r != null);
            const avgRpe =
              rpeValues.length > 0
                ? (rpeValues.reduce((sum, r) => sum + r, 0) / rpeValues.length).toFixed(1)
                : "N/A";

            const avgCalories =
              athleteNutrition.length > 0
                ? Math.round(
                    athleteNutrition.reduce((sum, n) => sum + (n.calories || 0), 0) /
                      athleteNutrition.length,
                  )
                : null;

            const metricsSnapshot = {
              compliance_pct: compliance,
              total_volume: totalVolume,
              workouts_completed: completedCount,
              workouts_missed: missedCount,
              workouts_remaining: remainingCount,
              workouts_scheduled: totalScheduled,
              avg_rpe: avgRpe,
              avg_daily_calories: avgCalories,
            };

            // Time-aware context for the AI
            let weekDoneContext: string;
            if (isSundayOrMonday && remainingCount === 0) {
              weekDoneContext =
                "La settimana di allenamento è conclusa. Fornisci un riepilogo completo della settimana appena terminata.";
            } else if (remainingCount === 0) {
              weekDoneContext =
                "Tutti gli allenamenti programmati sono stati completati o saltati. Fornisci un riepilogo.";
            } else {
              weekDoneContext = `Ci sono ancora ${remainingCount} allenament${remainingCount === 1 ? "o" : "i"} in programma. Motiva l'atleta a dare il massimo nelle sessioni rimanenti.`;
            }

            const prompt = `Sei un coach sportivo italiano esperto. Analizza la settimana corrente per ${athlete.full_name || "l'atleta"}.

Contesto temporale: Oggi è ${dayName}, ore ${timeStr} (fuso orario: Europe/Rome). Settimana dal ${weekStartStr} al ${weekEndStr}.

NOTA IMPORTANTE: I dati sono basati sul fuso orario italiano (Europe/Rome). Se l'ultimo allenamento è stato fatto oggi o nelle ultime 24 ore, considera la settimana ancora in corso per l'atleta. Se oggi è domenica o lunedì, fai un riepilogo della settimana COMPLETA appena trascorsa.

Dati settimana:
- Allenamenti completati: ${completedCount}
- Allenamenti saltati: ${missedCount}
- Allenamenti ancora in programma: ${remainingCount}
- Compliance attuale: ${compliance}% (${completedCount}/${totalScheduled})
- Volume totale: ${totalVolume} UA
- RPE medio: ${avgRpe}
- Calorie medie giornaliere: ${avgCalories ? avgCalories + " kcal" : "Non registrate"}

${weekDoneContext}

Scrivi un breve report (max 280 caratteri) in italiano. Sii tecnico ma incoraggiante. Non usare emoji.`;

            const aiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${openaiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-5.4-nano",
                messages: [{ role: "user", content: prompt }],
                max_completion_tokens: 200,
              }),
            });

            let aiSummary = "";
            if (aiResponse.ok) {
              const aiData = await aiResponse.json();
              aiSummary = aiData.choices?.[0]?.message?.content?.trim() || "";
            } else {
              console.error("AI error:", aiResponse.status, await aiResponse.text());
              aiSummary = `Compliance: ${compliance}%. Completati: ${completedCount}/${totalScheduled}. Volume: ${totalVolume} UA. RPE medio: ${avgRpe}.`;
            }

            const { error: upsertError } = await supabase.from("weekly_checkins").upsert(
              {
                coach_id: coachId,
                athlete_id: athlete.id,
                week_start: weekStartStr,
                status: "pending",
                ai_summary: aiSummary,
                metrics_snapshot: metricsSnapshot,
              },
              { onConflict: "coach_id,athlete_id,week_start" },
            );

            if (upsertError) throw upsertError;

            return { athlete_id: athlete.id, status: "ok" };
          } catch (err) {
            console.error(`Error processing athlete ${athlete.id}:`, err);
            return { athlete_id: athlete.id, status: "error" };
          }
        }),
      );

      results.push(...batchResults);
    }

    const successCount = results.filter((r) => r.status === "ok").length;

    return new Response(
      JSON.stringify({
        message: `Analyzed ${successCount}/${athletes.length} athletes`,
        count: successCount,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Batch checkins error:", error);
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
