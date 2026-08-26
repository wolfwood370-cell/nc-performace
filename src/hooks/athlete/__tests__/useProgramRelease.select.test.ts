// @vitest-environment jsdom
// =============================================================================
// The GATE of the update-safe slice: the two useProgramRelease queries cache
// (and therefore persist to IndexedDB) ONLY shapes Postgres decided — the
// derivation runs in `select`, at read time, always with the current code.
//
// Three claims, each measured here:
//   1. what the cache holds for the release query is the RAW row (no
//      `program`, no `release` wrapper) — dehydrate() is the exact object
//      the persister writes;
//   2. `select` has a STABLE reference: the parser runs ONCE, not once per
//      re-render (ActiveWorkout re-renders every second for the timer);
//   3. yesterday's cache (the pre-merge DERIVED shape) crosses `select` and
//      degrades to program:null — the page says «Programma non disponibile»,
//      it never mounts a list that promises.
//
// jsdom is per-file (this pragma); suite default stays "node".
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement, useReducer } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, dehydrate } from "@tanstack/react-query";
import type { Mock } from "vitest";

const h = vi.hoisted(() => ({
  releaseRow: null as Record<string, unknown> | null,
  profileRow: {
    coaching_mode: "autonomous",
    onboarding_completed: true,
    medical_clearance_required: false,
    red_flags: {},
    onboarding_data: { intake: { safety: { level: "green", yellow: [] } } },
  } as Record<string, unknown>,
  consentRows: [] as Array<Record<string, unknown>>,
}));

// Thenable query builder: chained calls return the builder, awaiting it
// resolves the table-appropriate result (same seam as the A-03 boundary test).
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
      from: (table: string) => ({
        select: () =>
          chain(() => {
            if (table === "program_releases") return { data: h.releaseRow, error: null };
            if (table === "profiles") return { data: h.profileRow, error: null };
            if (table === "consents") return { data: [...h.consentRows], error: null };
            return { data: [], error: null };
          }),
      }),
    },
  };
});

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "ath-1" }, session: null, profile: null, loading: false }),
}));

// Spy that KEEPS the real parser: the count is the measure, the parse is real.
vi.mock("@/lib/program/releaseView", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/program/releaseView")>();
  return { ...actual, parseReleaseDocument: vi.fn(actual.parseReleaseDocument) };
});

import { parseReleaseDocument } from "@/lib/program/releaseView";
import {
  useAthleteGateStatusQuery,
  useLatestReleaseQuery,
} from "@/hooks/athlete/useProgramRelease";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RELEASE_KEY = ["program-release", "latest", "ath-1"];
const GATE_KEY = ["program-release", "gate-status", "ath-1"];

// Fixed date on purpose: nothing in this file reads the clock.
const V2_DOC = {
  version: 2,
  goal: "forza",
  rationale: "",
  name: "Blocco 1",
  days: [
    {
      session_id: "s1",
      day_index: 0,
      day_name: "Giorno 1",
      focus: "Lower Body",
      date: "2026-01-05",
      week_order: 1,
      exercises: [
        {
          item_id: "w1-s1-e1",
          exercise_id: "ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f",
          name: "Back Squat",
          sets: [
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
          ],
        },
      ],
    },
  ],
};

/** The raw program_releases row as Postgres returns it (boundary-mock shape). */
const rawRow = () => ({ id: "rel-1", athlete_id: "ath-1", program_document: V2_DOC });

/** The object the PRE-MERGE code derived in queryFn and persisted: a
 *  {release, program} wrapper whose exercises carry NO catalog_exercise_id. */
const preMergeCachedObject = () => ({
  release: rawRow(),
  program: {
    goal: "forza",
    rationale: "",
    version: 2 as const,
    name: "Blocco 1",
    days: [
      {
        sessionId: "s1",
        dayIndex: 0,
        dayName: "Giorno 1",
        focus: "Lower Body",
        date: "2026-01-05",
        weekOrder: 1,
        exercises: [
          {
            id: "w1-s1-e1",
            code: "A1",
            name: "Back Squat",
            scheme: "1 Serie × 8 Reps",
            sets: 1,
            reps: "8",
            rpe: 7.5,
          },
        ],
      },
    ],
  },
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;
let latestRelease: ReturnType<typeof useLatestReleaseQuery> | null = null;
let latestGate: ReturnType<typeof useAthleteGateStatusQuery> | null = null;
let forceRender: () => void = () => {};

function ReleaseProbe() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  forceRender = bump;
  latestRelease = useLatestReleaseQuery();
  return null;
}

function GateProbe() {
  latestGate = useAthleteGateStatusQuery();
  return null;
}

/** Macrotask hop per round: TanStack observer notifications can schedule
 *  beyond the microtask queue (measured in the A-03 boundary test). */
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderProbe(probe: () => ReturnType<typeof createElement> | null): Promise<void> {
  // staleTime Infinity mirrors production (main.tsx:16): pre-seeded data
  // must NOT be refetched from under the test, exactly as after a restore.
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client: queryClient }, createElement(probe)));
  });
  await flush();
}

beforeEach(() => {
  h.releaseRow = rawRow();
  latestRelease = null;
  latestGate = null;
  (parseReleaseDocument as unknown as Mock).mockClear();
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

// ---------------------------------------------------------------------------
// 1 — the cache (and the dehydrated persist payload) holds the RAW row
// ---------------------------------------------------------------------------

describe("cosa finisce in cache (= in IndexedDB) per il rilascio", () => {
  it("la riga grezza di Postgres, MAI il derivato {release, program}", async () => {
    await renderProbe(ReleaseProbe);

    const cached = queryClient.getQueryData(RELEASE_KEY) as Record<string, unknown>;
    expect(cached, "la query si è risolta").toBeTruthy();
    expect(
      Object.keys(cached).sort(),
      "chiavi di primo livello del dato in cache: la riga come il DB la restituisce",
    ).toEqual(["athlete_id", "id", "program_document"]);
    expect(cached, "nessun oggetto derivato dal nostro codice").not.toHaveProperty("program");
    expect(cached).not.toHaveProperty("release");

    // dehydrate() is EXACTLY what persistQueryClient hands the persister.
    const dehydrated = dehydrate(queryClient);
    const persisted = dehydrated.queries.find(
      (q) => JSON.stringify(q.queryKey) === JSON.stringify(RELEASE_KEY),
    );
    expect(persisted, "la query del rilascio è nel payload persistito").toBeTruthy();
    expect(Object.keys(persisted!.state.data as Record<string, unknown>).sort()).toEqual([
      "athlete_id",
      "id",
      "program_document",
    ]);

    // ...and the COMPONENT still receives the derived view.
    expect(latestRelease!.data?.program?.days).toHaveLength(1);
    expect(latestRelease!.data?.release.id).toBe("rel-1");
  });

  it("gate status: in cache i grezzi {profile, consents}, al componente il derivato", async () => {
    await renderProbe(GateProbe);

    const cached = queryClient.getQueryData(GATE_KEY) as Record<string, unknown>;
    expect(Object.keys(cached).sort(), "solo i due result set grezzi").toEqual([
      "consents",
      "profile",
    ]);
    expect(cached, "nessun campo derivato in cache").not.toHaveProperty("pendingReview");
    expect(cached).not.toHaveProperty("coachingMode");

    expect(latestGate!.data?.coachingMode).toBe("autonomous");
    expect(latestGate!.data?.pendingReview).toBe(false);
    expect(latestGate!.data?.missingConsents).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// 2 — select has a STABLE reference: the parser runs once, not once per render
// ---------------------------------------------------------------------------

describe("referenza stabile di select", () => {
  it("il parser gira 1 volta e RESTA 1 dopo 10 re-render (pagina col timer a 1Hz)", async () => {
    await renderProbe(ReleaseProbe);

    const parserCalls = () => (parseReleaseDocument as unknown as Mock).mock.calls.length;
    expect(parserCalls(), "una sola esecuzione al settle").toBe(1);
    const derivedRef = latestRelease!.data;

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        forceRender();
      });
      await flush(1);
    }

    expect(
      parserCalls(),
      "select inline rieseguirebbe il parser a ogni render (misurato: 12 su 10 re-render); " +
        "la referenza stabile deve tenerlo a 1",
    ).toBe(1);
    expect(latestRelease!.data, "anche la referenza del derivato resta stabile").toBe(derivedRef);
  });
});

// ---------------------------------------------------------------------------
// 3 — yesterday's cache (pre-merge derived shape) degrades honestly
// ---------------------------------------------------------------------------

describe("la cache di ieri attraversa select e degrada, non mente", () => {
  it("forma derivata pre-merge in cache → program:null («Programma non disponibile»), mai una lista", async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // The persisted client of a user who last opened the app BEFORE the
    // merge: the derived wrapper sits where the raw row now belongs.
    queryClient.setQueryData(RELEASE_KEY, preMergeCachedObject());

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(ReleaseProbe)),
      );
    });
    await flush();

    expect(
      latestRelease!.data,
      "data è truthy: la pagina non inventa «nessun programma»",
    ).toBeTruthy();
    expect(
      latestRelease!.data?.program,
      "il wrapper vecchio non ha program_document al primo livello: il parser degrada a null " +
        "e la pagina dice «Programma non disponibile» — mai una seduta che promette",
    ).toBeNull();
  });

  it("gate status: la forma derivata di ieri in cache degrada CHIUSA (errore), mai un gate inventato", async () => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    // Yesterday's persisted shape: the ALREADY-DERIVED AthleteGateStatus,
    // where the raw {profile, consents} now belongs. deriveGateStatus throws
    // inside `select` (no .profile to read) and TanStack turns it into an
    // error state: the consumer (AthleteTraining) renders its error card —
    // closed, never a gate invented from a stale shape.
    queryClient.setQueryData(GATE_KEY, {
      coachingMode: "autonomous",
      onboardingCompleted: true,
      missingConsents: [],
      pendingReview: false,
    });

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => {
      root.render(
        createElement(QueryClientProvider, { client: queryClient }, createElement(GateProbe)),
      );
    });
    await flush();

    expect(latestGate!.data, "nessun derivato inventato dalla forma vecchia").toBeUndefined();
    expect(latestGate!.isError, "select lancia e la query fallisce CHIUSA").toBe(true);
  });
});
