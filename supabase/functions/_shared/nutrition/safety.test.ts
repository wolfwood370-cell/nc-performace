import { assertEquals } from "jsr:@std/assert@1";
import { evaluateSafetyGates } from "./safety.ts";
import { testConfig } from "./nutritionConfig.fixture.ts";
import type { WeightTrend } from "./types.ts";

const cfg = testConfig(); // exercise_kcal_per_day_estimate = 300 (decisione Nick)

function trendObs(obsKgPerWeek: number): WeightTrend {
  return {
    emaStartKg: 80,
    emaEndKg: 80,
    deltaKg: 0,
    spanDays: 14,
    obsKgPerWeek,
    noiseKg: 0,
    weighDays: 5,
  };
}

Deno.test(
  "calo involontario: maintain 80 kg, -0.7 kg/sett (soglia 0.6) → gate; -0.5 no; cut no",
  () => {
    const hit = evaluateSafetyGates({
      candidateKcal: 2500,
      strategy: "maintain",
      weightKg: 80,
      trend: trendObs(-0.7),
      latestBodyFatPct: null,
      cfg,
    });
    assertEquals(hit.length, 1);
    assertEquals(hit[0].reason, "unintended_weight_loss");

    const mild = evaluateSafetyGates({
      candidateKcal: 2500,
      strategy: "maintain",
      weightKg: 80,
      trend: trendObs(-0.5),
      latestBodyFatPct: null,
      cfg,
    });
    assertEquals(mild, []);

    const cutting = evaluateSafetyGates({
      candidateKcal: 2500,
      strategy: "cut",
      weightKg: 80,
      trend: trendObs(-0.7),
      latestBodyFatPct: null,
      cfg,
    });
    assertEquals(cutting, []);
  },
);

Deno.test("calo involontario NON valutato senza trend definito", () => {
  const r = evaluateSafetyGates({
    candidateKcal: 2500,
    strategy: "maintain",
    weightKg: 80,
    trend: null,
    latestBodyFatPct: null,
    cfg,
  });
  assertEquals(r, []);
});

Deno.test("LEA: 80 kg bf 25 (FFM 60), esercizio 300: 1800 kcal → EA 25 → gate", () => {
  const r = evaluateSafetyGates({
    candidateKcal: 1800,
    strategy: "cut",
    weightKg: 80,
    trend: null,
    latestBodyFatPct: 25,
    cfg,
  });
  assertEquals(r.length, 1);
  assertEquals(r[0].reason, "low_energy_availability");
});

Deno.test("LEA: minore STRETTO — EA esattamente 30 passa, 29.98 gatea", () => {
  // (2100-300)/60 = 30.0 → NO gate
  const edge = evaluateSafetyGates({
    candidateKcal: 2100,
    strategy: "cut",
    weightKg: 80,
    trend: null,
    latestBodyFatPct: 25,
    cfg,
  });
  assertEquals(edge, []);
  // (2099-300)/60 = 29.983 → gate
  const below = evaluateSafetyGates({
    candidateKcal: 2099,
    strategy: "cut",
    weightKg: 80,
    trend: null,
    latestBodyFatPct: 25,
    cfg,
  });
  assertEquals(below.length, 1);
});

Deno.test("LEA usa exercise_kcal dal CONFIG: con 0 il caso 1800 kcal NON gatea (300 si')", () => {
  // Pin della correzione di Nick: il default 0 indebolirebbe il gate.
  const withZero = evaluateSafetyGates({
    candidateKcal: 1800,
    strategy: "cut",
    weightKg: 80,
    trend: null,
    latestBodyFatPct: 25,
    cfg: testConfig({ exercise_kcal_per_day_estimate: 0 }),
  });
  assertEquals(withZero, []); // 1800/60 = 30 → passa (minore stretto)
});

Deno.test("LEA non valutabile: bf assente o non plausibile → nessun gate", () => {
  for (const bf of [null, 0, 100]) {
    const r = evaluateSafetyGates({
      candidateKcal: 1200,
      strategy: "cut",
      weightKg: 80,
      trend: null,
      latestBodyFatPct: bf,
      cfg,
    });
    assertEquals(r, []);
  }
});
