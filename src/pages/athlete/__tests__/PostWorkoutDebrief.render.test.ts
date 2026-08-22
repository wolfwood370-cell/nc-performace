// Mechanism proof for the debrief (objective #6 of the slice): the hero
// names the released session of the day the workout STARTED (store's
// startedAt — never the clock at debrief time) through the same
// day-selection door as home and Training Hub, or shows ONLY the real
// duration when that day has no session. Mounted for real via
// renderToString (node, no jsdom — decision
// 2026-07-14 in vitest.config.ts) with the data hooks and the workout store
// mocked. Two different documents must yield two different heroes: a test
// that matches one fixed title would pass with the old constant too.

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { localIsoDate, parseReleaseDocument } from "@/lib/program/releaseView";

const h = vi.hoisted(() => ({
  release: { data: null as unknown, isPending: false, isError: false },
  workout: {
    activeSessionId: "sess-1" as string | null,
    elapsedTime: 3723, // 1h 2m — the REAL timer value the store would carry
    // Fixed epoch: the debrief must date the session by the day the workout
    // STARTED, never by the clock at debrief time (midnight crossing).
    startedAt: new Date(2026, 7, 20, 18, 30).getTime() as number | null,
    stopSession: () => {},
  },
}));

vi.mock("@/stores/useAthleteWorkoutStore", () => ({
  useAthleteWorkoutStore: (selector: (s: typeof h.workout) => unknown) => selector(h.workout),
}));
vi.mock("@/hooks/athlete/useAthleteWorkoutHooks", () => ({
  useFinishSessionMutation: () => ({ mutate: () => {} }),
  useSessionSetsQuery: () => ({ data: [] }),
}));
vi.mock("@/hooks/athlete/useProgramRelease", () => ({
  useLatestReleaseQuery: () => ({
    data: h.release.data,
    isPending: h.release.isPending,
    isError: h.release.isError,
  }),
}));

import PostWorkoutDebrief from "@/pages/athlete/PostWorkoutDebrief";

// The day the mocked workout started (2026-08-20) — deterministic, no clock.
const SESSION_DAY = localIsoDate(new Date(2026, 7, 20, 18, 30));

const docWithDay = (dayName: string, date: string) => ({
  version: 2,
  goal: "forza",
  rationale: "",
  name: "Blocco 1",
  days: [
    {
      session_id: "s1",
      day_index: 0,
      day_name: dayName,
      focus: "", // empty focus is the NORMAL case: the day name is the title
      date,
      week_order: 1,
      exercises: [
        {
          item_id: "s1-e1",
          name: "Back Squat",
          sets: [
            {
              set_number: 1,
              reps: "5",
              rpe: 8,
              rir: null,
              percent_1rm: null,
              rest_seconds: 90,
              tempo: null,
              is_warmup: false,
            },
          ],
        },
      ],
    },
  ],
});

function setRelease(doc: unknown) {
  h.release.data = { release: {}, program: parseReleaseDocument(doc) };
}

function renderDebrief(): string {
  return renderToString(
    createElement(MemoryRouter, null, createElement(PostWorkoutDebrief)),
  ).replace(/<!-- -->/g, "");
}

beforeEach(() => {
  h.release.data = null;
  h.release.isPending = false;
  h.release.isError = false;
});

describe("il debrief nomina la seduta vera del giorno", () => {
  it("due documenti diversi → due heroes diversi, con la durata reale", () => {
    setRelease(docWithDay("Seduta Spinta Alfa", SESSION_DAY));
    const htmlA = renderDebrief();
    expect(htmlA).toContain("Seduta Spinta Alfa · 1h 2m");
    expect(htmlA).not.toContain("Seduta Tirata Beta");

    setRelease(docWithDay("Seduta Tirata Beta", SESSION_DAY));
    const htmlB = renderDebrief();
    expect(htmlB).toContain("Seduta Tirata Beta · 1h 2m");
    expect(htmlB).not.toContain("Seduta Spinta Alfa");
  });

  it("nessuna seduta nel giorno d'inizio → SOLO la durata reale, nessun titolo", () => {
    setRelease(docWithDay("Seduta Spinta Alfa", "2000-01-01"));
    const html = renderDebrief();
    expect(html).toContain("1h 2m");
    expect(html).not.toContain("Seduta Spinta Alfa");
    expect(html).not.toContain(" · ");
  });

  it("l'ancora è startedAt, non l'orologio: la seduta datata OGGI non viene nominata", () => {
    // The release has a session dated with the CLOCK's today, but the mocked
    // workout started on 2026-08-20 (a fixed past day): the hero must not
    // borrow today's session for a workout that belongs to another day.
    setRelease(docWithDay("Seduta Di Un Altro Giorno", localIsoDate(new Date())));
    const html = renderDebrief();
    expect(html).not.toContain("Seduta Di Un Altro Giorno");
    expect(html).toContain("1h 2m");
  });

  it("nessuna release → SOLO la durata reale", () => {
    h.release.data = null;
    const html = renderDebrief();
    expect(html).toContain("1h 2m");
    expect(html).not.toContain(" · ");
  });

  it("il mock non esiste più: niente 'Lower Body Power', niente chip muscolari", () => {
    setRelease(docWithDay("Seduta Spinta Alfa", SESSION_DAY));
    const html = renderDebrief();
    expect(html).not.toContain("Lower Body Power");
    expect(html).not.toContain("Muscoli Allenati");
    expect(html).not.toContain("Quadricipiti");
  });
});
