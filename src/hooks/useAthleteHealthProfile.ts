import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
// Note: FMS test rows have ~20 dynamic columns (`*_l`, `*_r`, single-side).
// We dynamically index them via a `Record` cast below — typed via supabase
// generated types where applicable.

// FMS test configuration
const FMS_TEST_CONFIG = {
  deep_squat: { name: "Deep Squat", bodyArea: "Lower Body" },
  hurdle_step: { name: "Hurdle Step", bodyArea: "Hip/Knee", bilateral: true },
  inline_lunge: { name: "Inline Lunge", bodyArea: "Hip Stability", bilateral: true },
  shoulder_mobility: { name: "Shoulder Mobility", bodyArea: "Shoulder", bilateral: true },
  active_straight_leg: { name: "Active Straight Leg", bodyArea: "Hamstring/Hip", bilateral: true },
  trunk_stability: { name: "Trunk Stability", bodyArea: "Core" },
  rotary_stability: { name: "Rotary Stability", bodyArea: "Core Rotation", bilateral: true },
} as const;

type FmsTestKey = keyof typeof FMS_TEST_CONFIG;

export interface FmsScore {
  testKey: FmsTestKey;
  testName: string;
  bodyArea: string;
  leftScore: number | null;
  rightScore: number | null;
  score: number | null; // For bilateral tests
  minScore: number;
  status: "optimal" | "limited" | "dysfunctional" | "pain";
}

export interface ActiveInjury {
  id: string;
  bodyZone: string;
  description: string | null;
  status: string;
  injuryDate: string;
}

export interface RecentPainReport {
  date: string;
  hasPain: boolean;
  sorenessMap: Record<string, number>;
}

export type HealthStatus = "green" | "yellow" | "red";

export interface HealthSummary {
  status: HealthStatus;
  title: string;
  description: string;
  details: string[];
}

export interface AthleteHealthProfile {
  athleteId: string;
  athleteName: string;
  // FMS Data
  fmsTestDate: string | null;
  fmsScores: FmsScore[];
  fmsTotalScore: number;
  fmsMaxScore: number;
  hasFmsRedFlags: boolean;
  // Injury Data
  activeInjuries: ActiveInjury[];
  // Pain Reports
  recentPainReports: RecentPainReport[];
  hasRecentPain: boolean;
  // Overall Summary
  summary: HealthSummary;
}

function getScoreStatus(score: number): FmsScore["status"] {
  if (score === 0) return "pain";
  if (score === 1) return "dysfunctional";
  if (score === 2) return "limited";
  return "optimal";
}

function getStatusLabel(status: FmsScore["status"]): string {
  switch (status) {
    case "pain":
      return "Dolore";
    case "dysfunctional":
      return "Disfunzionale";
    case "limited":
      return "Limitato";
    case "optimal":
      return "Ottimale";
  }
}

/**
 * Clinical Guard Hook - Fetches comprehensive health data for an athlete
 * Includes FMS tests, injuries, and recent pain reports from daily_readiness
 */
export function useAthleteHealthProfile(athleteId: string | null) {
  return useQuery({
    queryKey: ["athlete-health-profile", athleteId],
    queryFn: async (): Promise<AthleteHealthProfile | null> => {
      if (!athleteId) return null;

      // Parallel fetch all health data
      const [fmsResult, injuriesResult, readinessResult, profileResult] = await Promise.all([
        // Latest FMS test
        supabase
          .from("fms_tests")
          .select("*")
          .eq("athlete_id", athleteId)
          .order("test_date", { ascending: false })
          .limit(1)
          .maybeSingle(),

        // Active injuries (not healed)
        supabase
          .from("injuries")
          .select("*")
          .eq("athlete_id", athleteId)
          .neq("status", "healed")
          .order("injury_date", { ascending: false }),

        // Recent readiness with pain (last 7 days)
        supabase
          .from("daily_readiness")
          .select("date, has_pain, soreness_map")
          .eq("athlete_id", athleteId)
          .gte("date", format(subDays(new Date(), 7), "yyyy-MM-dd"))
          .order("date", { ascending: false }),

        // Athlete profile
        supabase.from("profiles").select("full_name").eq("id", athleteId).maybeSingle(),
      ]);

      if (fmsResult.error) throw fmsResult.error;
      if (injuriesResult.error) throw injuriesResult.error;
      if (readinessResult.error) throw readinessResult.error;

      const athleteName = profileResult.data?.full_name || "Atleta";
      const fmsData = fmsResult.data;
      const injuries = injuriesResult.data || [];
      const readinessData = readinessResult.data || [];

      // Process FMS scores
      const fmsScores: FmsScore[] = [];
      let fmsTotalScore = 0;

      if (fmsData) {
        // Process each test
        for (const [key, config] of Object.entries(FMS_TEST_CONFIG)) {
          const testKey = key as FmsTestKey;

          if ("bilateral" in config && config.bilateral) {
            // Bilateral test — read both sides via typed dynamic key access
            // fmsData has named columns (no index signature) but we read it
            // dynamically via `${testKey}_l/r`. Double cast through `unknown`
            // is the only way TS allows the narrowing — code smell stays.
            const fms = fmsData as unknown as Record<string, number | null | undefined>;
            const leftScore = (fms[`${testKey}_l`] ?? null) as number | null;
            const rightScore = (fms[`${testKey}_r`] ?? null) as number | null;
            const minScore =
              leftScore !== null && rightScore !== null
                ? Math.min(leftScore, rightScore)
                : (leftScore ?? rightScore ?? 0);

            fmsTotalScore += minScore;

            fmsScores.push({
              testKey,
              testName: config.name,
              bodyArea: config.bodyArea,
              leftScore,
              rightScore,
              score: null,
              minScore,
              status: getScoreStatus(minScore),
            });
          } else {
            // Unilateral test
            // fmsData has named columns (no index signature) but we read it
            // dynamically via `${testKey}_l/r`. Double cast through `unknown`
            // is the only way TS allows the narrowing — code smell stays.
            const fms = fmsData as unknown as Record<string, number | null | undefined>;
            const score = (fms[testKey] ?? null) as number | null;
            const scoreValue = score ?? 0;
            fmsTotalScore += scoreValue;

            fmsScores.push({
              testKey,
              testName: config.name,
              bodyArea: config.bodyArea,
              leftScore: null,
              rightScore: null,
              score,
              minScore: scoreValue,
              status: getScoreStatus(scoreValue),
            });
          }
        }
      }

      // Check for FMS red flags (score <= 1)
      const hasFmsRedFlags = fmsScores.some(
        (s) => s.status === "pain" || s.status === "dysfunctional",
      );

      // Process active injuries
      const activeInjuries: ActiveInjury[] = injuries.map((injury) => ({
        id: injury.id,
        bodyZone: injury.body_zone,
        description: injury.description,
        status: injury.status,
        injuryDate: injury.injury_date,
      }));

      // Process recent pain reports
      const recentPainReports: RecentPainReport[] = readinessData.map((r) => ({
        date: r.date,
        hasPain: r.has_pain || false,
        sorenessMap: (r.soreness_map as Record<string, number>) || {},
      }));

      const hasRecentPain = recentPainReports.some((r) => r.hasPain);

      // Generate summary
      const summary = generateHealthSummary({
        fmsScores,
        hasFmsRedFlags,
        activeInjuries,
        hasRecentPain,
        recentPainReports,
        fmsTestDate: fmsData?.test_date || null,
      });

      return {
        athleteId,
        athleteName,
        fmsTestDate: fmsData?.test_date || null,
        fmsScores,
        fmsTotalScore,
        fmsMaxScore: 21,
        hasFmsRedFlags,
        activeInjuries,
        recentPainReports,
        hasRecentPain,
        summary,
      };
    },
    enabled: !!athleteId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

function generateHealthSummary({
  fmsScores,
  hasFmsRedFlags,
  activeInjuries,
  hasRecentPain,
  recentPainReports,
  fmsTestDate,
}: {
  fmsScores: FmsScore[];
  hasFmsRedFlags: boolean;
  activeInjuries: ActiveInjury[];
  hasRecentPain: boolean;
  recentPainReports: RecentPainReport[];
  fmsTestDate: string | null;
}): HealthSummary {
  const details: string[] = [];

  // Determine status
  let status: HealthStatus = "green";

  // Check for active injuries - highest priority
  const criticalInjuries = activeInjuries.filter((i) => i.status === "in_rehab");
  if (criticalInjuries.length > 0) {
    status = "red";
    criticalInjuries.forEach((injury) => {
      details.push(
        `INFORTUNIO ATTIVO: ${injury.bodyZone}${injury.description ? ` - ${injury.description}` : ""}`,
      );
    });
  }

  // Check for recent pain
  if (hasRecentPain) {
    const painDays = recentPainReports.filter((r) => r.hasPain);
    if (painDays.length > 0) {
      if (status !== "red") status = "red";
      details.push(`Dolore riportato negli ultimi ${painDays.length} giorni`);
    }
  }

  // Check FMS red flags
  const painTests = fmsScores.filter((s) => s.status === "pain");
  const dysfunctionalTests = fmsScores.filter((s) => s.status === "dysfunctional");
  const limitedTests = fmsScores.filter((s) => s.status === "limited");

  if (painTests.length > 0) {
    if (status !== "red") status = "red";
    painTests.forEach((test) => {
      details.push(`FMS Dolore: ${test.testName} (${test.bodyArea})`);
    });
  }

  if (dysfunctionalTests.length > 0) {
    if (status === "green") status = "yellow";
    dysfunctionalTests.forEach((test) => {
      const sideInfo =
        test.leftScore !== null && test.rightScore !== null
          ? `[Sx: ${test.leftScore}, Dx: ${test.rightScore}]`
          : "";
      details.push(`FMS Disfunzionale: ${test.testName}${sideInfo}`);
    });
  }

  if (limitedTests.length > 0 && status === "green") {
    status = "yellow";
    limitedTests.forEach((test) => {
      details.push(`ℹ FMS Limitato: ${test.testName} (Score: ${test.minScore}/3)`);
    });
  }

  // Watchlist injuries
  const watchlistInjuries = activeInjuries.filter(
    (i) => i.status === "monitoring" || i.status === "recovered",
  );
  if (watchlistInjuries.length > 0 && status === "green") {
    status = "yellow";
    watchlistInjuries.forEach((injury) => {
      details.push(`In osservazione: ${injury.bodyZone}`);
    });
  }

  // Generate title and description based on status
  let title: string;
  let description: string;

  switch (status) {
    case "red":
      title = "ATTENZIONE RICHIESTA";
      description = "Limitazioni attive che richiedono adattamenti al programma";
      break;
    case "yellow":
      title = "Watchlist Attiva";
      description = "Alcune aree richiedono attenzione durante la programmazione";
      break;
    case "green":
      title = "Nessuna Restrizione";
      if (!fmsTestDate) {
        description = "Nessun test FMS registrato. Considera di eseguire una valutazione.";
        details.push("ℹ Test FMS non ancora eseguito");
      } else {
        description = "FMS completato - Nessun infortunio recente";
      }
      break;
  }

  return { status, title, description, details };
}

export { getStatusLabel };
