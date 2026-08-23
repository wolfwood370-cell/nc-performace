import { useMemo } from "react";
import { useDroppable } from "@dnd-kit/core";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Phone,
  Video,
  X,
  Plus,
  AlertTriangle,
  Activity,
  Dumbbell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
  addMonths,
  subMonths,
  getDay,
  isToday,
  startOfWeek,
  endOfWeek,
  addWeeks,
  subWeeks,
} from "date-fns";
import { it } from "date-fns/locale";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];

export interface ScheduledWorkoutLog {
  id: string;
  status: "scheduled" | "completed" | "missed";
  scheduled_date: string;
  scheduled_start_time: string | null;
  workout_name: string;
  athlete_id: string;
  athlete_name: string;
  avatar_url: string | null;
  program_workout_id: string | null;
}

export interface CalendarAppointment {
  id: string;
  title: string;
  type: "check-in" | "pt-session" | "other";
  date: string;
  time: string;
}

export interface GoogleBusySlot {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

interface CalendarGridProps {
  workoutLogs: ScheduledWorkoutLog[];
  appointments?: CalendarAppointment[];
  googleBusySlots?: GoogleBusySlot[];
  onDateSelect: (date: Date) => void;
  selectedDate: Date;
  view: "month" | "week";
  onViewChange: (view: "month" | "week") => void;
  currentDate: Date;
  onDateChange: (date: Date) => void;
  showGoogleEvents: boolean;
  onToggleGoogleEvents: (show: boolean) => void;
  onDeleteWorkout?: (logId: string) => void;
  /** True while a delete-workout mutation is in flight; trash buttons disable to prevent double-click (audit M13). */
  isDeletingWorkout?: boolean;
}

// Droppable Day Cell for Month View
/**
 * DroppableDayCell — Aura Health System day-cell (monthly grid).
 *
 * Multi-archetype rendering:
 *   A) Out-of-month: `opacity-40 bg-transparent` (no white surface, faded)
 *   B) Standard Training Day: white card + horizontal pill chips for each
 *      workout (`bg-primary-container/10 text-primary font-bold`).
 *   C) Triage Alert Day: red high-signal badge for missed workouts (proxy
 *      for ACWR spikes / overreaching) (`bg-error/10 text-error font-bold`).
 *   D) Rehab Focus Day: amber tokens for "consult" appointments (proxy for
 *      FMS / corrective protocols) (`bg-tertiary-container/10 text-tertiary
 *      border-tertiary-container/20`).
 *   E) Empty / Free Day: dashed drop-zone canvas with centered plus icon.
 *
 * The cell stays droppable in all states (setNodeRef on the outer button).
 */
function DroppableDayCell({
  date,
  isSelected,
  isCurrentMonth,
  isTodayDate,
  workouts,
  appointments,
  busySlots,
  showGoogleEvents,
  onClick,
  onDeleteWorkout,
  isDeletingWorkout,
}: {
  date: Date;
  isSelected: boolean;
  isCurrentMonth: boolean;
  isTodayDate: boolean;
  workouts: ScheduledWorkoutLog[];
  appointments: CalendarAppointment[];
  busySlots: GoogleBusySlot[];
  showGoogleEvents: boolean;
  onClick: () => void;
  onDeleteWorkout?: (logId: string) => void;
  isDeletingWorkout?: boolean;
}) {
  const dateKey = format(date, "yyyy-MM-dd");
  const { isOver, setNodeRef } = useDroppable({
    id: `calendar-day-${dateKey}`,
    data: { type: "calendar-day", date, dateKey },
  });

  // Archetype detection (proxy mappings — extend when domain data lands)
  const missedWorkout = workouts.find((w) => w.status === "missed");
  // CalendarAppointment.type is constrained to "check-in" | "pt-session" |
  // "other", so we detect "rehab focus" via a regex on the title (FMS,
  // mobilità, fisio, corrective, etc.). When the schema gains a dedicated
  // `rehab` type we'll switch to that.
  const rehabAppointment = appointments.find((a) =>
    /rehab|fms|recup|corrective|mobilit|fisio/i.test(a.title),
  );
  const hasEvents =
    workouts.length + appointments.length + (showGoogleEvents ? busySlots.length : 0) > 0;
  const totalEvents =
    workouts.length + appointments.length + (showGoogleEvents ? busySlots.length : 0);
  // "+N altri" must count the events actually HIDDEN by the chip caps
  // below, not "total minus a constant 3": the cell can render from 2 to
  // 5 chips depending on which archetypes are present.
  const shownEvents =
    (missedWorkout ? 1 : 0) +
    Math.min(workouts.filter((w) => w.status !== "missed").length, missedWorkout ? 1 : 2) +
    (rehabAppointment ? 1 : 0) +
    Math.min(appointments.filter((a) => a.id !== rehabAppointment?.id).length, 1) +
    (showGoogleEvents ? Math.min(busySlots.length, 1) : 0);
  const hiddenEvents = totalEvents - shownEvents;

  // State A — Out of month (faded, transparent)
  if (!isCurrentMonth) {
    return (
      <button
        ref={setNodeRef}
        onClick={onClick}
        className={cn(
          "min-h-[140px] p-3 rounded-[20px] text-left transition-all",
          "opacity-40 bg-transparent border border-outline-variant/10",
          isOver && "opacity-70 ring-2 ring-primary",
        )}
      >
        <span className="text-sm font-semibold text-on-surface-variant">{format(date, "d")}</span>
      </button>
    );
  }

  // State E — Empty / Free Day (dashed drop-zone)
  if (!hasEvents) {
    return (
      <button
        ref={setNodeRef}
        onClick={onClick}
        className={cn(
          "group min-h-[140px] p-3 rounded-[20px] transition-all flex flex-col justify-between text-left cursor-pointer",
          "border-2 border-dashed border-outline-variant/40 bg-surface-container-low/30",
          "hover:border-primary/50 hover:bg-primary-container/5",
          isSelected && "ring-2 ring-primary",
          isOver && "border-primary bg-primary-container/10 scale-[1.02]",
        )}
      >
        <DayHeader date={date} isTodayDate={isTodayDate} totalEvents={0} muted />
        <div className="flex-1 flex items-center justify-center">
          <div className="h-9 w-9 rounded-full bg-surface-container-lowest/60 border border-outline-variant/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <Plus className="h-4 w-4 text-on-surface-variant" />
          </div>
        </div>
      </button>
    );
  }

  // States B / C / D — populated cell on Aura white card
  return (
    <button
      ref={setNodeRef}
      onClick={onClick}
      className={cn(
        "min-h-[140px] p-3 rounded-[20px] bg-white border border-outline-variant/10 shadow-sm",
        "flex flex-col justify-between text-left transition-all",
        "hover:shadow-lg",
        isSelected && "ring-2 ring-primary",
        isTodayDate && !isSelected && "ring-1 ring-primary/40",
        isOver && "ring-2 ring-primary scale-[1.02]",
      )}
    >
      <DayHeader date={date} isTodayDate={isTodayDate} totalEvents={totalEvents} />

      {/* Chips area */}
      <div className="flex-1 flex flex-col gap-1 overflow-hidden mt-1">
        {/* Triage Alert chip (priority) */}
        {missedWorkout && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-destructive/10 text-destructive">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">⚠️ Spike ACWR</span>
          </span>
        )}

        {/* Standard Training Day chips */}
        {workouts
          .filter((w) => w.status !== "missed")
          .slice(0, missedWorkout ? 1 : 2)
          .map((workout) => (
            <div
              key={workout.id}
              className={cn(
                "group/event relative inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold",
                workout.status === "completed"
                  ? "bg-success/10 text-success"
                  : "bg-primary-container/10 text-primary",
              )}
            >
              {workout.status === "completed" ? (
                <CheckCircle2 className="h-2.5 w-2.5 shrink-0" />
              ) : (
                <Dumbbell className="h-2.5 w-2.5 shrink-0" />
              )}
              <span className="truncate flex-1">{workout.workout_name}</span>
              {workout.status === "scheduled" && onDeleteWorkout && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteWorkout(workout.id);
                  }}
                  disabled={isDeletingWorkout}
                  className="h-3.5 w-3.5 rounded-full bg-destructive/20 hover:bg-destructive/40 flex items-center justify-center opacity-0 group-hover/event:opacity-100 transition-opacity shrink-0 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Rimuovi"
                >
                  <X className="h-2 w-2 text-destructive" />
                </button>
              )}
            </div>
          ))}

        {/* Rehab Focus chip (consult appointment) */}
        {rehabAppointment && (
          <span
            key={rehabAppointment.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-tertiary-container/10 text-tertiary-container border border-tertiary-container/20"
            title="Rehab / FMS"
          >
            <Activity className="h-2.5 w-2.5 shrink-0" />
            <span className="truncate">{rehabAppointment.title}</span>
          </span>
        )}

        {/* Other appointments — soft success chip */}
        {appointments
          .filter((a) => a.id !== rehabAppointment?.id)
          .slice(0, 1)
          .map((apt) => (
            <span
              key={apt.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
            >
              {apt.type === "check-in" && <Phone className="h-2.5 w-2.5 shrink-0" />}
              {apt.type === "pt-session" && <Video className="h-2.5 w-2.5 shrink-0" />}
              <span className="truncate">{apt.title}</span>
            </span>
          ))}

        {/* Google busy chip */}
        {showGoogleEvents &&
          busySlots.slice(0, 1).map((slot) => (
            <span
              key={slot.id}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-muted text-muted-foreground"
            >
              <Clock className="h-2.5 w-2.5 shrink-0" />
              <span className="truncate">{slot.title || "Busy"}</span>
            </span>
          ))}

        {hiddenEvents > 0 && (
          <span className="text-3xs text-on-surface-variant px-1 font-medium">
            +{hiddenEvents} altri
          </span>
        )}
      </div>
    </button>
  );
}

/** Day-number header (re-used by all populated and empty cells) */
function DayHeader({
  date,
  isTodayDate,
  totalEvents,
  muted,
}: {
  date: Date;
  isTodayDate: boolean;
  totalEvents: number;
  muted?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span
        className={cn(
          "text-sm font-bold tabular-nums",
          isTodayDate
            ? "bg-primary text-white h-6 w-6 rounded-full flex items-center justify-center"
            : muted
              ? "text-on-surface-variant"
              : "text-on-surface",
        )}
      >
        {format(date, "d")}
      </span>
      {totalEvents > 0 && (
        <Badge variant="secondary" className="text-3xs h-4 px-1.5 rounded-full">
          {totalEvents}
        </Badge>
      )}
    </div>
  );
}

// Week View Row
function WeekViewRow({
  date,
  workouts,
  appointments,
  busySlots,
  showGoogleEvents,
  isSelected,
  onClick,
  onDeleteWorkout,
  isDeletingWorkout,
}: {
  date: Date;
  workouts: ScheduledWorkoutLog[];
  appointments: CalendarAppointment[];
  busySlots: GoogleBusySlot[];
  showGoogleEvents: boolean;
  isSelected: boolean;
  onClick: () => void;
  onDeleteWorkout?: (logId: string) => void;
  isDeletingWorkout?: boolean;
}) {
  const dateKey = format(date, "yyyy-MM-dd");
  const { isOver, setNodeRef } = useDroppable({
    id: `calendar-day-${dateKey}`,
    data: { type: "calendar-day", date, dateKey },
  });

  const isTodayDate = isToday(date);

  return (
    <div
      ref={setNodeRef}
      role="button"
      tabIndex={0}
      aria-label={`Apri ${format(date, "EEEE d MMMM", { locale: it })}`}
      aria-pressed={isSelected}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className={cn(
        "flex items-stretch border-b border-border/30 min-h-[120px] cursor-pointer hover:bg-muted/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSelected && "bg-primary/5",
        isOver && "bg-primary/10",
      )}
    >
      {/* Day label */}
      <div
        className={cn(
          "w-24 shrink-0 p-3 border-r border-border/30 flex flex-col items-center justify-center",
          isTodayDate && "bg-accent/30",
        )}
      >
        <span className="text-xs uppercase text-muted-foreground font-medium">
          {format(date, "EEE", { locale: it })}
        </span>
        <span
          className={cn("text-2xl font-bold tabular-nums mt-0.5", isTodayDate && "text-primary")}
        >
          {format(date, "d")}
        </span>
        <span className="text-3xs text-muted-foreground">
          {format(date, "MMM", { locale: it })}
        </span>
      </div>

      {/* Events */}
      <div className="flex-1 p-3 space-y-2">
        {workouts.length === 0 &&
        appointments.length === 0 &&
        (!showGoogleEvents || busySlots.length === 0) ? (
          <p className="text-sm text-muted-foreground/60 italic">
            Trascina qui un workout per programmarlo
          </p>
        ) : (
          <>
            {/* Workouts */}
            {workouts.map((workout) => (
              <div
                key={workout.id}
                className={cn(
                  "flex items-center gap-3 p-2.5 rounded-lg group relative",
                  workout.status === "scheduled" && "bg-primary/10 border border-primary/20",
                  workout.status === "completed" && "bg-success/10 border border-success/20",
                  workout.status === "missed" && "bg-destructive/10 border border-destructive/20",
                )}
              >
                <div
                  className={cn(
                    "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                    workout.status === "scheduled" && "bg-primary/20",
                    workout.status === "completed" && "bg-success/20",
                    workout.status === "missed" && "bg-destructive/20",
                  )}
                >
                  {workout.status === "scheduled" && <Clock className="h-4 w-4 text-primary" />}
                  {workout.status === "completed" && (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  )}
                  {workout.status === "missed" && <XCircle className="h-4 w-4 text-destructive" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{workout.workout_name}</p>
                  <p className="text-2xs text-muted-foreground">
                    {workout.scheduled_start_time?.slice(0, 5) || "Orario libero"}
                  </p>
                </div>
                <Avatar className="h-6 w-6">
                  <AvatarImage src={workout.avatar_url || undefined} />
                  <AvatarFallback className="text-5xs">
                    {workout.athlete_name
                      .split(" ")
                      .map((n) => n[0])
                      .join("")
                      .toUpperCase()
                      .slice(0, 2)}
                  </AvatarFallback>
                </Avatar>
                {/* Delete button */}
                {workout.status === "scheduled" && onDeleteWorkout && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteWorkout(workout.id);
                    }}
                    disabled={isDeletingWorkout}
                    className="h-6 w-6 rounded-full bg-destructive/10 hover:bg-destructive/20 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Rimuovi dal calendario"
                  >
                    <X className="h-3.5 w-3.5 text-destructive" />
                  </button>
                )}
              </div>
            ))}

            {/* Appointments */}
            {appointments.map((apt) => (
              <div
                key={apt.id}
                className="flex items-center gap-3 p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
              >
                <div className="h-8 w-8 rounded-lg bg-emerald-500/20 flex items-center justify-center shrink-0">
                  {apt.type === "check-in" && <Phone className="h-4 w-4 text-emerald-500" />}
                  {apt.type === "pt-session" && <Video className="h-4 w-4 text-emerald-500" />}
                  {apt.type === "other" && <CalendarDays className="h-4 w-4 text-emerald-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate text-emerald-700 dark:text-emerald-400">
                    {apt.title}
                  </p>
                  <p className="text-2xs text-muted-foreground">{apt.time}</p>
                </div>
              </div>
            ))}

            {/* Google Busy Slots */}
            {showGoogleEvents &&
              busySlots.map((slot) => (
                <div
                  key={slot.id}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-muted border border-border/50"
                >
                  <div className="h-8 w-8 rounded-lg bg-muted-foreground/10 flex items-center justify-center shrink-0">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate text-muted-foreground">
                      {slot.title || "Occupato"}
                    </p>
                    <p className="text-2xs text-muted-foreground">
                      {slot.startTime} - {slot.endTime}
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-3xs">
                    Google
                  </Badge>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
}

export function CalendarGrid({
  workoutLogs,
  appointments = [],
  googleBusySlots = [],
  onDateSelect,
  selectedDate,
  view,
  onViewChange,
  currentDate,
  onDateChange,
  showGoogleEvents,
  onToggleGoogleEvents,
  onDeleteWorkout,
  isDeletingWorkout,
}: CalendarGridProps) {
  // Group workouts by date
  const workoutsByDate = useMemo(() => {
    const grouped: Record<string, ScheduledWorkoutLog[]> = {};
    workoutLogs.forEach((log) => {
      const dateKey = log.scheduled_date;
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(log);
    });
    return grouped;
  }, [workoutLogs]);

  // Group appointments by date
  const appointmentsByDate = useMemo(() => {
    const grouped: Record<string, CalendarAppointment[]> = {};
    appointments.forEach((apt) => {
      if (!grouped[apt.date]) grouped[apt.date] = [];
      grouped[apt.date].push(apt);
    });
    return grouped;
  }, [appointments]);

  // Group busy slots by date
  const busySlotsByDate = useMemo(() => {
    const grouped: Record<string, GoogleBusySlot[]> = {};
    googleBusySlots.forEach((slot) => {
      if (!grouped[slot.date]) grouped[slot.date] = [];
      grouped[slot.date].push(slot);
    });
    return grouped;
  }, [googleBusySlots]);

  // Get days based on view
  const days = useMemo(() => {
    if (view === "month") {
      const start = startOfMonth(currentDate);
      const end = endOfMonth(currentDate);
      const monthDays = eachDayOfInterval({ start, end });

      // Pad to Monday start
      let startDay = getDay(start);
      startDay = startDay === 0 ? 6 : startDay - 1;
      const paddingDays: (Date | null)[] = Array(startDay).fill(null);

      return [...paddingDays, ...monthDays];
    } else {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return eachDayOfInterval({ start, end });
    }
  }, [currentDate, view]);

  const handlePrev = () => {
    if (view === "month") {
      onDateChange(subMonths(currentDate, 1));
    } else {
      onDateChange(subWeeks(currentDate, 1));
    }
  };

  const handleNext = () => {
    if (view === "month") {
      onDateChange(addMonths(currentDate, 1));
    } else {
      onDateChange(addWeeks(currentDate, 1));
    }
  };

  const handleToday = () => {
    onDateChange(new Date());
    onDateSelect(new Date());
  };

  // Title based on view
  const title = useMemo(() => {
    if (view === "month") {
      return format(currentDate, "MMMM yyyy", { locale: it });
    } else {
      const start = startOfWeek(currentDate, { weekStartsOn: 1 });
      const end = endOfWeek(currentDate, { weekStartsOn: 1 });
      return `${format(start, "d MMM", { locale: it })} - ${format(end, "d MMM yyyy", { locale: it })}`;
    }
  }, [currentDate, view]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-4 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Periodo precedente"
            className="h-9 w-9"
            onClick={handlePrev}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <h2 className="text-lg font-bold capitalize min-w-[220px] text-center">{title}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Periodo successivo"
            className="h-9 w-9"
            onClick={handleNext}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday} className="ml-2">
            Oggi
          </Button>
        </div>

        <div className="flex items-center gap-4">
          {/* Google Calendar Toggle */}
          <div className="flex items-center gap-2">
            <Switch
              checked={showGoogleEvents}
              onCheckedChange={onToggleGoogleEvents}
              id="google-events"
            />
            <label htmlFor="google-events" className="text-sm text-muted-foreground cursor-pointer">
              Mostra Google Calendar
            </label>
          </div>

          {/* View Toggle */}
          <Tabs value={view} onValueChange={(v) => onViewChange(v as "month" | "week")}>
            <TabsList className="h-9">
              <TabsTrigger value="month" className="text-xs px-4">
                Mese
              </TabsTrigger>
              <TabsTrigger value="week" className="text-xs px-4">
                Settimana
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {/* Calendar Content */}
      <div className="flex-1 overflow-auto pt-4">
        {view === "month" && (
          <>
            {/* Weekday Headers — Aura, LUN..DOM uppercase */}
            <div className="grid grid-cols-7 gap-3 mb-3">
              {WEEKDAYS.map((day) => (
                <div
                  key={day}
                  className="text-center text-3xs font-bold uppercase tracking-widest text-on-surface-variant py-2"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Month Grid — 5-week matrix, gap-3 per DESIGN.md spacing */}
            <div className="grid grid-cols-7 gap-3 auto-rows-fr">
              {days.map((day, idx) => {
                // Bounds safety: `days` may carry leading `null` placeholders
                // when the month doesn't start on Monday. Render an inert
                // spacer so the 7-col matrix stays aligned without a key
                // collision on subsequent renders.
                if (!day) {
                  return <div key={`empty-${idx}`} className="min-h-[140px]" aria-hidden />;
                }

                const dateKey = format(day, "yyyy-MM-dd");
                const dayWorkouts = workoutsByDate[dateKey] || [];
                const dayAppointments = appointmentsByDate[dateKey] || [];
                const dayBusySlots = busySlotsByDate[dateKey] || [];

                return (
                  <DroppableDayCell
                    key={dateKey}
                    date={day}
                    isSelected={isSameDay(day, selectedDate)}
                    isCurrentMonth={isSameMonth(day, currentDate)}
                    isTodayDate={isToday(day)}
                    workouts={dayWorkouts}
                    appointments={dayAppointments}
                    busySlots={dayBusySlots}
                    showGoogleEvents={showGoogleEvents}
                    onClick={() => onDateSelect(day)}
                    onDeleteWorkout={onDeleteWorkout}
                    isDeletingWorkout={isDeletingWorkout}
                  />
                );
              })}
            </div>
          </>
        )}

        {view === "week" && (
          <ScrollArea className="h-full">
            <div className="border border-border/30 rounded-xl overflow-hidden">
              {(days as Date[]).map((day) => {
                const dateKey = format(day, "yyyy-MM-dd");
                const dayWorkouts = workoutsByDate[dateKey] || [];
                const dayAppointments = appointmentsByDate[dateKey] || [];
                const dayBusySlots = busySlotsByDate[dateKey] || [];

                return (
                  <WeekViewRow
                    key={dateKey}
                    date={day}
                    workouts={dayWorkouts}
                    appointments={dayAppointments}
                    busySlots={dayBusySlots}
                    showGoogleEvents={showGoogleEvents}
                    isSelected={isSameDay(day, selectedDate)}
                    onClick={() => onDateSelect(day)}
                    onDeleteWorkout={onDeleteWorkout}
                    isDeletingWorkout={isDeletingWorkout}
                  />
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 pt-3 border-t border-border/50 text-2xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-primary" />
          <span>Scheduled</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-success" />
          <span>Completed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-destructive" />
          <span>Missed</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-2 w-2 rounded-full bg-emerald-500" />
          <span>Appointments</span>
        </div>
        {showGoogleEvents && (
          <div className="flex items-center gap-1.5">
            <div className="h-2 w-2 rounded-full bg-muted-foreground/60" />
            <span>Google Busy</span>
          </div>
        )}
      </div>
    </div>
  );
}
