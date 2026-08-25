import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";
import { format } from "date-fns";

// ===== TYPE DEFINITIONS =====

type AlertSeverity = "critical" | "warning" | "info";
// "high_acwr" is gone (C-09): the load ratio is a descriptive lens owned by
// src/lib/math/acwr.ts, not a triage verdict — and this hook's old local
// computation invented RPE 5 × 30 min for missing data. The dashboard no
// longer computes or shows the load ratio at all; its surfaces are the
// roster and the athlete detail.
type AlertType = "missed_workout" | "low_readiness" | "active_injury" | "rpe_spike" | "no_checkin";

export interface UrgentAlert {
  id: string;
  athleteId: string;
  athleteName: string;
  avatarUrl: string | null;
  avatarInitials: string;
  alertType: AlertType;
  severity: AlertSeverity;
  value: string;
  details: string;
  timestamp?: string;
}

interface FeedbackItem {
  id: string;
  workoutLogId: string;
  workoutTitle: string;
  athleteId: string;
  athleteName: string;
  avatarUrl: string | null;
  avatarInitials: string;
  completedAt: string;
  hasVideo: boolean;
  hasNotes: boolean;
  /** Session rating from `workout_logs.srpe` (CR-10). Null = not declared
   *  — the consumer renders no pill, never a fallback number. */
  sessionRpe: number | null;
}

interface TodayScheduleItem {
  id: string;
  title: string;
  athleteId: string;
  athleteName: string;
  avatarInitials: string;
  scheduledDate: string;
  status: string;
}

interface BusinessMetrics {
  activeClients: number;
  monthlyRecurringRevenue: number; // Mocked for now
  complianceRate: number; // % of athletes who checked in today
  avgReadiness: number | null;
  churnRisk: number; // Athletes with critical issues
}

interface HealthyAthlete {
  id: string;
  name: string;
  avatarUrl: string | null;
  avatarInitials: string;
  readinessScore: number | null;
}

export interface CoachDashboardMetrics {
  urgentAlerts: UrgentAlert[];
  feedbackItems: FeedbackItem[];
  todaySchedule: TodayScheduleItem[];
  businessMetrics: BusinessMetrics;
  healthyAthletes: HealthyAthlete[];
  /** Workout logs completed TODAY — the only measured "done today".
   *  The review queue (feedbackItems) is a different quantity. */
  completedTodayCount: number;
  /** Full pending-review count BEFORE the 10-row display cap of
   *  feedbackItems: a counted claim must not silently saturate. */
  pendingReviewCount: number;
  isLoading: boolean;
  error: Error | null;
}

// ===== HELPER FUNCTIONS =====

function getInitials(name: string | null): string {
  return (
    name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "??"
  );
}

// ===== MAIN HOOK =====

export function useCoachDashboardMetrics(): CoachDashboardMetrics {
  const { user, profile } = useAuth();
  const today = format(new Date(), "yyyy-MM-dd");
  const isCoach = profile?.role === "coach";

  // ===== QUERY 1: Athletes =====
  const {
    data: athletes = [],
    isLoading: athletesLoading,
    error: athletesError,
  } = useQuery({
    queryKey: ["dashboard-athletes", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("coach_id", user.id)
        .eq("role", "athlete");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && isCoach,
  });

  const athleteIds = useMemo(() => athletes.map((a) => a.id), [athletes]);

  // ===== QUERY 2: Daily Readiness (today + recent) =====
  const {
    data: readinessData = [],
    isLoading: readinessLoading,
    error: readinessError,
  } = useQuery({
    queryKey: ["dashboard-readiness", athleteIds.join(",")],
    queryFn: async () => {
      if (athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("daily_readiness")
        .select("athlete_id, date, score")
        .in("athlete_id", athleteIds)
        .order("date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
    enabled: athleteIds.length > 0,
  });

  // ===== QUERY 3: Active Injuries =====
  const {
    data: injuries = [],
    isLoading: injuriesLoading,
    error: injuriesError,
  } = useQuery({
    queryKey: ["dashboard-injuries", athleteIds.join(",")],
    queryFn: async () => {
      if (athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("injuries")
        .select("id, athlete_id, body_zone, description, status")
        .in("athlete_id", athleteIds)
        .in("status", ["active", "in_rehab"]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: athleteIds.length > 0,
  });

  // ===== QUERY 4: Workout Logs (28 days for ACWR + RPE analysis) =====
  const twentyEightDaysAgo = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 28);
    return d.toISOString();
  }, []);

  const {
    data: workoutLogs = [],
    isLoading: logsLoading,
    error: logsError,
  } = useQuery({
    queryKey: ["dashboard-workout-logs", athleteIds.join(",")],
    queryFn: async () => {
      if (athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workout_logs")
        .select(
          "id, athlete_id, workout_id, completed_at, duration_seconds, srpe, notes, coach_feedback, status, scheduled_date",
        )
        .in("athlete_id", athleteIds)
        .gte("created_at", twentyEightDaysAgo);
      if (error) throw error;
      return data ?? [];
    },
    enabled: athleteIds.length > 0,
  });

  // ===== QUERY 5: Workouts (for titles + missed detection) =====
  const {
    data: workouts = [],
    isLoading: workoutsLoading,
    error: workoutsError,
  } = useQuery({
    queryKey: ["dashboard-workouts", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("workouts")
        .select("id, title, athlete_id, scheduled_date, status")
        .eq("coach_id", user.id)
        .gte("scheduled_date", format(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"))
        .lte("scheduled_date", today);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user && isCoach,
  });

  // ===== COMPUTED: Urgent Alerts =====
  const urgentAlerts = useMemo<UrgentAlert[]>(() => {
    const alerts: UrgentAlert[] = [];

    athletes.forEach((athlete) => {
      const initials = getInitials(athlete.full_name);
      const athleteLogs = workoutLogs.filter((l) => l.athlete_id === athlete.id);
      const latestReadiness = readinessData.find((r) => r.athlete_id === athlete.id);

      // RULE 1: Missed Workout
      // If today > scheduled_date AND status != 'completed'
      const athleteWorkouts = workouts.filter((w) => w.athlete_id === athlete.id);
      athleteWorkouts.forEach((workout) => {
        if (
          workout.scheduled_date &&
          workout.scheduled_date < today &&
          workout.status !== "completed"
        ) {
          // Check if there's a completed log for this workout
          const hasCompletedLog = workoutLogs.some(
            (log) => log.workout_id === workout.id && log.status === "completed",
          );
          if (!hasCompletedLog) {
            alerts.push({
              id: `missed-${workout.id}`,
              athleteId: athlete.id,
              athleteName: athlete.full_name ?? "Atleta",
              avatarUrl: athlete.avatar_url,
              avatarInitials: initials,
              alertType: "missed_workout",
              severity: "warning",
              value: "Missed",
              details: `${workout.title} was scheduled for ${workout.scheduled_date}`,
              timestamp: workout.scheduled_date,
            });
          }
        }
      });

      // RULE 2: RPE Spike — on the SESSION rating in ITS column (srpe,
      // CR-10 of Foster). The old read of rpe_global judged a number whose
      // scale was not the one it believed (B-22). No value → no alert:
      // absence never becomes a number.
      const recentHighRpeLogs = athleteLogs.filter(
        (log) => log.srpe !== null && log.srpe > 9 && log.completed_at,
      );
      recentHighRpeLogs.slice(0, 1).forEach((log) => {
        alerts.push({
          id: `rpe-spike-${log.id}`,
          athleteId: athlete.id,
          athleteName: athlete.full_name ?? "Atleta",
          avatarUrl: athlete.avatar_url,
          avatarInitials: initials,
          alertType: "rpe_spike",
          severity: "warning",
          value: `RPE ${log.srpe}`,
          details: "High intensity session - check recovery status",
          timestamp: log.completed_at ?? undefined,
        });
      });

      // RULE 3: Low Readiness (< 45)
      if (latestReadiness && latestReadiness.score !== null && latestReadiness.score < 45) {
        alerts.push({
          id: `readiness-${athlete.id}`,
          athleteId: athlete.id,
          athleteName: athlete.full_name ?? "Atleta",
          avatarUrl: athlete.avatar_url,
          avatarInitials: initials,
          alertType: "low_readiness",
          severity: latestReadiness.score < 30 ? "critical" : "warning",
          value: `${latestReadiness.score}%`,
          details: `Readiness critically low (${latestReadiness.date})`,
          timestamp: latestReadiness.date,
        });
      }

      // RULE 4: No Check-in Today
      const todayCheckin = readinessData.find(
        (r) => r.athlete_id === athlete.id && r.date === today,
      );
      if (!todayCheckin) {
        const lastCheckin = readinessData.find((r) => r.athlete_id === athlete.id);
        alerts.push({
          id: `no-checkin-${athlete.id}`,
          athleteId: athlete.id,
          athleteName: athlete.full_name ?? "Atleta",
          avatarUrl: athlete.avatar_url,
          avatarInitials: initials,
          alertType: "no_checkin",
          severity: "info",
          value: "No Check-in",
          details: lastCheckin ? `Last: ${lastCheckin.date}` : "Never checked in",
        });
      }

      // The old RULE 5 ("High ACWR", severity critical/warning) is gone
      // (C-09): it fabricated load (RPE 5 × 30 min defaults), applied its
      // own thresholds, fed churnRisk with a verdict the method rejects —
      // and its fetched rows (created_at bound, uncompleted included)
      // could not match the roster's universe anyway. The load lens lives
      // on the roster and the athlete detail, through the acwr module.

      // RULE 6: Active Injuries
      const athleteInjuries = injuries.filter((i) => i.athlete_id === athlete.id);
      athleteInjuries.forEach((injury) => {
        alerts.push({
          id: `injury-${injury.id}`,
          athleteId: athlete.id,
          athleteName: athlete.full_name ?? "Atleta",
          avatarUrl: athlete.avatar_url,
          avatarInitials: initials,
          alertType: "active_injury",
          severity: injury.status === "active" ? "critical" : "warning",
          value: injury.body_zone,
          details: injury.description ?? `${injury.status} injury`,
        });
      });
    });

    // Sort: critical first, then warning, then info
    return alerts.sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.severity] - order[b.severity];
    });
  }, [athletes, readinessData, injuries, workoutLogs, workouts, today]);

  // ===== COMPUTED: Pending review (completed, no coach feedback) =====
  // Two different quantities, deliberately: the COUNT is every unreviewed
  // completed log in the fetched 28-day window (a counted claim must not
  // shrink to the feed's priority filter), while the FEED below keeps its
  // notes-or-last-24h priority filter and its 10-row display cap.
  const pendingReviewCount = useMemo(
    () => workoutLogs.filter((log) => log.completed_at && !log.coach_feedback).length,
    [workoutLogs],
  );

  const pendingReviewLogs = useMemo(() => {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    return workoutLogs.filter((log) => {
      if (!log.completed_at) return false;
      if (log.coach_feedback) return false; // Already reviewed
      // Prioritize those with notes or completed in last 24h
      return log.completed_at >= twentyFourHoursAgo || log.notes;
    });
  }, [workoutLogs]);

  // ===== COMPUTED: Workouts completed today (workout_logs.completed_at) =====
  // LOCAL date on both sides: `today` is local, so the timestamp converts
  // through Date (a session closed at 00:30 local is today's, not
  // yesterday's UTC day).
  const completedTodayCount = useMemo(
    () =>
      workoutLogs.filter(
        (log) => log.completed_at && format(new Date(log.completed_at), "yyyy-MM-dd") === today,
      ).length,
    [workoutLogs, today],
  );

  // ===== COMPUTED: Feedback Items (display feed, capped at 10) =====
  const feedbackItems = useMemo<FeedbackItem[]>(() => {
    return pendingReviewLogs
      .map((log) => {
        const athlete = athletes.find((a) => a.id === log.athlete_id);
        const workout = workouts.find((w) => w.id === log.workout_id);
        return {
          id: `feedback-${log.id}`,
          workoutLogId: log.id,
          workoutTitle: workout?.title ?? "Workout",
          athleteId: log.athlete_id,
          athleteName: athlete?.full_name ?? "Atleta",
          avatarUrl: athlete?.avatar_url ?? null,
          avatarInitials: getInitials(athlete?.full_name ?? null),
          completedAt: log.completed_at!,
          hasVideo: false, // workout_logs doesn't have video_url currently
          hasNotes: !!log.notes,
          sessionRpe: log.srpe,
        };
      })
      .slice(0, 10);
  }, [pendingReviewLogs, athletes, workouts]);

  // ===== COMPUTED: Today's Schedule =====
  const todaySchedule = useMemo<TodayScheduleItem[]>(() => {
    return workouts
      .filter((w) => w.scheduled_date === today && w.status === "pending")
      .map((w) => {
        const athlete = athletes.find((a) => a.id === w.athlete_id);
        return {
          id: w.id,
          title: w.title,
          athleteId: w.athlete_id,
          athleteName: athlete?.full_name ?? "Atleta",
          avatarInitials: getInitials(athlete?.full_name ?? null),
          scheduledDate: w.scheduled_date!,
          status: w.status,
        };
      });
  }, [workouts, athletes, today]);

  // ===== COMPUTED: Business Metrics =====
  const businessMetrics = useMemo<BusinessMetrics>(() => {
    const activeClients = athletes.length;

    // Mocked MRR calculation (e.g., €50 per client)
    const monthlyRecurringRevenue = activeClients * 50;

    // Compliance: % who checked in today
    const checkedInToday = athletes.filter((a) =>
      readinessData.some((r) => r.athlete_id === a.id && r.date === today),
    ).length;
    const complianceRate =
      activeClients > 0 ? Math.round((checkedInToday / activeClients) * 100) : 0;

    // Avg readiness of today's check-ins
    const todayScores = readinessData
      .filter((r) => r.date === today && r.score !== null)
      .map((r) => r.score!);
    const avgReadiness =
      todayScores.length > 0
        ? Math.round(todayScores.reduce((a, b) => a + b, 0) / todayScores.length)
        : null;

    // Churn risk: athletes with critical alerts
    const criticalAthleteIds = new Set(
      urgentAlerts.filter((a) => a.severity === "critical").map((a) => a.athleteId),
    );
    const churnRisk = criticalAthleteIds.size;

    return {
      activeClients,
      monthlyRecurringRevenue,
      complianceRate,
      avgReadiness,
      churnRisk,
    };
  }, [athletes, readinessData, urgentAlerts, today]);

  // ===== COMPUTED: Healthy Athletes (no critical/warning alerts) =====
  const healthyAthletes = useMemo<HealthyAthlete[]>(() => {
    const alertedIds = new Set(
      urgentAlerts
        .filter((a) => a.severity === "critical" || a.severity === "warning")
        .map((a) => a.athleteId),
    );

    return athletes
      .filter((a) => !alertedIds.has(a.id))
      .map((a) => {
        const latestReadiness = readinessData.find((r) => r.athlete_id === a.id);
        return {
          id: a.id,
          name: a.full_name ?? "Atleta",
          avatarUrl: a.avatar_url,
          avatarInitials: getInitials(a.full_name),
          readinessScore: latestReadiness?.score ?? null,
        };
      });
  }, [athletes, urgentAlerts, readinessData]);

  // ===== COMBINED STATE =====
  const isLoading =
    athletesLoading || readinessLoading || injuriesLoading || logsLoading || workoutsLoading;
  const error = athletesError || readinessError || injuriesError || logsError || workoutsError;

  return {
    urgentAlerts,
    feedbackItems,
    todaySchedule,
    businessMetrics,
    healthyAthletes,
    completedTodayCount,
    pendingReviewCount,
    isLoading,
    error: error as Error | null,
  };
}
