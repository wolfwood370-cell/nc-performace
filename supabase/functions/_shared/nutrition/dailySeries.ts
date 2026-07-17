// supabase/functions/_shared/nutrition/dailySeries.ts
// ISO-day arithmetic and daily series construction. PURE: date math runs on
// UTC epochs derived from the ISO strings themselves — never on the clock.

import type { BodyMeasurementRow, NutritionLogRow, WeightTrend } from "./types.ts";

const MS_PER_DAY = 86_400_000;

function epochOf(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) throw new Error(`invalid ISO day: ${iso}`);
  return t;
}

export function addDays(iso: string, n: number): string {
  return new Date(epochOf(iso) + n * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Signed whole days from `fromIso` to `toIso` (positive if toIso is later). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((epochOf(toIso) - epochOf(fromIso)) / MS_PER_DAY);
}

/**
 * Daily intake series over [startIso, endIso] inclusive. Value = sum of the
 * non-null calories of that day's rows; a day with no usable rows is null
 * (= not logged), NOT zero.
 */
export function buildIntakeSeries(
  logs: NutritionLogRow[],
  startIso: string,
  endIso: string,
): Array<number | null> {
  const len = daysBetween(startIso, endIso) + 1;
  const series = new Array<number | null>(Math.max(0, len)).fill(null);
  for (const row of logs) {
    if (row.calories == null || !Number.isFinite(row.calories)) continue;
    const idx = daysBetween(startIso, row.date);
    if (idx < 0 || idx >= series.length) continue;
    series[idx] = (series[idx] ?? 0) + row.calories;
  }
  return series;
}

/** A weight is usable only if finite and strictly positive (0/negative rows
 * are data corruption: they would produce a 0-kcal "suggestion"). */
function isUsableKg(w: number | null): w is number {
  return w != null && Number.isFinite(w) && w > 0;
}

/**
 * Daily weight series over [startIso, endIso] inclusive. Value = arithmetic
 * mean of the day's usable weight_kg measurements; null when unmeasured.
 */
export function buildWeightSeries(
  measurements: BodyMeasurementRow[],
  startIso: string,
  endIso: string,
): Array<number | null> {
  const len = daysBetween(startIso, endIso) + 1;
  const sums = new Array<number>(Math.max(0, len)).fill(0);
  const counts = new Array<number>(Math.max(0, len)).fill(0);
  for (const row of measurements) {
    if (!isUsableKg(row.weight_kg)) continue;
    const idx = daysBetween(startIso, row.date);
    if (idx < 0 || idx >= sums.length) continue;
    sums[idx] += row.weight_kg;
    counts[idx] += 1;
  }
  return sums.map((sum, i) => (counts[i] > 0 ? sum / counts[i] : null));
}

/** Latest usable weight measured on or before dayIso, with its date. */
export function latestWeightOnOrBefore(
  measurements: BodyMeasurementRow[],
  dayIso: string,
): { date: string; kg: number } | null {
  let best: { date: string; kg: number } | null = null;
  for (const row of measurements) {
    if (!isUsableKg(row.weight_kg)) continue;
    if (row.date > dayIso) continue;
    if (!best || row.date >= best.date) best = { date: row.date, kg: row.weight_kg };
  }
  return best;
}

/** Latest usable weight strictly BEFORE dayIso (EMA seed), with its date. */
export function latestWeightEntryBefore(
  measurements: BodyMeasurementRow[],
  dayIso: string,
): { date: string; kg: number } | null {
  let best: { date: string; kg: number } | null = null;
  for (const row of measurements) {
    if (!isUsableKg(row.weight_kg)) continue;
    if (row.date >= dayIso) continue;
    if (!best || row.date >= best.date) best = { date: row.date, kg: row.weight_kg };
  }
  return best;
}

/** Latest non-null body-fat % within [startIso, endIso] (stale bf ⇒ null). */
export function latestBodyFatWithin(
  measurements: BodyMeasurementRow[],
  startIso: string,
  endIso: string,
): number | null {
  let best: { date: string; bf: number } | null = null;
  for (const row of measurements) {
    if (row.body_fat_percentage == null || !Number.isFinite(row.body_fat_percentage)) continue;
    if (row.date < startIso || row.date > endIso) continue;
    if (!best || row.date >= best.date) best = { date: row.date, bf: row.body_fat_percentage };
  }
  return best ? best.bf : null;
}

/** EMA smoothing factor from a half-life in days: alpha = 1 − 2^(−1/H). */
export function alphaFromHalfLife(halfLifeDays: number): number {
  return 1 - Math.pow(2, -1 / halfLifeDays);
}

/** Pre-window EMA seed: the value AND how many days before the window start
 * it was measured — a stale seed must spread its delta over the TRUE elapsed
 * days, or months of change get attributed to the window span. */
export interface TrendSeed {
  kg: number;
  /** daysBetween(seed date, window start), always >= 1. */
  offsetDays: number;
}

/**
 * Gap-aware EMA weight trend over a daily series.
 * - The seed (latest measurement BEFORE the window) sits at its REAL virtual
 *   index −offsetDays: the first in-window observation at index k updates
 *   with an effective gap of k+offsetDays calendar days, and the span runs
 *   from the seed's true date — a tracking pause is never compressed into
 *   the window (it would inflate obsKgPerWeek and fire spurious gates).
 * - On an observation after a gap of g days: alphaEff = 1 − (1−alpha)^g.
 * - Days without observation carry the EMA forward unchanged.
 * Returns null when observations (seed included) < 2 or the observed span is
 * shorter than minSpanDays — too little signal to call it a trend.
 */
export function weightTrend(
  series: Array<number | null>,
  alpha: number,
  seed: TrendSeed | null,
  minSpanDays: number,
): WeightTrend | null {
  const seedKg = seed?.kg ?? null;
  let ema: number | null = seedKg;
  let emaStart: number | null = seedKg;
  let firstDefinedIdx: number | null = seed != null ? -seed.offsetDays : null;
  let prevObsIdx: number | null = seed != null ? -seed.offsetDays : null;
  let lastObsIdx: number | null = null;
  let weighDays = 0;
  let noiseSum = 0;
  let noiseCount = 0;

  for (let i = 0; i < series.length; i++) {
    const w = series[i];
    if (w == null) continue;
    weighDays += 1;
    if (ema == null) {
      ema = w;
      emaStart = w;
      firstDefinedIdx = i;
      prevObsIdx = i;
      lastObsIdx = i;
      continue;
    }
    const gap = prevObsIdx == null ? 1 : i - prevObsIdx;
    const alphaEff = 1 - Math.pow(1 - alpha, gap);
    noiseSum += Math.abs(w - ema);
    noiseCount += 1;
    ema = ema + alphaEff * (w - ema);
    prevObsIdx = i;
    lastObsIdx = i;
  }

  const totalObs = weighDays + (seedKg != null ? 1 : 0);
  if (ema == null || emaStart == null || firstDefinedIdx == null || lastObsIdx == null) return null;
  const spanDays = lastObsIdx - firstDefinedIdx;
  if (totalObs < 2 || spanDays < minSpanDays) return null;

  const deltaKg = ema - emaStart;
  return {
    emaStartKg: emaStart,
    emaEndKg: ema,
    deltaKg,
    spanDays,
    obsKgPerWeek: (deltaKg / spanDays) * 7,
    noiseKg: noiseCount > 0 ? noiseSum / noiseCount : 0,
    weighDays,
  };
}
