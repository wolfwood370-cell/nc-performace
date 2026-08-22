// Mechanism proof for the debrief (objective #6 of the slice): the hero
// names TODAY's released session — through the same day-selection door as
// home and Training Hub — or shows ONLY the real duration when today has no
// session. Mounted for real via renderToString (node, no jsdom — decision
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

const TODAY = localIsoDate(new Date());

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
    setRelease(docWithDay("Seduta Spinta Alfa", TODAY));
    const htmlA = renderDebrief();
    expect(htmlA).toContain("Seduta Spinta Alfa · 1h 2m");
    expect(htmlA).not.toContain("Seduta Tirata Beta");

    setRelease(docWithDay("Seduta Tirata Beta", TODAY));
    const htmlB = renderDebrief();
    expect(htmlB).toContain("Seduta Tirata Beta · 1h 2m");
    expect(htmlB).not.toContain("Seduta Spinta Alfa");
  });

  it("nessuna seduta oggi → SOLO la durata reale, nessun titolo", () => {
    setRelease(docWithDay("Seduta Spinta Alfa", "2000-01-01"));
    const html = renderDebrief();
    expect(html).toContain("1h 2m");
    expect(html).not.toContain("Seduta Spinta Alfa");
    expect(html).not.toContain(" · ");
  });

  it("nessuna release → SOLO la durata reale", () => {
    h.release.data = null;
    const html = renderDebrief();
    expect(html).toContain("1h 2m");
    expect(html).not.toContain(" · ");
  });

  it("il mock non esiste più: niente 'Lower Body Power', niente chip muscolari", () => {
    setRelease(docWithDay("Seduta Spinta Alfa", TODAY));
    const html = renderDebrief();
    expect(html).not.toContain("Lower Body Power");
    expect(html).not.toContain("Muscoli Allenati");
    expect(html).not.toContain("Quadricipiti");
  });
});
