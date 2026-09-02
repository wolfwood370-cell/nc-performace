// =============================================================================
// supabase/functions/_shared/program/checkinReading.ts
// =============================================================================
// PURE module (no clock, no network, no randomness): the weekly check-in READS
// the week, it does not judge it. Three things live here and nowhere else:
//
//   1. the adherence gate and its wording (R6 of the method: adherence comes
//      first — under the gate the programme is not judged and the load is
//      not commented; the threshold is DATA, exported, tunable in one place);
//   2. the cage around the model's prose, from both sides — the prompt
//      (buildCheckinPrompt) dictates the numbers and forbids load actions,
//      and the vet (vetSummary) refuses any ratio, fraction or percentage
//      that is not in the data, and any load-action word. A refusal costs
//      the deterministic fallback line; a fabricated number would cost the
//      coach's trust. The vet is conservative BY DESIGN (a «24/08» date
//      trips it): CORE §0.8, free text can only raise caution;
//   3. the count of sessions over the attention threshold — read from the
//      watchdog's alerts (coach_alerts.type = 'risk_alert'), DISTINCT by
//      workout_log_id. The threshold itself lives in the watchdog and is
//      never copied here: this module counts its judgements, it does not
//      re-issue them.
//
// Imported by the edge (generate-batch-checkins) AND by the coach inbox, which
// reads the same reading from the snapshot instead of re-deriving a verdict.
// =============================================================================

import { weekDataLines, type WeekReport } from "./weekAdherence.ts";

// ---- constants (data, not scattered numbers) ---------------------------------

/** R6 of the method (check-in settimanale): under this adherence the week is
 *  described, never judged, and the load is not commented. Starting point,
 *  declared tunable. */
export const ADHERENCE_GATE_PCT = 70;

/** Under this many prescribed days the adherence is worded in DAYS («1 giorno
 *  prescritto su 2 non onorato»): on two days «50%» is a pompous way of
 *  saying «one skipped». */
export const ADHERENCE_DAYS_WORDING_BELOW = 4;

// ---- types --------------------------------------------------------------------

export type AdherenceGate = "ok" | "below" | "none";

/** What the reading needs. WeekReport (the edge) satisfies it structurally;
 *  the inbox builds it from the persisted snapshot (readingSourceFromSnapshot). */
export interface WeekReadingSource {
  adherence: { prescribedCount: number; honouredCount: number; compliancePct: number | null };
  missedCount: number;
  remainingCount: number;
  totalVolume: number | null;
}

export interface WeekReading {
  adherence: { gate: AdherenceGate; text: string };
  overThresholdSessions: number;
  load: { ua: number | null; text: string };
  /** The only thing that tints a card: adherence under the gate, or at least
   *  one session the watchdog flagged. Never a verdict on the average RPE. */
  attention: boolean;
}

/** The snapshot keys the reading reads — all optional, mirroring the
 *  persisted shape (absent keys stay absent, see weekAdherence.ts). */
export interface WeekSnapshotLike {
  compliance_pct?: number;
  workouts_scheduled?: number;
  workouts_completed?: number;
  workouts_missed?: number;
  workouts_remaining?: number;
  total_volume?: number;
}

// ---- the adherence rule, in one place -----------------------------------------

const asCount = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function readingSourceFromSnapshot(
  snapshot: WeekSnapshotLike | null | undefined,
): WeekReadingSource {
  const prescribedCount = asCount(snapshot?.workouts_scheduled);
  return {
    adherence: {
      prescribedCount,
      honouredCount: asCount(snapshot?.workouts_completed),
      // An absent compliance_pct is an ABSENCE (no prescription): null, never 0.
      compliancePct:
        typeof snapshot?.compliance_pct === "number" && prescribedCount > 0
          ? snapshot.compliance_pct
          : null,
    },
    missedCount: asCount(snapshot?.workouts_missed),
    remainingCount: asCount(snapshot?.workouts_remaining),
    totalVolume: typeof snapshot?.total_volume === "number" ? snapshot.total_volume : null,
  };
}

/**
 * none  — nothing prescribed: no judgement (the absence already declared).
 * below — compliance under ADHERENCE_GATE_PCT once the week can be judged:
 *         no prescribed day is still ahead, OR the days still ahead cannot
 *         bring it back over the gate even if all honoured. A Tuesday with
 *         1 of 3 honoured and 2 still to come is NOT below: it is open.
 * ok    — otherwise.
 */
function adherenceGate(source: WeekReadingSource): AdherenceGate {
  const { prescribedCount, honouredCount, compliancePct } = source.adherence;
  if (prescribedCount === 0 || compliancePct === null) return "none";
  if (compliancePct >= ADHERENCE_GATE_PCT) return "ok";
  if (source.remainingCount === 0) return "below";
  const reachablePct = Math.round(
    ((honouredCount + source.remainingCount) / prescribedCount) * 100,
  );
  return reachablePct < ADHERENCE_GATE_PCT ? "below" : "ok";
}

const giorniPrescritti = (n: number): string =>
  n === 1 ? "1 giorno prescritto" : `${n} giorni prescritti`;

function adherenceText(source: WeekReadingSource, gate: AdherenceGate): string {
  if (gate === "none") return "nessun giorno prescritto questa settimana";
  const { prescribedCount: p, honouredCount: h, compliancePct } = source.adherence;
  const r = source.remainingCount;
  const ahead = r > 0 ? `, ${r} ancora in programma` : "";
  if (p >= ADHERENCE_DAYS_WORDING_BELOW) {
    return `aderenza ${compliancePct}% (${h} su ${p})${ahead}`;
  }
  if (gate === "below") {
    const m = source.missedCount;
    return `${giorniPrescritti(m)} su ${p} ${m === 1 ? "non onorato" : "non onorati"}${ahead}`;
  }
  return `${giorniPrescritti(h)} su ${p} ${h === 1 ? "onorato" : "onorati"}${ahead}`;
}

/** Italian decimal comma, without Intl (determinism across runtimes). */
const uaText = (ua: number): string => `${String(ua).replace(".", ",")} UA`;

const loadText = (ua: number | null): string =>
  ua === null ? "carico settimanale non misurato" : `carico settimanale ${uaText(ua)}`;

/** The words for the watchdog's count — shared by the inbox and the prompt. */
export function overThresholdText(n: number): string {
  return n === 1
    ? "1 seduta oltre la soglia d'attenzione"
    : `${n} sedute oltre la soglia d'attenzione`;
}

export function weekReading(source: WeekReadingSource, overThresholdSessions: number): WeekReading {
  const gate = adherenceGate(source);
  const ua = source.totalVolume;
  return {
    adherence: { gate, text: adherenceText(source, gate) },
    overThresholdSessions,
    load: { ua, text: loadText(ua) },
    attention: gate === "below" || overThresholdSessions >= 1,
  };
}

// ---- the watchdog's judgements, counted --------------------------------------

/**
 * Sessions of the week the watchdog flagged: DISTINCT workout_log_id among
 * the alerts, restricted to this week's completed logs. The watchdog can
 * write two alerts for one log (it re-fires on UPDATE, deferral of
 * 2026-09-05): one session, one count. The threshold is NOT here.
 */
export function countSessionsOverThreshold(
  alerts: ReadonlyArray<{ workout_log_id: string | null }>,
  weekLogIds: ReadonlyArray<string>,
): number {
  const week = new Set(weekLogIds);
  const hits = alerts
    .map((alert) => alert.workout_log_id)
    .filter((id): id is string => typeof id === "string" && week.has(id));
  return new Set(hits).size;
}

// ---- the prompt: the reading first, then the rules ----------------------------

export interface PromptContext {
  /** Caller-owned. The interpolation of a profile name is a known vector
   *  (review 2026-08-28) and belongs to another slice. */
  athleteName: string;
  dayName: string;
  timeStr: string;
  weekStartIso: string;
  weekEndIso: string;
  avgCalories: number | null;
  /** weekPaceContext(...) — the caller owns the clock that decides it. */
  paceContext: string;
}

/** The rules dictated to the model, verbatim: tests pin them by text. */
export const PROMPT_RULES = {
  onlyListedNumbers: "Usa solo i numeri elencati, così come sono scritti.",
  noNewRatios: "Non comporre rapporti, frazioni o percentuali che non siano nell'elenco.",
  noLoadActions: "Non proporre azioni sul carico: niente scarico, deload, alleggerire o aumentare.",
  belowGate:
    "L'aderenza è sotto la soglia: descrivi la settimana non eseguita e non commentare il carico.",
  datesInWords: "Scrivi le date in lettere (24 agosto), mai con la barra.",
} as const;

export function buildCheckinPrompt(
  reading: WeekReading,
  report: WeekReport,
  ctx: PromptContext,
): string {
  // Order is the contract: adherence -> sessions over threshold -> load ->
  // average RPE as a number. The adherence line precedes every load line.
  const readingLines = [
    `- Aderenza: ${reading.adherence.text}`,
    `- Sedute oltre la soglia d'attenzione: ${reading.overThresholdSessions}`,
    `- Carico: ${reading.load.text}`,
    `- RPE medio: ${report.avgRpe}`,
  ];
  const rules = [
    PROMPT_RULES.onlyListedNumbers,
    PROMPT_RULES.noNewRatios,
    PROMPT_RULES.noLoadActions,
    ...(reading.adherence.gate === "below" ? [PROMPT_RULES.belowGate] : []),
    PROMPT_RULES.datesInWords,
  ].map((rule, i) => `${i + 1}. ${rule}`);

  return `Sei un coach sportivo italiano esperto. Analizza la settimana corrente per ${ctx.athleteName}.

Contesto temporale: Oggi è ${ctx.dayName}, ore ${ctx.timeStr} (fuso orario: Europe/Rome). Settimana dal ${ctx.weekStartIso} al ${ctx.weekEndIso}.

NOTA IMPORTANTE: I dati sono basati sul fuso orario italiano (Europe/Rome). Se l'ultimo allenamento è stato fatto oggi o nelle ultime 24 ore, considera la settimana ancora in corso per l'atleta. Se oggi è domenica o lunedì, fai un riepilogo della settimana COMPLETA appena trascorsa.

Lettura della settimana:
${readingLines.join("\n")}

Dati settimana:
${weekDataLines(report, reading.overThresholdSessions)}
- Calorie medie giornaliere: ${ctx.avgCalories ? ctx.avgCalories + " kcal" : "Non registrate"}

${ctx.paceContext}

Regole:
${rules.join("\n")}

Scrivi un breve report (max 280 caratteri) in italiano. Sii tecnico ma incoraggiante. Non usare emoji.`;
}

// ---- the vet: every ratio and percentage must already be in the data ---------

const DECIMAL = "\\d+(?:[.,]\\d+)?";
/** «N su M», with up to three words in between («4 sedute su 5»,
 *  «1 giorno prescritto su 2»). */
const RATIO_SU = new RegExp(`(${DECIMAL})\\s+(?:\\p{L}+\\s+){0,3}su\\s+(${DECIMAL})`, "giu");
/** «N/M» — a «24/08» date matches too, on purpose: caution only rises. */
const RATIO_SLASH = new RegExp(`(${DECIMAL})\\s*/\\s*(${DECIMAL})`, "g");
const PERCENT = new RegExp(`(${DECIMAL})\\s*%`, "g");
/** Stems of the load actions the model must not propose (case-insensitive). */
const FORBIDDEN_STEMS = ["scaric", "deload", "allegger"] as const;

const toNumber = (s: string): number => Number(s.replace(",", "."));

/** The ratios the prompt itself writes: honoured/prescribed, the ones the
 *  adherence wording carries (e.g. «1 giorno prescritto su 2 non onorato»),
 *  and avgRpe/10 because the scale is known. Nothing else. */
function allowedRatios(report: WeekReport): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const { prescribedCount, honouredCount } = report.adherence;
  if (prescribedCount > 0) {
    out.push([honouredCount, prescribedCount]);
    const wording = adherenceText(report, adherenceGate(report));
    for (const m of wording.matchAll(RATIO_SU)) out.push([toNumber(m[1]), toNumber(m[2])]);
  }
  const rpe = toNumber(report.avgRpe);
  if (report.avgRpe !== "N/A" && Number.isFinite(rpe)) out.push([rpe, 10]);
  return out;
}

export function vetSummary(
  text: string,
  report: WeekReport,
): { ok: true } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  const ratios = allowedRatios(report);
  const percents = report.adherence.compliancePct === null ? [] : [report.adherence.compliancePct];
  const ratioAllowed = (a: number, b: number) => ratios.some(([x, y]) => x === a && y === b);

  for (const m of text.matchAll(RATIO_SU)) {
    if (!ratioAllowed(toNumber(m[1]), toNumber(m[2]))) {
      reasons.push(`rapporto «${m[0]}» assente dai dati`);
    }
  }
  for (const m of text.matchAll(RATIO_SLASH)) {
    if (!ratioAllowed(toNumber(m[1]), toNumber(m[2]))) {
      reasons.push(`rapporto «${m[0]}» assente dai dati`);
    }
  }
  for (const m of text.matchAll(PERCENT)) {
    if (!percents.includes(toNumber(m[1]))) {
      reasons.push(`percentuale «${m[0]}» assente dai dati`);
    }
  }
  for (const stem of FORBIDDEN_STEMS) {
    const hit = text.match(new RegExp(`\\p{L}*${stem}\\p{L}*`, "iu"));
    if (hit) reasons.push(`parola vietata «${hit[0]}»`);
  }
  return reasons.length === 0 ? { ok: true } : { ok: false, reasons };
}
