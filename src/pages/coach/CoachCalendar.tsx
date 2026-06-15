import { useState, useCallback, useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  pointerWithin,
  useSensor,
  useSensors,
  PointerSensor,
} from "@dnd-kit/core";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { ProgramsDrawer } from "@/components/coach/calendar/ProgramsDrawer";
import {
  CalendarGrid,
  ScheduledWorkoutLog,
  GoogleBusySlot,
} from "@/components/coach/calendar/CalendarGrid";
import { ScheduleWeekDialog } from "@/components/coach/calendar/ScheduleWeekDialog";
import { ScheduleConfirmDialog } from "@/components/coach/calendar/ScheduleConfirmDialog";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Dumbbell,
  Calendar,
  ExternalLink,
  Users,
  CalendarRange,
  CalendarDays,
  ArrowRightCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, addDays } from "date-fns";
import { log } from "@/lib/logger";
import { useCoachAppointments } from "@/hooks/useCoachAppointments";

// Types for drag data
interface DraggedWorkout {
  id: string;
  name: string;
  day_number?: number;
}

interface DraggedWeek {
  id: string;
  week_order: number;
  name: string | null;
}

interface Athlete {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
}

// Mock Google Calendar busy slots (for UI preparation)
const MOCK_GOOGLE_BUSY_SLOTS: GoogleBusySlot[] = [
  {
    id: "g1",
    title: "Riunione Team",
    date: format(new Date(), "yyyy-MM-dd"),
    startTime: "10:00",
    endTime: "11:00",
  },
  {
    id: "g2",
    title: "Call Cliente",
    date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    startTime: "14:00",
    endTime: "15:00",
  },
  {
    id: "g3",
    title: "Appuntamento",
    date: format(addDays(new Date(), 3), "yyyy-MM-dd"),
    startTime: "09:00",
    endTime: "10:30",
  },
];

// `MOCK_APPOINTMENTS` removed — see `useCoachAppointments` (audit M3).

export default function CoachCalendar() {
  const queryClient = useQueryClient();
  const { user, profile } = useAuth();

  // State
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<"month" | "week">("month");
  const [selectedAthleteId, setSelectedAthleteId] = useState<string | null>(null);
  const [showGoogleEvents, setShowGoogleEvents] = useState(false);

  // Drag state. Discriminated union mirroring the two payload shapes that
  // dnd-kit's `event.active.data.current` can carry on this page — set by
  // the drag-source components in ProgramsDrawer.
  type CalendarDragData =
    | { type: "calendar-workout"; workout: { id?: string; name: string } }
    | {
        type: "calendar-week";
        week: { id?: string; name?: string | null; week_order: number };
      };

  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeDragData, setActiveDragData] = useState<CalendarDragData | null>(null);

  // Confirmation dialog state
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingSchedule, setPendingSchedule] = useState<{
    workout: DraggedWorkout;
    targetDate: Date;
  } | null>(null);

  // Week scheduling dialog
  const [weekDialogOpen, setWeekDialogOpen] = useState(false);
  const [pendingWeekSchedule, setPendingWeekSchedule] = useState<{
    week: DraggedWeek;
    workouts: DraggedWorkout[];
    startDate: Date;
    planId: string;
  } | null>(null);

  // DnD Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  // Fetch coach's athletes
  const { data: athletes = [] } = useQuery({
    queryKey: ["coach-athletes", user?.id],
    ...COACH_ROSTER_QUERY_OPTS,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .eq("coach_id", user.id)
        .eq("role", "athlete");

      if (error) throw error;
      return data as Athlete[];
    },
    enabled: !!user && profile?.role === "coach",
  });

  // Set default athlete when loaded
  useEffect(() => {
    if (athletes.length > 0 && !selectedAthleteId) {
      setSelectedAthleteId(athletes[0].id);
    }
  }, [athletes, selectedAthleteId]);

  // Calculate date range based on view
  const dateRange = useMemo(() => {
    if (viewMode === "month") {
      return {
        start: format(startOfMonth(currentDate), "yyyy-MM-dd"),
        end: format(endOfMonth(currentDate), "yyyy-MM-dd"),
      };
    } else {
      return {
        start: format(startOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
        end: format(endOfWeek(currentDate, { weekStartsOn: 1 }), "yyyy-MM-dd"),
      };
    }
  }, [currentDate, viewMode]);

  // Fetch workout logs for calendar
  const { data: workoutLogs = [], isLoading: logsLoading } = useQuery({
    queryKey: [
      "calendar-workout-logs",
      user?.id,
      selectedAthleteId,
      dateRange.start,
      dateRange.end,
    ],
    queryFn: async () => {
      if (!user || !selectedAthleteId) return [];

      const { data, error } = await supabase
        .from("workout_logs")
        .select(
          `
          id,
          status,
          scheduled_date,
          scheduled_start_time,
          program_workout_id,
          athlete_id,
          workout_id,
          workouts!workout_logs_workout_id_fkey(title),
          profiles!workout_logs_athlete_id_fkey(full_name, avatar_url)
        `,
        )
        .eq("athlete_id", selectedAthleteId)
        .gte("scheduled_date", dateRange.start)
        .lte("scheduled_date", dateRange.end)
        .order("scheduled_date", { ascending: true });

      if (error) throw error;

      // Local row type for the nested `select(...)` shape above.
      // Supabase generic typing collapses embedded relations to `unknown`,
      // so we name it explicitly here instead of an `any` cast.
      type ScheduledWorkoutLogRow = {
        id: string;
        status: string;
        scheduled_date: string | null;
        scheduled_start_time: string | null;
        program_workout_id: string | null;
        athlete_id: string;
        workout_id: string | null;
        workouts: { title: string | null } | null;
        profiles: { full_name: string | null; avatar_url: string | null } | null;
      };

      // Bridge cast unavoidable: Supabase types the nested joins
      // (`workouts(title)`, `profiles(full_name, avatar_url)`) as arrays in
      // some shapes and singletons in others. The local `ScheduledWorkoutLogRow`
      // narrows to singleton. Replacing this needs an explicit `!inner` join
      // or a typed view.
      return ((data ?? []) as unknown as ScheduledWorkoutLogRow[]).map((log) => ({
        id: log.id,
        status: log.status as "scheduled" | "completed" | "missed",
        scheduled_date: log.scheduled_date,
        scheduled_start_time: log.scheduled_start_time,
        workout_name: log.workouts?.title ?? "Workout",
        athlete_id: log.athlete_id,
        athlete_name: log.profiles?.full_name ?? "Atleta",
        avatar_url: log.profiles?.avatar_url,
        program_workout_id: log.program_workout_id,
      })) as ScheduledWorkoutLog[];
    },
    enabled: !!user && !!selectedAthleteId && profile?.role === "coach",
  });

  // Mutation to schedule a workout
  const scheduleWorkoutMutation = useMutation({
    mutationFn: async ({
      programWorkoutId,
      workoutName,
      athleteId,
      scheduledDate,
    }: {
      programWorkoutId: string;
      workoutName: string;
      athleteId: string;
      scheduledDate: string;
    }) => {
      // First create a workout entry
      const { data: workout, error: workoutError } = await supabase
        .from("workouts")
        .insert({
          athlete_id: athleteId,
          coach_id: user!.id,
          title: workoutName,
          scheduled_date: scheduledDate,
          status: "pending",
          structure: [],
        })
        .select()
        .single();

      if (workoutError) throw workoutError;

      // Then create the workout log
      const { data: log, error: logError } = await supabase
        .from("workout_logs")
        .insert({
          athlete_id: athleteId,
          workout_id: workout.id,
          program_workout_id: programWorkoutId,
          scheduled_date: scheduledDate,
          status: "scheduled",
        })
        .select()
        .single();

      if (logError) throw logError;

      return log;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-workout-logs"] });
      toast.success("Workout programmato con successo");
    },
    onError: (error) => {
      log.error("Schedule error:", error);
      toast.error("Errore nella programmazione");
    },
  });

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
    // dnd-kit types `data.current` as a loose record; we narrow to our
    // discriminated union only when the `type` field matches one of the
    // two known shapes, otherwise leave the drag-overlay state null.
    const raw = event.active.data.current as CalendarDragData | undefined;
    if (raw?.type === "calendar-workout" || raw?.type === "calendar-week") {
      setActiveDragData(raw);
    } else {
      setActiveDragData(null);
    }
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveId(null);
      setActiveDragData(null);

      if (!over) return;

      const dropData = over.data.current;
      if (dropData?.type !== "calendar-day") return;

      const targetDate = dropData.date as Date;
      const dragData = active.data.current;

      // Check if athlete is selected before any scheduling
      if (!selectedAthleteId) {
        toast.error("Seleziona prima un atleta");
        return;
      }

      // Handle single workout drop - show confirmation dialog
      if (dragData?.type === "calendar-workout") {
        const workout = dragData.workout as DraggedWorkout;
        setPendingSchedule({ workout, targetDate });
        setConfirmDialogOpen(true);
      }

      // Handle week drop (Smart Paste)
      if (dragData?.type === "calendar-week") {
        const week = dragData.week as DraggedWeek;

        fetchWeekWorkouts(week.id, dragData.planId).then((workouts) => {
          if (workouts.length === 0) {
            toast.error("Questa settimana non ha workout");
            return;
          }

          setPendingWeekSchedule({
            week,
            workouts,
            startDate: targetDate,
            planId: dragData.planId,
          });
          setWeekDialogOpen(true);
        });
      }
    },
    [selectedAthleteId],
  );

  // Fetch workouts for a week (for Smart Paste)
  const fetchWeekWorkouts = async (weekId: string, _planId: string): Promise<DraggedWorkout[]> => {
    const { data: days, error: daysError } = await supabase
      .from("program_days")
      .select("id, day_number")
      .eq("program_week_id", weekId)
      .order("day_number", { ascending: true });

    if (daysError || !days?.length) return [];

    const dayIds = days.map((d) => d.id);
    const { data: workouts, error: workoutsError } = await supabase
      .from("program_workouts")
      .select("id, name, program_day_id")
      .in("program_day_id", dayIds)
      .order("sort_order", { ascending: true });

    if (workoutsError || !workouts?.length) return [];

    const dayMap = new Map(days.map((d) => [d.id, d.day_number]));
    return workouts.map((w) => ({
      id: w.id,
      name: w.name,
      day_number: dayMap.get(w.program_day_id),
    }));
  };

  // Handle single workout confirmation - now uses selectedAthleteId directly
  const handleConfirmSchedule = useCallback(async () => {
    if (!pendingSchedule || !selectedAthleteId) return;

    const { workout, targetDate } = pendingSchedule;
    const targetDateKey = format(targetDate, "yyyy-MM-dd");

    await scheduleWorkoutMutation.mutateAsync({
      programWorkoutId: workout.id,
      workoutName: workout.name,
      athleteId: selectedAthleteId,
      scheduledDate: targetDateKey,
    });

    setConfirmDialogOpen(false);
    setPendingSchedule(null);
  }, [pendingSchedule, selectedAthleteId, scheduleWorkoutMutation]);

  // Handle week schedule confirmation - uses RPC function
  const handleConfirmWeekSchedule = useCallback(async () => {
    if (!pendingWeekSchedule || !selectedAthleteId) return;

    const { week, startDate } = pendingWeekSchedule;
    const startDateKey = format(startDate, "yyyy-MM-dd");

    try {
      const { data, error } = await supabase.rpc("schedule_program_week", {
        p_week_id: week.id,
        p_start_date: startDateKey,
        p_athlete_id: selectedAthleteId,
      });

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["calendar-workout-logs"] });
      setWeekDialogOpen(false);
      setPendingWeekSchedule(null);
      toast.success(
        `${data} workout programmati per ${week.name || `Settimana ${week.week_order}`}`,
      );
    } catch (error) {
      log.error("Week schedule error:", error);
      toast.error("Errore nella programmazione della settimana");
    }
  }, [pendingWeekSchedule, selectedAthleteId, queryClient]);

  // Delete workout log mutation
  const deleteWorkoutLogMutation = useMutation({
    mutationFn: async (logId: string) => {
      if (!user?.id) throw new Error("Non autenticato.");

      // Fetch the parent workout_id. workout_logs has no coach_id column
      // (ownership flows via athlete_id → profiles.coach_id), so this
      // query relies on RLS for cross-coach isolation. If RLS is misconfigured
      // the .single() will return a row of another coach — server-side
      // policies are the only safety net here.
      const { data: log, error: fetchError } = await supabase
        .from("workout_logs")
        .select("workout_id")
        .eq("id", logId)
        .single();

      if (fetchError) throw fetchError;

      // Delete the workout log. Same RLS-only constraint as above.
      const { error: logDeleteError } = await supabase
        .from("workout_logs")
        .delete()
        .eq("id", logId);

      if (logDeleteError) throw logDeleteError;

      // Soft-delete the associated workout. workouts.coach_id IS a real
      // column, so we add defense-in-depth: even if RLS is missing or
      // loosened in a future migration, the .eq("coach_id", user.id)
      // guarantees we only touch our own rows. The cast removed because
      // `deleted_at` is part of TablesUpdate<"workouts">.
      if (log?.workout_id) {
        await supabase
          .from("workouts")
          .update({ deleted_at: new Date().toISOString() })
          .eq("id", log.workout_id)
          .eq("coach_id", user.id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["calendar-workout-logs"] });
      toast.success("Workout rimosso dal calendario");
    },
    onError: (error) => {
      log.error("Delete error:", error);
      toast.error("Errore nella rimozione del workout");
    },
  });

  const handleDeleteWorkoutLog = useCallback(
    (logId: string) => {
      deleteWorkoutLogMutation.mutate(logId);
    },
    [deleteWorkoutLogMutation],
  );

  // Audit M3 closure — real appointments (no more MOCK_APPOINTMENTS).
  // Scoped to the visible date range so we never over-fetch.
  const { appointments } = useCoachAppointments({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const selectedAthlete = athletes.find((a) => a.id === selectedAthleteId);

  return (
    <CoachLayout title="Calendario" subtitle="Programmazione Drag & Drop">
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 h-[calc(100vh-10rem)] animate-fade-in overflow-hidden">
          {/* ===== LEFT SIDEBAR: PROGRAMS DRAWER (25%) ===== */}
          <Card className="w-[25%] min-w-[280px] max-w-[360px] shrink-0 border shadow-sm flex flex-col overflow-hidden">
            <ProgramsDrawer />
          </Card>

          {/* ===== MAIN AREA: CALENDAR GRID (75%) ===== */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* Toolbar — Aura sub-header (3 columns: athlete · view switcher · macro actions) */}
            <div className="flex flex-wrap items-center justify-between gap-3 mb-3 px-1">
              {/* ── Left: Athlete Selector ── */}
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-sm text-on-surface-variant">
                  <Users className="h-4 w-4" />
                  <span>Atleta:</span>
                </div>
                <Select value={selectedAthleteId || ""} onValueChange={setSelectedAthleteId}>
                  <SelectTrigger className="w-48 h-9">
                    <SelectValue placeholder="Seleziona atleta" />
                  </SelectTrigger>
                  <SelectContent>
                    {athletes.map((athlete) => (
                      <SelectItem key={athlete.id} value={athlete.id}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-5 w-5">
                            <AvatarImage src={athlete.avatar_url || undefined} />
                            <AvatarFallback className="text-4xs">
                              {(athlete.full_name || "A")
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .toUpperCase()
                                .slice(0, 2)}
                            </AvatarFallback>
                          </Avatar>
                          <span className="text-sm">{athlete.full_name || "Atleta"}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* ── Center: View Switcher (pill toggle, Aura) ──
                  Container pill `rounded-full` track + 2 segmented buttons.
                  Active = solid primary-container + text-white,
                  inactive = transparent text-on-surface-variant with soft hover.
                  Toggling re-renders the CalendarGrid via the `view` prop. */}
              <div
                role="group"
                aria-label="Modalità visualizzazione calendario"
                className="inline-flex items-center gap-1 rounded-full bg-surface-container-low border border-outline-variant/30 p-1"
              >
                <button
                  type="button"
                  onClick={() => setViewMode("month")}
                  aria-pressed={viewMode === "month"}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-sm font-bold transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    viewMode === "month"
                      ? "bg-primary-container text-white shadow-[0_2px_8px_rgb(0_62_98_/_0.20)]"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-primary-container/10",
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Mese
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("week")}
                  aria-pressed={viewMode === "week"}
                  className={cn(
                    "inline-flex items-center gap-1.5 h-8 px-4 rounded-full text-sm font-bold transition-all duration-200",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                    viewMode === "week"
                      ? "bg-primary-container text-white shadow-[0_2px_8px_rgb(0_62_98_/_0.20)]"
                      : "text-on-surface-variant hover:text-on-surface hover:bg-primary-container/10",
                  )}
                >
                  <CalendarRange className="h-3.5 w-3.5" />
                  Settimana
                </button>
              </div>

              {/* ── Right: Macro automation actions ── */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 h-9"
                  onClick={() => {
                    toast.info("Slitta Blocco +7gg", {
                      description:
                        "Funzione in arrivo: sposta tutti i workout futuri dell'atleta di 7 giorni.",
                    });
                  }}
                  disabled={!selectedAthleteId}
                >
                  <ArrowRightCircle className="h-4 w-4" />
                  Slitta Blocco +7gg
                </Button>
                <Button variant="outline" size="sm" disabled className="gap-2 h-9">
                  <ExternalLink className="h-4 w-4" />
                  Connetti Google Calendar
                </Button>
              </div>
            </div>

            {/* Calendar Grid */}
            <Card className="flex-1 border shadow-sm overflow-hidden">
              <CardContent className="p-4 h-full">
                {!selectedAthleteId ? (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center">
                      <div className="h-14 w-14 rounded-xl bg-muted flex items-center justify-center mx-auto mb-3">
                        <Calendar className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <p className="text-sm font-semibold">Seleziona un atleta</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Scegli un atleta per visualizzare il calendario
                      </p>
                    </div>
                  </div>
                ) : logsLoading ? (
                  <div className="h-full p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-7 w-40" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-20" />
                        <Skeleton className="h-8 w-20" />
                      </div>
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                      {Array.from({ length: 7 }).map((_, i) => (
                        <Skeleton key={`hdr-${i}`} className="h-6 w-full" />
                      ))}
                      {Array.from({ length: 35 }).map((_, i) => (
                        <Skeleton key={`cell-${i}`} className="h-20 w-full" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <CalendarGrid
                    workoutLogs={workoutLogs}
                    googleBusySlots={MOCK_GOOGLE_BUSY_SLOTS}
                    onDateSelect={setSelectedDate}
                    selectedDate={selectedDate}
                    view={viewMode}
                    onViewChange={setViewMode}
                    currentDate={currentDate}
                    onDateChange={setCurrentDate}
                    showGoogleEvents={showGoogleEvents}
                    onToggleGoogleEvents={setShowGoogleEvents}
                    onDeleteWorkout={handleDeleteWorkoutLog}
                    isDeletingWorkout={deleteWorkoutLogMutation.isPending}
                    appointments={appointments}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Drag Overlay */}
        <DragOverlay>
          {activeId && activeDragData?.type === "calendar-workout" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary text-primary-foreground shadow-xl">
              <Dumbbell className="h-4 w-4" />
              <span className="text-sm font-medium">{activeDragData.workout.name}</span>
            </div>
          )}
          {activeId && activeDragData?.type === "calendar-week" && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary text-primary-foreground shadow-xl">
              <Calendar className="h-4 w-4" />
              <span className="text-sm font-medium">
                {activeDragData.week.name || `Settimana ${activeDragData.week.week_order}`}
              </span>
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Single Workout Confirmation Dialog */}
      {pendingSchedule && selectedAthleteId && (
        <ScheduleConfirmDialog
          open={confirmDialogOpen}
          onOpenChange={setConfirmDialogOpen}
          workoutName={pendingSchedule.workout.name}
          targetDate={pendingSchedule.targetDate}
          athleteName={selectedAthlete?.full_name || "Atleta"}
          onConfirm={handleConfirmSchedule}
          isScheduling={scheduleWorkoutMutation.isPending}
        />
      )}

      {/* Week Scheduling Dialog */}
      {pendingWeekSchedule && (
        <ScheduleWeekDialog
          open={weekDialogOpen}
          onOpenChange={setWeekDialogOpen}
          weekName={
            pendingWeekSchedule.week.name || `Settimana ${pendingWeekSchedule.week.week_order}`
          }
          startDate={pendingWeekSchedule.startDate}
          workouts={pendingWeekSchedule.workouts}
          onConfirm={handleConfirmWeekSchedule}
          isScheduling={scheduleWorkoutMutation.isPending}
        />
      )}
    </CoachLayout>
  );
}
