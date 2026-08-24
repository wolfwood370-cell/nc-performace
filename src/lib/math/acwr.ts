// ── ACWR — single owner (C-09) ─────────────────────────────────────────
// The ONLY place in the frontend that owns: the observation window, the
// load formula, the missing-data policy and the descriptive bands for the
// recent-vs-habitual load ratio. Every surface calls this module; none may
// re-apply thresholds or re-derive mean-7 over mean-28 on its own.
//
// Method source (Nicolò's method, consulted 2026-08-24, outside the repo):
// - session load = sRPE × duration (Foster 2001). sRPE is the SESSION
//   CR-10 scale; the per-set RPE (`rpe_global`) is a DIFFERENT scale and
//   must NEVER substitute it — that would be a scale error, not a fallback.
// - the ratio is a "lens of awareness, not a predictive formula"
//   (Impellizzeri 2020 10.1123/ijspp.2019-0864 · 2021
//   10.1007/s40279-020-01378-6): bands DESCRIBE, they never judge risk.
//
// Purity: "today" is an argument — no clock, no timezone dependence
// (calendar-day arithmetic through Date.UTC), no randomness.

import { ACWR_BASELINE_DAYS, ACWR_LOOKBACK_DAYS } from "./constants";

/** Acute (recent) window in days — the numerator of the ratio. */
export const ACWR_ACUTE_DAYS = 7;

/** Descriptive band boundaries. Same numeric bounds the legacy surfaces
 *  already used (0.8 / 1.3), kept as DESCRIPTION only: below = recent load
 *  under the habitual one, above = over it. No risk wording anywhere. */
export const ACWR_BAND_LOW = 0.8;
export const ACWR_BAND_HIGH = 1.3;

/** A workout session as this module needs it. Callers map their raw rows
 *  (e.g. Supabase `workout_logs`) into this shape — nothing else enters. */
export interface AcwrSessionInput {
  /** Completion timestamp/date; the calendar day is its first 10 chars
   *  (YYYY-MM-DD). `null` = the session cannot be placed in time. */
  completedAt: string | null;
  /** Session RPE (sRPE, CR-10). `null` = the session does NOT enter the
   *  computation — no 0, no invented default, no `rpe_global` in its place. */
  srpe: number | null;
  durationSeconds: number | null;
}

/** Sessions the module refused, counted by reason (first missing wins). */
export interface AcwrExclusions {
  /** No usable completion date. */
  senzaData: number;
  /** No session RPE — the most common case today: nothing writes `srpe`. */
  senzaSrpe: number;
  /** No duration. */
  senzaDurata: number;
}

export type AcwrBand = "sotto" | "in_linea" | "sopra";

export type AcwrAbsenceReason =
  /** Not a single session carries the data the formula needs. */
  | "nessuna_seduta_utilizzabile"
  /** The oldest usable session is younger than the habitual window: a
   *  "habitual load" does not exist yet, so no ratio exists either. */
  | "storia_troppo_corta"
  /** Window covered, but zero load inside it — nothing to divide by. */
  | "carico_abituale_zero";

interface AcwrBase {
  /** Age in days of the oldest usable session (0 when none). */
  daysCovered: number;
  /** = ACWR_BASELINE_DAYS — the window the history must span. */
  daysRequired: number;
  excluded: AcwrExclusions;
  excludedCount: number;
}

export interface AcwrAvailable extends AcwrBase {
  available: true;
  /** acute mean / chronic mean, rounded to 2 decimals. */
  ratio: number;
  band: AcwrBand;
  /** Mean daily load (AU) over the last ACWR_ACUTE_DAYS days, rounded. */
  acuteLoad: number;
  /** Mean daily load (AU) over the last ACWR_BASELINE_DAYS days, rounded. */
  chronicLoad: number;
}

export interface AcwrUnavailable extends AcwrBase {
  available: false;
  reason: AcwrAbsenceReason;
}

export type AcwrComputation = AcwrAvailable | AcwrUnavailable;

/** Calendar-day number of an ISO date/timestamp prefix, timezone-free. */
function dayNumber(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86_400_000;
}

/**
 * First calendar day (ISO, YYYY-MM-DD) a caller's fetch must include so this
 * module can both fill the chronic window AND see enough history to prove
 * coverage. Owned here — the fetch window is part of the window contract:
 * - a DAY boundary, not an instant: two surfaces mounting at different hours
 *   still fetch the same universe for the same "today";
 * - ACWR_LOOKBACK_DAYS (42) deep, not 28: sessions aged 29-42 days open the
 *   minimum-window gate stably; with a 28-day instant fetch the gate could
 *   only be reached on the boundary day, i.e. almost never.
 */
export function acwrLookbackStartIso(todayIso: string): string {
  const today = dayNumber(todayIso);
  if (today === null) {
    throw new TypeError(`acwrLookbackStartIso: data "oggi" non valida: ${todayIso}`);
  }
  return new Date((today - ACWR_LOOKBACK_DAYS) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * The one computation. Deterministic: same sessions + same `todayIso`
 * (YYYY-MM-DD) → same result, on any machine, in any timezone.
 */
export function computeAcwr(
  sessions: ReadonlyArray<AcwrSessionInput>,
  todayIso: string,
): AcwrComputation {
  const today = dayNumber(todayIso);
  if (today === null) {
    throw new TypeError(`computeAcwr: data "oggi" non valida: ${todayIso}`);
  }

  const excluded: AcwrExclusions = { senzaData: 0, senzaSrpe: 0, senzaDurata: 0 };
  const usable: Array<{ age: number; load: number }> = [];

  for (const s of sessions) {
    const day = s.completedAt === null ? null : dayNumber(s.completedAt);
    if (day === null) {
      excluded.senzaData += 1;
      continue;
    }
    if (s.srpe === null || !Number.isFinite(s.srpe)) {
      excluded.senzaSrpe += 1;
      continue;
    }
    if (s.durationSeconds === null || !Number.isFinite(s.durationSeconds)) {
      excluded.senzaDurata += 1;
      continue;
    }
    usable.push({ age: today - day, load: s.srpe * (s.durationSeconds / 60) });
  }

  const excludedCount = excluded.senzaData + excluded.senzaSrpe + excluded.senzaDurata;
  const base = { daysRequired: ACWR_BASELINE_DAYS, excluded, excludedCount };

  if (usable.length === 0) {
    return { available: false, reason: "nessuna_seduta_utilizzabile", daysCovered: 0, ...base };
  }

  // Coverage = how far back the usable history reaches. Future-dated
  // sessions (age < 0) never extend it.
  const daysCovered = Math.max(0, ...usable.map((s) => s.age));

  if (daysCovered < ACWR_BASELINE_DAYS) {
    return { available: false, reason: "storia_troppo_corta", daysCovered, ...base };
  }

  let acuteSum = 0;
  let chronicSum = 0;
  for (const s of usable) {
    if (s.age < 0 || s.age >= ACWR_BASELINE_DAYS) continue;
    chronicSum += s.load;
    if (s.age < ACWR_ACUTE_DAYS) acuteSum += s.load;
  }
  const acuteMean = acuteSum / ACWR_ACUTE_DAYS;
  const chronicMean = chronicSum / ACWR_BASELINE_DAYS;

  if (chronicMean === 0) {
    return { available: false, reason: "carico_abituale_zero", daysCovered, ...base };
  }

  const ratio = Math.round((acuteMean / chronicMean) * 100) / 100;
  const band: AcwrBand =
    ratio < ACWR_BAND_LOW ? "sotto" : ratio > ACWR_BAND_HIGH ? "sopra" : "in_linea";

  return {
    available: true,
    ratio,
    band,
    acuteLoad: Math.round(acuteMean),
    chronicLoad: Math.round(chronicMean),
    daysCovered,
    ...base,
  };
}

// ── User-facing words (Italian) — owned here so every surface shows the
//    SAME description and the SAME absence with the SAME reason. ──────────

/** Descriptive band labels — a description of the ratio, never a verdict. */
export const ACWR_BAND_LABELS: Record<AcwrBand, string> = {
  sopra: "Carico recente sopra l'abituale",
  in_linea: "Carico recente in linea con l'abituale",
  sotto: "Carico recente sotto l'abituale",
};

/** Shown next to the number on every surface that renders the ratio. */
export const ACWR_CAVEAT = "Lente di consapevolezza, non una previsione di infortunio.";

function excludedNote(e: AcwrExclusions): string | null {
  const parts: string[] = [];
  if (e.senzaSrpe > 0) parts.push(`${e.senzaSrpe} senza RPE di sessione`);
  if (e.senzaDurata > 0) parts.push(`${e.senzaDurata} senza durata`);
  if (e.senzaData > 0) parts.push(`${e.senzaData} senza data`);
  if (parts.length === 0) return null;
  const total = e.senzaSrpe + e.senzaDurata + e.senzaData;
  const head = total === 1 ? "1 seduta esclusa" : `${total} sedute escluse`;
  return `${head}: ${parts.join(", ")}`;
}

/** The one absence sentence — real numbers, no invented minimum-session
 *  count, identical on every surface. */
export function acwrAbsenceText(c: AcwrUnavailable): string {
  const note = excludedNote(c.excluded);
  let motivo: string;
  switch (c.reason) {
    case "nessuna_seduta_utilizzabile":
      motivo = "Nessuna seduta con RPE di sessione registrato";
      break;
    case "storia_troppo_corta":
      motivo = `Storico troppo corto: ${c.daysCovered} giorni coperti su ${c.daysRequired} richiesti`;
      break;
    case "carico_abituale_zero":
      motivo = `Nessun carico registrato negli ultimi ${c.daysRequired} giorni`;
      break;
  }
  return note === null ? motivo : `${motivo} (${note})`;
}
