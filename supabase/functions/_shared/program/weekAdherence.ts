// =============================================================================
// supabase/functions/_shared/program/weekAdherence.ts
// =============================================================================
// PURE module (no clock, no timezone lookup, no randomness, no network):
// civil YYYY-MM-DD dates in, civil dates and counts out. It answers ONE
// question for the coach's weekly check-in — "which days did the release
// prescribe, and how were they honoured?" — with the SAME semantics the
// athlete door applies (src/lib/program/releaseView.ts sessionForDate):
// v2 documents carry an explicit coach-confirmed date per day; v1 documents
// map the Monday-based weekday to program day i. The parity test
// (src/lib/program/__tests__/weekAdherence.parita.test.ts) derives both
// sides from the sources on every run, so the two doors cannot drift.
//
// Placement: the edge function generate-batch-checkins must import this and
// cannot import from src/ (zero occurrences of that direction in the repo);
// the front-end already imports _shared modules in 15 places (e.g.
// src/lib/billing/access.ts). vitest only includes src/**/*.test.ts, so
// keeping the counting HERE — not inside the edge — is what makes the
// check-in falsifiable by anyone with `npx vitest run`.
//
// Adherence is counted on prescribed DAYS honoured, never on sessions:
// 4 sessions logged on 1 prescribed day are 1 honoured day out of N (a
// session count of 200% is not a compliance). Sessions stay declared apart
// (sessions_completed, off_plan_sessions). With ZERO prescribed days the
// compliance is ABSENT — compliancePct null, and the snapshot key is never
// set — because an absence dressed as a 0% raises a risk banner the athlete
// did not earn (measured 2026-08-28 on the live inbox).
// =============================================================================

import { addDaysIso, isIsoDate } from "./coachRelease.ts";

// ---- input shape ------------------------------------------------------------

/** One workout_logs row as the caller hands it over. `completedDate` is the
 *  civil day of completed_at in Europe/Rome — the CALLER converts (the edge
 *  owns the clock and the timezone; this module never touches either).
 *  `scheduledDate` is the legacy column (NULL on all 16 live rows, no writer
 *  reachable): it is carried so the honest selection below is visible and
 *  falsifiable — counting MUST read completedDate, never scheduledDate. */
export interface WeekLogRow {
  status: string | null;
  completedDate: string | null;
  scheduledDate: string | null;
  totalLoadAu: number | null;
  srpe: number | null;
}

export interface WeekAdherence {
  prescribedCount: number;
  honouredCount: number;
  offPlanCount: number;
  /** null if and only if prescribedCount === 0: nothing to divide by. */
  compliancePct: number | null;
}

/** Snapshot fields this module owns. compliance_pct / workouts_scheduled /
 *  total_volume are OPTIONAL because absence is an ABSENT key: never 0,
 *  never null (a null would render "null%" in the inbox; an absent key
 *  renders "—"). The keys are simply not set — `"k" in snapshot` is false —
 *  so no JSON.stringify trick is even needed. */
export interface WeekSnapshotFields {
  compliance_pct?: number;
  workouts_scheduled?: number;
  workouts_completed: number;
  workouts_missed: number;
  workouts_remaining: number;
  sessions_completed: number;
  off_plan_sessions: number;
  total_volume?: number;
  avg_rpe: string;
}

export interface WeekReport {
  adherence: WeekAdherence;
  snapshot: WeekSnapshotFields;
  missedCount: number;
  remainingCount: number;
  totalVolume: number | null;
  /** "8.5"-style string or the legacy "N/A" sentinel the inbox guards. */
  avgRpe: string;
}

// ---- reading the release document ------------------------------------------
// Structural mirror of parseReleaseDocument's null-rules (releaseView.ts):
// a document that door refuses to parse yields [] here — absence, never an
// invented date. The mirror is intentionally byte-faithful to THOSE checks
// (v1 accepts empty exercise lists, v2 refuses them, v2 dates only need the
// shape test) so the parity test can sweep malformed fixtures too.

const ISO_DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

type Prescription = { kind: "v1"; dayCount: number } | { kind: "v2"; dates: string[] };

function readPrescription(document: unknown): Prescription | null {
  if (isObj(document) && document.version === 2) {
    if (!Array.isArray(document.days) || document.days.length === 0) return null;
    const dates: string[] = [];
    for (const rawDay of document.days) {
      if (!isObj(rawDay) || !Array.isArray(rawDay.exercises) || rawDay.exercises.length === 0) {
        return null;
      }
      if (typeof rawDay.date !== "string" || !ISO_DATE_SHAPE.test(rawDay.date)) return null;
      for (const ex of rawDay.exercises) {
        if (!isObj(ex) || typeof ex.name !== "string" || !Array.isArray(ex.sets)) return null;
        if (ex.sets.length === 0) return null;
        for (const set of ex.sets) {
          if (
            !isObj(set) ||
            typeof set.set_number !== "number" ||
            typeof set.reps !== "string" ||
            typeof set.rest_seconds !== "number"
          ) {
            return null;
          }
        }
      }
      dates.push(rawDay.date);
    }
    return { kind: "v2", dates };
  }
  if (!isObj(document) || document.version !== 1 || !Array.isArray(document.days)) return null;
  for (const rawDay of document.days) {
    if (!isObj(rawDay) || !Array.isArray(rawDay.exercises)) return null;
    for (const ex of rawDay.exercises) {
      if (!isObj(ex) || typeof ex.name !== "string") return null;
    }
  }
  if (document.days.length === 0) return null;
  return { kind: "v1", dayCount: document.days.length };
}

/** Monday-based weekday (0 = Monday .. 6 = Sunday) of a civil date, via
 *  Zeller's congruence: coachRelease exports no weekday helper and this
 *  module may not consult a clock. The parity test proves this arithmetic
 *  agrees with the athlete door's derivation on every date it sweeps. */
function mondayIndex(iso: string): number {
  let y = Number(iso.slice(0, 4));
  let m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (m < 3) {
    m += 12;
    y -= 1;
  }
  const k = y % 100;
  const j = Math.floor(y / 100);
  const h =
    (d + Math.floor((13 * (m + 1)) / 5) + k + Math.floor(k / 4) + Math.floor(j / 4) + 5 * j) % 7;
  // Zeller yields 0 = Saturday .. 6 = Friday; shift to 0 = Monday.
  return (h + 5) % 7;
}

/**
 * The prescribed days of `document` that fall inside [fromIso, toIso],
 * sorted, without duplicates. v2: the document's own coach-confirmed dates.
 * v1: the same Monday-based weekday mapping sessionForDate applies — the v1
 * semantics is INHERITED, not reinvented. Unreadable document, unknown
 * version or inverted window -> [] (absence, never an invented date).
 */
export function prescribedDatesInWindow(
  document: unknown,
  fromIso: string,
  toIso: string,
): string[] {
  if (!isIsoDate(fromIso) || !isIsoDate(toIso) || fromIso > toIso) return [];
  const prescription = readPrescription(document);
  if (prescription === null) return [];
  if (prescription.kind === "v2") {
    // isIsoDate (calendar-valid) is stricter than the parser's shape test:
    // a "2026-02-30" would survive the parser but can never equal a real
    // calendar date, so dropping it here cannot break parity.
    const unique = [
      ...new Set(prescription.dates.filter((d) => isIsoDate(d) && d >= fromIso && d <= toIso)),
    ];
    unique.sort();
    return unique;
  }
  const out: string[] = [];
  for (let day = fromIso; day <= toIso; day = addDaysIso(day, 1)) {
    if (mondayIndex(day) < prescription.dayCount) out.push(day);
  }
  return out;
}

// ---- counting ---------------------------------------------------------------

/**
 * Adherence over prescribed DAYS. `completedDates` carries one entry per
 * completed session (duplicates meaningful): a day is honoured by at least
 * one session on it, so compliancePct can never exceed 100 by construction.
 * Sessions on non-prescribed days count in offPlanCount — they are declared,
 * never folded into the ratio.
 */
export function weekAdherence(input: { prescribed: string[]; completedDates: string[] }): {
  prescribedCount: number;
  honouredCount: number;
  offPlanCount: number;
  compliancePct: number | null;
} {
  const prescribed = [...new Set(input.prescribed)];
  const prescribedSet = new Set(prescribed);
  const completedSet = new Set(input.completedDates);
  const prescribedCount = prescribed.length;
  const honouredCount = prescribed.filter((day) => completedSet.has(day)).length;
  const offPlanCount = input.completedDates.filter((day) => !prescribedSet.has(day)).length;
  const compliancePct =
    prescribedCount === 0 ? null : Math.round((honouredCount / prescribedCount) * 100);
  return { prescribedCount, honouredCount, offPlanCount, compliancePct };
}

/**
 * THE honest selection: a session counts when its status is "completed" and
 * its civil completion day falls inside the window. scheduledDate is dead
 * data here on purpose — it has no writer and is NULL on every live row;
 * filtering on it is exactly the defect this module replaces.
 */
export function completedLogsInWindow(
  logs: WeekLogRow[],
  fromIso: string,
  toIso: string,
): WeekLogRow[] {
  return logs.filter(
    (log) =>
      log.status === "completed" &&
      typeof log.completedDate === "string" &&
      log.completedDate >= fromIso &&
      log.completedDate <= toIso,
  );
}

/**
 * The whole week, counted once, deterministically. The edge function calls
 * this and only formats; the AI never receives a number this function did
 * not produce (CORE §0.11: the model decides words, never numbers).
 */
export function buildWeekReport(input: {
  document: unknown;
  fromIso: string;
  toIso: string;
  todayIso: string;
  logs: WeekLogRow[];
}): WeekReport {
  const prescribed = prescribedDatesInWindow(input.document, input.fromIso, input.toIso);
  const completedLogs = completedLogsInWindow(input.logs, input.fromIso, input.toIso);
  const completedDates = completedLogs.map((log) => log.completedDate as string);
  const adherence = weekAdherence({ prescribed, completedDates });

  const completedSet = new Set(completedDates);
  const missedCount = prescribed.filter(
    (day) => !completedSet.has(day) && day < input.todayIso,
  ).length;
  const remainingCount = prescribed.filter((day) => day >= input.todayIso).length;

  // Same absence rule the 2026-08-27/28 slices set for volume and RPE: the
  // sum runs over present values only, zero measured values leave the
  // metric absent — a fabricated «0 UA» is the same disease as the 0%.
  const loadValues = completedLogs
    .map((log) => log.totalLoadAu)
    .filter((v): v is number => typeof v === "number");
  const totalVolume =
    loadValues.length > 0
      ? Math.round(loadValues.reduce((sum, v) => sum + v, 0) * 100) / 100
      : null;
  const rpeValues = completedLogs
    .map((log) => log.srpe)
    .filter((v): v is number => typeof v === "number");
  const avgRpe =
    rpeValues.length > 0
      ? (rpeValues.reduce((sum, v) => sum + v, 0) / rpeValues.length).toFixed(1)
      : "N/A";

  const snapshot: WeekSnapshotFields = {
    // Conditional spread: with no prescribed day the keys are NEVER SET —
    // `"compliance_pct" in snapshot` is false, JSON carries no key, the
    // inbox renders "—" and isAnomalous stays silent. `?? undefined` would
    // satisfy JSON but leave the key visible to the `in` operator.
    ...(adherence.compliancePct === null
      ? {}
      : {
          compliance_pct: adherence.compliancePct,
          workouts_scheduled: adherence.prescribedCount,
        }),
    workouts_completed: adherence.honouredCount,
    workouts_missed: missedCount,
    workouts_remaining: remainingCount,
    sessions_completed: completedDates.length,
    off_plan_sessions: adherence.offPlanCount,
    ...(totalVolume === null ? {} : { total_volume: totalVolume }),
    avg_rpe: avgRpe,
  };

  return {
    adherence,
    snapshot,
    missedCount,
    remainingCount,
    totalVolume,
    avgRpe,
  };
}

// ---- the words the model is allowed to read ---------------------------------
// User-facing strings are Italian by contract. With ZERO prescribed days
// these strings must not contain "0%" nor "(0/0)": the absence is declared
// in words, never dressed as a measure.

const volumeText = (totalVolume: number | null): string =>
  totalVolume === null ? "N/A" : `${totalVolume} UA`;

/** The "Dati settimana" block of the model prompt (and of nothing else). */
export function weekDataLines(report: WeekReport): string {
  const tail = [
    `- Volume totale: ${volumeText(report.totalVolume)}`,
    `- RPE medio: ${report.avgRpe}`,
  ];
  if (report.adherence.compliancePct === null) {
    return [
      "- Nessuna seduta programmata risulta per questa settimana.",
      `- Sedute concluse: ${report.snapshot.sessions_completed}`,
      ...tail,
    ].join("\n");
  }
  return [
    `- Giorni prescritti onorati: ${report.adherence.honouredCount} su ${report.adherence.prescribedCount}`,
    `- Giorni prescritti saltati: ${report.missedCount}`,
    `- Giorni prescritti ancora in programma: ${report.remainingCount}`,
    `- Sedute concluse: ${report.snapshot.sessions_completed} (di cui fuori programma: ${report.adherence.offPlanCount})`,
    `- Compliance attuale: ${report.adherence.compliancePct}% (${report.adherence.honouredCount}/${report.adherence.prescribedCount})`,
    ...tail,
  ].join("\n");
}

/** Closing context sentence of the prompt. With no prescription the model is
 *  told to report what happened WITHOUT an adherence judgement. */
export function weekPaceContext(input: {
  prescribedCount: number;
  remainingCount: number;
  weekClosed: boolean;
}): string {
  if (input.prescribedCount === 0) {
    return "Per questa settimana non risulta nessuna seduta programmata: riferisci ciò che l'atleta ha effettivamente svolto, senza esprimere alcun giudizio di aderenza.";
  }
  if (input.weekClosed && input.remainingCount === 0) {
    return "La settimana di allenamento è conclusa. Fornisci un riepilogo completo della settimana appena terminata.";
  }
  if (input.remainingCount === 0) {
    return "Tutti gli allenamenti programmati sono stati completati o saltati. Fornisci un riepilogo.";
  }
  return `Ci sono ancora ${input.remainingCount} allenament${
    input.remainingCount === 1 ? "o" : "i"
  } in programma. Motiva l'atleta a dare il massimo nelle sessioni rimanenti.`;
}

/** The non-AI fallback summary — same absence rule as the prompt. */
export function fallbackSummaryText(report: WeekReport): string {
  const tail = `Volume: ${volumeText(report.totalVolume)}. RPE medio: ${report.avgRpe}.`;
  if (report.adherence.compliancePct === null) {
    return `Nessuna seduta programmata questa settimana. Sedute concluse: ${report.snapshot.sessions_completed}. ${tail}`;
  }
  return `Compliance: ${report.adherence.compliancePct}% (${report.adherence.honouredCount}/${report.adherence.prescribedCount} giorni prescritti). Sedute concluse: ${report.snapshot.sessions_completed}. ${tail}`;
}
