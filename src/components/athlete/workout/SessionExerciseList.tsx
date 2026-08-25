// =============================================================================
// src/components/athlete/workout/SessionExerciseList.tsx
// =============================================================================
// The exercise list INSIDE the active workout (slice A-03). Renders what the
// coach prescribed for today's session — read upstream through the ONE
// selector shared with the home and the Training Hub (sessionForDate); this
// component only receives the already-selected day.
//
// Contract:
//   - Every exercise of the day renders: name, positional code, prescription
//     scheme, and the completed-set count. Nothing is invented — the count
//     comes from real exercise_logs rows (countsByCatalogId), never from
//     local state.
//   - An exercise WITH a catalog reference is tappable: the parent opens the
//     set drawer with the catalog id (the only id the database accepts).
//   - An exercise WITHOUT a catalog reference renders read-only and says why:
//     the athlete must still be able to read their sheet even when one row
//     of the document is incomplete (it is never hidden, never loggable).
// =============================================================================

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { sessionTitle } from "@/lib/program/releaseView";
import type { ReleaseDayView, ReleaseExerciseView } from "@/lib/program/releaseView";

export interface SessionExerciseListProps {
  day: ReleaseDayView;
  /** Completed sets per CATALOG exercise id (exercises.id), derived from
   *  the session's exercise_logs rows by the parent. Local item ids are
   *  never keys here: an exercise without a catalog reference has no count. */
  countsByCatalogId: Record<string, number>;
  /** Tap on a loggable exercise. The parent only receives exercises whose
   *  catalog_exercise_id is present — read-only rows never fire this. */
  onOpenExercise: (exercise: ReleaseExerciseView) => void;
}

/** Count line: "2/4 serie" — done from DB rows, prescribed from the release. */
function countLabel(done: number, prescribed: number): string {
  return `${done}/${prescribed} serie`;
}

function ExerciseRow({
  exercise,
  done,
  onOpen,
}: {
  exercise: ReleaseExerciseView;
  done: number;
  onOpen: (exercise: ReleaseExerciseView) => void;
}) {
  const loggable = exercise.catalog_exercise_id !== null;
  const completed = loggable && done >= exercise.sets && exercise.sets > 0;

  const body = (
    <>
      <span
        aria-hidden="true"
        className={cn(
          "h-10 w-10 shrink-0 rounded-full flex items-center justify-center",
          "font-display text-sm font-bold",
          completed ? "bg-brand-container text-white" : "bg-surface-container text-brand-container",
        )}
      >
        {exercise.code}
      </span>
      <span className="min-w-0 flex-1 flex flex-col items-start text-left">
        <span className="font-display text-base font-bold tracking-tight text-on-surface truncate w-full">
          {exercise.name}
        </span>
        {exercise.scheme !== "" && (
          <span className="font-sans text-xs text-on-surface-variant truncate w-full">
            {exercise.scheme}
          </span>
        )}
        {!loggable && (
          <span className="mt-1 font-sans text-xs text-on-surface-variant italic">
            Solo consultazione: manca il riferimento di catalogo, le serie non si possono
            registrare.
          </span>
        )}
      </span>
      {loggable && (
        <span className="shrink-0 flex items-center gap-2">
          <span
            aria-label={`${done} serie registrate su ${exercise.sets} prescritte`}
            className={cn(
              "font-display text-sm font-semibold tabular-nums",
              completed ? "text-brand-container" : "text-on-surface-variant",
            )}
          >
            {countLabel(done, exercise.sets)}
          </span>
          <ChevronRight
            className="h-5 w-5 text-on-surface-variant/60"
            strokeWidth={2}
            aria-hidden="true"
          />
        </span>
      )}
    </>
  );

  const rowClass = cn(
    "w-full rounded-3xl p-4",
    "bg-white border border-[#c0c7d0]/30",
    "flex items-center gap-3",
  );

  // Read-only rows are NOT buttons: a disabled button would promise an
  // action that does not exist; a plain row + explicit reason tells the
  // truth (WAI-ARIA: no fake affordance to relabel).
  if (!loggable) {
    return <li className={rowClass}>{body}</li>;
  }

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(exercise)}
        aria-label={`Apri il registratore di serie per ${exercise.name}`}
        className={cn(
          rowClass,
          "transition-colors hover:bg-surface-container/40 active:scale-[0.99]",
        )}
      >
        {body}
      </button>
    </li>
  );
}

export function SessionExerciseList({
  day,
  countsByCatalogId,
  onOpenExercise,
}: SessionExerciseListProps) {
  return (
    <section aria-label="Esercizi della seduta" className="flex flex-col gap-3">
      <header className="px-1">
        <h2 className="font-display text-lg font-bold tracking-tight text-on-surface">
          {sessionTitle(day)}
        </h2>
        <p className="font-sans text-xs text-on-surface-variant">
          {day.exercises.length === 1 ? "1 esercizio" : `${day.exercises.length} esercizi`}
        </p>
      </header>
      <ul className="flex flex-col gap-3">
        {day.exercises.map((exercise) => (
          <ExerciseRow
            key={exercise.id}
            exercise={exercise}
            done={
              exercise.catalog_exercise_id !== null
                ? (countsByCatalogId[exercise.catalog_exercise_id] ?? 0)
                : 0
            }
            onOpen={onOpenExercise}
          />
        ))}
      </ul>
    </section>
  );
}
