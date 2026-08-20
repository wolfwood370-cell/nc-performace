import { memo, useCallback, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, X, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProgramBuilderStore } from "@/stores/programBuilder/useProgramBuilderStore";
import { FmsContraindicationBadge } from "@/components/coach/program/FmsContraindicationBadge";
import type { ExerciseInfo, ExerciseRiskAssessment } from "@/lib/math/fmsRiskEngine";
import type {
  ProgrammedExercise,
  ProgrammedSet,
  ProgrammedSetUpdate,
  UUID,
} from "@/types/training";

// ---------------------------------------------------------------------------
// Auto-regulation editor: RPE | RIR
// ---------------------------------------------------------------------------
//
// A coach typically prescribes one or the other, but the schema permits both.
// We render whichever is currently set; if neither is set, the card defaults
// to displaying RPE (the more common modern choice). A coach can flip the
// header label to switch the rendered field.

type AutoRegMode = "rpe" | "rir";

// ---------------------------------------------------------------------------
// CompactCell — borderless input that reveals its border only on hover/focus
// ---------------------------------------------------------------------------

interface CompactCellProps {
  value: string | number | undefined;
  /** Called on blur with the raw string from the input. */
  onCommit: (raw: string) => void;
  type?: "text" | "number";
  placeholder?: string;
  /** Tighten the input width if the column is narrow. */
  width?: string;
  /** Optional suffix glyph rendered inside the cell (e.g. "%"). */
  suffix?: string;
  min?: number;
  max?: number;
  step?: number;
}

const CompactCell = memo(function CompactCell({
  value,
  onCommit,
  type = "text",
  placeholder = "—",
  width,
  suffix,
  min,
  max,
  step,
}: CompactCellProps) {
  const handleBlur = useCallback(
    (e: React.FocusEvent<HTMLInputElement>) => {
      const raw = e.currentTarget.value.trim();
      onCommit(raw);
    },
    [onCommit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      // Enter commits and tabs forward; Escape rolls back to last committed.
      if (e.key === "Enter") {
        e.currentTarget.blur();
      } else if (e.key === "Escape") {
        e.currentTarget.value = value == null ? "" : String(value);
        e.currentTarget.blur();
      }
    },
    [value],
  );

  return (
    <div className={cn("relative inline-flex items-center", width)}>
      <input
        type={type}
        defaultValue={value ?? ""}
        placeholder={placeholder}
        min={min}
        max={max}
        step={step}
        inputMode={type === "number" ? "decimal" : undefined}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        // Re-key when the upstream value changes so the uncontrolled input
        // syncs (e.g. after week duplication overwrites this set).
        key={String(value ?? "")}
        // Aura form input: rounded-xl (16px), outline-variant border,
        // primary focus + ambient outer glow. Container is bg-surface-
        // container-lowest so the field reads as a "tray" against the
        // surrounding surface-container-low body.
        className={cn(
          "w-full h-8 px-2 text-xs tabular-nums text-center font-semibold",
          "rounded-xl border border-outline-variant bg-surface-container-lowest text-on-surface",
          "placeholder:text-on-surface-variant/60",
          "transition-[box-shadow,border-color] duration-200",
          "hover:border-primary/40",
          "focus:outline-none focus:border-primary focus:shadow-[0_0_0_3px_rgb(0_86_133_/_0.12)]",
          suffix && "pr-5",
        )}
      />
      {suffix && (
        <span className="absolute right-2 text-3xs text-on-surface-variant pointer-events-none font-bold">
          {suffix}
        </span>
      )}
    </div>
  );
});

// ---------------------------------------------------------------------------
// ProgrammedExerciseCard
// ---------------------------------------------------------------------------

export interface ProgrammedExerciseCardProps {
  weekId: UUID;
  sessionId: UUID;
  exercise: ProgrammedExercise;
  /** Optional remove handler — wired by the parent to the store's removeExercise. */
  onRemove?: () => void;
  /** Default auto-regulation column header. Can be flipped per-coach upstream. */
  autoRegMode?: AutoRegMode;
  /**
   * Optional FMS risk-checker. When provided we cross-reference this
   * exercise against the assigned athlete's latest assessment and
   * surface a Biomechanical Traffic Light. When `undefined` (no
   * athlete assigned) the card renders neutrally — risk is OFF.
   */
  checkExercise?: (exercise: ExerciseInfo) => ExerciseRiskAssessment;
  /** Athlete the program is assigned to — enables the FMS contraindication
   *  badge (useFmsAlerts → fms_tests). Undefined/null = badge off. */
  athleteId?: string | null;
}

export const ProgrammedExerciseCard = memo(function ProgrammedExerciseCard({
  weekId,
  sessionId,
  exercise,
  onRemove,
  autoRegMode = "rpe",
  checkExercise,
  athleteId,
}: ProgrammedExerciseCardProps) {
  // Store actions are pulled atomically — using shallow selectors here would
  // be overkill since the function references are stable inside zustand.
  const updateSetProgression = useProgramBuilderStore((s) => s.updateSetProgression);
  const addSetToExercise = useProgramBuilderStore((s) => s.addSetToExercise);
  // Inspector wiring — click anywhere on the card surface (outside form
  // controls + remove button) to focus this exercise in the right-hand
  // ProgressionInspector. Selection is derived from `selectedContext` so
  // the visual highlight reflects the store, not local state.
  const selectedContext = useProgramBuilderStore((s) => s.selectedContext);
  const setSelectedContext = useProgramBuilderStore((s) => s.setSelectedContext);
  const isSelected =
    selectedContext?.weekId === weekId &&
    selectedContext?.sessionId === sessionId &&
    selectedContext?.exerciseId === exercise.id;

  const focusInInspector = (e: React.MouseEvent<HTMLDivElement>) => {
    // Don't hijack clicks meant for the form inputs / remove button.
    if ((e.target as HTMLElement).closest("input, button, [role='button']")) return;
    setSelectedContext({ weekId, sessionId, exerciseId: exercise.id });
  };

  const patch = useCallback(
    (set: ProgrammedSet, updates: ProgrammedSetUpdate) => {
      updateSetProgression(weekId, sessionId, exercise.id, set.set_number, updates);
    },
    [updateSetProgression, weekId, sessionId, exercise.id],
  );

  // Parse a raw numeric input. Empty string → undefined (clears the field).
  // Out-of-range or non-numeric → no-op (the input visually re-syncs via key).
  const parseNum = (raw: string, min?: number, max?: number) => {
    if (raw === "") return undefined;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null; // sentinel: ignore
    if (min != null && n < min) return null;
    if (max != null && n > max) return null;
    return n;
  };

  // -------------------------------------------------------------------------
  // Biomechanical Traffic Light
  // -------------------------------------------------------------------------
  // We only flag HIGH risk visually — moderate findings are advisory and
  // would create too much noise across a populated week. The full reason
  // list (which can include moderate items) is still surfaced in the
  // tooltip so the coach can drill in.
  const verdict = useMemo<ExerciseRiskAssessment | null>(() => {
    if (!checkExercise) return null;
    return checkExercise({ name: exercise.exercise_name });
  }, [checkExercise, exercise.exercise_name]);

  const isHighRisk = verdict !== null && (verdict.isSafe === false || verdict.riskLevel === "high");

  return (
    <div
      onClick={focusInInspector}
      className={cn(
        // Aura compact card: rounded-2xl, surface-container-lowest,
        // soft 1px outline-variant, ambient shadow on hover.
        "group/card rounded-2xl border bg-surface-container-lowest cursor-pointer",
        "shadow-sm transition-all hover:shadow-[0_4px_14px_rgb(0,0,0,0.04)]",
        isHighRisk
          ? "border-destructive/40 hover:border-destructive/60"
          : isSelected
            ? "border-primary ring-2 ring-primary/30"
            : "border-outline-variant/20 hover:border-outline-variant/40",
      )}
    >
      {/* Header — exercise name + remove */}
      <div
        className={cn(
          "flex items-center justify-between gap-1 px-3 py-2 border-b",
          isHighRisk ? "border-destructive/30 bg-destructive/5" : "border-outline-variant/15",
        )}
      >
        <div className="flex min-w-0 items-center gap-1.5">
          {isHighRisk && verdict && (
            <TooltipProvider delayDuration={120}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="Biomechanical risk warning"
                    className="flex-shrink-0 outline-none focus-visible:ring-1 focus-visible:ring-destructive rounded-sm"
                  >
                    <AlertTriangle className="h-3.5 w-3.5 text-destructive animate-pulse" />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="top"
                  align="start"
                  className="max-w-xs space-y-1 border-destructive/40 bg-popover text-xs"
                >
                  <p className="font-semibold text-destructive">Rischio biomeccanico elevato</p>
                  <ul className="list-disc space-y-0.5 pl-4 text-foreground">
                    {verdict.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span
            className={cn("text-xs font-semibold truncate", isHighRisk && "text-destructive")}
            title={exercise.exercise_name}
          >
            {exercise.exercise_name}
          </span>
          {athleteId && (
            <FmsContraindicationBadge exerciseName={exercise.exercise_name} athleteId={athleteId} />
          )}
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className={cn(
              "h-5 w-5 flex-shrink-0 text-muted-foreground hover:text-destructive",
              "opacity-0 group-hover/card:opacity-100 transition-opacity",
            )}
            aria-label="Remove exercise"
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {/* Set grid — desktop-dense, tabular layout
         Columns: # | Reps | RPE/RIR | %1RM | Rec (s)
         Using a CSS grid keeps headers and rows perfectly aligned without
         <table>'s padding overhead.                                          */}
      <div className="px-2 py-2 space-y-1">
        {/* Header row */}
        <div
          className={cn(
            "grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr] items-center gap-1.5",
            "px-1 pb-1 mb-0.5 border-b border-outline-variant/20",
            "text-3xs font-bold text-on-surface-variant uppercase tracking-wider",
          )}
        >
          <span className="text-center">Set</span>
          <span className="text-center">Reps</span>
          <span className="text-center">{autoRegMode === "rir" ? "RIR" : "RPE"}</span>
          <span className="text-center">%1RM</span>
          <span className="text-center">Rec (s)</span>
        </div>

        {/* Set rows */}
        {exercise.sets.length === 0 && (
          <p className="text-3xs text-muted-foreground text-center py-1.5">No sets yet.</p>
        )}
        {exercise.sets.map((set) => (
          <div
            key={set.id}
            className={cn(
              "grid grid-cols-[1.5rem_1fr_1fr_1fr_1fr] items-center gap-1.5",
              "px-1 py-1 rounded-xl hover:bg-surface-container-low/50 transition-colors",
            )}
          >
            <span className="text-xs font-bold text-on-surface-variant text-center tabular-nums">
              {set.set_number}
            </span>

            {/* Reps — free-form string ("8", "8-10", "AMRAP") */}
            <CompactCell
              value={set.reps_target}
              onCommit={(raw) => patch(set, { reps_target: raw === "" ? "" : raw })}
              placeholder="—"
            />

            {/* RPE or RIR */}
            {autoRegMode === "rir" ? (
              <CompactCell
                type="number"
                value={set.rir_target}
                min={0}
                max={10}
                step={0.5}
                placeholder="—"
                onCommit={(raw) => {
                  const n = parseNum(raw, 0, 10);
                  if (n === null) return;
                  patch(set, { rir_target: n });
                }}
              />
            ) : (
              <CompactCell
                type="number"
                value={set.rpe_target}
                min={1}
                max={10}
                step={0.5}
                placeholder="—"
                onCommit={(raw) => {
                  const n = parseNum(raw, 1, 10);
                  if (n === null) return;
                  patch(set, { rpe_target: n });
                }}
              />
            )}

            {/* %1RM */}
            <CompactCell
              type="number"
              value={set.percent_1rm_target}
              min={0}
              max={100}
              step={1}
              placeholder="—"
              suffix="%"
              onCommit={(raw) => {
                const n = parseNum(raw, 0, 100);
                if (n === null) return;
                patch(set, { percent_1rm_target: n });
              }}
            />

            {/* Rest seconds — a prescription the coach SEES and can change
               (the 90s scaffold default used to be invisible: showing it here
               is what turns an internal constant into a coach's choice).
               Emptying the cell keeps the previous value: rest is always
               prescribed on a set, there is no "absent" state to write. */}
            <CompactCell
              type="number"
              value={set.rest_seconds}
              min={0}
              max={600}
              step={5}
              placeholder="—"
              onCommit={(raw) => {
                const n = parseNum(raw, 0, 600);
                if (n === null || n === undefined) return;
                patch(set, { rest_seconds: n });
              }}
            />
          </div>
        ))}

        {/* Add set — pill action */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => addSetToExercise(weekId, sessionId, exercise.id)}
          className={cn(
            "w-full h-7 mt-1 text-3xs font-bold text-on-surface-variant",
            "hover:text-on-surface hover:bg-primary-container/10",
          )}
        >
          <Plus className="h-3 w-3 mr-1" />
          Aggiungi Serie
        </Button>
      </div>
    </div>
  );
});
