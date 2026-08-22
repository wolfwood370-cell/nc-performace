// Prontezza sulla home: l'assenza resta assenza (mai uno 0 per dire
// "non lo so") e l'unico «oggi» è la riga di oggi del DB — i valori
// legacy persistiti nello store non devono più comparire come "di
// oggi". Stesso harness del render test esistente: renderToString sotto
// environment node, hook dati mockati (decisione 2026-07-14 in
// vitest.config.ts).

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => {
  // Legacy v0 blob with the 11/08 values: the exact scenario this slice
  // removes — days-old store metrics rendered under "riepilogo di oggi".
  const legacyBlob = JSON.stringify({
    state: {
      metrics: {
        Sonno: { today: 8, yesterday: 7 },
        Stress: { today: 2, yesterday: 5 },
        Fatica: { today: 6, yesterday: 6 },
        Soreness: { today: 10, yesterday: 6 },
        Umore: { today: 6, yesterday: 8 },
        Digestione: { today: 8, yesterday: 7 },
      },
      selectedDashboardMetrics: ["Sonno", "Stress", "Fatica"],
      isCustomMetricsPinned: false,
    },
    version: 0,
  });
  const backing = new Map<string, string>([["athlete-readiness-storage", legacyBlob]]);
  // The node environment has no localStorage: provide one seeded with
  // the legacy blob BEFORE the persisted store module evaluates.
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => backing.get(k) ?? null,
    setItem: (k: string, v: string) => void backing.set(k, v),
    removeItem: (k: string) => void backing.delete(k),
    clear: () => backing.clear(),
    key: () => null,
    get length() {
      return backing.size;
    },
  };
  return { readiness: { data: null as unknown } };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, profile: null, loading: false }),
}));
vi.mock("@/hooks/athlete/useProgramRelease", () => ({
  useLatestReleaseQuery: () => ({
    data: null,
    isPending: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock("@/hooks/athlete/useAthleteReadinessHooks", () => ({
  useDailyReadinessQuery: () => ({ data: h.readiness.data }),
}));
vi.mock("@/hooks/athlete/usePaymentOutcome", () => ({
  usePaymentOutcome: () => {},
}));

import AthleteDashboard from "@/pages/athlete/AthleteDashboard";

// A full daily_readiness row shaped like the DB one (11/08 values).
const todayRow = (over: Record<string, unknown> = {}) => ({
  athlete_id: "a1",
  body_weight: null,
  created_at: "2026-08-22T06:00:00Z",
  date: "2026-08-22",
  digestion: 8,
  energy: null,
  fatigue_score: 6,
  has_pain: false,
  id: "r1",
  mood: 6,
  notes: null,
  score: 68,
  sleep_hours: null,
  sleep_quality: 8,
  soreness_map: {},
  stress_level: 2,
  ...over,
});

function renderHome(): string {
  return renderToString(createElement(MemoryRouter, null, createElement(AthleteDashboard))).replace(
    /<!-- -->/g,
    "",
  );
}

beforeEach(() => {
  h.readiness.data = null;
});

describe("assente ≠ zero: senza riga di oggi nessun numero, con la riga il numero c'è", () => {
  it("senza check-in: 'Da registrare' e niente 0; con check-in: il punteggio compare", () => {
    // Absence first…
    const senzaRiga = renderHome();
    expect(senzaRiga).toContain("Da registrare");
    expect(senzaRiga).not.toContain("Punteggio Prontezza 0");
    expect(senzaRiga).not.toMatch(/>0</);
    // …and the positive control in the SAME test: with today's row the
    // number exists (a page that never shows numbers would also pass
    // the assertions above).
    h.readiness.data = todayRow();
    const conRiga = renderHome();
    expect(conRiga).toContain("Punteggio Prontezza 68 su 100");
    expect(conRiga).not.toContain("Da registrare");
  });

  it("riga presente ma senza risposte (score null) → trattino, mai 0", () => {
    h.readiness.data = todayRow({
      score: null,
      sleep_quality: null,
      stress_level: null,
      fatigue_score: null,
      mood: null,
      digestion: null,
      soreness_map: null,
    });
    const html = renderHome();
    expect(html).toContain("Punteggio Prontezza assente");
    expect(html).not.toContain("Punteggio Prontezza 0");
    expect(html).not.toMatch(/>0</);
  });
});

describe("il numero viene dalla riga: due righe diverse → due anelli diversi", () => {
  it("68 e 41 dai due casi reali", () => {
    h.readiness.data = todayRow();
    expect(renderHome()).toContain("Punteggio Prontezza 68 su 100");

    h.readiness.data = todayRow({
      score: 41,
      sleep_quality: 6,
      stress_level: 8,
      mood: 4,
      digestion: null,
    });
    const html = renderHome();
    expect(html).toContain("Punteggio Prontezza 41 su 100");
    expect(html).not.toContain("Punteggio Prontezza 68");
  });
});

describe("lo store legacy non è più un «oggi»", () => {
  it("blob v0 nello store + nessuna riga di oggi → la card non mostra metriche né numeri", () => {
    // localStorage was seeded (vi.hoisted) with the 11/08 metric values;
    // with no row for today NONE of them may render.
    const html = renderHome();
    expect(html).toContain("Da registrare");
    expect(html).not.toContain("Sonno");
    expect(html).not.toContain("Fatica");
    expect(html).not.toMatch(/>8</);
  });

  it("controllo positivo: con la riga di oggi le metriche compaiono (dalla riga, non dallo store)", () => {
    h.readiness.data = todayRow();
    const html = renderHome();
    // Worst-3 of today's row: Stress 2, Fatica 6, Umore 6.
    expect(html).toContain("Stress");
    expect(html).toContain(">2<");
    expect(html).toContain("Fatica");
  });
});
