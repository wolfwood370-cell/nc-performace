// =============================================================================
// src/lib/program/releaseView.ts
// =============================================================================
// Pure mapping (no React) of a program_releases.program_document (schema v1,
// written by release-autonomous-program/release/buildRelease.ts) into the
// Athlete Training Hub view model. Defensive at the boundary: the document is
// a jsonb blob — a malformed shape degrades to null, never crashes the page.
// =============================================================================

export interface ReleaseExerciseView {
  /** Stable item id from the release document (flows into logs later). */
  id: string;
  /** Letter code "A1", "B2"... positional, display-only. */
  code: string;
  name: string;
  /** Display line rendered on the card, e.g. "4 Serie × 6 Reps · 86.2%". */
  scheme: string;
  sets: number;
  reps: string;
  rpe: number;
}

export interface ReleaseDayView {
  sessionId: string;
  dayIndex: number;
  dayName: string;
  focus: string;
  exercises: ReleaseExerciseView[];
}

export interface ReleaseProgramView {
  goal: string;
  rationale: string;
  days: ReleaseDayView[];
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Positional letter codes: A1, B1, C1... (one lettered slot per exercise). */
function letterCode(index: number): string {
  return `${String.fromCharCode(65 + (index % 26))}1`;
}

/** program_document (jsonb, schema v1) -> view model; null on malformed shape. */
export function parseReleaseDocument(doc: unknown): ReleaseProgramView | null {
  if (!isObj(doc) || doc.version !== 1 || !Array.isArray(doc.days)) return null;
  const days: ReleaseDayView[] = [];
  for (const rawDay of doc.days) {
    if (!isObj(rawDay) || !Array.isArray(rawDay.exercises)) return null;
    const exercises: ReleaseExerciseView[] = [];
    for (let i = 0; i < rawDay.exercises.length; i++) {
      const ex = rawDay.exercises[i];
      if (!isObj(ex) || typeof ex.name !== "string") return null;
      const sets = typeof ex.sets === "number" ? ex.sets : 0;
      const reps = typeof ex.reps === "string" ? ex.reps : "";
      const load = typeof ex.load === "string" ? ex.load : "";
      exercises.push({
        id: typeof ex.item_id === "string" ? ex.item_id : `e${i + 1}`,
        code: letterCode(i),
        name: ex.name,
        scheme: `${sets} Serie × ${reps} Reps${load ? ` · ${load}` : ""}`,
        sets,
        reps,
        rpe: typeof ex.rpe === "number" ? ex.rpe : 0,
      });
    }
    days.push({
      sessionId: typeof rawDay.session_id === "string" ? rawDay.session_id : `s${days.length + 1}`,
      dayIndex: typeof rawDay.day_index === "number" ? rawDay.day_index : days.length,
      dayName: typeof rawDay.day_name === "string" ? rawDay.day_name : `Giorno ${days.length + 1}`,
      focus: typeof rawDay.focus === "string" ? rawDay.focus : "",
      exercises,
    });
  }
  if (days.length === 0) return null;
  return {
    goal: typeof doc.goal === "string" ? doc.goal : "",
    rationale: typeof doc.rationale === "string" ? doc.rationale : "",
    days,
  };
}

/**
 * Maps the selected weekday to a program day: Monday shows "Giorno 1",
 * Tuesday "Giorno 2", ... beyond days.length the athlete rests. v1 mapping,
 * declared — scheduling/anchoring is a later slice.
 */
export function dayForWeekday(
  program: ReleaseProgramView,
  mondayBasedIndex: number,
): ReleaseDayView | null {
  if (mondayBasedIndex < 0 || mondayBasedIndex >= program.days.length) return null;
  return program.days[mondayBasedIndex];
}

/** Average target RPE of a session (display), rounded to the nearest int. */
export function sessionRpeTarget(day: ReleaseDayView): number | null {
  const rpes = day.exercises.map((e) => e.rpe).filter((r) => r > 0);
  if (rpes.length === 0) return null;
  return Math.round(rpes.reduce((a, b) => a + b, 0) / rpes.length);
}
