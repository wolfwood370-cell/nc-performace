/**
 * src/lib/measurements/__tests__/weightTrend.test.ts
 * ---------------------------------------------------------------------------
 * Pins for the body-measurement helpers. Every assert is written to FAIL on
 * the specific regression it guards: source precedence flipped, index-based
 * moving average, weekly change fabricated from insufficient data (A5).
 */
import { describe, expect, it } from "vitest";
import {
  computeTrendSeries,
  computeWeightStats,
  deriveMeasurementCards,
  mergeWeightSources,
  type MeasurementRow,
} from "../weightTrend";

const row = (partial: Partial<MeasurementRow> & { date: string }): MeasurementRow => ({
  weight_kg: null,
  waist_cm: null,
  chest_cm: null,
  thigh_cm: null,
  arm_cm: null,
  ...partial,
});

describe("mergeWeightSources", () => {
  it("returns empty for empty sources", () => {
    expect(mergeWeightSources([], [])).toEqual([]);
  });

  it("drops null weights from both sources", () => {
    const merged = mergeWeightSources(
      [{ date: "2026-08-01", weight_kg: null }],
      [{ date: "2026-08-02", weight_kg: null }],
    );
    expect(merged).toEqual([]);
  });

  it("on date collision the coach measurement wins over the self-weigh", () => {
    const merged = mergeWeightSources(
      [{ date: "2026-08-05", weight_kg: 81.0 }],
      [{ date: "2026-08-05", weight_kg: 82.4 }],
    );
    expect(merged).toEqual([{ date: "2026-08-05", weight_kg: 82.4 }]);
  });

  it("unions disjoint dates and sorts ascending", () => {
    const merged = mergeWeightSources(
      [{ date: "2026-08-04", weight_kg: 81.2 }],
      [{ date: "2026-08-01", weight_kg: 82.0 }],
    );
    expect(merged).toEqual([
      { date: "2026-08-01", weight_kg: 82.0 },
      { date: "2026-08-04", weight_kg: 81.2 },
    ]);
  });
});

describe("computeTrendSeries", () => {
  it("a single point trends to itself", () => {
    expect(computeTrendSeries([{ date: "2026-08-05", weight_kg: 82.4 }])).toEqual([
      { date: "2026-08-05", weight_kg: 82.4, trend: 82.4 },
    ]);
  });

  it("averages points inside the 7-day window", () => {
    const series = computeTrendSeries([
      { date: "2026-08-01", weight_kg: 82.0 },
      { date: "2026-08-04", weight_kg: 81.0 },
      { date: "2026-08-07", weight_kg: 80.0 },
    ]);
    // Window of Aug 7 = [Aug 1 .. Aug 7]: mean(82, 81, 80) = 81.
    expect(series[2].trend).toBe(81);
  });

  it("the window is date-based, not index-based: a 10-day gap resets it", () => {
    const series = computeTrendSeries([
      { date: "2026-07-20", weight_kg: 90.0 },
      { date: "2026-07-30", weight_kg: 80.0 },
    ]);
    // An index-based 7-point window would average in the 90 from ten days
    // earlier (trend 85). The date window must not.
    expect(series[1].trend).toBe(80);
  });
});

describe("computeWeightStats", () => {
  it("empty series → both stats null", () => {
    expect(computeWeightStats([])).toEqual({ currentTrend: null, weeklyChange: null });
  });

  it("A5: one single measurement → weeklyChange null", () => {
    const stats = computeWeightStats(computeTrendSeries([{ date: "2026-08-05", weight_kg: 82.4 }]));
    expect(stats.currentTrend).toBe(82.4);
    expect(stats.weeklyChange).toBeNull();
  });

  it("two measurements 3 days apart → weeklyChange null (no week of distance)", () => {
    const stats = computeWeightStats(
      computeTrendSeries([
        { date: "2026-08-02", weight_kg: 83.0 },
        { date: "2026-08-05", weight_kg: 82.0 },
      ]),
    );
    expect(stats.weeklyChange).toBeNull();
  });

  it("two measurements 7 days apart → weeklyChange is the trend difference", () => {
    const stats = computeWeightStats(
      computeTrendSeries([
        { date: "2026-07-29", weight_kg: 83.0 },
        { date: "2026-08-05", weight_kg: 82.4 },
      ]),
    );
    expect(stats.weeklyChange).toBe(-0.6);
  });

  it("two measurements 40 days apart → weeklyChange null (month-wide hole)", () => {
    const stats = computeWeightStats(
      computeTrendSeries([
        { date: "2026-06-26", weight_kg: 84.0 },
        { date: "2026-08-05", weight_kg: 82.0 },
      ]),
    );
    expect(stats.weeklyChange).toBeNull();
  });

  it("picks the MOST RECENT point at least 7 days older, not the oldest", () => {
    const stats = computeWeightStats(
      computeTrendSeries([
        { date: "2026-07-01", weight_kg: 90.0 },
        { date: "2026-07-27", weight_kg: 83.0 },
        { date: "2026-08-05", weight_kg: 82.0 },
      ]),
    );
    // Reference must be Jul 27 (gap 9d), not Jul 1 (gap 35d → would be null).
    expect(stats.weeklyChange).toBe(-1);
  });
});

describe("deriveMeasurementCards", () => {
  it("always returns the 4 circumference cards, empty rows → all null", () => {
    const cards = deriveMeasurementCards([]);
    expect(cards.map((c) => c.key)).toEqual(["waist", "chest", "thigh", "arm"]);
    for (const card of cards) {
      expect(card.latestValue).toBeNull();
      expect(card.weeklyChange).toBeNull();
      expect(card.history).toEqual([]);
    }
  });

  it("a weight-only row fabricates no circumference point", () => {
    const cards = deriveMeasurementCards([row({ date: "2026-08-05", weight_kg: 82.4 })]);
    expect(cards.every((c) => c.history.length === 0)).toBe(true);
  });

  it("one value → latestValue set, weeklyChange null", () => {
    const cards = deriveMeasurementCards([row({ date: "2026-08-05", waist_cm: 84.0 })]);
    const waist = cards.find((c) => c.key === "waist")!;
    expect(waist.latestValue).toBe(84.0);
    expect(waist.weeklyChange).toBeNull();
  });

  it("two values → weeklyChange is latest minus previous, rows sorted by date", () => {
    const cards = deriveMeasurementCards([
      row({ date: "2026-08-05", waist_cm: 83.6 }),
      row({ date: "2026-07-29", waist_cm: 84.0 }),
    ]);
    const waist = cards.find((c) => c.key === "waist")!;
    expect(waist.latestValue).toBe(83.6);
    expect(waist.weeklyChange).toBe(-0.4);
    expect(waist.history.map((h) => h.date)).toEqual(["2026-07-29", "2026-08-05"]);
  });

  it("each card follows its own column's dates independently", () => {
    const cards = deriveMeasurementCards([
      row({ date: "2026-07-29", waist_cm: 84.0, chest_cm: 104.0 }),
      row({ date: "2026-08-05", waist_cm: 83.6 }),
    ]);
    expect(cards.find((c) => c.key === "waist")!.history).toHaveLength(2);
    const chest = cards.find((c) => c.key === "chest")!;
    expect(chest.history).toHaveLength(1);
    expect(chest.latestValue).toBe(104.0);
    expect(chest.weeklyChange).toBeNull();
  });
});
