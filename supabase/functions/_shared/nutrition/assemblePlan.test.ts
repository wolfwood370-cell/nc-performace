import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert@1";
import { assembleNutritionPlan } from "./assemblePlan.ts";
import { addDays } from "./dailySeries.ts";
import { testConfig } from "./nutritionConfig.fixture.ts";
import type {
  BodyMeasurementRow,
  NutritionEngineInput,
  NutritionLogRow,
  NutritionReleaseRow,
} from "./types.ts";

const TODAY = "2026-07-17";

// Config "piccola" per i calcoli a mano: finestra 7 giorni, half-life 1
// (alpha 0.5), trend valido da span 6, storico pieno a 7 giorni.
const smallCfg = testConfig({
  expenditure_window_days: 7,
  weight_trend_half_life_days: 1,
  min_trend_span_days: 6,
  min_history_days_full_confidence: 7,
});

function log(daysAgo: number, calories: number | null): NutritionLogRow {
  return { date: addDays(TODAY, -daysAgo), calories };
}

function weight(daysAgo: number, kg: number | null, bf: number | null = null): BodyMeasurementRow {
  return { date: addDays(TODAY, -daysAgo), weight_kg: kg, body_fat_percentage: bf };
}

function release(daysAgo: number, doc: unknown): NutritionReleaseRow {
  return {
    id: `rel-${daysAgo}`,
    released_at: `${addDays(TODAY, -daysAgo)}T08:00:00Z`,
    nutrition_document: doc,
  };
}

function doc(daily: number, exp: number, strategy: string): Record<string, unknown> {
  return { daily_calories: daily, expenditure_estimate: exp, strategy };
}

function baseInput(partial: Partial<NutritionEngineInput>): NutritionEngineInput {
  return {
    todayIso: TODAY,
    config: smallCfg,
    athlete: { cycleStatus: null, lifecycleReferralAlreadySent: false },
    activePlan: null,
    previousReleases: [],
    logs: [],
    measurements: [],
    ...partial,
  };
}

/** Fixture del ramo adattivo: 7 giorni loggati a 2000, peso 80 → 79.8. */
function adaptiveInput(partial: Partial<NutritionEngineInput> = {}): NutritionEngineInput {
  return baseInput({
    activePlan: { daily_calories: 2600, strategy_type: "maintain" },
    previousReleases: [release(7, doc(2600, 2600, "maintain"))],
    logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)),
    measurements: [weight(7, 80), weight(1, 79.8)],
    ...partial,
  });
}

Deno.test("cold start 80 kg: maintain forzato, 2992 kcal, macro pinnate, cold_start true", () => {
  const out = assembleNutritionPlan(
    baseInput({ config: testConfig(), measurements: [weight(1, 80)] }),
  );
  if (out.status !== "released") throw new Error(`atteso released, ottenuto ${out.status}`);
  assertEquals(out.document, {
    daily_calories: 2992, // round(80*22*1.7)
    protein_g: 136, // round(1.7*80)
    carbs_g: 425, // round((2992-544-747)/4)
    fats_g: 83, // max(40, round(0.25*2992/9))
    expenditure_estimate: 2992,
    confidence: 0, // zero giorni loggati → densita' 0 → geometrica 0
    logged_days: 0,
    imputed_days: 0,
    fallback_mode: false,
    cold_start: true,
    diet_break_suggested: false,
    strategy: "maintain",
    computed_for_date: TODAY,
    weight_kg_at_release: 80,
  });
});

Deno.test("nessun peso disponibile → no_baseline_data", () => {
  const out = assembleNutritionPlan(baseInput({ logs: [log(1, 2000)] }));
  assertEquals(out, { status: "no_baseline_data" });
});

Deno.test("strategia sconosciuta nel piano attivo → escalation", () => {
  const out = assembleNutritionPlan(
    baseInput({
      activePlan: { daily_calories: 2000, strategy_type: "recomp" },
      measurements: [weight(1, 80)],
    }),
  );
  if (out.status !== "escalation") throw new Error(`atteso escalation, ottenuto ${out.status}`);
  assert(out.reasons[0].includes("recomp"));
});

Deno.test(
  "ramo adattivo end-to-end: catena evidenza→gain→dispendio→target calcolata a mano",
  () => {
    // EMA (alpha 0.5): 80 @07-10, 79.8 @07-16 → alphaEff 1-0.5^6 = 0.984375
    //   emaEnd = 80 + 0.984375*(-0.2) = 79.803125; delta -0.196875; span 6
    // evidenza = 2000 - (-0.196875*7700/6) = 2252.65625
    // confidenza: density 1 (7/4 clamp), snr = (2/(7/3)) * 1/(1+0.2) = 5/7,
    //   history 1 → combined = cbrt(5/7) ≈ 0.8939035 → round3 0.894
    // gain = 0.25*0.8939035 = 0.2234759
    // dispendio = 2600 + 0.2234759*(2252.65625-2600) ≈ 2522.377 → 2522
    // maintain: raw = dispendio; salto 77.6 < cap 150 → final 2522
    const out = assembleNutritionPlan(adaptiveInput());
    if (out.status !== "released") throw new Error(`atteso released, ottenuto ${out.status}`);
    assertEquals(out.document, {
      daily_calories: 2522,
      protein_g: 136, // round(1.7*79.803125)
      carbs_g: 337, // (2522-544-630)/4
      fats_g: 70, // max(40, round(0.25*2522/9))
      expenditure_estimate: 2522,
      confidence: 0.894,
      logged_days: 7,
      imputed_days: 0,
      fallback_mode: false,
      cold_start: false,
      diet_break_suggested: false,
      strategy: "maintain",
      computed_for_date: TODAY,
      weight_kg_at_release: 79.8,
    });
    assertAlmostEquals(out.audit.evidenceKcal!, 2252.65625, 1e-6);
    assertAlmostEquals(out.audit.expenditureNewKcal, 2522.377, 5e-2);
    assertEquals(out.audit.cappedBy, []);
  },
);

Deno.test("la finestra termina IERI: un log di oggi non cambia nulla", () => {
  const without = assembleNutritionPlan(adaptiveInput());
  const withToday = assembleNutritionPlan(
    adaptiveInput({
      logs: [...[1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)), log(0, 5000)],
    }),
  );
  if (without.status !== "released" || withToday.status !== "released") {
    throw new Error("attesi entrambi released");
  }
  assertEquals(withToday.document, without.document);
});

Deno.test("determinismo: doppia chiamata e input shuffleati → esito identico", () => {
  const a = assembleNutritionPlan(adaptiveInput());
  const b = assembleNutritionPlan(adaptiveInput());
  assertEquals(a, b);

  const shuffled = adaptiveInput();
  shuffled.logs = [...shuffled.logs].reverse();
  shuffled.measurements = [...shuffled.measurements].reverse();
  shuffled.previousReleases = [...shuffled.previousReleases].reverse();
  assertEquals(assembleNutritionPlan(shuffled), a);
});

Deno.test(
  "adherence-neutral: intake +200/die uniforme → raw target sale di gain*200, mai compensazioni",
  () => {
    const a = assembleNutritionPlan(adaptiveInput());
    const b = assembleNutritionPlan(
      adaptiveInput({
        logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2200)),
      }),
    );
    if (a.status !== "released" || b.status !== "released") throw new Error("attesi released");
    // Chi ha mangiato di piu' NON viene punito: l'unico effetto e' l'evidenza
    // di dispendio piu' alta (raw piu' alto di gain*200 ≈ 44.7 kcal).
    assert(b.audit.rawTargetKcal > a.audit.rawTargetKcal);
    assertAlmostEquals(b.audit.rawTargetKcal - a.audit.rawTargetKcal, 0.25 * 0.8939035 * 200, 1e-3);
  },
);

Deno.test(
  "fallback (3 loggati su 7 < 4): dispendio invariato, correzione solo dal trend, cap attivo",
  () => {
    const out = assembleNutritionPlan(
      adaptiveInput({
        logs: [1, 2, 3].map((d) => log(d, 2000)),
      }),
    );
    if (out.status !== "released") throw new Error(`atteso released, ottenuto ${out.status}`);
    // corr = -(obs -0.2296875 - 0)*7700/7 = +252.65625 → raw 2852.65625 → cap +150
    assertEquals(out.document.fallback_mode, true);
    assertEquals(out.document.daily_calories, 2750);
    assertEquals(out.document.expenditure_estimate, 2600); // invariato
    assertEquals(out.audit.cappedBy, ["daily_cap"]);
    assertAlmostEquals(out.audit.rawTargetKcal, 2852.65625, 1e-6);
  },
);

Deno.test("pavimento vince sul cap anche nel flusso completo (cut vicino al pavimento)", () => {
  const cfg = testConfig({
    expenditure_window_days: 7,
    weight_trend_half_life_days: 1,
    min_trend_span_days: 6,
    min_history_days_full_confidence: 7,
    escalation_cap_multiplier: 100, // isola il pin cap-vs-pavimento dall'escalation
  });
  const out = assembleNutritionPlan(
    baseInput({
      config: cfg,
      activePlan: { daily_calories: 1450, strategy_type: "cut" },
      previousReleases: [release(7, doc(1450, 2000, "cut"))],
      logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 1200)),
      measurements: [weight(7, 80), weight(1, 80)],
    }),
  );
  if (out.status !== "released") throw new Error(`atteso released, ottenuto ${out.status}`);
  // raw ≈ 1150 → cap porterebbe a 1363 (< pavimento cut 1416) → vince il pavimento
  assertEquals(out.document.daily_calories, 1416);
  assertEquals(out.audit.cappedBy, ["weekly_pct_cap", "macro_floor"]);
});

Deno.test("stesso scenario con multiplier 3 reale → escalation (salto grezzo 300 > 3*87)", () => {
  const out = assembleNutritionPlan(
    baseInput({
      activePlan: { daily_calories: 1450, strategy_type: "cut" },
      previousReleases: [release(7, doc(1450, 2000, "cut"))],
      logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 1200)),
      measurements: [weight(7, 80), weight(1, 80)],
    }),
  );
  if (out.status !== "escalation") throw new Error(`atteso escalation, ottenuto ${out.status}`);
  assert(out.audit != null);
});

Deno.test("diet-break: 12 settimane di cut consecutive → suggested true; 11 → false", () => {
  const cutInput = (weeks: number) =>
    baseInput({
      activePlan: { daily_calories: 2000, strategy_type: "cut" },
      previousReleases: Array.from({ length: weeks }, (_, i) =>
        release(7 * (i + 1), doc(2000, 2500, "cut")),
      ),
      logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)),
      measurements: [weight(7, 80), weight(1, 80)],
    });
  const twelve = assembleNutritionPlan(cutInput(12));
  if (twelve.status !== "released") throw new Error(`atteso released, ottenuto ${twelve.status}`);
  assertEquals(twelve.document.diet_break_suggested, true);
  assertEquals(twelve.document.daily_calories, 1880); // 2000 - capEff 120 (6% di 2000)

  const eleven = assembleNutritionPlan(cutInput(11));
  if (eleven.status !== "released") throw new Error(`atteso released, ottenuto ${eleven.status}`);
  assertEquals(eleven.document.diet_break_suggested, false);
});

Deno.test("lifecycle assente_3m: deficit dimezzato (raw 2170, non 1840) + referral due", () => {
  const lifecycleInput = (cycleStatus: string | null) =>
    baseInput({
      athlete: { cycleStatus, lifecycleReferralAlreadySent: false },
      activePlan: { daily_calories: 2400, strategy_type: "cut" },
      previousReleases: [release(7, doc(2400, 2500, "cut"))],
      logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2500)), // evidenza = prev → dispendio 2500
      measurements: [weight(7, 80), weight(1, 80)],
    });

  const capped = assembleNutritionPlan(lifecycleInput("assente_3m"));
  if (capped.status !== "released") throw new Error(`atteso released, ottenuto ${capped.status}`);
  assertAlmostEquals(capped.audit.rawTargetKcal, 2170, 1e-6); // 2500 - 330
  assertEquals(capped.document.daily_calories, 2256); // 2400 - capEff 144
  assert(capped.audit.cappedBy.includes("lifecycle_cap"));
  assertEquals(capped.audit.lifecycleReferralDue, true);

  // Senza lifecycle il deficit pieno -660 fa saltare l'escalation (560 > 432):
  // il dimezzamento ha EVITATO l'escalation — pin non-vacuo del multiplier.
  const full = assembleNutritionPlan(lifecycleInput(null));
  if (full.status !== "escalation") throw new Error(`atteso escalation, ottenuto ${full.status}`);
  assertAlmostEquals(full.audit!.rawTargetKcal, 1840, 1e-6); // 2500 - 660

  // referral una-tantum: gia' emesso → non riproposto
  const already = assembleNutritionPlan(
    baseInput({
      athlete: { cycleStatus: "assente_3m", lifecycleReferralAlreadySent: true },
      activePlan: { daily_calories: 2400, strategy_type: "cut" },
      previousReleases: [release(7, doc(2400, 2500, "cut"))],
      logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2500)),
      measurements: [weight(7, 80), weight(1, 80)],
    }),
  );
  if (already.status !== "released") throw new Error("atteso released");
  assertEquals(already.audit.lifecycleReferralDue, false);
});

Deno.test(
  "LEA nel flusso completo: bf 25 in finestra, 2000 kcal → gated; con esercizio 0 → released",
  () => {
    const leaInput = (cfg = smallCfg) =>
      baseInput({
        config: cfg,
        activePlan: { daily_calories: 2050, strategy_type: "maintain" },
        previousReleases: [release(7, doc(2050, 2000, "maintain"))],
        logs: [1, 2, 3, 4, 5, 6, 7].map((d) => log(d, 2000)),
        measurements: [weight(7, 80), weight(4, 80, 25), weight(1, 80)],
      });

    const gated = assembleNutritionPlan(leaInput());
    if (gated.status !== "gated") throw new Error(`atteso gated, ottenuto ${gated.status}`);
    assertEquals(gated.reason, "low_energy_availability"); // (2000-300)/60 = 28.3 < 30
    assertEquals(gated.candidate.daily_calories, 2000);

    // Mutazione 300→0 (il default che Nick ha rifiutato): il gate NON scatterebbe.
    const weakened = assembleNutritionPlan(
      leaInput(
        testConfig({
          expenditure_window_days: 7,
          weight_trend_half_life_days: 1,
          min_trend_span_days: 6,
          min_history_days_full_confidence: 7,
          exercise_kcal_per_day_estimate: 0,
        }),
      ),
    );
    assertEquals(weakened.status, "released"); // 2000/60 = 33.3 → passa
  },
);

Deno.test("calo involontario nel flusso completo: maintain con -0.92 kg/sett → gated", () => {
  const out = assembleNutritionPlan(
    adaptiveInput({
      measurements: [weight(7, 80), weight(1, 79.2)],
    }),
  );
  if (out.status !== "gated") throw new Error(`atteso gated, ottenuto ${out.status}`);
  assertEquals(out.reason, "unintended_weight_loss");
  assert(out.candidate.daily_calories > 0); // il candidato resta visibile al coach
});

Deno.test("documento precedente illeggibile → fallback su piano attivo e baseline", () => {
  const out = assembleNutritionPlan(
    adaptiveInput({
      previousReleases: [release(7, { garbage: true })],
    }),
  );
  if (out.status !== "released") throw new Error(`atteso released, ottenuto ${out.status}`);
  // prev target dal piano (2600); dispendio prev = baseline(emaEnd 79.803125) = 2985
  assertEquals(out.audit.expenditurePrevKcal, 2985);
});
