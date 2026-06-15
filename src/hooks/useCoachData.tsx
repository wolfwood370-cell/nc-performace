import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "./useAuth";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";

interface Athlete {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  coach_id: string | null;
}

interface DailyReadiness {
  id: string;
  athlete_id: string;
  date: string;
  score: number | null;
  sleep_hours: number | null;
  sleep_quality: number | null;
  stress_level: number | null;
  has_pain: boolean | null;
  soreness_map: Record<string, unknown> | null;
  mood: number | null;
  digestion: number | null;
  created_at: string;
}

interface Injury {
  id: string;
  athlete_id: string;
  body_zone: string;
  status: string;
  injury_date: string;
}

// The `Workout.structure` and `WorkoutLog.exercises_data` columns are
// JSONB on the database side. They flow through this hook untyped — no
// consumer here parses them. Once the protocol-aware reader lands (the
// discriminated union audited as M8/B5), narrow these to the concrete
// shapes; for now `Json` is the honest type that matches the DB column.
interface Workout {
  id: string;
  athlete_id: string;
  title: string;
  scheduled_date: string | null;
  status: "pending" | "in_progress" | "completed" | "skipped";
  estimated_duration: number | null;
  structure: Json | null;
}

interface WorkoutLog {
  id: string;
  workout_id: string;
  athlete_id: string;
  completed_at: string | null;
  duration_seconds: number | null;
  rpe_global: number | null;
  exercises_data: Json | null;
}

interface AthleteIssue {
  type:
    | "no_checkin"
    | "low_readiness"
    | "pain_reported"
    | "high_stress"
    | "low_mood"
    | "digestion_issues"
    | "overreaching_risk"
    | "active_injury";
  label: string;
  severity: "critical" | "warning" | "info";
  details?: string;
}

interface ProblematicAthlete {
  id: string;
  name: string;
  avatar: string;
  avatarUrl: string | null;
  issues: AthleteIssue[];
  lastCheckinDate: string | null;
  readinessScore: number | null;
}

export function useCoachAthletes() {
  const { user, profile } = useAuth();

  return useQuery({
    queryKey: ["coach-athletes", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("coach_id", user.id)
        .eq("role", "athlete");

      if (error) throw error;
      return data as Athlete[];
    },
    enabled: !!user && profile?.role === "coach",
  });
}

function useCoachDashboardData() {
  const { user, profile } = useAuth();
  const today = new Date().toISOString().split("T")[0]; // YYYY-MM-DD format

  // Fetch athletes
  const athletesQuery = useQuery({
    queryKey: ["coach-athletes", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("coach_id", user.id)
        .eq("role", "athlete");

      if (error) throw error;
      return data as Athlete[];
    },
    enabled: !!user && profile?.role === "coach",
  });

  // Fetch latest readiness for each athlete (last 7 days to have context)
  const readinessQuery = useQuery({
    queryKey: ["coach-readiness", user?.id, athletesQuery.data?.map((a) => a.id).join(",")],
    queryFn: async () => {
      if (!user || !athletesQuery.data?.length) return [];

      const athleteIds = athletesQuery.data.map((a) => a.id);

      const { data, error } = await supabase
        .from("daily_readiness")
        .select("*")
        .in("athlete_id", athleteIds)
        .order("date", { ascending: false });

      if (error) throw error;
      return data as DailyReadiness[];
    },
    enabled: !!user && profile?.role === "coach" && !!athletesQuery.data?.length,
  });

  // Fetch recent workouts
  const workoutsQuery = useQuery({
    queryKey: ["coach-workouts", user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from("workouts")
        .select("*")
        .eq("coach_id", user.id)
        .order("scheduled_date", { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as Workout[];
    },
    enabled: !!user && profile?.role === "coach",
  });

  // Fetch recent workout logs (last 28 days for ACWR calculation)
  const twentyEightDaysAgo = new Date();
  twentyEightDaysAgo.setDate(twentyEightDaysAgo.getDate() - 28);

  const logsQuery = useQuery({
    queryKey: ["coach-workout-logs", user?.id, athletesQuery.data?.map((a) => a.id).join(",")],
    queryFn: async () => {
      if (!user || !athletesQuery.data?.length) return [];

      const athleteIds = athletesQuery.data.map((a) => a.id);

      const { data, error } = await supabase
        .from("workout_logs")
        .select("*")
        .in("athlete_id", athleteIds)
        .not("completed_at", "is", null)
        .gte("completed_at", twentyEightDaysAgo.toISOString())
        .order("completed_at", { ascending: false });

      if (error) throw error;
      return data as WorkoutLog[];
    },
    enabled: !!user && profile?.role === "coach" && !!athletesQuery.data?.length,
  });

  // Fetch active injuries (status != 'healed')
  const injuriesQuery = useQuery({
    queryKey: ["coach-injuries", user?.id, athletesQuery.data?.map((a) => a.id).join(",")],
    queryFn: async () => {
      if (!user || !athletesQuery.data?.length) return [];

      const athleteIds = athletesQuery.data.map((a) => a.id);

      const { data, error } = await supabase
        .from("injuries")
        .select("*")
        .in("athlete_id", athleteIds)
        .neq("status", "healed");

      if (error) throw error;
      return data as Injury[];
    },
    enabled: !!user && profile?.role === "coach" && !!athletesQuery.data?.length,
  });

  // Helper function to calculate ACWR for an athlete
  const calculateAthleteAcwr = (athleteId: string): number | null => {
    const athleteLogs = (logsQuery.data || []).filter(
      (log) =>
        log.athlete_id === athleteId && log.rpe_global !== null && log.duration_seconds !== null,
    );

    if (athleteLogs.length === 0) return null;

    const now = new Date();
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);

    const loadsWithDates = athleteLogs.map((log) => ({
      date: new Date(log.completed_at!),
      load: log.rpe_global! * (log.duration_seconds! / 60),
    }));

    // Acute: average daily load over last 7 days
    const acuteLoads = loadsWithDates.filter((l) => l.date >= sevenDaysAgo);
    const acuteLoad =
      acuteLoads.length > 0 ? acuteLoads.reduce((sum, l) => sum + l.load, 0) / 7 : 0;

    // Chronic: average daily load over last 28 days
    const chronicLoad = loadsWithDates.reduce((sum, l) => sum + l.load, 0) / 28;

    if (chronicLoad === 0) return null;

    return acuteLoad / chronicLoad;
  };

  // Compute problematic athletes with triage logic
  const problematicAthletes: ProblematicAthlete[] = (athletesQuery.data || [])
    .map((athlete) => {
      // Get all readiness for this athlete
      const athleteReadiness = (readinessQuery.data || []).filter(
        (r) => r.athlete_id === athlete.id,
      );

      // Get today's check-in (if exists)
      const todayCheckin = athleteReadiness.find((r) => r.date === today);

      // Get latest check-in (most recent by date)
      const latestCheckin = athleteReadiness[0] || null;

      const issues: AthleteIssue[] = [];

      // 1. Missing Check-in: No record with today's date
      if (!todayCheckin) {
        issues.push({
          type: "no_checkin",
          label: "No Check-in",
          severity: "info",
          details: latestCheckin ? `Ultimo: ${formatDate(latestCheckin.date)}` : "Mai effettuato",
        });
      }

      // Use today's check-in if available, otherwise latest
      const relevantCheckin = todayCheckin || latestCheckin;

      if (relevantCheckin) {
        // 2. Low Readiness: score < 50
        if (relevantCheckin.score !== null && relevantCheckin.score < 50) {
          issues.push({
            type: "low_readiness",
            label: "Low Readiness",
            severity: "critical",
            details: `Score: ${relevantCheckin.score}/100`,
          });
        }

        // 3. Pain Detected: has_pain is true OR soreness_map is not empty
        const hasSoreness =
          relevantCheckin.soreness_map &&
          typeof relevantCheckin.soreness_map === "object" &&
          Object.keys(relevantCheckin.soreness_map).length > 0;

        if (relevantCheckin.has_pain || hasSoreness) {
          issues.push({
            type: "pain_reported",
            label: "Dolore Segnalato",
            severity: "critical",
            details: hasSoreness
              ? `Zone: ${Object.keys(relevantCheckin.soreness_map!).join(", ")}`
              : "Dolore generico",
          });
        }

        // 4. High Stress: stress_level > 7
        if (relevantCheckin.stress_level !== null && relevantCheckin.stress_level > 7) {
          issues.push({
            type: "high_stress",
            label: "Stress Alto",
            severity: "warning",
            details: `Livello: ${relevantCheckin.stress_level}/10`,
          });
        }

        // 5. Low Mood: mood <= 4
        if (relevantCheckin.mood !== null && relevantCheckin.mood <= 4) {
          issues.push({
            type: "low_mood",
            label: "Low Mood",
            severity: "warning",
            details: `Umore: ${relevantCheckin.mood}/10`,
          });
        }

        // 6. Digestion Issues: digestion <= 4
        if (relevantCheckin.digestion !== null && relevantCheckin.digestion <= 4) {
          issues.push({
            type: "digestion_issues",
            label: "Digestion Issues",
            severity: "warning",
            details: `Digestione: ${relevantCheckin.digestion}/10`,
          });
        }
      }

      // 7. Overreaching Risk: ACWR > 1.5
      const athleteAcwr = calculateAthleteAcwr(athlete.id);
      if (athleteAcwr !== null && athleteAcwr > 1.5) {
        issues.push({
          type: "overreaching_risk",
          label: "Overreaching Risk",
          severity: "critical",
          details: `ACWR: ${athleteAcwr.toFixed(2)}`,
        });
      }

      // 8. Active Injury: has open injury record
      const athleteInjuries = (injuriesQuery.data || []).filter((i) => i.athlete_id === athlete.id);
      if (athleteInjuries.length > 0) {
        issues.push({
          type: "active_injury",
          label: "Infortunio Attivo",
          severity: "critical",
          details: athleteInjuries.map((i) => i.body_zone).join(", "),
        });
      }

      // Only include athletes with at least one issue
      if (issues.length === 0) return null;

      return {
        id: athlete.id,
        name: athlete.full_name || "Atleta",
        avatar:
          athlete.full_name
            ?.split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2) || "??",
        avatarUrl: athlete.avatar_url,
        issues,
        lastCheckinDate: latestCheckin?.date || null,
        readinessScore: relevantCheckin?.score ?? null,
      };
    })
    .filter((a): a is ProblematicAthlete => a !== null);

  // Sort by severity: critical issues first, then warning, then info
  problematicAthletes.sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    const aMaxSeverity = Math.min(...a.issues.map((i) => severityOrder[i.severity]));
    const bMaxSeverity = Math.min(...b.issues.map((i) => severityOrder[i.severity]));
    return aMaxSeverity - bMaxSeverity;
  });

  // Compute KPI metrics
  const totalAthletes = athletesQuery.data?.length || 0;

  // Compliance Rate: % of athletes who checked in today
  const athletesCheckedInToday = (athletesQuery.data || []).filter((athlete) =>
    (readinessQuery.data || []).some((r) => r.athlete_id === athlete.id && r.date === today),
  ).length;
  const complianceRate =
    totalAthletes > 0 ? Math.round((athletesCheckedInToday / totalAthletes) * 100) : 0;

  // Avg Readiness: average score of today's check-ins
  const todayReadinessScores = (readinessQuery.data || [])
    .filter((r) => r.date === today && r.score !== null)
    .map((r) => r.score!);
  const avgReadiness =
    todayReadinessScores.length > 0
      ? Math.round(todayReadinessScores.reduce((a, b) => a + b, 0) / todayReadinessScores.length)
      : null;

  // Churn Risk: athletes with critical issues
  const churnRisk = problematicAthletes.filter((a) =>
    a.issues.some((i) => i.severity === "critical"),
  ).length;

  // Build activity feed from recent data
  const activityFeed: Array<{
    id: string;
    athlete: string;
    action: string;
    highlight: string;
    time: string;
    type: "success" | "default" | "message";
    icon: "Dumbbell" | "HeartPulse" | "Camera" | "Scale" | "MessageSquare";
  }> = [
    ...(logsQuery.data?.slice(0, 5).map((log) => {
      const athlete = athletesQuery.data?.find((a) => a.id === log.athlete_id);
      const workout = workoutsQuery.data?.find((w) => w.id === log.workout_id);
      return {
        id: `log-${log.id}`,
        athlete: athlete?.full_name || "Atleta",
        action: "ha completato",
        highlight: workout?.title || "Workout",
        time: log.completed_at ? getRelativeTime(new Date(log.completed_at)) : "Recente",
        type: "success" as const,
        icon: "Dumbbell" as const,
      };
    }) || []),
    ...(readinessQuery.data?.slice(0, 5).map((readiness) => {
      const athlete = athletesQuery.data?.find((a) => a.id === readiness.athlete_id);
      return {
        id: `readiness-${readiness.id}`,
        athlete: athlete?.full_name || "Atleta",
        action: "check-in inviato",
        highlight: readiness.score !== null ? `Readiness ${readiness.score}/100` : "Check-in",
        time: getRelativeTime(new Date(readiness.created_at)),
        type: "default" as const,
        icon: "HeartPulse" as const,
      };
    }) || []),
  ]
    .sort((a, b) => {
      // Sort by recency (parse time strings for rough ordering)
      const getMinutes = (time: string) => {
        if (time === "Adesso") return 0;
        const match = time.match(/(\d+)/);
        if (!match) return 9999;
        const num = parseInt(match[1]);
        if (time.includes("min")) return num;
        if (time.includes("h")) return num * 60;
        if (time.includes("g")) return num * 60 * 24;
        return 9999;
      };
      return getMinutes(a.time) - getMinutes(b.time);
    })
    .slice(0, 10);

  return {
    athletes: athletesQuery.data || [],
    problematicAthletes,
    businessMetrics: {
      activeClients: totalAthletes,
      complianceRate,
      avgReadiness,
      churnRisk,
    },
    activityFeed,
    isLoading:
      athletesQuery.isLoading ||
      readinessQuery.isLoading ||
      logsQuery.isLoading ||
      injuriesQuery.isLoading,
    error: athletesQuery.error || readinessQuery.error || logsQuery.error || injuriesQuery.error,
  };
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (dateStr === today.toISOString().split("T")[0]) {
    return "Oggi";
  }
  if (dateStr === yesterday.toISOString().split("T")[0]) {
    return "Ieri";
  }

  const diffDays = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 7) {
    return `${diffDays} giorni fa`;
  }

  return date.toLocaleDateString("it-IT", { day: "numeric", month: "short" });
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));

  if (minutes < 1) return "Adesso";
  if (minutes < 60) return `${minutes} min`;
  if (hours < 24) return `${hours}h`;
  return `${days}g`;
}

// Convenience hook for getting just athletes list (used by Periodization)
function useCoachData() {
  const { data: athletes, isLoading, error } = useCoachAthletes();
  return {
    athletes: athletes || [],
    isLoading,
    error,
  };
}
