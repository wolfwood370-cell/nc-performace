// =============================================================================
// Pure view-model pins for the athlete nutrition screen. The document fixture
// mirrors the REAL 14-key shape written by compute-nutrition-target
// (target/processAthlete.ts) — lesson M2: fixtures reproduce the writer, not
// an imagined shape. Includes the anti-regression pin of Nick's 2026-07-17
// correction: release AGE alone must NEVER produce a safety pause.
// =============================================================================

import { describe, expect, it } from "vitest";
import { NUTRITION_COPY, STRATEGY_LABELS } from "../copy";
import {
  NUTRITION_REVIEW_NOTIFICATION_TYPE,
  deriveScreenState,
  describeRelease,
  formatItalianDate,
} from "../describeRelease";
import { parseNutritionDocument, parseSafetyContext } from "../parseRelease";
import type { NutritionDocument, NutritionReleaseDbRow, SafetyContextView } from "../types";

// --- fixtures: factories with overrides (gateStatus.test.ts style) ----------

function doc(overrides: Partial<NutritionDocument> = {}): NutritionDocument {
  return {
    daily_calories: 2310,
    protein_g: 158,
    carbs_g: 260,
    fats_g: 62,
    expenditure_estimate: 2760,
    confidence: 0.847,
    logged_days: 5,
    imputed_days: 2,
    fallback_mode: false,
    cold_start: false,
    diet_break_suggested: false,
    strategy: "cut",
    computed_for_date: "2026-07-14",
    weight_kg_at_release: 72.3,
    ...overrides,
  };
}

/** safety_context exactly as the writer builds it (11 keys; the UI reads 3). */
function safetyRaw(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    gate_outcome: "released",
    consent: "granted",
    safety_capture: {
      source: "daily_readiness",
      checkin_present: true,
      latest_date: "2026-07-13",
      has_pain: false,
      weekly_checkins_evaluated: false,
    },
    config_profile: "nicolo_nutrition",
    config_version: "v2",
    capped_by: [],
    evidence_kcal: 2748,
    confidence_components: {
      logDensity: 0.9,
      weightTrendSnr: 0.8,
      historyLength: 0.85,
      combined: 0.847,
    },
    deficit_streak_weeks: 3,
    lifecycle_referral_due: false,
    ...overrides,
  };
}

function safetyView(overrides: Partial<SafetyContextView> = {}): SafetyContextView {
  return { capped_by: [], lifecycle_referral_due: false, deficit_streak_weeks: 3, ...overrides };
}

function releaseRow(overrides: Partial<NutritionReleaseDbRow> = {}): NutritionReleaseDbRow {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    athlete_id: "00000000-0000-4000-8000-0000000000aa",
    coaching_mode: "autonomous",
    cold_start: false,
    config_version: "v2",
    created_at: "2026-07-14T05:00:00+00:00",
    fallback_mode: false,
    nutrition_document: doc() as unknown as NutritionReleaseDbRow["nutrition_document"],
    released_at: "2026-07-14T05:00:00+00:00",
    released_by: "00000000-0000-4000-8000-0000000000bb",
    safety_context: safetyRaw() as NutritionReleaseDbRow["safety_context"],
    schema_version: 1,
    supersedes_id: null,
    ...overrides,
  };
}

const NO_FLAGS = { coldStart: false, fallbackMode: false, inReview: false };

// --- shared contract ---------------------------------------------------------

describe("contratto condiviso col motore", () => {
  it("il canale-pausa è la notifica type='nutrition_review' (pin letterale)", () => {
    expect(NUTRITION_REVIEW_NOTIFICATION_TYPE).toBe("nutrition_review");
  });
});

// --- deriveScreenState -------------------------------------------------------

describe("deriveScreenState — precedenza degli stati", () => {
  it("notifica non letta più recente della release → pausa, con ultimo obiettivo demotato", () => {
    const state = deriveScreenState({
      release: releaseRow(),
      unreadReviewNoticeAt: "2026-07-15T08:00:00+00:00",
    });
    expect(state.kind).toBe("safety-pause");
    if (state.kind === "safety-pause") {
      expect(state.lastRelease?.document.daily_calories).toBe(2310);
    }
  });

  it("notifica non letta senza alcuna release → pausa senza obiettivo", () => {
    const state = deriveScreenState({
      release: null,
      unreadReviewNoticeAt: "2026-07-15T08:00:00+00:00",
    });
    expect(state).toEqual({ kind: "safety-pause", lastRelease: null });
  });

  it("notifica più VECCHIA della release → release normale (il motore ha ri-rilasciato)", () => {
    const state = deriveScreenState({
      release: releaseRow(),
      unreadReviewNoticeAt: "2026-07-10T08:00:00+00:00",
    });
    expect(state.kind).toBe("release");
  });

  it("ANTI-REGRESSIONE (Nick 2026-07-17): release vecchia di mesi senza notifica → release, MAI pausa", () => {
    const state = deriveScreenState({
      release: releaseRow({
        released_at: "2026-01-03T05:00:00+00:00",
        nutrition_document: doc({
          computed_for_date: "2026-01-03",
        }) as unknown as NutritionReleaseDbRow["nutrition_document"],
      }),
      unreadReviewNoticeAt: null,
    });
    expect(state.kind).toBe("release");
  });

  it("nessuna release e nessuna notifica → vuoto", () => {
    expect(deriveScreenState({ release: null, unreadReviewNoticeAt: null })).toEqual({
      kind: "empty",
    });
  });

  it("release con documento malformato → unreadable", () => {
    const state = deriveScreenState({
      release: releaseRow({
        nutrition_document: {
          schema: "vecchio",
        } as unknown as NutritionReleaseDbRow["nutrition_document"],
      }),
      unreadReviewNoticeAt: null,
    });
    expect(state.kind).toBe("unreadable");
  });

  it("release malformata + notifica non letta → pausa con lastRelease null", () => {
    const state = deriveScreenState({
      release: releaseRow({
        nutrition_document: null as unknown as NutritionReleaseDbRow["nutrition_document"],
      }),
      unreadReviewNoticeAt: "2026-07-15T08:00:00+00:00",
    });
    expect(state).toEqual({ kind: "safety-pause", lastRelease: null });
  });
});

// --- parse difensivo ---------------------------------------------------------

describe("parseNutritionDocument — degradazione difensiva", () => {
  it("documento del writer reale → accettato", () => {
    expect(parseNutritionDocument(doc())).not.toBeNull();
  });

  it("chiave numerica mancante (daily_calories) → null", () => {
    const { daily_calories: _dropped, ...rest } = doc();
    expect(parseNutritionDocument(rest)).toBeNull();
  });

  it("valore non numerico o non finito → null, mai NaN a schermo", () => {
    expect(parseNutritionDocument(doc({ daily_calories: "2300" as unknown as number }))).toBeNull();
    expect(parseNutritionDocument(doc({ confidence: Number.NaN }))).toBeNull();
    expect(parseNutritionDocument(doc({ protein_g: Infinity }))).toBeNull();
  });

  it("null / array / stringa → null", () => {
    expect(parseNutritionDocument(null)).toBeNull();
    expect(parseNutritionDocument([doc()])).toBeNull();
    expect(parseNutritionDocument("{}")).toBeNull();
  });

  it("strategy ignota resta accettata: sparisce il pill, non lo schermo", () => {
    const parsed = parseNutritionDocument(doc({ strategy: "recomp" as never }));
    expect(parsed).not.toBeNull();
  });
});

describe("parseSafetyContext — solo le 3 chiavi UI, con degradazione", () => {
  it("contesto del writer reale → capped_by/streak/referral estratti", () => {
    expect(
      parseSafetyContext(safetyRaw({ capped_by: ["daily_cap"], lifecycle_referral_due: true })),
    ).toEqual({ capped_by: ["daily_cap"], lifecycle_referral_due: true, deficit_streak_weeks: 3 });
  });

  it("contesto assente o malformato → zero segnali", () => {
    expect(parseSafetyContext(null)).toEqual({
      capped_by: [],
      lifecycle_referral_due: false,
      deficit_streak_weeks: 0,
    });
    expect(parseSafetyContext("boh")).toEqual({
      capped_by: [],
      lifecycle_referral_due: false,
      deficit_streak_weeks: 0,
    });
  });

  it("valori ignoti in capped_by → filtrati", () => {
    expect(
      parseSafetyContext(safetyRaw({ capped_by: ["daily_cap", "nuovo_cap", 42] })).capped_by,
    ).toEqual(["daily_cap"]);
  });
});

// --- describeRelease ---------------------------------------------------------

describe("describeRelease — spie → copy (deterministico)", () => {
  it("cold start → badge calibrazione + banner + numeri comunque presenti", () => {
    const view = describeRelease(doc({ cold_start: true }), safetyView(), {
      ...NO_FLAGS,
      coldStart: true,
    });
    expect(view.badges).toEqual([{ kind: "calibrazione", label: NUTRITION_COPY.coldStartBadge }]);
    expect(view.banners[0]).toEqual({ kind: "calibrazione", text: NUTRITION_COPY.coldStartBanner });
    expect(view.headline.kcal).toBe(2310);
  });

  it("fallback → banner solo-peso", () => {
    const view = describeRelease(doc({ fallback_mode: true }), safetyView(), {
      ...NO_FLAGS,
      fallbackMode: true,
    });
    expect(view.banners).toEqual([{ kind: "solo-peso", text: NUTRITION_COPY.bannerFallback }]);
  });

  it("macro_floor → minimo di sicurezza; lifecycle_cap → banner fase", () => {
    const floors = describeRelease(doc(), safetyView({ capped_by: ["macro_floor"] }), NO_FLAGS);
    expect(floors.banners).toEqual([
      { kind: "minimo-sicurezza", text: NUTRITION_COPY.bannerMacroFloor },
    ]);
    const lifecycle = describeRelease(
      doc(),
      safetyView({ capped_by: ["lifecycle_cap"] }),
      NO_FLAGS,
    );
    expect(lifecycle.banners).toEqual([
      { kind: "graduale-fase", text: NUTRITION_COPY.bannerLifecycle },
    ]);
  });

  it("daily_cap + weekly_pct_cap insieme → UN solo banner graduale", () => {
    const view = describeRelease(
      doc(),
      safetyView({ capped_by: ["daily_cap", "weekly_pct_cap"] }),
      NO_FLAGS,
    );
    expect(view.banners).toEqual([{ kind: "graduale", text: NUTRITION_COPY.bannerGradual }]);
  });

  it("pausa-dieta con streak 6 → '6 settimane'; streak 0 → variante generica senza numero", () => {
    const withStreak = describeRelease(
      doc({ diet_break_suggested: true }),
      safetyView({ deficit_streak_weeks: 6 }),
      NO_FLAGS,
    );
    expect(withStreak.banners).toEqual([
      { kind: "pausa-dieta", text: NUTRITION_COPY.bannerDietBreak(6) },
    ]);
    expect(withStreak.banners[0].text).toContain("6 settimane");
    const noStreak = describeRelease(
      doc({ diet_break_suggested: true }),
      safetyView({ deficit_streak_weeks: 0 }),
      NO_FLAGS,
    );
    expect(noStreak.banners).toEqual([
      { kind: "pausa-dieta", text: NUTRITION_COPY.bannerDietBreakGeneric },
    ]);
    expect(noStreak.banners[0].text).not.toContain("0");
  });

  it("referral → banner specialista; inReview → badge 'In revisione'", () => {
    const view = describeRelease(doc(), safetyView({ lifecycle_referral_due: true }), {
      ...NO_FLAGS,
      inReview: true,
    });
    expect(view.banners).toEqual([{ kind: "specialista", text: NUTRITION_COPY.bannerReferral }]);
    expect(view.badges).toEqual([{ kind: "in-revisione", label: NUTRITION_COPY.pauseBadge }]);
  });

  it("strategia → etichetta: cut/maintain/bulk mappate, ignota → null", () => {
    expect(
      describeRelease(doc({ strategy: "cut" }), safetyView(), NO_FLAGS).headline.strategyLabel,
    ).toBe("Taglio");
    expect(
      describeRelease(doc({ strategy: "maintain" }), safetyView(), NO_FLAGS).headline.strategyLabel,
    ).toBe("Mantieni");
    expect(
      describeRelease(doc({ strategy: "bulk" }), safetyView(), NO_FLAGS).headline.strategyLabel,
    ).toBe("Massa");
    expect(
      describeRelease(doc({ strategy: "recomp" as never }), safetyView(), NO_FLAGS).headline
        .strategyLabel,
    ).toBeNull();
  });

  it("arrotondamenti e dettagli: confidenza 85%, peso 1 decimale, giorni 5 su 7, data italiana", () => {
    const view = describeRelease(doc({ weight_kg_at_release: 72.34 }), safetyView(), NO_FLAGS);
    expect(view.details).toEqual({
      expenditureKcal: 2760,
      confidencePct: 85,
      loggedDays: 5,
      totalDays: 7,
      weightKg: 72.3,
    });
    expect(view.headline.dateLabel).toBe("Aggiornato il 14/07/2026");
  });

  it("determinismo: stessa fixture → stesso output", () => {
    const input = doc({ cold_start: true, diet_break_suggested: true });
    const flags = { ...NO_FLAGS, coldStart: true };
    expect(describeRelease(input, safetyView({ capped_by: ["daily_cap"] }), flags)).toEqual(
      describeRelease(input, safetyView({ capped_by: ["daily_cap"] }), flags),
    );
  });

  it("ANTI-LEAK: con tutte le spie accese nessuna stringa utente contiene nomi tecnici", () => {
    const view = describeRelease(
      doc({ cold_start: true, fallback_mode: true, diet_break_suggested: true }),
      safetyView({
        capped_by: ["daily_cap", "weekly_pct_cap", "macro_floor", "lifecycle_cap"],
        lifecycle_referral_due: true,
        deficit_streak_weeks: 8,
      }),
      { coldStart: true, fallbackMode: true, inReview: true },
    );
    const allText = [
      view.headline.dateLabel,
      view.headline.strategyLabel ?? "",
      ...view.badges.map((b) => b.label),
      ...view.banners.map((b) => b.text),
    ].join(" | ");
    expect(allText).not.toMatch(
      /daily_cap|weekly_pct_cap|macro_floor|lifecycle_cap|fallback|cold_start|nutrition_review|gate/i,
    );
  });
});

// --- copy: pin letterali del contratto task -----------------------------------

describe("copy — pin letterali (contratto task 2026-07-17)", () => {
  it("le stringhe dettate dal task sono letterali, non riformulate", () => {
    expect(NUTRITION_COPY.bannerFallback).toBe(
      "Hai registrato pochi giorni: questa settimana mi baso solo sul tuo peso. Più registri, più divento preciso.",
    );
    expect(NUTRITION_COPY.coldStartBanner).toBe(
      "Prima settimana: sto calibrando il tuo obiettivo. Registra i pasti e il peso; la prossima settimana affino.",
    );
    expect(NUTRITION_COPY.pauseTitle).toBe("In revisione col tuo coach");
    expect(NUTRITION_COPY.emptyTitle).toBe("Stiamo preparando il tuo primo obiettivo");
    expect(STRATEGY_LABELS).toEqual({ cut: "Taglio", maintain: "Mantieni", bulk: "Massa" });
  });
});

// --- formatItalianDate --------------------------------------------------------

describe("formatItalianDate", () => {
  it("YYYY-MM-DD → DD/MM/YYYY; input non conforme → passthrough", () => {
    expect(formatItalianDate("2026-07-14")).toBe("14/07/2026");
    expect(formatItalianDate("data-sconosciuta")).toBe("data-sconosciuta");
  });
});
