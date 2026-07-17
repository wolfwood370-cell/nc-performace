import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import {
  applyGuardrails,
  deficitStreakWeeks,
  fallbackCorrectionKcal,
  isLifecycleCapped,
  readReleaseDocument,
  strategyDeltaKcal,
} from "./target.ts";
import { addDays } from "./dailySeries.ts";
import { testConfig } from "./nutritionConfig.fixture.ts";
import type { NutritionReleaseRow } from "./types.ts";

const cfg = testConfig();
const TODAY = "2026-07-17";

function release(daysAgo: number, strategy: string): NutritionReleaseRow {
  return {
    id: `rel-${daysAgo}`,
    released_at: `${addDays(TODAY, -daysAgo)}T08:00:00Z`,
    nutrition_document: { daily_calories: 2000, expenditure_estimate: 2500, strategy },
  };
}

Deno.test("delta strategia: cut 80 kg → -660; bulk → +220; maintain → 0", () => {
  assertAlmostEquals(strategyDeltaKcal(cfg, "cut", 80, null).deltaKcal, -660, 1e-9);
  assertAlmostEquals(strategyDeltaKcal(cfg, "bulk", 80, null).deltaKcal, 220, 1e-9);
  assertEquals(strategyDeltaKcal(cfg, "maintain", 80, null).deltaKcal, 0);
});

Deno.test("lifecycle: il deficit si dimezza (cut 80 → -330), il surplus bulk NO", () => {
  assert(isLifecycleCapped("assente_3m"));
  assert(isLifecycleCapped("menopausa"));
  assert(!isLifecycleCapped("regolare") && !isLifecycleCapped(null));

  const cut = strategyDeltaKcal(cfg, "cut", 80, "assente_3m");
  assertAlmostEquals(cut.deltaKcal, -330, 1e-9);
  assertEquals(cut.lifecycleCapped, true);

  const bulk = strategyDeltaKcal(cfg, "bulk", 80, "menopausa");
  assertAlmostEquals(bulk.deltaKcal, 220, 1e-9);
  assertEquals(bulk.lifecycleCapped, false);
});

Deno.test("cap effettivo: min(150, 6% del target precedente), su entrambi i lati", () => {
  // prev 2500: capPct 150 → vince (pari merito) il cap giornaliero
  const up = applyGuardrails({
    rawTargetKcal: 2700,
    prevTargetKcal: 2500,
    prevStrategy: "maintain",
    strategy: "maintain",
    weightKg: 80,
    cfg,
  });
  assertEquals(up.finalKcal, 2650);
  assertEquals(up.cappedBy, ["daily_cap"]);

  const down = applyGuardrails({
    rawTargetKcal: 2300,
    prevTargetKcal: 2500,
    prevStrategy: "maintain",
    strategy: "maintain",
    weightKg: 80,
    cfg,
  });
  assertEquals(down.finalKcal, 2350);

  // prev 2000: capPct 120 < 150 → tetto secondario
  const pct = applyGuardrails({
    rawTargetKcal: 2300,
    prevTargetKcal: 2000,
    prevStrategy: "maintain",
    strategy: "maintain",
    weightKg: 80,
    cfg,
  });
  assertEquals(pct.finalKcal, 2120);
  assertEquals(pct.cappedBy, ["weekly_pct_cap"]);
});

Deno.test("pavimento-macro VINCE sul cap: cut 80 kg non scende mai sotto 1416", () => {
  const r = applyGuardrails({
    rawTargetKcal: 1300,
    prevTargetKcal: 1240,
    prevStrategy: "cut",
    strategy: "cut",
    weightKg: 80,
    cfg,
  });
  assertEquals(r.finalKcal, 1416);
  assertEquals(r.cappedBy, ["macro_floor"]);
  assertEquals(r.escalation, null);
});

Deno.test("escalation: oltre 3x il cap a strategia invariata; ESENTE al cambio strategia", () => {
  // stessa strategia, salto 451 > 3*150
  const esc = applyGuardrails({
    rawTargetKcal: 2951,
    prevTargetKcal: 2500,
    prevStrategy: "maintain",
    strategy: "maintain",
    weightKg: 80,
    cfg,
  });
  assert(esc.escalation != null);

  // salto 450 = esattamente 3x → NON escala (maggiore stretto)
  const edge = applyGuardrails({
    rawTargetKcal: 2950,
    prevTargetKcal: 2500,
    prevStrategy: "maintain",
    strategy: "maintain",
    weightKg: 80,
    cfg,
  });
  assertEquals(edge.escalation, null);
  assertEquals(edge.finalKcal, 2650);

  // maintain→cut: il salto -660 e' legittimo, il cap lo fasa comunque
  const strategySwitch = applyGuardrails({
    rawTargetKcal: 1840,
    prevTargetKcal: 2500,
    prevStrategy: "maintain",
    strategy: "cut",
    weightKg: 80,
    cfg,
  });
  assertEquals(strategySwitch.escalation, null);
  assertEquals(strategySwitch.finalKcal, 2350);
});

Deno.test("cold start (prev null): niente cap/escalation, solo pavimento e round", () => {
  const r = applyGuardrails({
    rawTargetKcal: 2991.6,
    prevTargetKcal: null,
    prevStrategy: null,
    strategy: "maintain",
    weightKg: 80,
    cfg,
  });
  assertEquals(r.finalKcal, 2992);
  assertEquals(r.cappedBy, []);
  assertEquals(r.escalation, null);
});

Deno.test("fallback: obiettivo -0.6 kg/sett, osservato -1.0 → correzione +440", () => {
  assertAlmostEquals(fallbackCorrectionKcal(cfg, "cut", 80, -1.0, null), 440, 1e-9);
  // trend assente → hold
  assertEquals(fallbackCorrectionKcal(cfg, "cut", 80, null, null), 0);
  // maintain con peso in salita +0.3 → correzione negativa -330
  assertAlmostEquals(fallbackCorrectionKcal(cfg, "maintain", 80, 0.3, null), -330, 1e-9);
});

Deno.test("readReleaseDocument: difensivo su documenti malformati", () => {
  assertEquals(readReleaseDocument(null), null);
  assertEquals(readReleaseDocument({ daily_calories: 2000 }), null);
  assertEquals(
    readReleaseDocument({ daily_calories: 2000, expenditure_estimate: NaN, strategy: "cut" }),
    null,
  );
  assertEquals(
    readReleaseDocument({ daily_calories: 2000, expenditure_estimate: 2500, strategy: "recomp" }),
    null,
  );
  assertEquals(
    readReleaseDocument({ daily_calories: 2000, expenditure_estimate: 2500, strategy: "cut" }),
    { daily_calories: 2000, expenditure_estimate: 2500, strategy: "cut" },
  );
});

Deno.test("streak deficit: 12 rilasci cut settimanali → 12; 11 → 11; vuoto → 0", () => {
  const twelve = Array.from({ length: 12 }, (_, i) => release(7 * (i + 1), "cut"));
  assertEquals(deficitStreakWeeks(twelve, TODAY, cfg), 12);
  const eleven = Array.from({ length: 11 }, (_, i) => release(7 * (i + 1), "cut"));
  assertEquals(deficitStreakWeeks(eleven, TODAY, cfg), 11);
  assertEquals(deficitStreakWeeks([], TODAY, cfg), 0);
});

Deno.test("streak: gap >14 giorni spezza la catena; un maintain in mezzo spezza", () => {
  // rilasci a -7 e -22: gap 15 → conta solo il primo
  assertEquals(deficitStreakWeeks([release(7, "cut"), release(22, "cut")], TODAY, cfg), 1);
  // cut -7, maintain -14, cut -21 → la catena si ferma al maintain
  assertEquals(
    deficitStreakWeeks(
      [release(7, "cut"), release(14, "maintain"), release(21, "cut")],
      TODAY,
      cfg,
    ),
    1,
  );
});
