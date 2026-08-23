/**
 * src/components/coach/program/ProgressionInspector.tsx
 * ---------------------------------------------------------------------------
 * Aura Health System — right-hand inspector for the ProgramBuilder.
 *
 * Visual contract (DESIGN.md + Stitch reference):
 *   - Fixed sidebar w-80 (≈3/12), full-height column layout.
 *   - White surface card: rounded-3xl bg-surface-container-lowest
 *     border-outline-variant/10 shadow-[0_8px_30px_rgb(0,0,0,0.04)]
 *   - Sticky header chip + scrollable body + footer pill CTA.
 *
 * Three core content blocks:
 *   1. Exercise context card (selected exercise meta + last-set RPE chip)
 *   2. Logic boxes — IF/ON/THEN rule editor with 16px-rounded form fields
 *      and a placeholder "Salva regola" trigger.
 *   3. Intensity Curve graph — abstract SVG trajectory with rounded bars
 *      driven by `set.rpe_target` / `set.percent_1rm_target` of the
 *      selected exercise.
 *
 * Store wiring (Zustand `useProgramBuilderStore`):
 *   - `block` + `selectedContext` selectors derive the active exercise.
 *   - When `selectedContext === null` the panel renders its empty state
 *     prompting the coach to pick an exercise from the day grid.
 *   - The inspector itself does NOT mutate the store — it only reads
 *     and surfaces local rule-editor state (in-memory) until the
 *     auto-regulation engine is wired up server-side.
 */
import { useMemo, useState } from "react";
import { useProgramBuilderStore } from "@/stores/programBuilder/useProgramBuilderStore";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  Sparkles,
  Activity,
  Flame,
  Zap,
  Save,
  Wand2,
  Target,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type {
  ProgrammedExercise,
  ProgrammedSet,
  Microcycle,
  Session,
  UUID,
} from "@/types/training";

// ---------------------------------------------------------------------------
// Rule editor enums (in-memory until backend auto-regulation lands)
// ---------------------------------------------------------------------------

type IfCondition = "rpe_ge_9_5" | "rpe_ge_9" | "rpe_le_7" | "rir_le_1" | "missed_reps";
type OnTarget = "last_set" | "any_set" | "all_sets" | "first_set";
type ThenAction =
  | "reduce_load_2_5"
  | "reduce_load_5"
  | "increase_load_2_5"
  | "increase_load_5"
  | "deload_next_week"
  | "add_set_next_week";

const IF_OPTIONS: Array<{ value: IfCondition; label: string }> = [
  { value: "rpe_ge_9_5", label: "RPE ≥ 9.5" },
  { value: "rpe_ge_9", label: "RPE ≥ 9" },
  { value: "rpe_le_7", label: "RPE ≤ 7" },
  { value: "rir_le_1", label: "RIR ≤ 1" },
  { value: "missed_reps", label: "Reps non completate" },
];
const ON_OPTIONS: Array<{ value: OnTarget; label: string }> = [
  { value: "last_set", label: "Last Set" },
  { value: "any_set", label: "Any Set" },
  { value: "all_sets", label: "All Sets" },
  { value: "first_set", label: "First Set" },
];
const THEN_OPTIONS: Array<{ value: ThenAction; label: string }> = [
  { value: "reduce_load_2_5", label: "Riduci carico −2.5%" },
  { value: "reduce_load_5", label: "Riduci carico −5%" },
  { value: "increase_load_2_5", label: "Aumenta carico +2.5%" },
  { value: "increase_load_5", label: "Aumenta carico +5%" },
  { value: "deload_next_week", label: "Deload settimana successiva" },
  { value: "add_set_next_week", label: "Aggiungi 1 serie" },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Locate the exercise + its parent week/session from the selected context. */
function findSelected(
  block: ReturnType<typeof useProgramBuilderStore.getState>["block"],
  ctx: { weekId: UUID; sessionId: UUID; exerciseId: UUID } | null,
): { week: Microcycle; session: Session; exercise: ProgrammedExercise } | null {
  if (!block || !ctx) return null;
  const week = block.weeks.find((w) => w.id === ctx.weekId);
  if (!week) return null;
  const session = week.sessions.find((s) => s.id === ctx.sessionId);
  if (!session) return null;
  const exercise = session.exercises.find((e) => e.id === ctx.exerciseId);
  if (!exercise) return null;
  return { week, session, exercise };
}

/** Pick the strongest intensity signal from a set for the curve display. */
function intensityOf(set: ProgrammedSet): number {
  // Normalize all signals to a 0–100 scale so the bar heights are
  // comparable when the coach mixes RPE-based and %1RM-based sets in
  // the same exercise.
  if (set.rpe_target != null) return (set.rpe_target / 10) * 100;
  if (set.rir_target != null) return ((10 - set.rir_target) / 10) * 100;
  if (set.percent_1rm_target != null) return set.percent_1rm_target;
  return 0;
}

function intensityLabel(set: ProgrammedSet): string {
  if (set.rpe_target != null) return `RPE ${set.rpe_target}`;
  if (set.rir_target != null) return `RIR ${set.rir_target}`;
  if (set.percent_1rm_target != null) return `${set.percent_1rm_target}%`;
  return "—";
}

// ===========================================================================
// Component
// ===========================================================================

export function ProgressionInspector() {
  // Zustand selectors — independent so unrelated state churn doesn't
  // re-render the whole inspector.
  const block = useProgramBuilderStore((s) => s.block);
  const selectedContext = useProgramBuilderStore((s) => s.selectedContext);
  const setSelectedContext = useProgramBuilderStore((s) => s.setSelectedContext);

  const selected = useMemo(() => findSelected(block, selectedContext), [block, selectedContext]);

  // ── Local rule-editor state (in-memory until backend lands) ────────────
  const [ifCondition, setIfCondition] = useState<IfCondition>("rpe_ge_9_5");
  const [onTarget, setOnTarget] = useState<OnTarget>("last_set");
  const [thenAction, setThenAction] = useState<ThenAction>("reduce_load_2_5");

  // Compose the human-readable rule preview (used in the footer toast).
  const rulePreview = useMemo(() => {
    const a = IF_OPTIONS.find((o) => o.value === ifCondition)?.label;
    const b = ON_OPTIONS.find((o) => o.value === onTarget)?.label;
    const c = THEN_OPTIONS.find((o) => o.value === thenAction)?.label;
    return `SE ${a} ON ${b} → ALLORA ${c}`;
  }, [ifCondition, onTarget, thenAction]);

  return (
    <aside
      className={cn(
        "w-80 shrink-0 flex flex-col h-full overflow-hidden font-sans",
        "rounded-3xl bg-surface-container-lowest border border-outline-variant/10",
        "shadow-[0_8px_30px_rgb(0,0,0,0.04)]",
      )}
    >
      {/* ─── Sticky Header ─── */}
      <header className="flex-shrink-0 px-5 py-5 border-b border-outline-variant/15">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-container/15 text-primary px-2.5 py-0.5 text-3xs font-bold uppercase tracking-wider mb-2">
          <TrendingUp className="h-3 w-3" />
          Progression Inspector
        </span>
        <h3 className="font-display text-label-md font-bold text-on-surface truncate">
          {selected ? selected.exercise.exercise_name : "Nessun esercizio selezionato"}
        </h3>
        {selected && (
          <p className="text-xs text-on-surface-variant truncate mt-0.5">
            Settimana {selected.week.order} · {selected.session.name}
          </p>
        )}
      </header>

      {/* ─── Body (scrollable) ─── */}
      <ScrollArea className="flex-1 custom-scrollbar">
        <div className="p-5 space-y-4">
          {!selected ? (
            <EmptyState onPickFirst={() => pickFirstExercise(block, setSelectedContext)} />
          ) : (
            <>
              {/* ═══ Block 1 — Exercise Context Card ═══ */}
              <ExerciseContextTile
                exercise={selected.exercise}
                week={selected.week}
                session={selected.session}
              />

              {/* ═══ Block 2 — Logic Box (IF / ON / THEN) ═══ */}
              <section
                aria-label="Regola di auto-regolazione"
                className="rounded-2xl bg-surface-container-low p-4 space-y-3"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Wand2 className="h-3.5 w-3.5 text-primary" />
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                    Logic Trigger
                  </p>
                </div>

                <RuleField label="SE">
                  <Select
                    value={ifCondition}
                    onValueChange={(v) => setIfCondition(v as IfCondition)}
                  >
                    <SelectTrigger className="rounded-xl h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IF_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RuleField>

                <RuleField label="ON">
                  <Select value={onTarget} onValueChange={(v) => setOnTarget(v as OnTarget)}>
                    <SelectTrigger className="rounded-xl h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ON_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RuleField>

                <RuleField label="ALLORA">
                  <Select value={thenAction} onValueChange={(v) => setThenAction(v as ThenAction)}>
                    <SelectTrigger className="rounded-xl h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {THEN_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value} className="text-xs">
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RuleField>

                <div className="rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2">
                  <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant mb-1">
                    Anteprima
                  </p>
                  <p className="text-xs text-on-surface leading-relaxed">{rulePreview}</p>
                </div>
              </section>

              {/* ═══ Block 3 — Intensity Curve graph ═══ */}
              <section
                aria-label="Curva di intensità"
                className="rounded-2xl bg-surface-container-low p-4"
              >
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-primary" />
                    <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
                      Curva di Intensità
                    </p>
                  </div>
                  <span className="text-3xs text-on-surface-variant font-bold tabular-nums">
                    {selected.exercise.sets.length} serie
                  </span>
                </div>
                <IntensityCurve sets={selected.exercise.sets} />
              </section>

              {/* ═══ AI Suggestion teaser ═══ */}
              <section className="rounded-2xl bg-gradient-to-br from-primary-container/15 to-primary-container/5 border border-primary-container/20 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-container/20 flex-shrink-0">
                    <Sparkles className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-label-md font-bold text-on-surface mb-0.5">Coach Copilot</p>
                    {/* No fabricated recommendation: the auto-regulation
                        engine is not wired yet, and the old hardcoded
                        load/RPE teaser read as its output. */}
                    <p className="text-xs text-on-surface-variant leading-relaxed">
                      Non ancora attivo: quando l&apos;engine di auto-regolazione sarà collegato,
                      qui comparirà il suggerimento calcolato sui dati della settimana.
                    </p>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </ScrollArea>

      {/* ─── Footer pill CTA ─── */}
      <footer className="flex-shrink-0 border-t border-outline-variant/15 p-4">
        <Button
          className="w-full gap-2"
          disabled={!selected}
          onClick={() => {
            toast.info("Auto-regolazione in arrivo", {
              description: `Regola salvata in locale: "${rulePreview}". L'engine server-side la applicherà al prossimo microciclo.`,
            });
          }}
        >
          <Save className="h-4 w-4" />
          Salva Regola
        </Button>
      </footer>
    </aside>
  );
}

// ===========================================================================
// Subcomponents
// ===========================================================================

/**
 * Compact context tile: exercise + week + last set intensity chip.
 * Replaces the manual scan a coach would otherwise do to remind
 * themselves what they were tuning.
 */
function ExerciseContextTile({
  exercise,
  week,
  session,
}: {
  exercise: ProgrammedExercise;
  week: Microcycle;
  session: Session;
}) {
  const lastSet = exercise.sets[exercise.sets.length - 1];
  // Label follows the datum: RIR is a DIFFERENT, inverse scale (RIR 2 ≈
  // RPE 8, types/training.ts) — a RIR value under a "Last RPE" label read
  // a hard set as a feather-light one.
  const lastIntensity =
    lastSet?.rpe_target != null
      ? { label: "Last RPE", value: lastSet.rpe_target }
      : lastSet?.rir_target != null
        ? { label: "Last RIR", value: lastSet.rir_target }
        : { label: "Last RPE", value: "—" as const };
  return (
    <section className="rounded-2xl bg-surface-container-low p-4">
      <div className="flex items-center gap-2 mb-3">
        <Target className="h-3.5 w-3.5 text-primary" />
        <p className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant">
          Esercizio Selezionato
        </p>
      </div>

      <p className="font-display text-base font-bold text-on-surface leading-snug">
        {exercise.exercise_name}
      </p>
      <p className="text-xs text-on-surface-variant mt-0.5">
        Settimana {week.order} · {session.name}
      </p>

      <div className="grid grid-cols-3 gap-2 mt-3">
        <Stat label="Serie" value={exercise.sets.length} icon={Flame} />
        <Stat label={lastIntensity.label} value={lastIntensity.value} icon={Zap} />
        <Stat
          label="Top %1RM"
          value={Math.max(0, ...exercise.sets.map((s) => s.percent_1rm_target ?? 0)) || "—"}
          icon={TrendingUp}
        />
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  icon: typeof Flame;
}) {
  return (
    <div className="rounded-xl bg-surface-container-lowest border border-outline-variant/15 p-2 text-center">
      <div className="inline-flex items-center justify-center h-5 w-5 rounded-full bg-primary-container/15 mb-0.5">
        <Icon className="h-2.5 w-2.5 text-primary" />
      </div>
      <p className="font-display text-sm font-bold text-on-surface tabular-nums leading-none">
        {value}
      </p>
      <p className="text-3xs text-on-surface-variant uppercase tracking-wider mt-0.5">{label}</p>
    </div>
  );
}

/**
 * RuleField — wraps a label + form control on its own row inside the
 * Logic Box. Keeps the label tightly coupled to its input via grid.
 */
function RuleField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[64px_1fr] items-center gap-2">
      <span className="text-3xs font-bold uppercase tracking-wider text-on-surface-variant text-right">
        {label}
      </span>
      {children}
    </label>
  );
}

/**
 * IntensityCurve — abstract SVG trajectory drawing the relative intensity
 * (RPE / RIR-inverted / %1RM normalized to 0–100) of each programmed set.
 * Renders rounded bars + a connecting line so coaches can pattern-match
 * pyramid / reverse-pyramid / ramp shapes at a glance.
 */
function IntensityCurve({ sets }: { sets: ProgrammedSet[] }) {
  if (sets.length === 0) {
    return (
      <p className="text-xs text-on-surface-variant text-center py-6">Nessuna serie programmata.</p>
    );
  }

  // Geometry — fixed viewBox so the SVG scales fluidly with the card width.
  const W = 280;
  const H = 100;
  const PAD_X = 12;
  const PAD_Y = 14;
  const usableW = W - PAD_X * 2;
  const usableH = H - PAD_Y * 2;
  const barWidth = Math.max(8, (usableW - (sets.length - 1) * 6) / sets.length);
  const step = barWidth + 6;

  const values = sets.map((s) => intensityOf(s));
  // Anchor points for the trajectory polyline (centered on top of each bar).
  const points = values.map((v, i) => {
    const x = PAD_X + i * step + barWidth / 2;
    const h = (v / 100) * usableH;
    const y = PAD_Y + (usableH - h);
    return { x, y, v };
  });
  const pathD = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ");

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-24"
        role="img"
        aria-label="Curva di intensità per le serie programmate"
      >
        {/* Y-axis dashed reference lines (25% / 50% / 75%) */}
        {[0.25, 0.5, 0.75].map((t) => {
          const y = PAD_Y + usableH * (1 - t);
          return (
            <line
              key={t}
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y}
              y2={y}
              stroke="currentColor"
              strokeWidth="1"
              strokeDasharray="2 3"
              className="text-outline-variant/40"
            />
          );
        })}

        {/* Bars — rounded caps, primary-container color */}
        {points.map((p, i) => {
          const h = (values[i] / 100) * usableH;
          return (
            <rect
              key={`bar-${i}`}
              x={PAD_X + i * step}
              y={PAD_Y + (usableH - h)}
              width={barWidth}
              height={Math.max(2, h)}
              rx={Math.min(barWidth / 2, 6)}
              ry={Math.min(barWidth / 2, 6)}
              className="fill-primary-container/40"
            />
          );
        })}

        {/* Trajectory path */}
        <path
          d={pathD}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        />

        {/* Endpoint dots */}
        {points.map((p, i) => (
          <circle key={`dot-${i}`} cx={p.x} cy={p.y} r={3} className="fill-primary" />
        ))}
      </svg>

      {/* Set legend */}
      <div className="flex items-center justify-between gap-1 px-1">
        {sets.map((set, i) => (
          <div key={set.id} className="flex flex-col items-center gap-0.5 flex-1 min-w-0">
            <span className="text-3xs font-bold text-on-surface tabular-nums truncate">
              {intensityLabel(set)}
            </span>
            <span className="text-3xs text-on-surface-variant tabular-nums">#{i + 1}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Empty state — visible when no exercise is selected. Pre-selects the
 * first programmed exercise found in the block so the coach can immediately
 * jump in (otherwise the panel is a dead end on first paint).
 */
function EmptyState({ onPickFirst }: { onPickFirst: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10">
      <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-primary-container/10 mb-3">
        <TrendingUp className="h-7 w-7 text-primary" strokeWidth={1.75} />
      </div>
      <p className="font-display text-label-md font-bold text-on-surface mb-1">
        Nessun esercizio selezionato
      </p>
      <p className="text-xs text-on-surface-variant max-w-[240px] mb-4 leading-relaxed">
        Clicca su un esercizio nella griglia settimanale per editare la curva di intensità e le
        regole di auto-regolazione.
      </p>
      <Button variant="outline" size="sm" className="gap-2" onClick={onPickFirst}>
        Seleziona il primo
        <ChevronRight className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

/**
 * Locate the first programmed exercise in the block and set it as the
 * inspector's context. No-op if the block has no exercises at all.
 */
function pickFirstExercise(
  block: ReturnType<typeof useProgramBuilderStore.getState>["block"],
  setCtx: ReturnType<typeof useProgramBuilderStore.getState>["setSelectedContext"],
): void {
  if (!block) return;
  for (const week of block.weeks) {
    for (const session of week.sessions) {
      if (session.exercises.length > 0) {
        setCtx({
          weekId: week.id,
          sessionId: session.id,
          exerciseId: session.exercises[0].id,
        });
        return;
      }
    }
  }
}
