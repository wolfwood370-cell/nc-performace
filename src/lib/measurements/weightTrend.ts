/**
 * src/lib/measurements/weightTrend.ts
 * ---------------------------------------------------------------------------
 * Pure helpers for the athlete body-measurement views (coach platform).
 *
 * Weight has two independent sources that measure the same quantity with
 * two different gestures:
 *   - `daily_metrics.weight_kg`   — athlete self-weigh (offline sync).
 *   - `body_measurements.weight_kg` — instrument measurement entered by the
 *     coach. On date collision this one wins: the coach just typed a number
 *     and expects to see exactly that number.
 *
 * All functions are pure: rows in, series/stats out. Date strings are
 * `yyyy-MM-dd` (the format both tables store).
 */
import { differenceInCalendarDays, parseISO } from "date-fns";

export interface WeightSourceRow {
  date: string;
  weight_kg: number | null;
}

export interface WeightPoint {
  date: string;
  weight_kg: number;
}

export interface TrendPoint extends WeightPoint {
  /** Mean of the weights available in the 7-day window ending at `date`. */
  trend: number;
}

export interface WeightStats {
  /** Latest trend value, null when there are no measurements. */
  currentTrend: number | null;
  /**
   * Latest trend minus the trend of the most recent point at least 7 days
   * older. Null when that reference point does not exist or is more than
   * 30 days older — a "weekly change" without a week of distance (or with
   * a month-wide hole) would be an invention, not a measurement.
   */
  weeklyChange: number | null;
}

export interface MeasurementRow {
  date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  thigh_cm: number | null;
  arm_cm: number | null;
}

export type MeasurementKey = "waist" | "chest" | "thigh" | "arm";

export interface MeasurementCard {
  key: MeasurementKey;
  label: string;
  unit: string;
  /** Most recent recorded value, null when never measured. */
  latestValue: number | null;
  /** Latest minus previous recorded value, null with fewer than 2 values. */
  weeklyChange: number | null;
  /**
   * Calendar days between the last two recorded values, null with fewer
   * than 2. Lets callers refuse to narrate a "weekly" change computed
   * across a month-wide hole.
   */
  lastGapDays: number | null;
  history: Array<{ date: string; value: number }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const daysBetween = (later: string, earlier: string) =>
  differenceInCalendarDays(parseISO(later), parseISO(earlier));

/**
 * Merge the two weight sources into one series, one point per date,
 * sorted ascending. Null weights are dropped; on date collision the
 * `bodyMeasurements` value overrides the `dailyMetrics` one.
 * Pass an empty first argument to read a single source.
 */
export function mergeWeightSources(
  dailyMetrics: WeightSourceRow[],
  bodyMeasurements: WeightSourceRow[],
): WeightPoint[] {
  const byDate = new Map<string, number>();
  for (const row of dailyMetrics) {
    if (row.weight_kg != null) byDate.set(row.date, Number(row.weight_kg));
  }
  for (const row of bodyMeasurements) {
    if (row.weight_kg != null) byDate.set(row.date, Number(row.weight_kg));
  }
  return [...byDate.entries()]
    .map(([date, weight_kg]) => ({ date, weight_kg }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 7-day moving average computed over DATES, not indices: the window for a
 * point is every measurement dated within the 6 days before it (plus the
 * point itself). With weekly measurements each window holds one point and
 * the trend equals the measurement — honest for sparse data, where an
 * index-based window would average values a month apart.
 */
export function computeTrendSeries(points: WeightPoint[]): TrendPoint[] {
  const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date));
  return sorted.map((point, i) => {
    const window: number[] = [];
    for (let j = i; j >= 0; j--) {
      if (daysBetween(point.date, sorted[j].date) > 6) break;
      window.push(sorted[j].weight_kg);
    }
    const mean = window.reduce((sum, w) => sum + w, 0) / window.length;
    return { ...point, trend: round1(mean) };
  });
}

export function computeWeightStats(series: TrendPoint[]): WeightStats {
  if (series.length === 0) return { currentTrend: null, weeklyChange: null };

  const latest = series[series.length - 1];
  let reference: TrendPoint | null = null;
  for (let i = series.length - 2; i >= 0; i--) {
    const gap = daysBetween(latest.date, series[i].date);
    if (gap >= 7) {
      if (gap <= 30) reference = series[i];
      break;
    }
  }

  return {
    currentTrend: latest.trend,
    weeklyChange: reference ? round1(latest.trend - reference.trend) : null,
  };
}

const MEASUREMENT_TYPES: Array<{
  key: MeasurementKey;
  label: string;
  column: keyof Pick<MeasurementRow, "waist_cm" | "chest_cm" | "thigh_cm" | "arm_cm">;
}> = [
  { key: "waist", label: "Vita", column: "waist_cm" },
  { key: "chest", label: "Petto", column: "chest_cm" },
  { key: "thigh", label: "Coscia", column: "thigh_cm" },
  { key: "arm", label: "Braccio", column: "arm_cm" },
];

/**
 * Per-circumference card data from raw `body_measurements` rows. Each card
 * only sees the dates where its own column was filled, so a weight-only
 * row never fabricates a circumference point.
 */
export function deriveMeasurementCards(rows: MeasurementRow[]): MeasurementCard[] {
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date));
  return MEASUREMENT_TYPES.map(({ key, label, column }) => {
    const history = sorted
      .filter((row) => row[column] != null)
      .map((row) => ({ date: row.date, value: Number(row[column]) }));

    const latestValue = history.length > 0 ? history[history.length - 1].value : null;
    const weeklyChange =
      history.length >= 2
        ? round1(history[history.length - 1].value - history[history.length - 2].value)
        : null;
    const lastGapDays =
      history.length >= 2
        ? daysBetween(history[history.length - 1].date, history[history.length - 2].date)
        : null;

    return { key, label, unit: "cm", latestValue, weeklyChange, lastGapDays, history };
  });
}
