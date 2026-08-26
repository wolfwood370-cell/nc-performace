// @vitest-environment jsdom
// =============================================================================
// LA PROVA DELL'AGGIORNAMENTO (slice update-safe) — the criterion that did
// not exist on 2026-08-25: the page is mounted with the release object in the
// shape the code BEFORE the A-03 merge derived and persisted to IndexedDB —
// exercises WITHOUT catalog_exercise_id (the field is ABSENT, not null).
// A row must never promise an action the page then refuses in silence.
//
// The seam sits at the release-hook boundary ON PURPOSE: it is the exact
// door through which the rehydrated cache re-entered the page on 25/08. In
// production the CURRENT hook would already degrade this object through
// `select` (pinned in useProgramRelease.select.test.ts); this file pins the
// LAST guard — the shared loggability predicate — which must keep the row
// honest even when a day with absent references reaches the components.
//
// Red run to show: with the predicate brought back to `!== null`, the row
// becomes clickable while the drawer never mounts — this test then fails
// SAYING exactly that.
//
// jsdom is per-file (this pragma); suite default stays "node".
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { localIsoDate } from "@/lib/program/releaseView";

const h = vi.hoisted(() => ({
  cachedRelease: null as unknown,
}));

// The rehydrated object enters where it entered on 25/08: the release hook.
vi.mock("@/hooks/athlete/useProgramRelease", () => ({
  useLatestReleaseQuery: () => ({ data: h.cachedRelease, isPending: false, isError: false }),
}));

// Session lifecycle + logged-set rows: real hooks over the mocked client.
vi.mock("@/integrations/supabase/client", () => {
  function chain(resolveResult: () => unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ["select", "eq", "order", "limit", "gte", "lte", "not", "in"]) {
      c[m] = self;
    }
    c.single = self;
    c.maybeSingle = self;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveResult()).then(resolve);
    return c;
  }
  return {
    supabase: {
      auth: {
        getSession: () =>
          Promise.resolve({ data: { session: { user: { id: "ath-1" } } }, error: null }),
      },
      from: (table: string) => ({
        select: () => chain(() => ({ data: table === "exercise_logs" ? [] : null, error: null })),
        insert: (payload: Record<string, unknown>) =>
          chain(() => ({ data: { id: "sess-1", ...payload }, error: null })),
      }),
    },
  };
});

vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }),
}));

import ActiveWorkout from "@/pages/athlete/ActiveWorkout";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CATALOG_UUID = "ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f";

/** ReleaseExerciseView as the PRE-MERGE code shaped it: no catalog_exercise_id
 *  anywhere. This is the JSON that comes back up from IndexedDB, verbatim. */
const preMergeExercise = (id: string, name: string) => ({
  id,
  code: "A1",
  name,
  scheme: "3 Serie × 8 Reps · RPE 7.5 · rec 120s",
  sets: 3,
  reps: "8",
  rpe: 7.5,
  sets_detail: [
    {
      set_number: 1,
      reps: "8",
      rpe: 7.5,
      rir: null,
      percent_1rm: null,
      rest_seconds: 120,
      tempo: null,
      is_warmup: false,
    },
    {
      set_number: 2,
      reps: "8",
      rpe: 7.5,
      rir: null,
      percent_1rm: null,
      rest_seconds: 120,
      tempo: null,
      is_warmup: false,
    },
    {
      set_number: 3,
      reps: "8",
      rpe: 7.5,
      rir: null,
      percent_1rm: null,
      rest_seconds: 120,
      tempo: null,
      is_warmup: false,
    },
  ],
  uniform: true,
  superset_id: null,
  coach_notes: "",
});

/** The cached {release, program} wrapper of the previous build, with today's
 *  session so the real sessionForDate door selects it. */
const preMergeCachedRelease = (exercises: Array<Record<string, unknown>>) => ({
  release: { id: "rel-1", athlete_id: "ath-1", program_document: {} },
  program: {
    goal: "forza",
    rationale: "",
    version: 2,
    name: "Blocco 1",
    days: [
      {
        sessionId: "s1",
        dayIndex: 0,
        dayName: "Giorno 1",
        focus: "Lower Body",
        date: localIsoDate(new Date()),
        weekOrder: 1,
        exercises,
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Harness (same pattern as ActiveWorkout.boundary.test.ts)
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;

/** Macrotask hop per round: TanStack observer notifications can schedule
 *  beyond the microtask queue (measured in the A-03 boundary test). */
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPage(): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(
        QueryClientProvider,
        { client: queryClient },
        createElement(MemoryRouter, null, createElement(ActiveWorkout)),
      ),
    );
  });
  await flush();
}

beforeEach(() => {
  h.cachedRelease = preMergeCachedRelease([preMergeExercise("w1-s1-e1", "Panca piana di ieri")]);
  useAthleteWorkoutStore.setState({
    isSessionActive: false,
    elapsedTime: 0,
    startedAt: null,
    activeSessionId: null,
  });
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

function buttons(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button"));
}

function openerFor(name: string): HTMLButtonElement | undefined {
  return buttons().find(
    (b) => b.getAttribute("aria-label") === `Apri il registratore di serie per ${name}`,
  );
}

function drawer(): Element | null {
  return container.querySelector('section[aria-label="Logga la prossima serie"]');
}

async function tap(btn: HTMLButtonElement): Promise<void> {
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

// ---------------------------------------------------------------------------
// 1 — THE update proof: yesterday's cache must not promise
// ---------------------------------------------------------------------------

describe("cache scritta dal build precedente (catalog_exercise_id ASSENTE)", () => {
  it("la riga non promette: o dice «Solo consultazione», o — se cliccabile — il drawer DEVE montarsi", async () => {
    await renderPage();

    // The sheet stays readable: the exercise is rendered, never hidden.
    expect(container.textContent, "l'esercizio della cache di ieri resta in scheda").toContain(
      "Panca piana di ieri",
    );

    const opener = openerFor("Panca piana di ieri");
    if (opener) {
      // A clickable row is a promise: tapping it MUST mount the set logger.
      await tap(opener);
      expect(
        drawer(),
        "la riga è cliccabile ma il drawer non si monta: i due guardiani rispondono " +
          "in modo diverso su undefined (riga: cliccabile; montaggio: rifiutato) — " +
          "la promessa muta del 25/08",
      ).not.toBeNull();
    }
    expect(
      opener,
      "campo assente = riferimento assente: la riga deve essere «Solo consultazione», " +
        "mai offrire il registratore",
    ).toBeUndefined();
    expect(container.textContent, "il motivo è dichiarato a schermo").toContain(
      "manca il riferimento di catalogo",
    );
  });

  it("undefined e null si comportano identicamente anche in superficie", async () => {
    h.cachedRelease = preMergeCachedRelease([
      preMergeExercise("w1-s1-e1", "Esercizio con campo assente"),
      { ...preMergeExercise("w1-s1-e2", "Esercizio con null"), catalog_exercise_id: null },
    ]);
    await renderPage();

    expect(container.textContent).toContain("Esercizio con campo assente");
    expect(container.textContent).toContain("Esercizio con null");
    const reasons = container.textContent?.match(/manca il riferimento di catalogo/g) ?? [];
    expect(reasons, "entrambe le righe degradano allo stesso modo").toHaveLength(2);
    expect(openerFor("Esercizio con campo assente")).toBeUndefined();
    expect(openerFor("Esercizio con null")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 2 — positive control: with the reference present, nothing changed
// ---------------------------------------------------------------------------

describe("controllo positivo — dati nuovi, comportamento invariato", () => {
  it("col riferimento di catalogo presente la riga apre il drawer come prima", async () => {
    h.cachedRelease = preMergeCachedRelease([
      { ...preMergeExercise("w1-s1-e1", "Back Squat"), catalog_exercise_id: CATALOG_UUID },
    ]);
    await renderPage();

    const opener = openerFor("Back Squat");
    expect(opener, "la riga registrabile offre il registratore").toBeDefined();
    await tap(opener!);
    expect(drawer(), "il drawer si monta sul riferimento presente").not.toBeNull();
  });
});
