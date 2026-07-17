import { assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { baselineExpenditure, updateExpenditure } from "./expenditure.ts";
import { testConfig } from "./nutritionConfig.fixture.ts";
import type { WeightTrend } from "./types.ts";

const cfg = testConfig();

function flatTrend(deltaKg: number, spanDays: number): WeightTrend {
  return {
    emaStartKg: 80,
    emaEndKg: 80 + deltaKg,
    deltaKg,
    spanDays,
    obsKgPerWeek: (deltaKg / spanDays) * 7,
    noiseKg: 0,
    weighDays: 5,
  };
}

Deno.test("baseline: 80 kg → 2992; 62.5 kg → 2338 (pinna il round)", () => {
  assertEquals(baselineExpenditure(80, cfg), 2992); // 80*22*1.7
  assertEquals(baselineExpenditure(62.5, cfg), 2338); // round(2337.5)
});

Deno.test("evidenza: intake 2000 costante, delta -0.7 kg su 7 giorni → 2770 esatto", () => {
  const r = updateExpenditure({
    intakeSeries: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
    trend: flatTrend(-0.7, 7),
    expenditurePrevKcal: 2600,
    confidence: 1,
    cfg,
  });
  assertAlmostEquals(r.evidenceKcal!, 2770, 1e-9); // 2000 + 0.7*7700/7
});

Deno.test(
  "aggiornamento liscio: prev 2600, evidenza 2770, confidenza 0.5 → 2621.25 (gain 0.125)",
  () => {
    const r = updateExpenditure({
      intakeSeries: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
      trend: flatTrend(-0.7, 7),
      expenditurePrevKcal: 2600,
      confidence: 0.5,
      cfg,
    });
    assertAlmostEquals(r.expenditureNewKcal, 2621.25, 1e-9);
  },
);

Deno.test("imputazione: 4 loggati a 2000 + 3 non loggati con prev 2500 → media 2214.2857", () => {
  const r = updateExpenditure({
    intakeSeries: [2000, 2000, 2000, 2000, null, null, null],
    trend: flatTrend(0, 7),
    expenditurePrevKcal: 2500,
    confidence: 1,
    cfg,
  });
  assertEquals(r.imputedDays, 3);
  assertAlmostEquals(r.meanIntakeKcal!, 15500 / 7, 1e-9); // (4*2000+3*2500)/7
  assertAlmostEquals(r.evidenceKcal!, 15500 / 7, 1e-9); // delta 0
});

Deno.test("impute_unlogged_days=false → media solo sui giorni loggati", () => {
  const r = updateExpenditure({
    intakeSeries: [2000, 2000, 2000, 2000, null, null, null],
    trend: flatTrend(0, 7),
    expenditurePrevKcal: 2500,
    confidence: 1,
    cfg: testConfig({ impute_unlogged_days: false }),
  });
  assertEquals(r.imputedDays, 0);
  assertAlmostEquals(r.meanIntakeKcal!, 2000, 1e-9);
});

Deno.test("trend null → dispendio invariato, evidenza null", () => {
  const r = updateExpenditure({
    intakeSeries: [2000, 2000, 2000],
    trend: null,
    expenditurePrevKcal: 2600,
    confidence: 1,
    cfg,
  });
  assertEquals(r.expenditureNewKcal, 2600);
  assertEquals(r.evidenceKcal, null);
});

Deno.test("confidenza 0 → gain 0 → dispendio esattamente invariato", () => {
  const r = updateExpenditure({
    intakeSeries: [2000, 2000, 2000, 2000, 2000, 2000, 2000],
    trend: flatTrend(-0.7, 7),
    expenditurePrevKcal: 2600,
    confidence: 0,
    cfg,
  });
  assertEquals(r.expenditureNewKcal, 2600);
});

Deno.test("nessun giorno loggato senza imputazione → invariato", () => {
  const r = updateExpenditure({
    intakeSeries: [null, null, null],
    trend: flatTrend(-0.3, 3),
    expenditurePrevKcal: 2600,
    confidence: 1,
    cfg: testConfig({ impute_unlogged_days: false }),
  });
  assertEquals(r.expenditureNewKcal, 2600);
  assertEquals(r.evidenceKcal, null);
});
