import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subDays, format } from "date-fns";

interface MetabolicDataPoint {
  date: string;
  dateFormatted: string;
  bodyWeight: number | null;
  caloriesLogged: number | null;
  caloriesTarget: number;
}

interface StrengthDataPoint {
  date: string;
  dateFormatted: string;
  estimated1RM: number;
  exerciseName: string;
}

interface VolumeIntensityDataPoint {
  date: string;
  dateFormatted: string;
  totalTonnage: number;
  /** Mean of the per-set RPEs; falls back to the SESSION rating (`srpe`,
   *  its own scale, declared by the athlete) when no set carries one.
   *  `null` = nobody declared anything — the chart shows a gap, never a
   *  fabricated number (the old `rpe_global ?? 7` invented a 7). */
  avgRpe: number | null;
}

interface SetData {
  set_number?: number;
  reps?: number;
  weight_kg?: number;
  rpe?: number;
  completed?: boolean;
}

export function useAthleteMetabolicData(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-metabolic", athleteId],
    queryFn: async () => {
      if (!athleteId) return [];

      const thirtyDaysAgo = subDays(new Date(), 30);
      const today = new Date();

      // Fetch body weight from daily_readiness
      const { data: readinessData, error: readinessError } = await supabase
        .from("daily_readiness")
        .select("date, body_weight")
        .eq("athlete_id", athleteId)
        .gte("date", format(thirtyDaysAgo, "yyyy-MM-dd"))
        .lte("date", format(today, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      if (readinessError) throw readinessError;

      // Fetch calories from nutrition_logs (summed by day)
      const { data: nutritionData, error: nutritionError } = await supabase
        .from("nutrition_logs")
        .select("date, calories")
        .eq("athlete_id", athleteId)
        .gte("date", format(thirtyDaysAgo, "yyyy-MM-dd"))
        .lte("date", format(today, "yyyy-MM-dd"))
        .order("date", { ascending: true });

      if (nutritionError) throw nutritionError;

      // Fetch active nutrition plan for target
      const { data: planData } = await supabase
        .from("nutrition_plans")
        .select("daily_calories")
        .eq("athlete_id", athleteId)
        .eq("active", true)
        .single();

      const caloriesTarget = planData?.daily_calories ?? 2500;

      // Aggregate nutrition by day
      const nutritionByDate: Record<string, number> = {};
      nutritionData?.forEach((log) => {
        if (!nutritionByDate[log.date]) {
          nutritionByDate[log.date] = 0;
        }
        nutritionByDate[log.date] += log.calories ?? 0;
      });

      // Build weight map
      const weightByDate: Record<string, number> = {};
      readinessData?.forEach((r) => {
        if (r.body_weight !== null) {
          weightByDate[r.date] = Number(r.body_weight);
        }
      });

      // Create data points for last 30 days
      const dataPoints: MetabolicDataPoint[] = [];
      for (let i = 30; i >= 0; i--) {
        const date = subDays(today, i);
        const dateStr = format(date, "yyyy-MM-dd");
        dataPoints.push({
          date: dateStr,
          dateFormatted: format(date, "dd/MM"),
          bodyWeight: weightByDate[dateStr] ?? null,
          caloriesLogged: nutritionByDate[dateStr] ?? null,
          caloriesTarget,
        });
      }

      return dataPoints;
    },
    enabled: !!athleteId,
  });
}

export function useAthleteStrengthProgression(
  athleteId: string | undefined,
  exerciseName: string = "Back Squat",
) {
  return useQuery({
    queryKey: ["athlete-strength", athleteId, exerciseName],
    queryFn: async () => {
      if (!athleteId) return [];

      // Fetch workout logs with exercises
      const { data: logs, error: logsError } = await supabase
        .from("workout_logs")
        .select(
          `
          id,
          completed_at,
          workout_exercises (
            exercise_name,
            sets_data
          )
        `,
        )
        .eq("athlete_id", athleteId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: true });

      if (logsError) throw logsError;

      const dataPoints: StrengthDataPoint[] = [];

      logs?.forEach((log) => {
        if (!log.completed_at || !log.workout_exercises) return;

        const exercises = log.workout_exercises as Array<{
          exercise_name: string;
          sets_data: SetData[];
        }>;

        const matchingExercise = exercises.find((e) =>
          e.exercise_name.toLowerCase().includes(exerciseName.toLowerCase()),
        );

        if (matchingExercise && matchingExercise.sets_data) {
          const sets = matchingExercise.sets_data;
          if (Array.isArray(sets) && sets.length > 0) {
            // Find the best set (highest estimated 1RM)
            let best1RM = 0;
            sets.forEach((set) => {
              const weight = Number(set.weight_kg) || 0;
              const reps = Number(set.reps) || 0;
              if (weight > 0 && reps > 0) {
                // Epley formula: 1RM = weight * (1 + 0.0333 * reps)
                const estimated1RM = weight * (1 + 0.0333 * reps);
                if (estimated1RM > best1RM) {
                  best1RM = estimated1RM;
                }
              }
            });

            if (best1RM > 0) {
              const date = new Date(log.completed_at);
              dataPoints.push({
                date: log.completed_at,
                dateFormatted: format(date, "dd/MM"),
                estimated1RM: Math.round(best1RM * 10) / 10,
                exerciseName: matchingExercise.exercise_name,
              });
            }
          }
        }
      });

      return dataPoints;
    },
    enabled: !!athleteId && !!exerciseName,
  });
}

export function useAthleteVolumeIntensity(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-volume-intensity", athleteId],
    queryFn: async () => {
      if (!athleteId) return [];

      const { data: logs, error: logsError } = await supabase
        .from("workout_logs")
        .select(
          `
          id,
          completed_at,
          srpe,
          workout_exercises (
            sets_data
          )
        `,
        )
        .eq("athlete_id", athleteId)
        .eq("status", "completed")
        .not("completed_at", "is", null)
        .order("completed_at", { ascending: true });

      if (logsError) throw logsError;

      const dataPoints: VolumeIntensityDataPoint[] = [];

      logs?.forEach((log) => {
        if (!log.completed_at || !log.workout_exercises) return;

        const exercises = log.workout_exercises as Array<{
          sets_data: SetData[];
        }>;

        let totalTonnage = 0;
        let totalRpe = 0;
        let rpeCount = 0;

        exercises.forEach((exercise) => {
          if (Array.isArray(exercise.sets_data)) {
            exercise.sets_data.forEach((set) => {
              const weight = Number(set.weight_kg) || 0;
              const reps = Number(set.reps) || 0;
              totalTonnage += weight * reps;
              if (set.rpe) {
                totalRpe += Number(set.rpe);
                rpeCount++;
              }
            });
          }
        });

        // Session RPE (srpe) if no set carries one; declared by nobody →
        // null, never an invented default.
        const avgRpe = rpeCount > 0 ? totalRpe / rpeCount : log.srpe;

        const date = new Date(log.completed_at);
        dataPoints.push({
          date: log.completed_at,
          dateFormatted: format(date, "dd/MM"),
          totalTonnage: Math.round(totalTonnage),
          avgRpe: avgRpe == null ? null : Math.round(avgRpe * 10) / 10,
        });
      });

      return dataPoints;
    },
    enabled: !!athleteId,
  });
}

export function useAthleteExerciseList(athleteId: string | undefined) {
  return useQuery({
    queryKey: ["athlete-exercise-list", athleteId],
    queryFn: async () => {
      if (!athleteId) return [];

      const { data: logs, error } = await supabase
        .from("workout_logs")
        .select(
          `
          workout_exercises (
            exercise_name
          )
        `,
        )
        .eq("athlete_id", athleteId)
        .eq("status", "completed");

      if (error) throw error;

      const exerciseNames = new Set<string>();
      logs?.forEach((log) => {
        const exercises = log.workout_exercises as Array<{ exercise_name: string }>;
        exercises?.forEach((e) => {
          if (e.exercise_name) {
            exerciseNames.add(e.exercise_name);
          }
        });
      });

      return Array.from(exerciseNames).sort();
    },
    enabled: !!athleteId,
  });
}
