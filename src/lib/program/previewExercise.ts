// =============================================================================
// src/lib/program/previewExercise.ts
// =============================================================================
// Pure contract + display formatting for the athlete Exercise Preview page
// (src/pages/athlete/ExercisePreview.tsx). Lives outside the page module so
// unit tests stay node-only (no jsdom — decision 2026-07-14) and the page
// keeps component-only exports (react-refresh boundary).
//
// Display rule shared by every formatter: a value the payload does not
// carry — or that the release parser (releaseView.ts) coerced to "" / 0 —
// renders as "—", never as a number the coach did not write.
// =============================================================================

export type ExerciseType = "standard" | "emom";

export interface PreviewExercise {
  id: string;
  /** Programme code: "A1", "B2", "C1"... optional for warm-up moves. */
  code?: string;
  /** Display name, e.g. "Barbell Back Squat". */
  name: string;
  /** Drives which variant is rendered. */
  type: ExerciseType;
  /** Prescribed sets count. */
  sets?: number;
  /** Free-form reps prescription ("8", "6-8", "AMRAP", "60s"). */
  reps?: string;
  /** Prescribed load in kilograms. 0 = bodyweight; undefined = not specified. */
  weightKg?: number;
  /** Target RPE 1..10. */
  rpe?: number;
  /** Tempo Under Tension descriptor ("3-0-1-0", "controlled", ...). */
  tut?: string;
  /** Rest period between sets, in seconds. Drives the rest chip. */
  restSeconds?: number;
  /** Optional sub-line (phase or protocol descriptor). */
  meta?: string;
}

/**
 * Defensively type-narrows the unknown `location.state` blob into a
 * PreviewExercise. Returns null when the state is missing or malformed:
 * the page then redirects to /athlete/training instead of inventing an
 * exercise the athlete never selected. A valid candidate passes through
 * UNTOUCHED — no default merged in, no fields injected.
 */
export function readExerciseFromLocationState(state: unknown): PreviewExercise | null {
  if (
    state &&
    typeof state === "object" &&
    "exercise" in state &&
    state.exercise &&
    typeof state.exercise === "object"
  ) {
    const candidate = state.exercise as Partial<PreviewExercise>;
    if (
      typeof candidate.id === "string" &&
      typeof candidate.name === "string" &&
      (candidate.type === "standard" || candidate.type === "emom")
    ) {
      return candidate as PreviewExercise;
    }
  }
  return null;
}

/** Values for the 5-cell variables grid (Sets / Reps / Peso / TUT / RPE). */
export interface ExerciseVariableCells {
  sets: string;
  reps: string;
  weight: string;
  tut: string;
  rpe: string;
}

export function formatVariableCells(exercise: PreviewExercise): ExerciseVariableCells {
  return {
    sets: exercise.sets !== undefined && exercise.sets > 0 ? String(exercise.sets) : "—",
    reps: exercise.reps ? exercise.reps : "—",
    weight:
      exercise.weightKg === undefined
        ? "—"
        : exercise.weightKg > 0
          ? `${exercise.weightKg} kg`
          : "BW",
    tut: exercise.tut ?? "—",
    rpe: exercise.rpe !== undefined && exercise.rpe > 0 ? String(exercise.rpe) : "—",
  };
}

/**
 * Row count for the locked logging table. Null hides the table entirely:
 * fabricating N rows out of a missing (or 0-coerced) set count would be
 * a prescription the coach never wrote.
 */
export function lockedTableSetCount(exercise: PreviewExercise): number | null {
  return exercise.sets !== undefined && exercise.sets > 0 ? exercise.sets : null;
}

/** Rest chip main text: "90s" when prescribed, "—" when not specified. */
export function formatRestDisplay(seconds?: number): string {
  return seconds !== undefined ? `${seconds}s` : "—";
}
