// =============================================================================
// supabase/functions/_shared/program/coachRelease.ts
// =============================================================================
// PURE module (no network, no Date, no randomness) — the single source of
// truth for the schema_version 2 release document: written by the edge
// function publish-program-block, read by the athlete view. The FE imports it
// directly (same path precedent as release-autonomous-program/release/
// consents.ts) so writer and reader cannot drift.
// Contract rules (slice 2026-08-20):
//   - a value the coach did not write is null — never 0, never a default;
//   - no conversion between RPE / RIR / %1RM scales;
//   - the session date is explicit coach-confirmed data: defaultSessionDates
//     below is ONLY the pre-fill convention, kept in this one place.
// =============================================================================

// ---- input shape — structural subset of src/types/training.ts ProgramBlock --
// (compatibility is enforced by the FE round-trip test, which feeds a typed
// ProgramBlock straight into buildCoachProgramDocument)

export interface CoachBlockSet {
  set_number: number;
  reps_target: string;
  rpe_target?: number;
  rir_target?: number;
  percent_1rm_target?: number;
  rest_seconds: number;
  is_warmup?: boolean;
  tempo?: string;
}

export interface CoachBlockExercise {
  exercise_id: string;
  exercise_name: string;
  order: number;
  superset_id?: string;
  coach_notes?: string;
  sets: CoachBlockSet[];
}

export interface CoachBlockSession {
  name: string;
  order: number;
  focus?: string;
  exercises: CoachBlockExercise[];
}

export interface CoachBlockWeek {
  /** 1-indexed week number within the block. */
  order: number;
  sessions: CoachBlockSession[];
}

export interface CoachBlockSource {
  block_id: string;
  block_updated_at: string;
  name: string;
  goal: string;
  /** YYYY-MM-DD */
  start_date: string;
  description?: string | null;
  weeks: CoachBlockWeek[];
}

export interface SessionDateInput {
  session_id: string;
  /** YYYY-MM-DD */
  date: string;
}

// ---- document v2 ------------------------------------------------------------

export const COACH_PROGRAM_SCHEMA_VERSION = 2;
export const COACH_CONFIG_VERSION = "coach-v1";

export interface CoachReleaseSetV2 {
  set_number: number;
  reps: string;
  rpe: number | null;
  rir: number | null;
  percent_1rm: number | null;
  rest_seconds: number;
  tempo: string | null;
  is_warmup: boolean;
}

export interface CoachReleaseExerciseV2 {
  item_id: string;
  exercise_id: string;
  name: string;
  order: number;
  superset_id: string | null;
  coach_notes: string;
  sets: CoachReleaseSetV2[];
}

export interface CoachReleaseDayV2 {
  session_id: string;
  /** YYYY-MM-DD — the coach-confirmed calendar day of this session. */
  date: string;
  week_order: number;
  day_index: number;
  day_name: string;
  focus: string;
  exercises: CoachReleaseExerciseV2[];
}

export interface CoachProgramDocumentV2 {
  version: 2;
  source: { block_id: string; block_updated_at: string };
  name: string;
  goal: string;
  start_date: string;
  /** Coach's own words (block.description). Empty allowed — never invented. */
  rationale: string;
  days: CoachReleaseDayV2[];
}

// ---- civil-date arithmetic (no Date on purpose: determinism is contract) ----

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Gregorian date -> Julian day number (Fliegel–Van Flandern). */
function toDayNumber(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const a = Math.floor((14 - m) / 12);
  const y2 = y + 4800 - a;
  const m2 = m + 12 * a - 3;
  return (
    d +
    Math.floor((153 * m2 + 2) / 5) +
    365 * y2 +
    Math.floor(y2 / 4) -
    Math.floor(y2 / 100) +
    Math.floor(y2 / 400) -
    32045
  );
}

/** Julian day number -> Gregorian YYYY-MM-DD (inverse of toDayNumber). */
function fromDayNumber(jdn: number): string {
  const a = jdn + 32044;
  const b = Math.floor((4 * a + 3) / 146097);
  const c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461);
  const e = c - Math.floor((1461 * d) / 4);
  const m = Math.floor((5 * e + 2) / 153);
  const day = e - Math.floor((153 * m + 2) / 5) + 1;
  const month = m + 3 - 12 * Math.floor(m / 10);
  const year = 100 * b + d - 4800 + Math.floor(m / 10);
  const pad = (n: number, w: number) => String(n).padStart(w, "0");
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
}

/** True only for a well-formed, calendar-valid YYYY-MM-DD string. */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !ISO_DATE_RE.test(value)) return false;
  return fromDayNumber(toDayNumber(value)) === value;
}

export function addDaysIso(iso: string, days: number): string {
  return fromDayNumber(toDayNumber(iso) + days);
}

// ---- stable ids -------------------------------------------------------------

/** "w<week>-s<position>" — position is 1-based within the week. */
export function sessionIdFor(weekOrder: number, sessionPosition: number): string {
  return `w${weekOrder}-s${sessionPosition}`;
}

// ---- pre-fill convention ----------------------------------------------------

/**
 * PRE-FILL ONLY. The coach's model has NO weekday field (Session carries just
 * name + order): deriving dates silently would invent an assignment the coach
 * never made. This convention — start_date + 7*(week-1) + session index —
 * exists solely to pre-populate the publish dialog, where every date is shown
 * and editable; only what the coach confirms enters the document.
 *
 * Sessions with NO exercises are not part of any delivery (nothing prescribed,
 * nothing arrives — review 2026-08-20): they get no date row here, no expected
 * date server-side, and no day in the document. Ids stay positional over the
 * FULL session list, so they are stable whether or not neighbours are empty.
 */
export function defaultSessionDates(
  startDate: string,
  weeks: CoachBlockWeek[],
): SessionDateInput[] {
  const out: SessionDateInput[] = [];
  const orderedWeeks = [...weeks].sort((a, b) => a.order - b.order);
  for (const week of orderedWeeks) {
    const sessions = [...week.sessions].sort((a, b) => a.order - b.order);
    sessions.forEach((session, idx) => {
      if (session.exercises.length === 0) return;
      out.push({
        session_id: sessionIdFor(week.order, idx + 1),
        date: addDaysIso(startDate, 7 * (week.order - 1) + idx),
      });
    });
  }
  return out;
}

// ---- builder ----------------------------------------------------------------

const numOrNull = (v: number | undefined): number | null => (typeof v === "number" ? v : null);

/**
 * 0 is not a value on the RPE (1..10) or %1RM (>0) scales: legacy producers
 * use it as an "absent" sentinel (v1 documents; aiProgramMapper's `|| 0`).
 * The v2 contract refuses to inherit that ambiguity, so a sentinel 0 becomes
 * null at the build boundary. RIR is different: RIR 0 IS a real prescription
 * (0 reps in reserve) and is preserved via numOrNull.
 */
const scaleOrNull = (v: number | undefined): number | null =>
  typeof v === "number" && v !== 0 ? v : null;

/**
 * Freezes the coach's draft into the v2 document. Throws on impossible input
 * (missing/duplicate session date): callers validate dates upstream — a throw
 * here is an internal bug, not a user branch.
 */
export function buildCoachProgramDocument(
  source: CoachBlockSource,
  dates: SessionDateInput[],
): CoachProgramDocumentV2 {
  const dateBySession = new Map<string, string>();
  for (const d of dates) dateBySession.set(d.session_id, d.date);

  const days: CoachReleaseDayV2[] = [];
  const orderedWeeks = [...source.weeks].sort((a, b) => a.order - b.order);
  for (const week of orderedWeeks) {
    const sessions = [...week.sessions].sort((a, b) => a.order - b.order);
    sessions.forEach((session, idx) => {
      // An empty session is not a prescription: skipped, never delivered as
      // a "0 exercises" training day (see defaultSessionDates).
      if (session.exercises.length === 0) return;
      const sessionId = sessionIdFor(week.order, idx + 1);
      const date = dateBySession.get(sessionId);
      if (!date) throw new Error(`missing date for session ${sessionId}`);
      const exercises = [...session.exercises]
        .sort((a, b) => a.order - b.order)
        .map((ex, exIdx) => ({
          item_id: `${sessionId}-e${exIdx + 1}`,
          exercise_id: ex.exercise_id,
          name: ex.exercise_name,
          order: ex.order,
          superset_id: ex.superset_id ?? null,
          coach_notes: ex.coach_notes ?? "",
          sets: [...ex.sets]
            .sort((a, b) => a.set_number - b.set_number)
            .map((s) => ({
              set_number: s.set_number,
              reps: s.reps_target,
              rpe: scaleOrNull(s.rpe_target),
              rir: numOrNull(s.rir_target),
              percent_1rm: scaleOrNull(s.percent_1rm_target),
              rest_seconds: s.rest_seconds,
              tempo: s.tempo ?? null,
              is_warmup: s.is_warmup === true,
            })),
        }));
      days.push({
        session_id: sessionId,
        date,
        week_order: week.order,
        day_index: idx,
        day_name: session.name,
        focus: session.focus ?? "",
        exercises,
      });
    });
  }

  days.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  for (let i = 1; i < days.length; i++) {
    if (days[i].date === days[i - 1].date) {
      throw new Error(`duplicate session date ${days[i].date}`);
    }
  }

  return {
    version: 2,
    source: { block_id: source.block_id, block_updated_at: source.block_updated_at },
    name: source.name,
    goal: source.goal,
    start_date: source.start_date,
    rationale: source.description ?? "",
    days,
  };
}

// ---- validator --------------------------------------------------------------

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Boundary validator (CORE §3: the document shape is validated at the write
 * boundary). Rejects the 0-as-absent ambiguity explicitly: rpe must be null
 * or 1..10 (0 is not a prescription), percent_1rm null or >0..100. RIR 0 IS
 * a valid prescription (0 reps in reserve) and stays accepted.
 */
export function validateCoachProgramDocument(
  doc: unknown,
): { ok: true } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const bad = (path: string, msg: string) => errors.push(`${path}: ${msg}`);

  if (!isObj(doc)) return { ok: false, errors: ["document: not an object"] };
  if (doc.version !== COACH_PROGRAM_SCHEMA_VERSION) bad("version", "must be 2");
  if (
    !isObj(doc.source) ||
    typeof doc.source.block_id !== "string" ||
    doc.source.block_id.length === 0 ||
    typeof doc.source.block_updated_at !== "string" ||
    doc.source.block_updated_at.length === 0
  ) {
    bad("source", "must carry block_id and block_updated_at");
  }
  if (typeof doc.name !== "string" || doc.name.length === 0) bad("name", "must be non-empty");
  if (typeof doc.goal !== "string" || doc.goal.length === 0) bad("goal", "must be non-empty");
  if (!isIsoDate(doc.start_date)) bad("start_date", "must be YYYY-MM-DD");
  if (typeof doc.rationale !== "string") bad("rationale", "must be a string (empty allowed)");

  if (!Array.isArray(doc.days) || doc.days.length === 0) {
    bad("days", "must be a non-empty array");
    return { ok: false, errors };
  }

  doc.days.forEach((day, i) => {
    const p = `days[${i}]`;
    if (!isObj(day)) {
      bad(p, "not an object");
      return;
    }
    if (typeof day.session_id !== "string" || !/^w\d+-s\d+$/.test(day.session_id)) {
      bad(`${p}.session_id`, "must match w<week>-s<index>");
    }
    if (!isIsoDate(day.date)) bad(`${p}.date`, "must be YYYY-MM-DD");
    if (!Number.isInteger(day.week_order) || (day.week_order as number) < 1) {
      bad(`${p}.week_order`, "must be an integer >= 1");
    }
    if (!Number.isInteger(day.day_index) || (day.day_index as number) < 0) {
      bad(`${p}.day_index`, "must be an integer >= 0");
    }
    if (typeof day.day_name !== "string") bad(`${p}.day_name`, "must be a string");
    if (typeof day.focus !== "string") bad(`${p}.focus`, "must be a string");
    // Symmetric with sets below: a day with no exercises is not a delivery
    // (the builder never emits one — an athlete must never read "0 esercizi").
    if (!Array.isArray(day.exercises) || day.exercises.length === 0) {
      bad(`${p}.exercises`, "must be a non-empty array");
      return;
    }
    day.exercises.forEach((ex, j) => {
      const pe = `${p}.exercises[${j}]`;
      if (!isObj(ex)) {
        bad(pe, "not an object");
        return;
      }
      if (typeof ex.item_id !== "string" || !/^w\d+-s\d+-e\d+$/.test(ex.item_id)) {
        bad(`${pe}.item_id`, "must match w<week>-s<index>-e<n>");
      }
      if (typeof ex.exercise_id !== "string" || ex.exercise_id.length === 0) {
        bad(`${pe}.exercise_id`, "must be non-empty");
      }
      if (typeof ex.name !== "string" || ex.name.length === 0) {
        bad(`${pe}.name`, "must be non-empty");
      }
      if (!Number.isInteger(ex.order) || (ex.order as number) < 0) {
        bad(`${pe}.order`, "must be an integer >= 0");
      }
      if (ex.superset_id !== null && typeof ex.superset_id !== "string") {
        bad(`${pe}.superset_id`, "must be string or null");
      }
      if (typeof ex.coach_notes !== "string") bad(`${pe}.coach_notes`, "must be a string");
      if (!Array.isArray(ex.sets) || ex.sets.length === 0) {
        bad(`${pe}.sets`, "must be a non-empty array");
        return;
      }
      ex.sets.forEach((s, k) => {
        const ps = `${pe}.sets[${k}]`;
        if (!isObj(s)) {
          bad(ps, "not an object");
          return;
        }
        if (!Number.isInteger(s.set_number) || (s.set_number as number) < 1) {
          bad(`${ps}.set_number`, "must be an integer >= 1");
        }
        if (typeof s.reps !== "string") bad(`${ps}.reps`, "must be a string");
        if (s.rpe !== null && (typeof s.rpe !== "number" || s.rpe < 1 || s.rpe > 10)) {
          bad(`${ps}.rpe`, "must be null or 1..10 (0 is not a prescription)");
        }
        if (s.rir !== null && (typeof s.rir !== "number" || s.rir < 0 || s.rir > 10)) {
          bad(`${ps}.rir`, "must be null or 0..10");
        }
        if (
          s.percent_1rm !== null &&
          (typeof s.percent_1rm !== "number" || s.percent_1rm <= 0 || s.percent_1rm > 100)
        ) {
          bad(`${ps}.percent_1rm`, "must be null or >0..100");
        }
        if (typeof s.rest_seconds !== "number" || s.rest_seconds < 0) {
          bad(`${ps}.rest_seconds`, "must be a number >= 0");
        }
        if (s.tempo !== null && typeof s.tempo !== "string") {
          bad(`${ps}.tempo`, "must be string or null");
        }
        if (typeof s.is_warmup !== "boolean") bad(`${ps}.is_warmup`, "must be a boolean");
      });
    });
  });

  for (let i = 1; i < doc.days.length; i++) {
    const prev = doc.days[i - 1] as Record<string, unknown>;
    const curr = doc.days[i] as Record<string, unknown>;
    if (
      typeof prev.date === "string" &&
      typeof curr.date === "string" &&
      String(curr.date) <= String(prev.date)
    ) {
      bad(`days[${i}].date`, "days must be strictly ascending by date");
    }
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
