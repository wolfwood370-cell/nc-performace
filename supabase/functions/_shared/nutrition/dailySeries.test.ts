import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  addDays,
  alphaFromHalfLife,
  buildIntakeSeries,
  buildWeightSeries,
  daysBetween,
  latestBodyFatWithin,
  latestWeightBefore,
  latestWeightOnOrBefore,
  weightTrend,
} from "./dailySeries.ts";

Deno.test("aritmetica date ISO: addDays e daysBetween", () => {
  assertEquals(addDays("2026-07-17", -1), "2026-07-16");
  assertEquals(addDays("2026-07-17", -21), "2026-06-26");
  assertEquals(addDays("2026-12-31", 1), "2027-01-01");
  assertEquals(daysBetween("2026-07-10", "2026-07-17"), 7);
  assertEquals(daysBetween("2026-07-17", "2026-07-10"), -7);
});

Deno.test(
  "buildIntakeSeries: somma per giorno, calories null ignorata, giorno vuoto = null",
  () => {
    const series = buildIntakeSeries(
      [
        { date: "2026-07-10", calories: 800 },
        { date: "2026-07-10", calories: 1200 },
        { date: "2026-07-11", calories: null },
        { date: "2026-07-13", calories: 500 }, // fuori finestra
      ],
      "2026-07-10",
      "2026-07-12",
    );
    assertEquals(series, [2000, null, null]);
  },
);

Deno.test("buildWeightSeries: media aritmetica delle misure dello stesso giorno", () => {
  const series = buildWeightSeries(
    [
      { date: "2026-07-10", weight_kg: 80, body_fat_percentage: null },
      { date: "2026-07-10", weight_kg: 81, body_fat_percentage: null },
      { date: "2026-07-11", weight_kg: null, body_fat_percentage: 20 },
    ],
    "2026-07-10",
    "2026-07-11",
  );
  assertEquals(series, [80.5, null]);
});

Deno.test("selettori ultimo-peso e bf-in-finestra", () => {
  const ms = [
    { date: "2026-07-01", weight_kg: 82, body_fat_percentage: 26 },
    { date: "2026-07-10", weight_kg: 80, body_fat_percentage: null },
    { date: "2026-07-20", weight_kg: 79, body_fat_percentage: null },
  ];
  assertEquals(latestWeightOnOrBefore(ms, "2026-07-15"), { date: "2026-07-10", kg: 80 });
  assertEquals(latestWeightBefore(ms, "2026-07-10"), 82);
  assertEquals(latestBodyFatWithin(ms, "2026-07-05", "2026-07-15"), null); // bf del 01/07 e' fuori
  assertEquals(latestBodyFatWithin(ms, "2026-07-01", "2026-07-15"), 26);
});

Deno.test("alphaFromHalfLife: pin esatti (h=1 → 0.5; h=10 → 0.0669670085)", () => {
  assertAlmostEquals(alphaFromHalfLife(1), 0.5, 1e-12);
  assertAlmostEquals(alphaFromHalfLife(10), 0.06696700846319259, 1e-12);
});

Deno.test("EMA gap-aware: gap di 3 giorni con half-life 1 → alphaEff 0.875, ema 79.65", () => {
  // 80 @idx0, poi 79.6 @idx3: alphaEff = 1-0.5^3 = 0.875 → 80 + 0.875*(-0.4)
  const trend = weightTrend([80, null, null, 79.6], 0.5, null, 3);
  if (trend == null) throw new Error("trend atteso definito");
  assertAlmostEquals(trend.emaEndKg, 79.65, 1e-9);
  assertAlmostEquals(trend.deltaKg, -0.35, 1e-9);
  assertEquals(trend.spanDays, 3);
  assertAlmostEquals(trend.noiseKg, 0.4, 1e-9);
  assertEquals(trend.weighDays, 2);
});

Deno.test("seed pre-finestra: definisce l'EMA dal giorno 0 (gap virtuale k+1)", () => {
  // seed 80 (idx virtuale -1), obs 79.5 @idx1: gap 2 → alphaEff 0.75 → 79.625
  const trend = weightTrend([null, 79.5], 0.5, 80, 1);
  if (trend == null) throw new Error("trend atteso definito");
  assertAlmostEquals(trend.emaStartKg, 80, 1e-9);
  assertAlmostEquals(trend.emaEndKg, 79.625, 1e-9);
  assertEquals(trend.spanDays, 1);
  assertEquals(trend.weighDays, 1); // il seed non conta come pesata in finestra
});

Deno.test("trend indefinito: <2 pesate totali o span sotto il minimo → null", () => {
  assertEquals(weightTrend([80, null, null], 0.5, null, 1), null); // 1 sola pesata
  assertEquals(weightTrend([80, 79.8], 0.5, null, 7), null); // span 1 < 7
  assertEquals(weightTrend([null, null], 0.5, 80, 1), null); // solo seed
});

Deno.test("obsKgPerWeek: delta -0.6 su span 6 → -0.7 kg/settimana", () => {
  // alpha 1: l'EMA insegue esattamente le osservazioni
  const trend = weightTrend([80, null, null, null, null, null, 79.4], 1, null, 6);
  if (trend == null) throw new Error("trend atteso definito");
  assertAlmostEquals(trend.deltaKg, -0.6, 1e-9);
  assertAlmostEquals(trend.obsKgPerWeek, -0.7, 1e-9);
});
