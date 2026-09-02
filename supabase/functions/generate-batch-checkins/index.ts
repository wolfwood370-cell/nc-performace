import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";
import { addDaysIso } from "../_shared/program/coachRelease.ts";
import {
  buildWeekReport,
  fallbackSummaryText,
  weekPaceContext,
  type WeekLogRow,
} from "../_shared/program/weekAdherence.ts";
import {
  buildCheckinPrompt,
  chooseSummary,
  countSessionsOverThreshold,
  weekReading,
} from "../_shared/program/checkinReading.ts";

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

// PostgREST's default max_rows (config.toml sets none): past this many rows
// the read would truncate SILENTLY — the guard below turns that into an error.
const RELEASES_BATCH_CAP = 1000;
const ALERTS_BATCH_CAP = 1000;

const ROME_DAY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Rome",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Civil YYYY-MM-DD in Europe/Rome of a timestamp. NOT toISOString(): that
 *  is UTC, and at 00:30 in Rome it would still say yesterday. */
function romeDayOf(timestamp: string): string {
  return ROME_DAY_FORMATTER.format(new Date(timestamp));
}

/** UTC instant of 00:00 Europe/Rome of a civil day — the completed_at query
 *  window must open and close on Rome's day boundaries, not UTC's. Rome is
 *  +01:00 or +02:00: the candidate that formats back to midnight of the
 *  same civil day is the real one. */
function utcOfRomeMidnight(dayIso: string): string {
  for (const offset of ["+01:00", "+02:00"]) {
    const candidate = new Date(`${dayIso}T00:00:00${offset}`);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(candidate);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    const civilDay = `${get("year")}-${get("month")}-${get("day")}`;
    if (civilDay === dayIso && get("hour") === "00" && get("minute") === "00") {
      return candidate.toISOString();
    }
  }
  // Unreachable for real Rome days: DST switches at 02:00/03:00, never 00:00.
  return `${dayIso}T00:00:00.000Z`;
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

    // The window runs on completed_at (Rome day boundaries expressed as UTC
    // instants): scheduled_date has no writer and is NULL on every live row
    // (measured 2026-08-28) — filtering on it returns nothing, ever.
    const weekStartUtc = utcOfRomeMidnight(weekStartStr);
    const weekEndUtcExclusive = utcOfRomeMidnight(addDaysIso(weekEndStr, 1));
    // The watchdog writes its alert in the transaction that writes srpe —
    // together with completed_at (useAthleteWorkoutHooks.ts:174-186, client
    // clock) — so an alert about a session of THIS week is never older than
    // the week itself, modulo clock skew: one day of margin absorbs it. The
    // precise match (workout_log_id among this week's completed logs) is done
    // in code per athlete, because those ids exist only after the first read.
    const alertsSinceUtc = utcOfRomeMidnight(addDaysIso(weekStartStr, -1));

    const [logsRes, nutritionRes, releasesRes, alertsRes] = await Promise.all([
      supabase
        .from("workout_logs")
        .select("id, athlete_id, completed_at, total_load_au, status, scheduled_date, srpe")
        .in("athlete_id", athleteIds)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .gte("completed_at", weekStartUtc)
        .lt("completed_at", weekEndUtcExclusive),
      supabase
        .from("nutrition_logs")
        .select("athlete_id, calories, protein, carbs, fats, date")
        .in("athlete_id", athleteIds)
        .gte("date", weekStartStr)
        .lte("date", weekEndStr),
      // ONE query for the whole batch: the adherence denominator lives in the
      // release document, the only owner of prescribed dates.
      supabase
        .from("program_releases")
        .select("athlete_id, program_document, released_at")
        .in("athlete_id", athleteIds)
        .order("released_at", { ascending: false })
        .limit(RELEASES_BATCH_CAP),
      // The watchdog's per-session judgement (coach_alerts.type = 'risk_alert',
      // migration 20260825103000): this batch COUNTS its alerts, it never
      // re-evaluates the threshold — no srpe comparison exists in this file.
      supabase
        .from("coach_alerts")
        .select("athlete_id, workout_log_id")
        .eq("type", "risk_alert")
        .in("athlete_id", athleteIds)
        .gte("created_at", alertsSinceUtc)
        .limit(ALERTS_BATCH_CAP),
    ]);

    // A failed batch read must FAIL the batch, not impersonate an absence:
    // supabase-js resolves query errors as {data: null, error} without
    // throwing, so `data || []` would write "no prescription / no sessions"
    // snapshots nothing could tell apart from the truth (review 2026-08-28).
    if (logsRes.error) throw logsRes.error;
    if (nutritionRes.error) throw nutritionRes.error;
    if (releasesRes.error) throw releasesRes.error;
    if (alertsRes.error) throw alertsRes.error;
    // Hitting the cap means rows silently vanished for SOMEONE: an athlete
    // whose releases were cut off would read as "never prescribed". Fail loud.
    if ((releasesRes.data || []).length >= RELEASES_BATCH_CAP) {
      throw new Error("program_releases oltre il cap di lettura del batch");
    }
    // Same disease at the cap: an athlete whose alerts were cut off would read
    // as "no session over threshold" — an absence fabricated by truncation.
    if ((alertsRes.data || []).length >= ALERTS_BATCH_CAP) {
      throw new Error("coach_alerts oltre il cap di lettura del batch");
    }

    const allLogs = logsRes.data || [];
    const nutritionLogs = nutritionRes.data || [];
    const riskAlerts = alertsRes.data || [];
    // Rows arrive released_at-descending: the first seen per athlete is the
    // most recent — the same "latest" the athlete door reads
    // (useProgramRelease.ts: order released_at desc, limit 1).
    const latestDocByAthlete = new Map<string, unknown>();
    for (const row of releasesRes.data || []) {
      if (!latestDocByAthlete.has(row.athlete_id)) {
        latestDocByAthlete.set(row.athlete_id, row.program_document);
      }
    }

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

            // Every number the snapshot and the model receive comes from the
            // pure module (CORE §0.11: the AI decides words, never numbers):
            // denominator = prescribed days of the latest release document,
            // numerator/volume/effort = completed sessions by Rome civil day.
            const logRows: WeekLogRow[] = athleteLogs.map((l) => ({
              status: l.status,
              completedDate: l.completed_at ? romeDayOf(l.completed_at) : null,
              scheduledDate: l.scheduled_date ?? null,
              totalLoadAu: l.total_load_au ?? null,
              srpe: l.srpe ?? null,
            }));
            const report = buildWeekReport({
              document: latestDocByAthlete.get(athlete.id) ?? null,
              fromIso: weekStartStr,
              toIso: weekEndStr,
              todayIso: todayStr,
              logs: logRows,
            });
            // Sessions the watchdog flagged, DISTINCT by workout_log_id and
            // restricted to this week's completed logs (the same rows the
            // report counted): a count of events read, always present.
            const overThreshold = countSessionsOverThreshold(
              riskAlerts.filter((a) => a.athlete_id === athlete.id),
              athleteLogs.map((l) => l.id),
            );
            const reading = weekReading(report, overThreshold);

            const avgCalories =
              athleteNutrition.length > 0
                ? Math.round(
                    athleteNutrition.reduce((sum, n) => sum + (n.calories || 0), 0) /
                      athleteNutrition.length,
                  )
                : null;

            // compliance_pct / workouts_scheduled / total_volume are ABSENT
            // keys (never 0, never null) when there is nothing to measure:
            // the module never sets them, JSON carries no key, the inbox
            // renders "—" and isAnomalous stays silent.
            const metricsSnapshot = {
              ...report.snapshot,
              sessions_over_threshold: overThreshold,
              avg_daily_calories: avgCalories,
            };

            // The reading first, then the data, then the rules the model must
            // obey (no invented ratios, no load actions): checkinReading.ts.
            const prompt = buildCheckinPrompt(reading, report, {
              athleteName: athlete.full_name || "l'atleta",
              dayName,
              timeStr,
              weekStartIso: weekStartStr,
              weekEndIso: weekEndStr,
              avgCalories,
              paceContext: weekPaceContext({
                prescribedCount: report.adherence.prescribedCount,
                remainingCount: report.remainingCount,
                weekClosed: isSundayOrMonday,
              }),
            });

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
              const content = aiData.choices?.[0]?.message?.content;
              // What gets saved is decided in ONE place (chooseSummary): the
              // vet is deterministic and refuses ANY ratio, fraction or
              // percentage not in the data, and any load-action word; an
              // EMPTY answer (or a non-string one) takes the same road. A
              // refusal costs the deterministic line; a fabricated number
              // («4 sedute su 5», 2026-08-30) or a void would cost the
              // coach's trust.
              const chosen = chooseSummary(typeof content === "string" ? content : "", report);
              if (chosen.reason !== null) {
                console.warn(
                  `[vetSummary] atleta ${athlete.id}: riepilogo IA scartato — ${chosen.reason}`,
                );
              }
              aiSummary = chosen.text;
            } else {
              console.error("AI error:", aiResponse.status, await aiResponse.text());
              // Same absence rule as the prompt: no fabricated 0% here either.
              aiSummary = fallbackSummaryText(report);
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
