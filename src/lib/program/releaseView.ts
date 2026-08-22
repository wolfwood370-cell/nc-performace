// =============================================================================
// src/lib/program/releaseView.ts
// =============================================================================
// Pure mapping (no React) of a program_releases.program_document into the
// Athlete Training Hub view model. Two document shapes share one entry point:
//   v1 — engine release (release-autonomous-program/release/buildRelease.ts),
//        parsed EXACTLY as before this slice (0/"" coercions included);
//   v2 — coach release (supabase/functions/_shared/program/coachRelease.ts),
//        one entry per set, null = not prescribed (never coerced to 0).
// Defensive at the boundary: the document is a jsonb blob — a malformed shape
// degrades to null, never crashes the page.
// =============================================================================

/** One prescribed set as the athlete observes it (v2 only). Null = the coach
 *  did not write that value: the UI renders no label for it, never a 0. */
export interface ReleaseSetView {
  set_number: number;
  reps: string;
  rpe: number | null;
  rir: number | null;
  percent_1rm: number | null;
  rest_seconds: number;
  tempo: string | null;
  is_warmup: boolean;
}

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
  /** v2 only: per-set prescription, one entry per set. */
  sets_detail?: ReleaseSetView[];
  /** v2 only: true when every set is identical (compact scheme tells all). */
  uniform?: boolean;
  /** v2 only: superset group id, null when the exercise stands alone. */
  superset_id?: string | null;
  /** v2 only: coach's notes for the athlete ("" = none written). */
  coach_notes?: string;
}

export interface ReleaseDayView {
  sessionId: string;
  dayIndex: number;
  dayName: string;
  focus: string;
  exercises: ReleaseExerciseView[];
  /** v2 only: the coach-confirmed calendar date (YYYY-MM-DD). */
  date?: string;
  /** v2 only: 1-based week number within the block. */
  weekOrder?: number;
}

export interface ReleaseProgramView {
  goal: string;
  rationale: string;
  days: ReleaseDayView[];
  /** Present (=2) only for coach releases; v1 output is untouched. */
  version?: 2;
  /** v2 only: block name as the coach titled it. */
  name?: string;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Positional letter codes: A1, B1, C1... (one lettered slot per exercise). */
function letterCode(index: number): string {
  return `${String.fromCharCode(65 + (index % 26))}1`;
}

/**
 * program_document (jsonb) -> view model; null on malformed shape.
 * Dispatches on doc.version: 1 -> the untouched v1 path below, 2 -> the coach
 * release path, anything else -> null (as before).
 */
export function parseReleaseDocument(doc: unknown): ReleaseProgramView | null {
  if (isObj(doc) && doc.version === 2) return parseReleaseDocumentV2(doc);
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

// =============================================================================
// v2 — coach release document (schema_version 2)
// =============================================================================

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseSetV2(raw: unknown): ReleaseSetView | null {
  if (!isObj(raw)) return null;
  if (typeof raw.set_number !== "number" || typeof raw.reps !== "string") return null;
  if (typeof raw.rest_seconds !== "number") return null;
  const numOrNull = (v: unknown): number | null => (typeof v === "number" ? v : null);
  return {
    set_number: raw.set_number,
    reps: raw.reps,
    rpe: numOrNull(raw.rpe),
    rir: numOrNull(raw.rir),
    percent_1rm: numOrNull(raw.percent_1rm),
    rest_seconds: raw.rest_seconds,
    tempo: typeof raw.tempo === "string" ? raw.tempo : null,
    is_warmup: raw.is_warmup === true,
  };
}

const sameSet = (a: ReleaseSetView, b: ReleaseSetView): boolean =>
  a.reps === b.reps &&
  a.rpe === b.rpe &&
  a.rir === b.rir &&
  a.percent_1rm === b.percent_1rm &&
  a.rest_seconds === b.rest_seconds &&
  a.tempo === b.tempo &&
  a.is_warmup === b.is_warmup;

/** Labelled parts of ONE set's prescription: null never renders, 0 is never
 *  shown for an absent value ("8 reps · RPE 7 · rec 90s"). */
function setParts(set: ReleaseSetView): string[] {
  const parts: string[] = [];
  if (set.reps) parts.push(`${set.reps} reps`);
  if (set.rpe !== null) parts.push(`RPE ${set.rpe}`);
  if (set.rir !== null) parts.push(`RIR ${set.rir}`);
  if (set.percent_1rm !== null) parts.push(`${set.percent_1rm}% 1RM`);
  parts.push(`rec ${set.rest_seconds}s`);
  if (set.tempo !== null) parts.push(`tempo ${set.tempo}`);
  if (set.is_warmup) parts.push("warm-up");
  return parts;
}

/** Display line for one set of the per-set list, e.g. "2 · 6 reps · RPE 8.5 · rec 150s". */
export function formatReleaseSetLine(set: ReleaseSetView): string {
  return [`${set.set_number}`, ...setParts(set)].join(" · ");
}

/**
 * Compact scheme for a v2 exercise: when EVERY set is identical, one line
 * tells the truth for all of them; when they differ, "N serie" — the per-set
 * list carries the detail. Never an average, never the first set passed off
 * as all of them.
 */
function schemeV2(sets: ReleaseSetView[]): { scheme: string; uniform: boolean } {
  const uniform = sets.every((s) => sameSet(s, sets[0]));
  if (!uniform) return { scheme: `${sets.length} serie`, uniform };
  const first = sets[0];
  const head = first.reps ? `${sets.length} Serie × ${first.reps} Reps` : `${sets.length} Serie`;
  const parts = setParts(first).filter((p) => !p.endsWith(" reps"));
  return { scheme: [head, ...parts].join(" · "), uniform };
}

/** v2 parser: same defensive posture as v1 — malformed shape degrades to null. */
function parseReleaseDocumentV2(doc: Record<string, unknown>): ReleaseProgramView | null {
  if (!Array.isArray(doc.days) || doc.days.length === 0) return null;
  const days: ReleaseDayView[] = [];
  for (const rawDay of doc.days) {
    // The v2 writer never emits a day without exercises (an empty session is
    // not a delivery): a day with none is a malformed document, not a rest day.
    if (!isObj(rawDay) || !Array.isArray(rawDay.exercises) || rawDay.exercises.length === 0) {
      return null;
    }
    if (typeof rawDay.date !== "string" || !ISO_DATE_RE.test(rawDay.date)) return null;
    const exercises: ReleaseExerciseView[] = [];
    for (let i = 0; i < rawDay.exercises.length; i++) {
      const ex = rawDay.exercises[i];
      if (!isObj(ex) || typeof ex.name !== "string" || !Array.isArray(ex.sets)) return null;
      const sets_detail: ReleaseSetView[] = [];
      for (const rawSet of ex.sets) {
        const parsed = parseSetV2(rawSet);
        if (!parsed) return null;
        sets_detail.push(parsed);
      }
      if (sets_detail.length === 0) return null;
      const { scheme, uniform } = schemeV2(sets_detail);
      const first = sets_detail[0];
      exercises.push({
        id: typeof ex.item_id === "string" ? ex.item_id : `e${i + 1}`,
        code: letterCode(i),
        name: ex.name,
        scheme,
        // Legacy compat fields: honest only when uniform; 0/"" here are the
        // view-level "no single value" markers, never shown as numbers.
        sets: sets_detail.length,
        reps: uniform ? first.reps : "",
        rpe: uniform && first.rpe !== null ? first.rpe : 0,
        sets_detail,
        uniform,
        superset_id: typeof ex.superset_id === "string" ? ex.superset_id : null,
        coach_notes: typeof ex.coach_notes === "string" ? ex.coach_notes : "",
      });
    }
    days.push({
      sessionId: typeof rawDay.session_id === "string" ? rawDay.session_id : `s${days.length + 1}`,
      dayIndex: typeof rawDay.day_index === "number" ? rawDay.day_index : days.length,
      dayName: typeof rawDay.day_name === "string" ? rawDay.day_name : `Giorno ${days.length + 1}`,
      focus: typeof rawDay.focus === "string" ? rawDay.focus : "",
      exercises,
      date: rawDay.date,
      weekOrder: typeof rawDay.week_order === "number" ? rawDay.week_order : undefined,
    });
  }
  return {
    goal: typeof doc.goal === "string" ? doc.goal : "",
    rationale: typeof doc.rationale === "string" ? doc.rationale : "",
    days,
    version: 2,
    name: typeof doc.name === "string" ? doc.name : "",
  };
}

/**
 * Day selection for v2: EXACT match on the coach-confirmed date — no
 * positional weekday mapping. A date with no session is a rest day (null).
 * v1 keeps dayForWeekday above.
 */
export function dayForDate(program: ReleaseProgramView, isoDate: string): ReleaseDayView | null {
  return program.days.find((d) => d.date === isoDate) ?? null;
}

// =============================================================================
// Cross-version selectors — ONE door for every screen (home, Training Hub,
// post-workout debrief). Two screens answering "what does the athlete do
// today?" on their own is exactly how they diverge (defect D6).
// =============================================================================

/**
 * LOCAL-calendar YYYY-MM-DD of a Date — the key that matches the
 * coach-confirmed session dates (v2). Not toISOString(): that is UTC, and at
 * 00:30 in Rome it would still say yesterday. The CALLER owns the clock and
 * passes its own Date; this module never reads it.
 */
export function localIsoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * The session the release prescribes for one calendar date, whatever the
 * document version: v2 matches the coach-confirmed date exactly; v1 maps the
 * date's Monday-based weekday to program day i (Mon -> "Giorno 1"), beyond
 * the program length the athlete rests. Null = rest day (or malformed date).
 */
export function sessionForDate(
  program: ReleaseProgramView,
  isoDate: string,
): ReleaseDayView | null {
  if (!ISO_DATE_RE.test(isoDate)) return null;
  if (program.version === 2) return dayForDate(program, isoDate);
  // Weekday derived from the ISO date itself (UTC parse of a date-only
  // string is timezone-independent): 0 = Monday .. 6 = Sunday.
  const mondayIdx = (new Date(`${isoDate}T00:00:00Z`).getUTCDay() + 6) % 7;
  return dayForWeekday(program, mondayIdx);
}

/** Prescribed RPE range of a session. min === max when every prescription
 *  agrees. This is a QUOTATION of what the coach wrote, on the scale they
 *  wrote it — never a session-RPE estimate: that judgement belongs to the
 *  athlete, after the session (sRPE method). */
export interface SessionRpeRange {
  min: number;
  max: number;
}

/**
 * v2 reads the per-set prescriptions (sets_detail); v1 the per-exercise
 * RPEs. Null and 0 both mean "not prescribed" (0 is the legacy honesty
 * marker, never a real prescription): with no written RPE there is no
 * range — the UI renders no line, never an "RPE 0". Warm-up sets are
 * excluded: a ramp-up RPE is not the session's working intensity, and
 * "RPE serie 4–9" would misquote a 9-RPE session with a light warm-up.
 */
export function sessionRpeRange(day: ReleaseDayView): SessionRpeRange | null {
  const rpes: number[] = [];
  for (const exercise of day.exercises) {
    if (exercise.sets_detail) {
      for (const set of exercise.sets_detail) {
        if (set.is_warmup) continue;
        if (set.rpe !== null && set.rpe > 0) rpes.push(set.rpe);
      }
    } else if (exercise.rpe > 0) {
      rpes.push(exercise.rpe);
    }
  }
  if (rpes.length === 0) return null;
  return { min: Math.min(...rpes), max: Math.max(...rpes) };
}

/** Display label for the prescribed range: "RPE serie 7.5–9", collapsing to
 *  "RPE serie 8" when min === max. */
export function formatSessionRpeRange(range: SessionRpeRange): string {
  return range.min === range.max ? `RPE serie ${range.min}` : `RPE serie ${range.min}–${range.max}`;
}

/** Display title of a session: the coach's focus when written, else the day
 *  name. An empty focus is the NORMAL case on real releases, not an edge —
 *  the fallback is the day's own name, never an invented description. */
export function sessionTitle(day: ReleaseDayView): string {
  const focus = day.focus.trim();
  return focus !== "" ? focus : day.dayName;
}
