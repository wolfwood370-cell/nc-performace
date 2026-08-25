// =============================================================================
// src/components/athlete/drawers/StandardSetDrawer.tsx
// =============================================================================
// Standard sets execution drawer, wired to the Supabase data layer.
//
// UI model:
//   - Header: title (+ optional meta line) + close.
//   - Optional "previous" reference line — rendered only when the caller
//     provides a real value; same for the rest-period chip.
//   - "Completed sets" list — reads `exercise_logs` filtered to this
//     exercise via React Query. Empty when nothing has been logged yet.
//   - Active input row — bound to local `weight` + `reps` state. Tapping
//     "Aggiungi Set" fires `useLogSetMutation` with the next
//     `set_number`, clears the inputs, and refocuses the kg field.
//   - Sticky footer: "Termina Esercizio" → closes the drawer.
//
// Every prop describing the exercise must carry REAL data: there are no
// mock defaults. Blocks whose value is missing simply don't render.
// Mounted by ActiveWorkout (slice A-03), one instance per opened
// exercise, ALWAYS with the catalog id — see catalogExerciseId below.
//
// Inputs use `type="number" inputMode="decimal"` per the project's
// established mobile-keyboard convention. Both fields must be filled
// before a set can be logged (CORE §0.8: they start empty, never 0) —
// bodyweight work is an explicit "0" typed in the weight field.
// =============================================================================

import { useRef, useState } from "react";
import { Check, Plus, Play, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DrawerShell } from "./DrawerShell";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";
import {
  useLogSetMutation,
  useSessionSetsQuery,
  type ExerciseLogRow,
} from "@/hooks/athlete/useAthleteWorkoutHooks";

// Module-scope stable empty array — used as a fallback when the query
// has no data yet, so the rendered set list reference stays stable
// across renders.
const EMPTY_SETS: ExerciseLogRow[] = [];

interface StandardSetDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * CATALOG id of the exercise being logged (exercises.id) — the only
   * value the exercise_logs FK accepts. NEVER the release document's
   * builder-local item id ("w1-s1-e1"): that resolves to nothing in the
   * exercises table and every INSERT would be rejected. Callers with no
   * catalog reference must not mount this drawer at all.
   */
  catalogExerciseId: string;
  /** Real exercise title, e.g. "A1. Barbell Back Squat". No default. */
  exerciseName: string;
  /** Optional sub-line (phase / protocol descriptor). Hidden if absent. */
  meta?: string;
  /** Last logged reference for this exercise. Hidden if absent. */
  previousReference?: string;
  /** Rest period between sets, in seconds. Hidden if absent. */
  restSeconds?: number;
}

export function StandardSetDrawer({
  isOpen,
  onClose,
  catalogExerciseId,
  exerciseName,
  meta,
  previousReference,
  restSeconds,
}: StandardSetDrawerProps) {
  // -- Local input state --------------------------------------------------
  // Strings (not numbers) so an empty field renders as "" rather than 0.
  const [weight, setWeight] = useState("");
  const [reps, setReps] = useState("");

  // Ref on the weight input so we can re-focus it after a successful
  // logSet — keeps the keyboard up and the cursor in the same place
  // for rapid back-to-back set logging.
  const weightInputRef = useRef<HTMLInputElement | null>(null);

  // -- Data layer wiring --------------------------------------------------
  // The session id is local UI state (which DB row is being edited).
  // Reads are scoped to that session and filtered down to this exercise.
  const activeSessionId = useAthleteWorkoutStore((s) => s.activeSessionId);
  const sessionSets = useSessionSetsQuery(activeSessionId);
  const completedSets = sessionSets.data
    ? sessionSets.data.filter((row) => row.exercise_id === catalogExerciseId)
    : EMPTY_SETS;

  const logSetMutation = useLogSetMutation();

  // Disabled until BOTH fields are filled (slice A-03 contract: a set is
  // not logged while either value is still unstated — bodyweight is an
  // explicit "0" in the weight field, never an inferred one). Also
  // disabled while another set is mid-flight to avoid duplicate inserts
  // on rapid taps.
  const canLog =
    weight.trim().length > 0 &&
    reps.trim().length > 0 &&
    !logSetMutation.isPending &&
    activeSessionId !== null;

  const handleLogSet = () => {
    if (!canLog || !activeSessionId) return;
    const w = Number(weight) || 0;
    const r = Number(reps) || 0;
    logSetMutation.mutate(
      {
        session_id: activeSessionId,
        exercise_id: catalogExerciseId,
        set_number: completedSets.length + 1,
        weight: w,
        reps: r,
      },
      {
        onSuccess: () => {
          setWeight("");
          setReps("");
          weightInputRef.current?.focus();
        },
      },
    );
  };

  return (
    <DrawerShell open={isOpen} onClose={onClose} ariaLabel={`Esecuzione ${exerciseName}`}>
      {/* ------------------------------------------------------------------
          Header
          ------------------------------------------------------------------ */}
      <header className="shrink-0 px-6 pb-4 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl font-bold tracking-tight text-on-surface truncate">
            {exerciseName}
          </h2>
          {meta && (
            <p className="mt-1 font-sans text-[11px] font-semibold tracking-widest uppercase text-on-surface-variant">
              {meta}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Chiudi"
          className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-on-surface hover:bg-surface-container transition-colors active:scale-95"
        >
          <X className="h-5 w-5" strokeWidth={2.5} aria-hidden="true" />
        </button>
      </header>

      {/* ------------------------------------------------------------------
          Body
          ------------------------------------------------------------------ */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 flex flex-col gap-5">
        {/* Previous-session reference — only when the caller provides one */}
        {previousReference && (
          <div
            className={cn(
              "rounded-2xl p-4",
              "bg-surface-container/50 border-l-4 border-brand-container",
              "border border-brand-container/15",
            )}
          >
            <p className="font-sans text-[11px] text-on-surface-variant">
              <span className="font-semibold tracking-wider uppercase">Precedente</span> ·{" "}
              {previousReference}
            </p>
          </div>
        )}

        {/* Completed sets — derived from the store */}
        <section aria-label="Serie completate" className="flex flex-col gap-2">
          <h3 className="font-display text-[11px] font-bold tracking-widest uppercase text-on-surface-variant px-1">
            Serie Completate ({completedSets.length})
          </h3>
          {completedSets.length === 0 ? (
            <p className="px-1 text-sm italic text-on-surface-variant/70">
              Nessuna serie ancora loggata. Compila kg + reps qui sotto e tocca "Aggiungi Set".
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {completedSets.map((set, idx) => (
                <li
                  key={set.id}
                  className={cn(
                    "grid grid-cols-[28px_minmax(0,1fr)_minmax(0,1fr)_28px] gap-2 items-center",
                    "rounded-2xl p-3",
                    "bg-brand-container/10 border border-brand-container/20",
                  )}
                >
                  <span className="font-display text-sm font-bold text-brand-container text-center tabular-nums">
                    {idx + 1}
                  </span>
                  <span className="font-display text-sm font-semibold text-on-surface text-center tabular-nums">
                    {set.weight}{" "}
                    <span className="text-on-surface-variant text-xs font-normal">kg</span>
                  </span>
                  <span className="font-display text-sm font-semibold text-on-surface text-center tabular-nums">
                    {set.reps}{" "}
                    <span className="text-on-surface-variant text-xs font-normal">reps</span>
                  </span>
                  <span
                    aria-hidden="true"
                    className="h-6 w-6 rounded-md bg-brand-container text-white flex items-center justify-center"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Prescribed rest period — static information, shown only when
            known. No countdown widget exists yet, so this is deliberately
            NOT a button: a control promising a timer would be a lie. */}
        {restSeconds !== undefined && (
          <div
            className={cn(
              "w-full inline-flex items-center justify-center gap-2 rounded-2xl",
              "px-4 py-3",
              "bg-brand-container/10 text-brand-container",
              "font-sans text-sm font-bold tracking-wide uppercase",
            )}
          >
            <Timer className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Recupero · {restSeconds}s
          </div>
        )}

        {/* Active input row */}
        <section
          aria-label="Logga la prossima serie"
          className={cn(
            "rounded-2xl p-4",
            "bg-white border-2 border-brand-container/50",
            "flex flex-col gap-3",
          )}
        >
          <h3 className="font-display text-[11px] font-bold tracking-widest uppercase text-brand-container">
            Serie {completedSets.length + 1}
          </h3>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
            <label className="flex flex-col gap-1">
              <span className="font-sans text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant">
                Peso (kg)
              </span>
              <input
                ref={weightInputRef}
                type="number"
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                placeholder="0"
                className={cn(
                  "w-full h-12 rounded-xl text-center font-display text-lg font-bold tabular-nums",
                  "bg-surface-container/60 text-on-surface border border-transparent",
                  "outline-none focus:bg-white focus:border-brand-container focus:ring-2 focus:ring-brand-container/30",
                  "placeholder:text-on-surface-variant/40",
                )}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-sans text-[10px] font-semibold tracking-wider uppercase text-on-surface-variant">
                Ripetizioni
              </span>
              <input
                type="number"
                inputMode="decimal"
                value={reps}
                onChange={(e) => setReps(e.target.value)}
                placeholder="0"
                className={cn(
                  "w-full h-12 rounded-xl text-center font-display text-lg font-bold tabular-nums",
                  "bg-surface-container/60 text-on-surface border border-transparent",
                  "outline-none focus:bg-white focus:border-brand-container focus:ring-2 focus:ring-brand-container/30",
                  "placeholder:text-on-surface-variant/40",
                )}
              />
            </label>
          </div>
          <button
            type="button"
            onClick={handleLogSet}
            disabled={!canLog}
            className={cn(
              "mt-1 py-3 rounded-full",
              "flex items-center justify-center gap-1.5",
              "bg-brand-container text-white",
              "font-display text-xs font-bold tracking-widest uppercase",
              "shadow-[0_6px_18px_rgba(34,111,163,0.25)]",
              "transition-all duration-200",
              "hover:brightness-110 active:scale-[0.98]",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "disabled:active:scale-100 disabled:hover:brightness-100",
            )}
          >
            <Plus className="h-4 w-4" strokeWidth={2.5} aria-hidden="true" />
            Aggiungi Set
          </button>
        </section>
      </div>

      {/* ------------------------------------------------------------------
          Sticky footer
          ------------------------------------------------------------------ */}
      <footer className="shrink-0 px-6 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] border-t border-[#c0c7d0]/30 bg-white/85 backdrop-blur-xl">
        <button
          type="button"
          onClick={onClose}
          className={cn(
            "w-full h-14 rounded-full",
            "flex items-center justify-center gap-2",
            "bg-on-surface text-white",
            "font-display text-sm font-bold tracking-widest uppercase",
            "shadow-[0_8px_20px_rgba(0,30,45,0.25)]",
            "transition-all duration-200",
            "hover:brightness-110 active:scale-[0.98]",
          )}
        >
          <Play className="h-5 w-5 fill-white" strokeWidth={0} aria-hidden="true" />
          Termina Esercizio
        </button>
      </footer>
    </DrawerShell>
  );
}
