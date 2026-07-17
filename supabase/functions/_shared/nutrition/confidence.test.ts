import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { computeConfidence } from "./confidence.ts";
import { testConfig } from "./nutritionConfig.fixture.ts";
import type { WeightTrend } from "./types.ts";

const cfg = testConfig(); // window 21, minPer7 4 → densita' piena a 12 giorni

function trendOf(partial: Partial<WeightTrend>): WeightTrend {
  return {
    emaStartKg: 80,
    emaEndKg: 80,
    deltaKg: 0,
    spanDays: 14,
    obsKgPerWeek: 0,
    noiseKg: 0,
    weighDays: 7,
    ...partial,
  };
}

Deno.test("logDensity: satura a windowDays*minPer7/7 = 12 giorni; 6 giorni → 0.5", () => {
  const full = computeConfidence({
    loggedDays: 12,
    windowDays: 21,
    trend: null,
    historyDays: 0,
    cfg,
  });
  assertEquals(full.logDensity, 1);
  const half = computeConfidence({
    loggedDays: 6,
    windowDays: 21,
    trend: null,
    historyDays: 0,
    cfg,
  });
  assertEquals(half.logDensity, 0.5);
});

Deno.test("historyLength: piena a 21 giorni; 7 giorni → 1/3", () => {
  const full = computeConfidence({
    loggedDays: 0,
    windowDays: 21,
    trend: null,
    historyDays: 21,
    cfg,
  });
  assertEquals(full.historyLength, 1);
  const third = computeConfidence({
    loggedDays: 0,
    windowDays: 21,
    trend: null,
    historyDays: 7,
    cfg,
  });
  assertAlmostEquals(third.historyLength, 1 / 3, 1e-12);
});

Deno.test(
  "weightTrendSnr: trend null → 0; pesate dense senza rumore → 1; rumore 1 kg dimezza",
  () => {
    const none = computeConfidence({
      loggedDays: 0,
      windowDays: 21,
      trend: null,
      historyDays: 0,
      cfg,
    });
    assertEquals(none.weightTrendSnr, 0);

    const clean = computeConfidence({
      loggedDays: 0,
      windowDays: 21,
      trend: trendOf({ weighDays: 7, noiseKg: 0 }), // target pesate = 21/3 = 7
      historyDays: 0,
      cfg,
    });
    assertEquals(clean.weightTrendSnr, 1);

    const noisy = computeConfidence({
      loggedDays: 0,
      windowDays: 21,
      trend: trendOf({ weighDays: 7, noiseKg: 1 }), // penalita' 1/(1+1/1) = 0.5
      historyDays: 0,
      cfg,
    });
    assertEquals(noisy.weightTrendSnr, 0.5);
  },
);

Deno.test(
  "combinazione = media GEOMETRICA: (0.5,0.5,0.5)→0.5; (1,1,0.5)→0.7937; una componente 0 azzera",
  () => {
    const mid = computeConfidence({
      loggedDays: 6, // 0.5
      windowDays: 21,
      trend: trendOf({ weighDays: 7, noiseKg: 1 }), // 0.5
      historyDays: 10.5, // 0.5
      cfg,
    });
    assertAlmostEquals(mid.combined, 0.5, 1e-12);

    // Pin che fallirebbe con min() (=0.5) o con prodotto puro (=0.5): cbrt(0.5)
    const geo = computeConfidence({
      loggedDays: 12, // 1
      windowDays: 21,
      trend: trendOf({ weighDays: 7, noiseKg: 0 }), // 1
      historyDays: 10.5, // 0.5
      cfg,
    });
    assertAlmostEquals(geo.combined, 0.7937005259840998, 1e-12);

    const zero = computeConfidence({
      loggedDays: 12,
      windowDays: 21,
      trend: null, // componente 0
      historyDays: 21,
      cfg,
    });
    assertEquals(zero.combined, 0);
  },
);

Deno.test("tutte le componenti restano in [0,1] anche con input sovrabbondanti", () => {
  const over = computeConfidence({
    loggedDays: 100,
    windowDays: 21,
    trend: trendOf({ weighDays: 21, noiseKg: 0 }),
    historyDays: 400,
    cfg,
  });
  assert(over.logDensity <= 1 && over.weightTrendSnr <= 1 && over.historyLength <= 1);
  assert(over.combined <= 1 && over.combined >= 0);
});
