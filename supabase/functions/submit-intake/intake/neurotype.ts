// Neurotype scoring (Thibaudeau model) — 1:1 port of the mechanics of
// nc-questionnaire src/lib/neurotype-scoring.ts, backed by the data module
// neurotypeScoringData.ts. Correctness is pinned by the 3 validation
// examples (regression vs the coach script scoring-neurotipo.py) in
// neurotype.test.ts. Deterministic: no I/O, no Date, no randomness.
//
// The result is a SEED with confidence (~8/10): a small margin is a hint,
// not a diagnosis — downstream (rule C3) it is down-weighted for fragile or
// clinical profiles and never overrides measured data or the safety gate.

import { NT_BANDS, NT_MAP } from "./neurotypeScoringData.ts";
import type { NeuroLetter, NeuroTypeCode } from "./neurotypeScoringData.ts";

export type { NeuroLetter, NeuroTypeCode };

/** Fixed type order: it is also the deterministic tie-break (1A > 1B > 2A > 2B > 3). */
export const NT_ORDER: readonly NeuroTypeCode[] = ["1A", "1B", "2A", "2B", "3"];

export function neuroKeyOf(n: number): string {
  return `q${String(n).padStart(2, "0")}`;
}

export interface NeuroScore {
  totals: Record<NeuroTypeCode, number>;
  /** Types sorted by descending total; ties resolved by NT_ORDER. */
  ranked: { code: NeuroTypeCode; total: number }[];
  primary: NeuroTypeCode;
  secondary: NeuroTypeCode;
  margin: number;
  /** Margin <= 5: head-to-head — a hint, not a diagnosis. */
  closeCall: boolean;
}

/**
 * Computes per-type totals from the 30 answers (array of letters A–E in
 * q01→q30 order). Missing or invalid answers add no points.
 */
export function scoreNeurotype(answers: readonly string[]): NeuroScore {
  const totals: Record<NeuroTypeCode, number> = { "1A": 0, "1B": 0, "2A": 0, "2B": 0, "3": 0 };
  for (let n = 1; n <= 30; n++) {
    const entry = NT_MAP[neuroKeyOf(n)];
    const letter = (answers[n - 1] ?? "").toUpperCase() as NeuroLetter;
    const pts = NT_BANDS[entry.band][letter];
    if (typeof pts === "number") totals[entry.type] += pts;
  }
  const ranked = NT_ORDER.map((code) => ({ code, total: totals[code] })).sort(
    (a, b) => b.total - a.total || NT_ORDER.indexOf(a.code) - NT_ORDER.indexOf(b.code),
  );
  const primary = ranked[0];
  const secondary = ranked[1];
  const margin = primary.total - secondary.total;
  return {
    totals,
    ranked,
    primary: primary.code,
    secondary: secondary.code,
    margin,
    closeCall: margin <= 5,
  };
}

const LETTERS: readonly NeuroLetter[] = ["A", "B", "C", "D", "E"];

/**
 * Normalizes answers to an array of 30 letters A–E.
 * Accepts: keys `q01`…`q30` or `q1`…`q30`, letters (a/A) or numbers 1–5
 * (1=A … 5=E). Missing or unrecognized values become "" (no points).
 */
export function normalizeNeuroAnswers(
  source: Record<string, unknown> | null | undefined,
): string[] {
  const out: string[] = [];
  for (let n = 1; n <= 30; n++) {
    let v = source?.[neuroKeyOf(n)];
    if (v === null || v === undefined || v === "") v = source?.[`q${n}`];
    out.push(normalizeLetter(v));
  }
  return out;
}

function normalizeLetter(v: unknown): string {
  if (typeof v === "string") {
    const up = v.trim().toUpperCase();
    if ((LETTERS as readonly string[]).includes(up)) return up;
    const num = Number(up);
    if (Number.isInteger(num) && num >= 1 && num <= 5) return LETTERS[num - 1];
    return "";
  }
  if (typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5) return LETTERS[v - 1];
  return "";
}
