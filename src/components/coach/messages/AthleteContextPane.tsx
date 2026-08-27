/**
 * src/components/coach/messages/AthleteContextPane.tsx
 * ---------------------------------------------------------------------------
 * Aura Health System — Column 3 (Right) of the messages workspace.
 *
 * Layout contract (DESIGN.md + Stitch reference):
 *   - Fixed w-80 sized container. On desktop the rounded-3xl card surface
 *     + ambient shadow is owned by the PARENT (CoachMessages 3-column
 *     layout). On mobile we still render a self-contained card with the
 *     same shape so the slide-in feels intentional.
 *   - Three primary "biometric tiles" (layout from the Stitch spec, values
 *     honest — absent data renders as absent, never as a mock number):
 *       A) Active Periodization — not wired to a source on this surface
 *          yet → renders "—"
 *       B) Internal Training Load — ACWR is not computed on this surface
 *          yet → renders "—" (no judgment badge on a missing value)
 *       C) Recovery Context — circular SVG ring with the live check-in
 *          readiness score; without a check-in the ring stays empty
 *   - Three additional live tiles preserved from the previous version
 *     (Upcoming workouts · Last workout · Weekly compliance) so we
 *     don't sacrifice information density.
 *   - Sticky footer button: outline pill "Vedi Scheda Allenamento
 *     Completa" → navigate to the athlete's training tab.
 *
 * State + hooks preserved 1:1:
 *   - useQuery workout-context (last completed, next scheduled, week
 *     compliance, upcoming 3-day window).
 *   - useQuery daily readiness (latest 7 days).
 *   - useAuth for the athlete-id derivation logic (other participant).
 */
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { format, startOfWeek, endOfWeek, addDays } from "date-fns";
import { it } from "date-fns/locale";
import {
  X,
  Calendar,
  Dumbbell,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Activity,
  Flame,
  HeartPulse,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import type { ChatRoom } from "@/hooks/useChatRooms";
import { useAuth } from "@/hooks/useAuth";
import { formatDurataSeduta } from "@/lib/format/durataSeduta";

interface AthleteContextPaneProps {
  room: ChatRoom | null;
  isOpen: boolean;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Tile shell — single source of truth for the biometric block style
// ---------------------------------------------------------------------------
const TILE = "rounded-2xl bg-surface-container-low p-4";

export function AthleteContextPane({ room, isOpen, onClose }: AthleteContextPaneProps) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // Athlete id derivation (preserved 1:1)
  const athleteId =
    room?.type === "direct" ? room.participants.find((p) => p.user_id !== user?.id)?.user_id : null;
  const athleteProfile = room?.participants.find((p) => p.user_id === athleteId)?.profile;

  // ── Workout context query (preserved) ──────────────────────────────────
  const { data: workoutData, isLoading: workoutsLoading } = useQuery({
    queryKey: ["athlete-context-workouts", athleteId],
    queryFn: async () => {
      if (!athleteId) return null;
      const today = new Date();
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      const nextThreeDays = addDays(today, 3);

      const { data: lastCompleted } = await supabase
        .from("workout_logs")
        .select("id, scheduled_date, completed_at, srpe, duration_seconds, workout:workouts(title)")
        .eq("athlete_id", athleteId)
        .eq("status", "completed")
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      const { data: weekWorkouts } = await supabase
        .from("workout_logs")
        .select("id, status, scheduled_date")
        .eq("athlete_id", athleteId)
        .gte("scheduled_date", format(weekStart, "yyyy-MM-dd"))
        .lte("scheduled_date", format(weekEnd, "yyyy-MM-dd"));

      const { data: upcomingWorkouts } = await supabase
        .from("workout_logs")
        .select("id, scheduled_date, workout:workouts(title)")
        .eq("athlete_id", athleteId)
        .eq("status", "scheduled")
        .gte("scheduled_date", format(today, "yyyy-MM-dd"))
        .lte("scheduled_date", format(nextThreeDays, "yyyy-MM-dd"))
        .order("scheduled_date", { ascending: true });

      const total = weekWorkouts?.length || 0;
      const completed = weekWorkouts?.filter((w) => w.status === "completed").length || 0;
      // Date-only comparison: a workout scheduled for TODAY is still doable,
      // not "missed" — comparing against the clock overcounted it all day.
      const todayIso = format(today, "yyyy-MM-dd");
      const missed =
        weekWorkouts?.filter((w) => w.status === "scheduled" && w.scheduled_date < todayIso)
          .length || 0;

      // Narrow the loosely-typed embedded relation locally.
      const titleOf = (row: { workout?: { title?: string | null } | null } | null): string =>
        row?.workout?.title ?? "Allenamento";

      return {
        lastCompleted: lastCompleted
          ? { ...lastCompleted, workoutTitle: titleOf(lastCompleted) }
          : null,
        upcoming: upcomingWorkouts?.map((w) => ({ ...w, workoutTitle: titleOf(w) })) || [],
        compliance: {
          total,
          completed,
          missed,
          percentage: total > 0 ? Math.round((completed / total) * 100) : 0,
        },
      };
    },
    enabled: !!athleteId && isOpen,
  });

  // ── Readiness query (preserved) ────────────────────────────────────────
  const { data: readinessData, isLoading: readinessLoading } = useQuery({
    queryKey: ["athlete-context-readiness", athleteId],
    queryFn: async () => {
      if (!athleteId) return null;
      const { data } = await supabase
        .from("daily_readiness")
        .select("date, score, energy, sleep_quality, mood")
        .eq("athlete_id", athleteId)
        .order("date", { ascending: false })
        .limit(7);
      return data || [];
    },
    enabled: !!athleteId && isOpen,
  });

  if (!room || room.type !== "direct") return null;

  const isLoading = workoutsLoading || readinessLoading;

  // ── Derived biometric values ───────────────────────────────────────────
  // Latest readiness score — daily_readiness.score is on a 0–100 scale
  // already (the athlete-side form clamps 1–10 then scales for storage).
  // No fallback: an absent check-in renders as absent, never as a number.
  // No qualitative label either — a score→label mapping is not a validated
  // method (same decision as the Training Hub glance card).
  const latestReadiness = readinessData?.[0]?.score ?? null;

  const initials =
    athleteProfile?.full_name
      ?.split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "U";

  // SVG circular ring math (r=42, circumference 2πr ≈ 264). The progress
  // arc is only drawn when a real score exists.
  const RING_CIRC = 264;
  const ringDash = latestReadiness != null ? (latestReadiness / 100) * RING_CIRC : 0;

  // Minutes are a VIEW of the one stored column (duration_seconds, A-02):
  // null when the datum is absent, so the JSX renders nothing — never «0 min».
  const durataUltimaSeduta = formatDurataSeduta(
    workoutData?.lastCompleted?.duration_seconds ?? null,
  );

  return (
    <div
      className={cn(
        // Mobile: fixed slide-in panel. Desktop: rely on the parent's
        // rounded-3xl card. The bg + radius below are duplicates of
        // the parent shell so the mobile drawer renders consistently.
        "h-full flex flex-col font-sans",
        "lg:relative lg:translate-x-0 lg:bg-transparent lg:rounded-none",
        "fixed inset-y-0 right-0 w-80 z-50 bg-surface-container-lowest rounded-3xl",
        "transform transition-transform duration-200 ease-in-out",
        isOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0",
      )}
    >
      {/* ── Header ── */}
      <header className="h-14 shrink-0 border-b border-outline-variant/20 flex items-center justify-between px-5">
        <h3 className="font-display text-label-md font-bold text-on-surface">Contesto Atleta</h3>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Chiudi"
          className="h-9 w-9 rounded-full lg:hidden"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
      </header>

      {/* ── Body (scrollable) ── */}
      <ScrollArea className="flex-1 custom-scrollbar">
        <div className="p-5 space-y-4">
          {/* Athlete identity */}
          <div className="text-center pb-2">
            <Avatar className="h-16 w-16 mx-auto mb-2 ring-2 ring-outline-variant/40 ring-offset-2 ring-offset-surface-container-lowest">
              <AvatarImage src={athleteProfile?.avatar_url || undefined} />
              <AvatarFallback className="text-lg font-bold bg-primary-container/15 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
            <h4 className="font-display text-label-md font-bold text-on-surface">
              {athleteProfile?.full_name || "Atleta"}
            </h4>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-20 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              {/* ═══ Block A — Active Periodization ═══ */}
              <section className={TILE} aria-label="Periodizzazione attiva">
                <div className="flex items-center gap-2 mb-2">
                  <Activity className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Periodizzazione Attiva
                  </p>
                </div>
                {/* This pane has no wired periodization source yet: the
                    absent phase renders as absent — never as mock copy. */}
                <p className="font-display text-base font-bold text-on-surface leading-snug">—</p>
              </section>

              {/* ═══ Block B — Internal Training Load (ACWR) ═══ */}
              <section className={TILE} aria-label="Carico interno">
                <div className="flex items-center gap-2 mb-2">
                  <Flame className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Carico Interno
                  </p>
                </div>
                {/* ACWR is not computed on this surface yet (the roster hook
                    aggregates it elsewhere): the absent value renders as
                    absent, with no judgment badge on top of a missing number.
                    Wiring the real aggregation here is a future slice. */}
                <div className="flex items-end justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs text-on-surface-variant mb-1">ACWR (acuto:cronico)</p>
                    <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-bold tabular-nums bg-surface-container-highest text-on-surface-variant">
                      —
                    </span>
                  </div>
                </div>
              </section>

              {/* ═══ Block C — Recovery Context (check-in readiness) ═══ */}
              <section
                className={cn(TILE, "flex flex-col items-center text-center")}
                aria-label="Prontezza da check-in"
              >
                <div className="flex items-center gap-2 self-start mb-3">
                  <HeartPulse className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Prontezza · Check-in
                  </p>
                </div>
                {/* SVG circular ring — custom vector, no charts lib needed.
                    The progress arc only exists when a real score does: an
                    empty ring is the honest render of a missing check-in. */}
                <div className="relative w-32 h-32">
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="42"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="8"
                      className="text-surface-container-highest"
                    />
                    {latestReadiness != null && (
                      <circle
                        cx="50"
                        cy="50"
                        r="42"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        strokeDasharray={`${ringDash} ${RING_CIRC}`}
                        className="text-primary"
                        style={{ transition: "stroke-dasharray 0.6s ease-out" }}
                      />
                    )}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {latestReadiness != null ? (
                      <span className="font-display text-2xl font-bold text-primary tabular-nums leading-none">
                        {Math.round(latestReadiness)}%
                      </span>
                    ) : (
                      <span className="font-display text-2xl font-bold text-on-surface-variant leading-none">
                        —
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-3xs text-on-surface-variant mt-3">
                  {latestReadiness != null
                    ? `Ultimo check-in: ${format(new Date(readinessData?.[0]?.date ?? new Date()), "d MMM", { locale: it })}`
                    : "Nessun check-in registrato"}
                </p>
              </section>

              {/* ── Live tiles (preserved as supplementary blocks) ── */}

              {/* Upcoming workouts */}
              <section className={TILE} aria-label="Prossimi allenamenti">
                <div className="flex items-center gap-2 mb-3">
                  <Calendar className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Prossimi Allenamenti
                  </p>
                </div>
                {workoutData?.upcoming.length === 0 ? (
                  <p className="text-xs text-on-surface-variant text-center py-2">
                    Nessun allenamento programmato.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {workoutData?.upcoming.map((workout) => (
                      <li
                        key={workout.id}
                        className="flex items-center gap-3 p-2 rounded-xl bg-surface-container-lowest border border-outline-variant/15"
                      >
                        <div className="h-9 w-9 rounded-xl bg-primary-container/15 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-primary tabular-nums">
                            {format(new Date(workout.scheduled_date), "d")}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-on-surface truncate">
                            {workout.workoutTitle}
                          </p>
                          <p className="text-3xs text-on-surface-variant capitalize">
                            {format(new Date(workout.scheduled_date), "EEEE", { locale: it })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Last completed workout */}
              <section className={TILE} aria-label="Ultimo allenamento">
                <div className="flex items-center gap-2 mb-3">
                  <Dumbbell className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Ultimo Allenamento
                  </p>
                </div>
                {!workoutData?.lastCompleted ? (
                  <p className="text-xs text-on-surface-variant text-center py-2">
                    Nessun allenamento completato.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-on-surface truncate">
                        {workoutData.lastCompleted.workoutTitle}
                      </span>
                      {/* Session rating from ITS column (srpe, CR-10).
                          Not declared → "—": absence stays readable, never
                          a fallback number (B-22). */}
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-3xs font-bold tabular-nums shrink-0",
                          workoutData.lastCompleted.srpe != null &&
                            workoutData.lastCompleted.srpe > 8
                            ? "bg-destructive/10 text-destructive"
                            : "bg-secondary text-secondary-foreground",
                        )}
                      >
                        {workoutData.lastCompleted.srpe != null &&
                          workoutData.lastCompleted.srpe > 8 && (
                            <AlertTriangle className="h-2.5 w-2.5" />
                          )}
                        RPE {workoutData.lastCompleted.srpe ?? "—"}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-3xs text-on-surface-variant">
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {format(
                          new Date(
                            workoutData.lastCompleted.completed_at ||
                              workoutData.lastCompleted.scheduled_date,
                          ),
                          "d MMM",
                          { locale: it },
                        )}
                      </span>
                      {durataUltimaSeduta !== null && (
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {durataUltimaSeduta}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </section>

              {/* Weekly compliance */}
              <section className={TILE} aria-label="Compliance settimanale">
                <div className="flex items-center gap-2 mb-3">
                  <TrendingUp className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Compliance Settimanale
                  </p>
                </div>
                {/* No `?? 0` fallbacks: an errored/absent query must render
                    as absence — "0/0 · 0 fatti" would read as a measured
                    empty week. */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-on-surface-variant">Completati</span>
                    <span className="font-bold text-on-surface tabular-nums">
                      {workoutData
                        ? `${workoutData.compliance.completed}/${workoutData.compliance.total}`
                        : "—"}
                    </span>
                  </div>
                  {workoutData && (
                    <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all duration-500"
                        style={{ width: `${workoutData.compliance.percentage}%` }}
                      />
                    </div>
                  )}
                  {workoutData && (
                    <div className="flex items-center gap-3 text-3xs">
                      <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-bold">
                        <CheckCircle2 className="h-3 w-3" />
                        {workoutData.compliance.completed} fatti
                      </span>
                      {workoutData.compliance.missed > 0 && (
                        <span className="flex items-center gap-1 text-destructive font-bold">
                          <AlertTriangle className="h-3 w-3" />
                          {workoutData.compliance.missed} saltati
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </section>
            </>
          )}
        </div>
      </ScrollArea>

      {/* ═══ Footer: full-width outline pill CTA ═══ */}
      <footer className="shrink-0 border-t border-outline-variant/20 p-4">
        <Button
          variant="outline"
          className="w-full rounded-full border-outline text-sm gap-2 group"
          disabled={!athleteId}
          onClick={() => {
            if (athleteId) navigate(`/coach/athlete/${athleteId}?tab=program`);
          }}
        >
          Vedi Scheda Allenamento Completa
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </footer>
    </div>
  );
}
