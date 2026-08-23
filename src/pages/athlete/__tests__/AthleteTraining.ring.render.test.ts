// Coda della fetta A-04, spostata dove il numero SI VEDE: the Training
// Hub glance card must not draw a 0% ring when today's check-in is
// absent — absence is an empty track, a number only exists when the row
// does. Mechanism proof with positive control: without the row NO arc is
// drawn anywhere; with the row the arc exists at the row's value. Same
// renderToString/node harness as the other render tests.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

const h = vi.hoisted(() => {
  // node has no localStorage: the persisted workout store evaluates at
  // import time, so provide one BEFORE modules load.
  const backing = new Map<string, string>();
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

vi.mock("@/hooks/athlete/useAthleteReadinessHooks", () => ({
  useDailyReadinessQuery: () => ({ data: h.readiness.data }),
}));
vi.mock("@/hooks/athlete/useProgramRelease", () => ({
  // A release whose program has NO days: every date is a rest day, which
  // renders the "Giorno di riposo" state card + GlanceCards (the surface
  // under test) without needing a full blueprint fixture.
  useLatestReleaseQuery: () => ({
    data: { release: {}, program: { goal: "", rationale: "", days: [] } },
    isPending: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
  useAthleteGateStatusQuery: () => ({
    data: null,
    isPending: false,
    isError: false,
    refetch: () => Promise.resolve(),
  }),
  useRequestReleaseMutation: () => ({ mutate: () => {}, isPending: false }),
  useRecordConsentMutation: () => ({ mutate: () => {}, isPending: false }),
}));

import AthleteTraining from "@/pages/athlete/AthleteTraining";

function renderHub(): string {
  return renderToString(createElement(MemoryRouter, null, createElement(AthleteTraining))).replace(
    /<!-- -->/g,
    "",
  );
}

// MiniReadinessRing geometry: r=14 → the arc, when drawn, carries
// stroke-dashoffset = circumference * (1 - score/100).
const RING_CIRCUMFERENCE = 2 * Math.PI * 14;

beforeEach(() => {
  h.readiness.data = null;
});

describe("l'anello della Prontezza non disegna zero quando il dato manca", () => {
  it("senza check-in: 'Da registrare', nessun arco; col check-in: l'arco al valore", () => {
    // Absence: the card invites to register and NO ring arc exists in the
    // whole page (the track has no dashoffset — only the arc does).
    const senza = renderHub();
    expect(senza).toContain("Da registrare");
    expect(senza).not.toContain("stroke-dashoffset");

    // Positive control in the SAME test: with today's row the arc is drawn
    // exactly at the row's score.
    h.readiness.data = { score: 68 };
    const con = renderHub();
    expect(con).toContain("68%");
    expect(con).toContain(`stroke-dashoffset="${RING_CIRCUMFERENCE * (1 - 68 / 100)}"`);
    expect(con).not.toContain("Da registrare");
  });

  it("riga presente ma score null → trattino e nessun arco (mai uno 0)", () => {
    h.readiness.data = { score: null };
    const html = renderHub();
    expect(html).toContain("—");
    expect(html).not.toContain("stroke-dashoffset");
    expect(html).not.toContain("0%");
  });

  it("due righe diverse → due archi diversi", () => {
    h.readiness.data = { score: 40 };
    const html = renderHub();
    expect(html).toContain("40%");
    expect(html).toContain(`stroke-dashoffset="${RING_CIRCUMFERENCE * (1 - 40 / 100)}"`);
    expect(html).not.toContain(`stroke-dashoffset="${RING_CIRCUMFERENCE * (1 - 68 / 100)}"`);
  });
});
