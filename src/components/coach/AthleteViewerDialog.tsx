import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Zap,
  Dumbbell,
  Moon,
  Activity,
  CheckCircle2,
  Flame,
  Heart,
  Scale,
  Utensils,
  AlertTriangle,
  MessageSquare,
  Send,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { useReviewWorkout } from "@/hooks/useReviewWorkout";

interface ReviewWorkoutItemProps {
  logId: string;
  title: string;
  /** Session rating from `workout_logs.srpe` (CR-10). The old second badge
   *  read `rpe_global` — the session value written for two years to the
   *  wrong column (B-22): the surface now reads ONE column, and a missing
   *  value reads "—", never a fallback number. */
  srpe: number | null;
  athleteNotes: string | null;
  existingFeedback: string | null;
  exercisesData: unknown;
  onSaved: () => void;
}

interface ParsedSet {
  set_number: number;
  weight_kg: number | null;
  reps: number | null;
  rpe: number | null;
  completed: boolean;
}

interface ParsedExercise {
  name: string;
  sets: ParsedSet[];
  notes?: string;
}

function parseExecutionLog(raw: unknown): ParsedExercise[] | null {
  if (!raw || !Array.isArray(raw)) return null;
  const parsed: ParsedExercise[] = [];
  for (const ex of raw as Array<Record<string, unknown>>) {
    if (!ex || typeof ex !== "object") continue;
    const name = (ex.exercise_name as string) || (ex.name as string) || "Esercizio";
    const rawSets = (ex.sets_data as unknown) ?? (ex.sets as unknown);
    if (!Array.isArray(rawSets)) continue;
    const sets: ParsedSet[] = rawSets
      .filter((s) => s && typeof s === "object")
      .map((s, idx) => {
        const r = s as Record<string, unknown>;
        return {
          set_number: typeof r.set_number === "number" ? r.set_number : idx + 1,
          weight_kg:
            typeof r.weight_kg === "number" ? r.weight_kg : typeof r.kg === "number" ? r.kg : null,
          reps: typeof r.reps === "number" ? r.reps : null,
          rpe: typeof r.rpe === "number" ? r.rpe : null,
          completed: r.completed !== false,
        };
      });
    if (sets.length === 0) continue;
    parsed.push({
      name,
      sets,
      notes: typeof ex.notes === "string" ? (ex.notes as string) : undefined,
    });
  }
  return parsed.length > 0 ? parsed : null;
}

export function ReviewWorkoutItem({
  logId,
  title,
  srpe,
  athleteNotes,
  existingFeedback,
  exercisesData,
  onSaved,
}: ReviewWorkoutItemProps) {
  const [feedback, setFeedback] = useState(existingFeedback ?? "");
  const review = useReviewWorkout();
  const reviewed = !!existingFeedback;
  const execution = useMemo(() => parseExecutionLog(exercisesData), [exercisesData]);

  const handleSubmit = async () => {
    await review.mutateAsync({ logId, feedback });
    onSaved();
  };

  return (
    <div className="rounded-md border border-border/60 p-3 space-y-2 bg-muted/20">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold truncate">{title}</p>
        <div className="flex items-center gap-1">
          <Badge variant="secondary" className="text-3xs">
            RPE sessione {srpe ?? "—"}
          </Badge>
          {reviewed && (
            <Badge variant="default" className="text-3xs bg-success text-success-foreground">
              Recensito
            </Badge>
          )}
        </div>
      </div>

      {/* Execution Table */}
      <div className="rounded border border-border/50 bg-background/60 overflow-hidden">
        <div className="px-2 py-1.5 border-b border-border/50 bg-muted/40 flex items-center gap-1.5">
          <Dumbbell className="h-3 w-3 text-primary" />
          <span className="text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
            Esecuzione
          </span>
        </div>
        {execution ? (
          <div className="divide-y divide-border/40">
            {execution.map((ex, idx) => (
              <div key={idx} className="p-2 space-y-1.5">
                <p className="text-2xs font-semibold text-foreground truncate">{ex.name}</p>
                <table className="w-full text-3xs">
                  <thead>
                    <tr className="text-muted-foreground">
                      <th className="text-left font-medium py-0.5 w-8">Set</th>
                      <th className="text-right font-medium py-0.5">Kg</th>
                      <th className="text-right font-medium py-0.5">Reps</th>
                      <th className="text-right font-medium py-0.5">RPE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ex.sets.map((s, sIdx) => (
                      <tr
                        key={sIdx}
                        className={cn("border-t border-border/30", !s.completed && "opacity-50")}
                      >
                        <td className="py-0.5 font-mono text-muted-foreground">{s.set_number}</td>
                        <td className="py-0.5 text-right font-mono tabular-nums">
                          {s.weight_kg != null ? s.weight_kg : "—"}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums">
                          {s.reps != null ? s.reps : "—"}
                        </td>
                        <td className="py-0.5 text-right font-mono tabular-nums">
                          {s.rpe != null ? s.rpe : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {ex.notes && (
                  <p className="text-3xs text-muted-foreground italic pt-0.5">{ex.notes}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="px-2 py-3 text-3xs text-muted-foreground text-center italic">
            Nessun log dettagliato fornito
          </p>
        )}
      </div>

      {athleteNotes && <p className="text-2xs text-muted-foreground italic">"{athleteNotes}"</p>}
      <Textarea
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        placeholder="Scrivi il tuo feedback per l'atleta..."
        className="min-h-[64px] text-xs"
        maxLength={500}
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSubmit}
          disabled={review.isPending || !feedback.trim()}
          className="h-8 text-xs"
        >
          {review.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin mr-1" />
          ) : (
            <Send className="h-3 w-3 mr-1" />
          )}
          {reviewed ? "Aggiorna" : "Invia Feedback"}
        </Button>
      </div>
    </div>
  );
}

interface AthleteViewerDialogProps {
  athleteId: string;
  athleteName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AthleteViewerDialog({
  athleteId,
  athleteName,
  open,
  onOpenChange,
}: AthleteViewerDialogProps) {
  const todayDate = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  // Fetch readiness
  const { data: readiness, isLoading: readinessLoading } = useQuery({
    queryKey: ["god-mode-readiness", athleteId, todayDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("daily_readiness")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("date", todayDate)
        .maybeSingle();
      return data;
    },
    enabled: open && !!athleteId,
  });

  // Fetch today's workouts
  const { data: todayWorkouts = [], isLoading: workoutsLoading } = useQuery({
    queryKey: ["god-mode-workouts", athleteId, todayDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("workouts")
        .select("id, title, status, scheduled_date, estimated_duration")
        .eq("athlete_id", athleteId)
        .eq("scheduled_date", todayDate)
        .order("created_at", { ascending: true });
      return data || [];
    },
    enabled: open && !!athleteId,
  });

  // Fetch completed workout logs for today (review queue)
  const {
    data: completedLogs = [],
    isLoading: logsLoading,
    refetch: refetchLogs,
  } = useQuery({
    queryKey: ["god-mode-workout-logs", athleteId, todayDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("workout_logs")
        .select(
          "id, workout_id, srpe, notes, coach_feedback, completed_at, exercises_data, workouts(title)",
        )
        .eq("athlete_id", athleteId)
        .eq("status", "completed")
        .gte("completed_at", `${todayDate}T00:00:00`)
        .lte("completed_at", `${todayDate}T23:59:59`)
        .order("completed_at", { ascending: false });
      return data || [];
    },
    enabled: open && !!athleteId,
  });

  // Fetch nutrition logs for today
  const { data: nutritionLogs = [], isLoading: nutritionLoading } = useQuery({
    queryKey: ["god-mode-nutrition", athleteId, todayDate],
    queryFn: async () => {
      const { data } = await supabase
        .from("nutrition_logs")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("date", todayDate)
        .order("logged_at", { ascending: true });
      return data || [];
    },
    enabled: open && !!athleteId,
  });

  // Fetch active nutrition plan
  const { data: nutritionPlan } = useQuery({
    queryKey: ["god-mode-nutrition-plan", athleteId],
    queryFn: async () => {
      const { data } = await supabase
        .from("nutrition_plans")
        .select("*")
        .eq("athlete_id", athleteId)
        .eq("active", true)
        .maybeSingle();
      return data;
    },
    enabled: open && !!athleteId,
  });

  // Fetch habits
  const { data: habits = [], isLoading: habitsLoading } = useQuery({
    queryKey: ["god-mode-habits", athleteId, todayDate],
    queryFn: async () => {
      const { data: athleteHabits } = await supabase
        .from("athlete_habits")
        .select("id, habit_id, habits_library(name, category)")
        .eq("athlete_id", athleteId)
        .eq("active", true);

      if (!athleteHabits?.length) return [];

      const { data: logs } = await supabase
        .from("habit_logs")
        .select("athlete_habit_id, completed")
        .eq("athlete_id", athleteId)
        .eq("date", todayDate);

      const logMap = new Map(logs?.map((l) => [l.athlete_habit_id, l.completed]) || []);

      return athleteHabits.map((h) => {
        // Supabase types the joined relation loosely (can be object/array/null
        // depending on FK shape). Narrow to the two fields we actually read
        // — `name` and `category` — instead of casting through `any`.
        const lib = h.habits_library as
          { name?: string | null; category?: string | null } | null | undefined;
        return {
          id: h.id,
          name: lib?.name || "Abitudine",
          category: lib?.category || "general",
          completed: logMap.get(h.id) ?? false,
        };
      });
    },
    enabled: open && !!athleteId,
  });

  // Aggregate nutrition
  const nutritionTotals = useMemo(() => {
    return nutritionLogs.reduce(
      (acc, log) => ({
        calories: acc.calories + (log.calories || 0),
        protein: acc.protein + (log.protein || 0),
        carbs: acc.carbs + (log.carbs || 0),
        fats: acc.fats + (log.fats || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fats: 0 },
    );
  }, [nutritionLogs]);

  const completedHabits = habits.filter((h) => h.completed).length;
  const readinessScore = readiness?.score;

  const getScoreColor = (score: number) => {
    if (score >= 75) return "text-success";
    if (score >= 50) return "text-warning";
    return "text-destructive";
  };

  const isLoading = readinessLoading || workoutsLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0 gap-0 overflow-hidden max-h-[90vh]">
        <DialogHeader className="px-4 pt-4 pb-2">
          <DialogTitle className="text-sm font-semibold flex items-center gap-2">
            <div className="h-6 w-6 rounded-md bg-primary/10 flex items-center justify-center">
              <Activity className="h-3.5 w-3.5 text-primary" />
            </div>
            Vista Atleta — {athleteName}
          </DialogTitle>
          <p className="text-3xs text-muted-foreground">
            Modalità sola lettura · {format(new Date(), "EEEE d MMMM", { locale: it })}
          </p>
        </DialogHeader>

        {/* Phone-like content area */}
        <ScrollArea className="h-[70vh] px-4 pb-4">
          <div className="space-y-3 pt-2">
            {/* ===== READINESS CARD ===== */}
            <Card className="overflow-hidden">
              <CardContent className="p-4">
                {readinessLoading ? (
                  <Skeleton className="h-16 w-full" />
                ) : readiness ? (
                  <div className="flex items-center gap-4">
                    {/* Score Ring */}
                    <div className="relative flex-shrink-0">
                      <svg className="w-16 h-16 -rotate-90" viewBox="0 0 100 100">
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          className="text-muted/30"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="42"
                          fill="none"
                          stroke={
                            readinessScore && readinessScore >= 75
                              ? "hsl(160 84% 39%)"
                              : readinessScore && readinessScore >= 50
                                ? "hsl(38 92% 50%)"
                                : "hsl(0 84% 60%)"
                          }
                          strokeWidth="8"
                          strokeLinecap="round"
                          strokeDasharray={`${2 * Math.PI * 42}`}
                          strokeDashoffset={`${2 * Math.PI * 42 * (1 - (readinessScore || 0) / 100)}`}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <span
                          className={cn("text-lg font-bold", getScoreColor(readinessScore || 0))}
                        >
                          {readinessScore}
                        </span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">Punteggio Recupero</p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Moon className="h-3 w-3" /> {readiness.sleep_hours ?? "—"}h
                        </span>
                        <span className="flex items-center gap-1">
                          <Heart className="h-3 w-3" /> Stress: {readiness.stress_level ?? "—"}/10
                        </span>
                        {readiness.body_weight && (
                          <span className="flex items-center gap-1">
                            <Scale className="h-3 w-3" /> {readiness.body_weight} kg
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 text-muted-foreground">
                    <AlertTriangle className="h-5 w-5" />
                    <div>
                      <p className="text-sm font-medium">Check-in non completato</p>
                      <p className="text-xs">
                        L'atleta non ha ancora registrato la readiness oggi.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ===== TODAY'S WORKOUTS ===== */}
            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center gap-2 mb-2">
                  <Dumbbell className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Allenamento di Oggi</h3>
                </div>
                {workoutsLoading ? (
                  <Skeleton className="h-12 w-full" />
                ) : todayWorkouts.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-2">
                    Nessun allenamento programmato per oggi.
                  </p>
                ) : (
                  todayWorkouts.map((w) => (
                    <div
                      key={w.id}
                      className="flex items-center justify-between p-2 rounded-lg bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={cn(
                            "h-7 w-7 rounded-md flex items-center justify-center",
                            w.status === "completed" ? "bg-success/15" : "bg-primary/10",
                          )}
                        >
                          {w.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-success" />
                          ) : (
                            <Dumbbell className="h-4 w-4 text-primary" />
                          )}
                        </div>
                        <div>
                          <p className="text-xs font-medium">{w.title}</p>
                          {w.estimated_duration && (
                            <p className="text-3xs text-muted-foreground">
                              ~{w.estimated_duration} min
                            </p>
                          )}
                        </div>
                      </div>
                      <Badge
                        variant={w.status === "completed" ? "default" : "secondary"}
                        className="text-3xs"
                      >
                        {w.status === "completed" ? "Completato" : "In attesa"}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* ===== REVIEW QUEUE ===== */}
            {(logsLoading || completedLogs.length > 0) && (
              <Card>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Feedback Coach</h3>
                  </div>
                  {logsLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    completedLogs.map((log) => (
                      <ReviewWorkoutItem
                        key={log.id}
                        logId={log.id}
                        title={(log.workouts as { title?: string } | null)?.title ?? "Allenamento"}
                        srpe={log.srpe}
                        athleteNotes={log.notes}
                        existingFeedback={log.coach_feedback}
                        exercisesData={log.exercises_data}
                        onSaved={() => refetchLogs()}
                      />
                    ))
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Utensils className="h-4 w-4 text-primary" />
                  <h3 className="text-sm font-semibold">Nutrizione</h3>
                </div>
                {nutritionLoading ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <div className="grid grid-cols-4 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold">{nutritionTotals.calories}</p>
                      <p className="text-3xs text-muted-foreground">kcal</p>
                      {nutritionPlan && (
                        <p className="text-4xs text-muted-foreground">
                          /{nutritionPlan.daily_calories}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-bold">{Math.round(nutritionTotals.protein)}</p>
                      <p className="text-3xs text-muted-foreground">Proteine</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{Math.round(nutritionTotals.carbs)}</p>
                      <p className="text-3xs text-muted-foreground">Carb</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold">{Math.round(nutritionTotals.fats)}</p>
                      <p className="text-3xs text-muted-foreground">Grassi</p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ===== HABITS ===== */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Flame className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold">Abitudini</h3>
                  </div>
                  <Badge variant="secondary" className="text-3xs">
                    {completedHabits}/{habits.length}
                  </Badge>
                </div>
                {habitsLoading ? (
                  <Skeleton className="h-8 w-full" />
                ) : habits.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Nessuna abitudine assegnata.</p>
                ) : (
                  <div className="space-y-1.5">
                    {habits.map((h) => (
                      <div key={h.id} className="flex items-center gap-2 p-1.5 rounded-md">
                        <div
                          className={cn(
                            "h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0",
                            h.completed
                              ? "bg-success border-success"
                              : "border-muted-foreground/40",
                          )}
                        >
                          {h.completed && (
                            <CheckCircle2 className="h-3 w-3 text-success-foreground" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "text-xs",
                            h.completed ? "line-through text-muted-foreground" : "text-foreground",
                          )}
                        >
                          {h.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
