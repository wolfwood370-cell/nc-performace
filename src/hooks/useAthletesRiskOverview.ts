import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { getArchivedAt, isArchived } from "@/types/profile";
import { useAuth } from "./useAuth";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";

export type RiskLevel = "high" | "moderate" | "low" | "optimal";
type RiskType = "high_injury_risk" | "detraining_risk" | "low_recovery" | "overload_warning";

export interface RiskFlag {
  type: RiskType;
  label: string;
  level: RiskLevel;
  value: string;
  details?: string;
}

export interface AthleteRiskData {
  athleteId: string;
  athleteName: string;
  avatarUrl: string | null;
  avatarInitials: string;
  acwr: number | null;
  acuteLoad: number;
  chronicLoad: number;
  riskLevel: RiskLevel;
  riskFlags: RiskFlag[];
  primaryFlag: RiskFlag | null;
  latestReadiness: number | null;
  readinessDate: string | null;
  dailyLoadHistory: number[];
  /** Single archived criterion (settings.archived === true, via isArchived).
   *  Consumers decide what to do with it: CoachAthletes filters the roster,
   *  NewChatDialog deliberately keeps archived athletes reachable. */
  archived: boolean;
  /** ISO timestamp of archiving, when present. */
  archivedAt: string | null;
}

interface WorkoutLogRaw {
  id: string;
  athlete_id: string;
  completed_at: string | null;
  duration_seconds: number | null;
  rpe_global: number | null;
  srpe: number | null;
}

interface DailyMetricRaw {
  id: string;
  user_id: string;
  date: string;
  subjective_readiness: number | null;
}

interface DailyReadinessRaw {
  id: string;
  athlete_id: string;
  date: string;
  score: number | null;
}

interface AthleteProfile {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  settings: Json | null;
}

function calculateDailyLoads(logs: WorkoutLogRaw[], days: number): number[] {
  const now = new Date();
  const dailyLoads: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const targetDate = new Date(now);
    targetDate.setDate(now.getDate() - i);
    const dateStr = targetDate.toISOString().split("T")[0];
    const dayLoad = logs
      .filter((log) => log.completed_at && log.completed_at.split("T")[0] === dateStr)
      .reduce((sum, log) => {
        const rpe = log.srpe ?? log.rpe_global ?? 0;
        const durationMinutes = (log.duration_seconds ?? 0) / 60;
        return sum + rpe * durationMinutes;
      }, 0);
    dailyLoads.push(Math.round(dayLoad));
  }
  return dailyLoads;
}

function calculateAcwr(dailyLoads: number[]): {
  acwr: number | null;
  acuteLoad: number;
  chronicLoad: number;
} {
  if (dailyLoads.length < 28) return { acwr: null, acuteLoad: 0, chronicLoad: 0 };
  const acuteDays = dailyLoads.slice(-7);
  const acuteLoad = acuteDays.reduce((a, b) => a + b, 0) / 7;
  const chronicLoad = dailyLoads.reduce((a, b) => a + b, 0) / 28;
  if (chronicLoad === 0) return { acwr: null, acuteLoad, chronicLoad };
  return {
    acwr: Math.round((acuteLoad / chronicLoad) * 100) / 100,
    acuteLoad: Math.round(acuteLoad),
    chronicLoad: Math.round(chronicLoad),
  };
}

function assessRisks(
  acwr: number | null,
  readiness: number | null,
): { riskLevel: RiskLevel; riskFlags: RiskFlag[] } {
  const flags: RiskFlag[] = [];
  if (acwr !== null) {
    if (acwr > 1.5)
      flags.push({
        type: "high_injury_risk",
        label: "High Injury Risk",
        level: "high",
        value: `ACWR ${acwr.toFixed(2)}`,
        details: "Acute workload significantly exceeds chronic capacity",
      });
    else if (acwr > 1.3)
      flags.push({
        type: "overload_warning",
        label: "Overload Warning",
        level: "moderate",
        value: `ACWR ${acwr.toFixed(2)}`,
        details: "Approaching injury risk zone",
      });
    else if (acwr < 0.8)
      flags.push({
        type: "detraining_risk",
        label: "Detraining Risk",
        level: "moderate",
        value: `ACWR ${acwr.toFixed(2)}`,
        details: "Training load may be insufficient",
      });
  }
  if (readiness !== null && readiness < 40) {
    flags.push({
      type: "low_recovery",
      label: "Low Recovery",
      level: "high",
      value: `Readiness ${readiness}/100`,
      details: "Athlete reports poor recovery status",
    });
  }
  let riskLevel: RiskLevel = "optimal";
  if (flags.some((f) => f.level === "high")) riskLevel = "high";
  else if (flags.some((f) => f.level === "moderate")) riskLevel = "moderate";
  else if (acwr !== null && acwr >= 0.8 && acwr <= 1.3) riskLevel = "optimal";
  else if (acwr === null && readiness === null) riskLevel = "low";
  return { riskLevel, riskFlags: flags };
}

export function useAthletesRiskOverview() {
  const { user, profile } = useAuth();
  const now = new Date();
  const twentyEightDaysAgo = new Date(now);
  twentyEightDaysAgo.setDate(now.getDate() - 28);

  const athletesQuery = useQuery({
    queryKey: ["risk-overview-athletes", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, settings")
        .eq("coach_id", user.id)
        .eq("role", "athlete");
      if (error) throw error;
      return data as AthleteProfile[];
    },
    enabled: !!user && profile?.role === "coach",
  });

  const athleteIds = athletesQuery.data?.map((a) => a.id) ?? [];

  const logsQuery = useQuery({
    queryKey: ["risk-overview-logs", user?.id, athleteIds.join(",")],
    queryFn: async () => {
      if (!user || athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("workout_logs")
        .select("id, athlete_id, completed_at, duration_seconds, rpe_global, srpe")
        .in("athlete_id", athleteIds)
        .not("completed_at", "is", null)
        .gte("completed_at", twentyEightDaysAgo.toISOString())
        .order("completed_at", { ascending: true });
      if (error) throw error;
      return data as WorkoutLogRaw[];
    },
    enabled: !!user && profile?.role === "coach" && athleteIds.length > 0,
  });

  const metricsQuery = useQuery({
    queryKey: ["risk-overview-metrics", user?.id, athleteIds.join(",")],
    queryFn: async () => {
      if (!user || athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("daily_metrics")
        .select("id, user_id, date, subjective_readiness")
        .in("user_id", athleteIds)
        .gte("date", twentyEightDaysAgo.toISOString().split("T")[0])
        .order("date", { ascending: false });
      if (error) throw error;
      return data as DailyMetricRaw[];
    },
    enabled: !!user && profile?.role === "coach" && athleteIds.length > 0,
  });

  const readinessQuery = useQuery({
    queryKey: ["risk-overview-readiness", user?.id, athleteIds.join(",")],
    queryFn: async () => {
      if (!user || athleteIds.length === 0) return [];
      const { data, error } = await supabase
        .from("daily_readiness")
        .select("id, athlete_id, date, score")
        .in("athlete_id", athleteIds)
        .gte("date", twentyEightDaysAgo.toISOString().split("T")[0])
        .order("date", { ascending: false });
      if (error) throw error;
      return data as DailyReadinessRaw[];
    },
    enabled: !!user && profile?.role === "coach" && athleteIds.length > 0,
  });

  const athleteRiskData: AthleteRiskData[] = (athletesQuery.data ?? []).map((athlete) => {
    const athleteLogs = (logsQuery.data ?? []).filter((log) => log.athlete_id === athlete.id);
    const dailyLoadHistory = calculateDailyLoads(athleteLogs, 28);
    const { acwr, acuteLoad, chronicLoad } = calculateAcwr(dailyLoadHistory);
    const latestMetric = (metricsQuery.data ?? []).find((m) => m.user_id === athlete.id);
    const latestReadinessRecord = (readinessQuery.data ?? []).find(
      (r) => r.athlete_id === athlete.id,
    );
    const latestReadiness =
      latestMetric?.subjective_readiness ?? latestReadinessRecord?.score ?? null;
    const readinessDate = latestMetric?.date ?? latestReadinessRecord?.date ?? null;
    const { riskLevel, riskFlags } = assessRisks(acwr, latestReadiness);
    const avatarInitials =
      athlete.full_name
        ?.split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) ?? "??";
    return {
      athleteId: athlete.id,
      athleteName: athlete.full_name ?? "Atleta",
      avatarUrl: athlete.avatar_url,
      avatarInitials,
      acwr,
      acuteLoad,
      chronicLoad,
      riskLevel,
      riskFlags,
      primaryFlag: riskFlags[0] ?? null,
      latestReadiness,
      readinessDate,
      dailyLoadHistory,
      archived: isArchived(athlete.settings),
      archivedAt: getArchivedAt(athlete.settings),
    };
  });

  const sortedAthletes = [...athleteRiskData].sort((a, b) => {
    const riskOrder: Record<RiskLevel, number> = { high: 0, moderate: 1, low: 2, optimal: 3 };
    return riskOrder[a.riskLevel] - riskOrder[b.riskLevel];
  });

  const needsAttention = sortedAthletes.filter(
    (a) => a.riskLevel === "high" || a.riskLevel === "moderate",
  );
  const healthyAthletes = sortedAthletes.filter(
    (a) => a.riskLevel === "optimal" || a.riskLevel === "low",
  );

  return {
    allAthletes: sortedAthletes,
    needsAttention,
    healthyAthletes,
    isLoading:
      athletesQuery.isLoading ||
      logsQuery.isLoading ||
      metricsQuery.isLoading ||
      readinessQuery.isLoading,
    error: athletesQuery.error || logsQuery.error || metricsQuery.error || readinessQuery.error,
  };
}
