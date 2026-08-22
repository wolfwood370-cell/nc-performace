// Mechanism proof for the athlete home (acceptance #1-#3 of the slice):
// the page is REALLY mounted (react-dom/server renderToString — works under
// the node environment, no jsdom: decision of 2026-07-14 in vitest.config.ts)
// with the data hooks mocked. What makes these tests count: TWO different
// release documents must produce TWO different screens, and TWO different
// profiles TWO different greetings — a fixture that merely matches a
// hardcoded value would pass with the old MOCK constant, this cannot.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { localIsoDate, parseReleaseDocument } from "@/lib/program/releaseView";

const h = vi.hoisted(() => ({
  auth: { profile: null as { full_name: string | null } | null },
  release: {
    data: null as unknown,
    isPending: false,
    isError: false,
  },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null, profile: h.auth.profile, loading: false }),
}));
vi.mock("@/hooks/athlete/useProgramRelease", () => ({
  useLatestReleaseQuery: () => ({
    data: h.release.data,
    isPending: h.release.isPending,
    isError: h.release.isError,
    refetch: () => Promise.resolve(),
  }),
}));
vi.mock("@/hooks/athlete/useAthleteReadinessHooks", () => ({
  useDailyReadinessQuery: () => ({ data: undefined }),
}));
vi.mock("@/hooks/athlete/usePaymentOutcome", () => ({
  usePaymentOutcome: () => {},
}));

import AthleteDashboard from "@/pages/athlete/AthleteDashboard";

// ---------------------------------------------------------------------------
// Fixtures — v2 raw documents round-tripped through the REAL parser.
// ---------------------------------------------------------------------------

const TODAY = localIsoDate(new Date());

const rawSet = (setNumber: number, rpe: number | null, percent1rm: number | null = null) => ({
  set_number: setNumber,
  reps: "5",
  rpe,
  rir: null,
  percent_1rm: percent1rm,
  rest_seconds: 90,
  tempo: null,
  is_warmup: false,
});

const docWithDay = (dayName: string, date: string, sets: ReturnType<typeof rawSet>[]) => ({
  version: 2,
  goal: "forza",
  rationale: "",
  name: "Blocco 1",
  days: [
    {
      session_id: "s1",
      day_index: 0,
      day_name: dayName,
      focus: "", // empty focus is the NORMAL case on real releases
      date,
      week_order: 1,
      exercises: [{ item_id: "s1-e1", name: "Back Squat", sets }],
    },
  ],
});

function setRelease(doc: unknown) {
  h.release.data = { release: {}, program: parseReleaseDocument(doc) };
}

function renderHome(): string {
  // renderToString separates adjacent text expressions with "<!-- -->"
  // markers ("Ciao, <!-- -->Nicolò"): strip them so the assertions read the
  // text the athlete reads.
  return renderToString(createElement(MemoryRouter, null, createElement(AthleteDashboard))).replace(
    /<!-- -->/g,
    "",
  );
}

beforeEach(() => {
  h.auth.profile = null;
  h.release.data = null;
  h.release.isPending = false;
  h.release.isError = false;
});

describe("il saluto viene dal profilo (due profili → due saluti)", () => {
  it("primo token del full_name; profili diversi salutano diversamente", () => {
    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, 8)]));

    h.auth.profile = { full_name: "Nicolò Castello" };
    const htmlA = renderHome();
    expect(htmlA).toContain("Ciao, Nicolò");
    expect(htmlA).not.toContain("Castello");

    h.auth.profile = { full_name: "Marta Bianchi" };
    const htmlB = renderHome();
    expect(htmlB).toContain("Ciao, Marta");
    expect(htmlB).not.toContain("Ciao, Nicolò");
  });

  it("senza full_name il ripiego è 'Atleta', come in AthleteProfile", () => {
    h.auth.profile = null;
    expect(renderHome()).toContain("Ciao, Atleta");
    h.auth.profile = { full_name: "   " };
    expect(renderHome()).toContain("Ciao, Atleta");
  });
});

describe("la seduta viene dal documento (due documenti → due schermate)", () => {
  it("documenti diversi producono card diverse, col nome del giorno come titolo", () => {
    setRelease(docWithDay("Sessione Alfa Spinta", TODAY, [rawSet(1, 8)]));
    const htmlA = renderHome();
    expect(htmlA).toContain("Sessione Alfa Spinta");
    expect(htmlA).not.toContain("Sessione Beta Tirata");

    setRelease(docWithDay("Sessione Beta Tirata", TODAY, [rawSet(1, 8)]));
    const htmlB = renderHome();
    expect(htmlB).toContain("Sessione Beta Tirata");
    expect(htmlB).not.toContain("Sessione Alfa Spinta");
  });

  it("nessun dato inventato sopravvive: niente Marco, niente titolo/durata/intensità mock", () => {
    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, 7.5), rawSet(2, 8), rawSet(3, 9)]));
    h.auth.profile = { full_name: "Nicolò Castello" };
    const html = renderHome();
    expect(html).not.toContain("Marco");
    expect(html).not.toContain("Forza Lower Body");
    expect(html).not.toContain("45 min");
    expect(html).not.toContain("High intensity");
  });
});

describe("tre stati, e il bottone ne segue uno solo", () => {
  it("seduta oggi → CTA presente; nessuna seduta oggi → riposo SENZA CTA", () => {
    // Positive control FIRST: with today's session the button exists.
    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, 8)]));
    const withSession = renderHome();
    expect(withSession).toContain("Inizia Sessione");
    expect(withSession).not.toContain("Giorno di riposo");

    // Same page, document whose only day is NOT today: rest day, no CTA.
    setRelease(docWithDay("Giorno 1", "2000-01-01", [rawSet(1, 8)]));
    const restDay = renderHome();
    expect(restDay).toContain("Giorno di riposo");
    expect(restDay).not.toContain("Inizia Sessione");
  });

  it("nessun programma → stato equivalente al Training Hub, senza CTA", () => {
    h.release.data = null;
    const html = renderHome();
    expect(html).toContain("Nessun programma attivo");
    expect(html).not.toContain("Inizia Sessione");
  });

  it("errore di caricamento → copy del Training Hub, senza CTA", () => {
    h.release.isError = true;
    const html = renderHome();
    expect(html).toContain("Errore di caricamento");
    expect(html).not.toContain("Inizia Sessione");
  });

  it("caricamento → attesa dichiarata, senza CTA", () => {
    h.release.isPending = true;
    const html = renderHome();
    expect(html).toContain("Caricamento");
    expect(html).not.toContain("Inizia Sessione");
  });

  it("documento illeggibile → 'Programma non disponibile', senza CTA", () => {
    h.release.data = { release: {}, program: null };
    const html = renderHome();
    expect(html).toContain("Programma non disponibile");
    expect(html).not.toContain("Inizia Sessione");
  });
});

describe("l'intensità è l'intervallo prescritto, mai la media, mai uno 0", () => {
  it("7.5/8/9 → 'RPE serie 7.5–9'; tutte a 8 → 'RPE serie 8'", () => {
    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, 7.5), rawSet(2, 8), rawSet(3, 9)]));
    expect(renderHome()).toContain("RPE serie 7.5–9");

    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, 8), rawSet(2, 8)]));
    expect(renderHome()).toContain("RPE serie 8");
  });

  it("nessun RPE scritto (solo %1RM) → nessuna riga, e mai 'RPE serie 0'", () => {
    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, null, 80), rawSet(2, null, 85)]));
    const html = renderHome();
    expect(html).not.toContain("RPE serie");
    expect(html).not.toContain("RPE serie 0");
  });
});

describe("un esercizio si conta al singolare", () => {
  it("1 → '1 esercizio', 3 → '3 esercizi'", () => {
    setRelease(docWithDay("Giorno 1", TODAY, [rawSet(1, 8)]));
    expect(renderHome()).toContain("1 esercizio");

    const threeExercises = {
      ...docWithDay("Giorno 1", TODAY, [rawSet(1, 8)]),
      days: [
        {
          ...docWithDay("Giorno 1", TODAY, [rawSet(1, 8)]).days[0],
          exercises: [
            { item_id: "s1-e1", name: "Back Squat", sets: [rawSet(1, 8)] },
            { item_id: "s1-e2", name: "Bench Press", sets: [rawSet(1, 8)] },
            { item_id: "s1-e3", name: "Deadlift", sets: [rawSet(1, 8)] },
          ],
        },
      ],
    };
    setRelease(threeExercises);
    expect(renderHome()).toContain("3 esercizi");
  });
});
