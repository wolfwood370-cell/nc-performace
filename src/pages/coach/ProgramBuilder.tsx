/**
 * ProgramBuilder (V2)
 * ---------------------------------------------------------------------------
 * Coach-facing builder wired to the new periodized engine
 * (`useAdvancedProgramStore` → ProgramBlock → Microcycle → Session →
 * ProgrammedExercise → ProgrammedSet).
 *
 * Layout (desktop-first; horizontal scroll is acceptable on small screens):
 *
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │  Header: block name · goal · meta                            │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  ◀  Macro-Timeline (horizontal scroll, one card per week)  ▶ │
 *   ├─────────────────────────────────────────────────────────────┤
 *   │  Week Grid: Session 1 │ Session 2 │ Session 3 │ Session 4   │
 *   │             (vertical columns of exercise cards)              │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * State ownership: this page owns ONLY `selectedWeekId` (a UI concern).
 * All program data lives in the Zustand store and is mutated via store
 * actions. We deliberately do NOT mirror store data into local state.
 *
 * Out of scope for this iteration (per task brief):
 *   - Real exercise library selector (uses a mock for now)
 *   - Set-level editing UI
 *   - Save / persistence wiring
 *   - Athlete assignment
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { CoachLayout } from "@/components/coach/CoachLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  Plus,
  Calendar,
  Target,
  Layers,
  Dumbbell,
  Save,
  Loader2,
  Copy,
  Send,
  Lock,
  User,
  BookmarkPlus,
  Activity,
} from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useShallow } from "zustand/shallow";
import { toast } from "sonner";

import { useAdvancedProgramStore } from "@/stores/useAdvancedProgramStore";
import { ExerciseLibraryDrawer } from "@/components/coach/program/ExerciseLibraryDrawer";
import { GenerateAiWeekDialog } from "@/components/coach/program/GenerateAiWeekDialog";
import { ProgrammedExerciseCard } from "@/components/coach/program/ProgrammedExerciseCard";
import { ProgressionInspector } from "@/components/coach/program/ProgressionInspector";
import { FeatureGate } from "@/components/common/FeatureGate";
import { useSaveProgramBlock, SaveProgramBlockError } from "@/hooks/useSaveProgramBlock";
import { useAuth } from "@/hooks/useAuth";
import { COACH_ROSTER_QUERY_OPTS } from "@/lib/coachQueries";
import { useAthleteRiskAnalysis } from "@/hooks/useAthleteRiskAnalysis";
import { useActiveProgramsCount } from "@/hooks/useActiveProgramsCount";
import { supabase } from "@/integrations/supabase/client";
import type { ExerciseInfo, ExerciseRiskAssessment } from "@/lib/math/fmsRiskEngine";
import type { Microcycle, Session, UUID } from "@/types/training";

// ---------------------------------------------------------------------------
// Constants & helpers
// ---------------------------------------------------------------------------

/**
 * Default scaffold used when the page mounts with no active block.
 * Matches typical block-periodization defaults: 4-week mesocycle, 4 sessions
 * per week. Coaches can resize / rename later.
 */
const DEFAULT_BLOCK = {
  name: "New Training Block",
  weeksCount: 4,
  sessionsPerWeek: 4,
} as const;

/**
 * Coach-facing labels for the first few microcycles in a classical linear
 * mesocycle. Beyond the prebaked range we fall back to "Week N". These are
 * purely cosmetic — the underlying data has no notion of accumulation /
 * intensification (yet); that lives in the coach's mental model.
 */
const WEEK_PHASE_LABELS = ["Accumulation", "Intensification", "Realization", "Deload"] as const;

/**
 * Inline hook: fetch the authenticated coach's athletes from the
 * `profiles` table. Kept local to the page since this is the only
 * consumer for now; will be promoted to a shared hook if a second
 * caller appears.
 */
function useCoachAthletes() {
  const { user, profile } = useAuth();
  return useQuery({
    queryKey: ["coach-athletes-roster", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name")
        .eq("coach_id", user.id)
        .eq("role", "athlete")
        .order("full_name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; full_name: string | null }>;
    },
    enabled: !!user && profile?.role === "coach",
    ...COACH_ROSTER_QUERY_OPTS,
  });
}

const weekPhaseLabel = (week: Microcycle): string => {
  if (week.is_deload) return "Deload";
  // `order` is 1-indexed in the V2 model.
  const idx = week.order - 1;
  return WEEK_PHASE_LABELS[idx] ?? `Week ${week.order}`;
};

// Note: a previous scaffold defined `buildMockExercise` here (with a
// `mockExerciseCounter` module-scope counter) for early smoke-testing
// of the program builder grid. The function was never wired into any
// call site once the real ExerciseLibraryDrawer landed, so it sat as
// dead code surfaced by the audit (B7 / M3 zone). Removed in PR17.

// ---------------------------------------------------------------------------
// Subcomponent: WeekTimelineCard
// ---------------------------------------------------------------------------

/**
 * A single selectable week tile inside the Macro-Timeline. Kept narrow
 * (~160px) so a 12-week mesocycle fits inside a 1280px viewport without
 * scroll, but wide enough to show both the phase label and exercise count.
 */
interface WeekTimelineCardProps {
  week: Microcycle;
  isActive: boolean;
  onSelect: () => void;
}

function WeekTimelineCard({ week, isActive, onSelect }: WeekTimelineCardProps) {
  // Total prescribed exercises across all sessions in this week. Useful as
  // a glance metric: empty weeks visually fade vs. populated ones.
  const exerciseCount = useMemo(
    () => week.sessions.reduce((sum, s) => sum + s.exercises.length, 0),
    [week.sessions],
  );

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "group relative flex h-[88px] w-[160px] shrink-0 flex-col justify-between rounded-lg border p-3 text-left transition-all",
        "hover:border-primary/50 hover:shadow-sm",
        isActive
          ? "border-primary bg-primary/5 shadow-sm ring-1 ring-primary/40"
          : "border-border/60 bg-card",
        // Visually muted state for empty weeks — coach attention should
        // gravitate toward weeks that already have prescribed work.
        exerciseCount === 0 && !isActive && "opacity-70",
      )}
      aria-pressed={isActive}
      aria-label={`Week ${week.order}: ${weekPhaseLabel(week)}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-3xs font-medium uppercase tracking-wide text-muted-foreground">
            Week {week.order}
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold leading-tight">
            {weekPhaseLabel(week)}
          </p>
        </div>
        {week.is_deload && (
          <Badge
            variant="outline"
            className="h-4 shrink-0 border-sky-500/40 px-1 text-4xs text-sky-600 dark:text-sky-400"
          >
            Deload
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-1.5 text-3xs text-muted-foreground">
        <Dumbbell className="h-3 w-3" />
        <span className="tabular-nums">
          {exerciseCount} {exerciseCount === 1 ? "exercise" : "exercises"}
        </span>
        <span className="text-muted-foreground/50">·</span>
        <span className="tabular-nums">{week.sessions.length}d</span>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Subcomponent: SessionColumn
// ---------------------------------------------------------------------------

/**
 * One vertical column representing a single training day. The "+ Add
 * Exercise" button opens the ExerciseLibraryDrawer; each programmed
 * exercise is rendered with the inline ProgrammedExerciseCard which writes
 * directly to the store.
 */
interface SessionColumnProps {
  weekId: UUID;
  session: Session;
  /**
   * Optional risk-checker injected from the page. Closes over the
   * cached FMS assessment for the assigned athlete; safe to call before
   * data lands (returns a low-risk verdict with `unknown_assessment`).
   */
  checkExercise?: (exercise: ExerciseInfo) => ExerciseRiskAssessment;
  /** Athlete the program is assigned to — threaded to the FMS badge. */
  athleteId?: string | null;
}

function SessionColumn({ weekId, session, checkExercise, athleteId }: SessionColumnProps) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const removeExercise = useAdvancedProgramStore((s) => s.removeExercise);

  return (
    <div className="flex h-full w-[260px] shrink-0 flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      {/* Column header */}
      <div className="flex items-baseline justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-tight">{session.name}</p>
          {session.focus && (
            <p className="truncate text-3xs uppercase tracking-wide text-muted-foreground">
              {session.focus}
            </p>
          )}
        </div>
        <Badge variant="secondary" className="h-4 shrink-0 px-1.5 text-3xs tabular-nums">
          {session.exercises.length}
        </Badge>
      </div>

      <Separator className="bg-border/40" />

      {/* Exercise list */}
      <div className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {session.exercises.length === 0 ? (
          <p className="px-1 py-3 text-center text-2xs italic text-muted-foreground/70">
            No exercises yet
          </p>
        ) : (
          session.exercises.map((ex) => (
            <ProgrammedExerciseCard
              key={ex.id}
              weekId={weekId}
              sessionId={session.id}
              exercise={ex}
              onRemove={() => removeExercise(weekId, session.id, ex.id)}
              checkExercise={checkExercise}
              athleteId={athleteId}
            />
          ))
        )}
      </div>

      {/* Add button — opens the exercise library drawer */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setLibraryOpen(true)}
        className="h-8 w-full justify-center gap-1.5 border border-dashed border-border/60 text-xs text-muted-foreground hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Exercise
      </Button>

      <ExerciseLibraryDrawer
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        weekId={weekId}
        sessionId={session.id}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page component
// ---------------------------------------------------------------------------

export default function ProgramBuilder() {
  // -------------------------------------------------------------------------
  // Store wiring
  // -------------------------------------------------------------------------

  // Read the active block. We pull it as a single value (rather than
  // destructuring nested fields) because zustand+immer returns stable
  // references for unchanged subtrees — re-renders are already minimal.
  const block = useAdvancedProgramStore((s) => s.block);

  // Actions are grouped via useShallow so the function-identity object
  // doesn't churn on every state change.
  const { initializeBlock } = useAdvancedProgramStore(
    useShallow((s) => ({
      initializeBlock: s.initializeBlock,
    })),
  );

  // -------------------------------------------------------------------------
  // Live coach roster + FMS risk hook for the assigned athlete.
  // -------------------------------------------------------------------------

  const { data: athletesRoster = [], isLoading: athletesLoading } = useCoachAthletes();

  const assignedAthleteId = block?.athlete_id ?? null;
  const { checkExercise } = useAthleteRiskAnalysis(assignedAthleteId);

  // Premium gating: count the coach's other published programs to enforce the
  // `max_active_programs` limit on Publish (excludes the block being edited so
  // re-publishing an existing program never counts against itself).
  const navigate = useNavigate();
  const { count: activeProgramsCount, isLoading: programsCountLoading } = useActiveProgramsCount(
    block?.id,
  );

  // -------------------------------------------------------------------------
  // Local UI state — selected week (a pure view concern)
  // -------------------------------------------------------------------------

  const [selectedWeekId, setSelectedWeekId] = useState<UUID | null>(null);

  // -------------------------------------------------------------------------
  // Lifecycle: scaffold an empty block on first mount if none exists.
  // -------------------------------------------------------------------------

  // We don't yet have a "load by id" flow (that lands when persistence
  // wiring is built). For now, mounting the page with no block scaffolds a
  // 4×4 default so the grid has something to render. This keeps the UI
  // exercise-able in isolation.
  useEffect(() => {
    if (!block) {
      initializeBlock({
        name: DEFAULT_BLOCK.name,
        weeksCount: DEFAULT_BLOCK.weeksCount,
        sessionsPerWeek: DEFAULT_BLOCK.sessionsPerWeek,
      });
    }
  }, [block, initializeBlock]);

  // Keep `selectedWeekId` in sync with the block: default to the first
  // week, and recover gracefully if the selected week was removed.
  useEffect(() => {
    if (!block || block.weeks.length === 0) {
      if (selectedWeekId !== null) setSelectedWeekId(null);
      return;
    }
    const stillExists = block.weeks.some((w) => w.id === selectedWeekId);
    if (!stillExists) {
      setSelectedWeekId(block.weeks[0].id);
    }
  }, [block, selectedWeekId]);

  // -------------------------------------------------------------------------
  // Derived data
  // -------------------------------------------------------------------------

  const selectedWeek: Microcycle | undefined = useMemo(
    () => block?.weeks.find((w) => w.id === selectedWeekId),
    [block, selectedWeekId],
  );

  // -------------------------------------------------------------------------
  // Save mutation
  // -------------------------------------------------------------------------

  const { saveBlock, isPending: isSaving } = useSaveProgramBlock();

  const runSave = useCallback(
    async (status: "draft" | "published") => {
      if (!block) return;
      try {
        await saveBlock({ block, status });
        if (status === "published") {
          toast.success("Program published", {
            description: `"${block.name}" is now live for the assigned athlete.`,
          });
        } else {
          toast.success("Program saved", {
            description: `"${block.name}" is up to date.`,
          });
        }
      } catch (e) {
        const message =
          e instanceof SaveProgramBlockError
            ? e.message
            : "Unexpected error while saving the program.";
        toast.error(status === "published" ? "Publish failed" : "Save failed", {
          description: message,
        });
      }
    },
    [block, saveBlock],
  );

  const handleSave = useCallback(() => runSave("draft"), [runSave]);
  const handlePublish = useCallback(() => runSave("published"), [runSave]);

  // -------------------------------------------------------------------------
  // Athlete assignment — patches `athlete_id` directly on the active block.
  // We use `setState` so we don't have to extend the store API for a
  // single-field write.
  // -------------------------------------------------------------------------

  const handleAssignAthlete = useCallback((athleteId: string) => {
    useAdvancedProgramStore.setState((state) => {
      if (!state.block) return;
      state.block.athlete_id = athleteId;
      state.isDirty = true;
    });
  }, []);

  // -------------------------------------------------------------------------
  // Duplicate previous week into the currently-selected week.
  // -------------------------------------------------------------------------

  const duplicateWeek = useAdvancedProgramStore((s) => s.duplicateWeek);

  const previousWeek: Microcycle | undefined = useMemo(() => {
    if (!block || !selectedWeek) return undefined;
    if (selectedWeek.order <= 1) return undefined;
    return block.weeks.find((w) => w.order === selectedWeek.order - 1);
  }, [block, selectedWeek]);

  const handleCopyFromPrevious = useCallback(() => {
    if (!previousWeek || !selectedWeek) return;
    duplicateWeek(previousWeek.id, selectedWeek.id);
    toast.success("Week duplicated", {
      description: `Copied Week ${previousWeek.order} into Week ${selectedWeek.order}.`,
    });
  }, [duplicateWeek, previousWeek, selectedWeek]);

  // Aggregate metrics — only deload count is still used here (in the
  // wave visualizer header). Block totals moved into ProgressionInspector.
  // Must be declared BEFORE the early return below to keep hook count stable
  // across the null-block → ready-block transition.
  const deloadCount = useMemo(
    () => (block?.weeks ?? []).filter((w) => w.is_deload).length,
    [block?.weeks],
  );

  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------
  // (Add-exercise wiring now lives inside SessionColumn via the drawer.)

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Loading shim: the init effect runs synchronously on the next tick, so
  // this branch is only hit for one frame. Still — render *something*
  // rather than crashing on the null block.
  if (!block) {
    return (
      <CoachLayout title="Program Builder" subtitle="Initializing…">
        <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      </CoachLayout>
    );
  }

  return (
    <CoachLayout title="Program Builder" subtitle="Design periodized training blocks">
      {/* ═══ Outer split shell — Aura full-screen viewport ═══
          DESIGN.md spec: h-[calc(100vh-2rem)] flex overflow-hidden p-4
          gap-6 bg-surface. The page hosts (1) a flexible main canvas with
          the macro-timeline + sessions and (2) a fixed-width Progression
          Inspector sidebar on the right. */}
      <div className="h-[calc(100vh-2rem)] flex overflow-hidden p-4 gap-6 bg-surface font-sans">
        {/* ═══ MAIN COLUMN — header + timeline + week grid ═══ */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden rounded-3xl bg-surface-container-lowest border border-outline-variant/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          {/* ── Sticky Header (Aura sub-bar) ── */}
          <header className="sticky top-0 z-10 flex-shrink-0 px-6 py-5 border-b border-outline-variant/15 bg-surface-container-lowest/95 backdrop-blur-md">
            {/* Row 1 — Template badge + global actions */}
            <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
              <div className="min-w-0 flex-1">
                {/* Macrocycle title badge — pill chip with the active block name */}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container/15 text-primary px-3 py-1 text-xs font-bold mb-2">
                  <Layers className="h-3.5 w-3.5" />
                  Template: {block.name}
                </span>
                <h1 className="font-display text-headline-md font-bold text-on-surface tracking-tight truncate">
                  {block.name}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-on-surface-variant">
                  <span className="inline-flex items-center gap-1">
                    <Target className="h-3 w-3" />
                    {block.goal}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Layers className="h-3 w-3" />
                    <span className="tabular-nums">{block.weeks.length}</span> settimane
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    Inizio {block.start_date}
                  </span>
                </div>
              </div>

              {/* Pill action controls (Aura rounded-full) */}
              <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                {/* Athlete assignment */}
                <Select
                  value={block.athlete_id || undefined}
                  onValueChange={handleAssignAthlete}
                  disabled={athletesLoading}
                >
                  <SelectTrigger className="h-9 w-[200px] text-xs gap-2">
                    <User className="h-3.5 w-3.5 text-on-surface-variant" />
                    <SelectValue
                      placeholder={athletesLoading ? "Caricamento…" : "Assegna atleta…"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {athletesRoster.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-on-surface-variant">
                        Nessun atleta.
                      </div>
                    ) : (
                      athletesRoster.map((a) => (
                        <SelectItem key={a.id} value={a.id} className="text-xs">
                          {a.full_name ?? "Atleta"}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>

                {/* Clona Settimana — pill outline, replicates previous week into current */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleCopyFromPrevious}
                  disabled={!previousWeek || !selectedWeek}
                  className="gap-2"
                  title={
                    !previousWeek
                      ? "Disponibile dalla seconda settimana"
                      : `Sostituisce Settimana ${selectedWeek?.order} con copia di Settimana ${previousWeek.order}`
                  }
                >
                  <Copy className="h-4 w-4" />
                  Clona Settimana
                </Button>

                {/* Genera Settimana IA — invoca generate-program e rimpiazza la
                    settimana selezionata col risultato mappato. */}
                <GenerateAiWeekDialog
                  athleteId={block.athlete_id || undefined}
                  weekId={selectedWeekId}
                  weekOrder={selectedWeek?.order}
                  daysPerWeek={selectedWeek?.sessions.length ?? 0}
                />

                {/* Salva nei Template — pill outline, placeholder until template lib lands */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    toast.info("Libreria template in arrivo", {
                      description: "Salverà il blocco corrente come template riutilizzabile.",
                    })
                  }
                  className="gap-2"
                >
                  <BookmarkPlus className="h-4 w-4" />
                  Salva nei Template
                </Button>

                {/* Save draft (primary pill — workhorse) */}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="gap-2"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                  {isSaving ? "Salvataggio…" : "Salva Bozza"}
                </Button>

                {/* Publish (primary CTA) — gated by max_active_programs */}
                <FeatureGate
                  feature="max_active_programs"
                  current={activeProgramsCount}
                  fallback={
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => navigate("/coach/business")}
                      className="gap-2"
                      title="Limite di programmi attivi raggiunto per il tuo piano — passa a un piano superiore per pubblicarne altri"
                    >
                      <Lock className="h-4 w-4" />
                      Limite piano
                    </Button>
                  }
                >
                  <Button
                    type="button"
                    size="sm"
                    onClick={handlePublish}
                    disabled={isSaving || !block.athlete_id || programsCountLoading}
                    className="gap-2"
                    title={
                      !block.athlete_id
                        ? "Assegna un atleta prima di pubblicare"
                        : "Pubblica il programma"
                    }
                  >
                    <Send className="h-4 w-4" />
                    Pubblica
                  </Button>
                </FeatureGate>
              </div>
            </div>

            {/* ── Volume/Intensity wave visualizer ──
                Compact horizontal bar that tracks Accumulo vs Deload steps
                across the macrocycle. Each week renders a vertical column
                whose height represents prescribed exercise count (proxy
                for volume) and whose opacity reflects the wave position
                (deload = lower alpha, peak intensification = stronger). */}
            <section aria-label="Andamento volume/intensità" className="space-y-1.5">
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider text-3xs">
                  <Activity className="h-3 w-3 text-primary" />
                  Onda Volume · Intensità
                </span>
                <span className="text-3xs">
                  {block.weeks.length} microcicli · {deloadCount} deload
                </span>
              </div>
              <VolumeIntensityWave
                weeks={block.weeks}
                selectedWeekId={selectedWeekId}
                onSelect={setSelectedWeekId}
              />
            </section>
          </header>

          {/* ── Macro-Timeline — horizontal strip of week cards ── */}
          <section
            aria-label="Macro-cycle timeline"
            className="flex-shrink-0 border-b border-outline-variant/15"
          >
            <ScrollArea className="w-full">
              <div className="flex gap-2 px-6 py-3">
                {block.weeks.map((week) => (
                  <WeekTimelineCard
                    key={week.id}
                    week={week}
                    isActive={week.id === selectedWeekId}
                    onSelect={() => setSelectedWeekId(week.id)}
                  />
                ))}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>

          {/* ── Week Grid — vertical session columns (horizontal scroll) ── */}
          <section
            aria-label={`Settimana ${selectedWeek?.order ?? ""} · sessioni`}
            className="flex-1 min-h-0 flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 px-6 py-3 border-b border-outline-variant/10">
              <div className="flex items-baseline gap-2">
                <h2 className="font-display text-label-md font-bold text-on-surface">
                  Settimana {selectedWeek?.order ?? "—"}
                </h2>
                {selectedWeek && (
                  <span className="text-xs text-on-surface-variant">
                    · {weekPhaseLabel(selectedWeek)}
                  </span>
                )}
              </div>
              <span className="text-3xs text-on-surface-variant tabular-nums">
                {selectedWeek?.sessions.length ?? 0} sessioni
              </span>
            </div>

            <ScrollArea className="flex-1 overflow-x-auto">
              <div className="flex h-full min-h-[400px] gap-3 p-6">
                {selectedWeek?.sessions.length ? (
                  selectedWeek.sessions.map((session) => (
                    <SessionColumn
                      key={session.id}
                      weekId={selectedWeek.id}
                      session={session}
                      checkExercise={assignedAthleteId ? checkExercise : undefined}
                      athleteId={assignedAthleteId}
                    />
                  ))
                ) : (
                  <div className="flex flex-1 items-center justify-center text-sm text-on-surface-variant">
                    Nessuna sessione in questa settimana.
                  </div>
                )}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </section>
        </main>

        {/* ═══ RIGHT SIDEBAR — Progression Inspector ═══
            Wired to the Zustand `selectedContext` (set by clicking an
            exercise card in the day grid). The component handles its own
            surface, scroll, and CTA — we just place it. */}
        <ProgressionInspector />
      </div>
    </CoachLayout>
  );
}

// ===========================================================================
// VolumeIntensityWave — compact horizontal sparkline
// ===========================================================================
function VolumeIntensityWave({
  weeks,
  selectedWeekId,
  onSelect,
}: {
  weeks: Microcycle[];
  selectedWeekId: UUID | null;
  onSelect: (id: UUID) => void;
}) {
  // Volume proxy: total prescribed exercises across the week. The maximum
  // across the block normalises the bar height so the chart fits the row.
  const counts = weeks.map((w) => w.sessions.reduce((n, s) => n + s.exercises.length, 0));
  const max = Math.max(1, ...counts);

  return (
    <div className="flex items-end gap-1 h-12">
      {weeks.map((week, idx) => {
        const ratio = counts[idx] / max;
        // Alpha-calibrated opacity: deload weeks fade out (40%), regular
        // weeks gradient from 60% → 100% based on relative volume.
        const opacity = week.is_deload ? 0.4 : Math.max(0.55, ratio);
        const heightPct = Math.max(15, ratio * 100);
        const isActive = week.id === selectedWeekId;
        return (
          <button
            key={week.id}
            type="button"
            onClick={() => onSelect(week.id)}
            aria-label={`Settimana ${week.order} · ${weekPhaseLabel(week)}`}
            aria-pressed={isActive}
            title={`Settimana ${week.order} · ${counts[idx]} esercizi · ${weekPhaseLabel(week)}`}
            className={cn(
              "flex-1 min-w-[16px] rounded-t-md transition-all hover:scale-105",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
              week.is_deload ? "bg-sky-500" : "bg-primary",
              isActive && "ring-2 ring-primary ring-offset-1 ring-offset-surface-container-lowest",
            )}
            style={{ height: `${heightPct}%`, opacity }}
          />
        );
      })}
    </div>
  );
}
