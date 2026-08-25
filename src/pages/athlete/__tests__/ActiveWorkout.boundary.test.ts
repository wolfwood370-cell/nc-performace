// @vitest-environment jsdom
// =============================================================================
// WIRING boundary test (slice A-03) — from the release document to the INSERT
// payload that reaches exercise_logs. The seam is the supabase CLIENT,
// deliberately BELOW useLogSetMutation: the defect this slice guards against
// lives in WHICH id gets wired into the insert (the release document carries
// two — item_id "w1-s1-e1", builder-local, resolving to NOTHING in exercises,
// and exercise_id, the catalog UUID the FK accepts). A mock at the hook level
// would go green with the wrong id reintroduced one hop lower; here the real
// parser, the real sessionForDate door, the real page, the real drawer and
// the real mutation all run.
//
// jsdom is per-file (this pragma): the suite default stays environment
// "node" (vitest.config.ts). createElement, no JSX.
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { localIsoDate } from "@/lib/program/releaseView";

const h = vi.hoisted(() => ({
  workoutLogInserts: [] as Array<Record<string, unknown>>,
  exerciseLogInserts: [] as Array<Record<string, unknown>>,
  /** Rows the exercise_logs SELECT returns — the ONLY source the UI may
   *  count from. Inserts append here unless nextInsertError is armed. */
  sessionRows: [] as Array<Record<string, unknown>>,
  releaseDoc: null as unknown,
  nextInsertError: null as { code: string; message: string } | null,
  toastError: vi.fn(),
  toastPlain: vi.fn(),
}));

// Generic thenable query builder: chained calls return the builder, awaiting
// it resolves the table-appropriate result computed AT AWAIT TIME.
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
        select: () =>
          chain(() => {
            if (table === "program_releases") {
              return {
                data: { id: "rel-1", athlete_id: "ath-1", program_document: h.releaseDoc },
                error: null,
              };
            }
            if (table === "exercise_logs") {
              return { data: [...h.sessionRows], error: null };
            }
            return { data: [], error: null };
          }),
        insert: (payload: Record<string, unknown>) => {
          if (table === "workout_logs") {
            h.workoutLogInserts.push(payload);
            return chain(() => ({ data: { id: "sess-1", ...payload }, error: null }));
          }
          if (table === "exercise_logs") {
            h.exerciseLogInserts.push(payload);
            if (h.nextInsertError) {
              const error = h.nextInsertError;
              h.nextInsertError = null;
              return chain(() => ({ data: null, error }));
            }
            const row = { id: `log-${h.sessionRows.length + 1}`, ...payload };
            h.sessionRows.push(row);
            return chain(() => ({ data: row, error: null }));
          }
          return chain(() => ({ data: payload, error: null }));
        },
      }),
    },
  };
});

// Identity is not under test: useAuth only gates the release query.
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "ath-1" }, session: null, profile: null, loading: false }),
}));

// Spy on the toast channel — "the interface says it" is asserted here.
vi.mock("sonner", () => ({
  toast: Object.assign(h.toastPlain, { error: h.toastError, success: vi.fn() }),
}));

import ActiveWorkout from "@/pages/athlete/ActiveWorkout";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// ---------------------------------------------------------------------------
// Fixture — a v2 document round-tripped through the REAL parser. Exercise 1
// carries BOTH ids; exercise 2 has no catalog reference on purpose.
// ---------------------------------------------------------------------------

const CATALOG_UUID = "ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f";
const ITEM_ID = "w1-s1-e1";

const rawSet = (n: number) => ({
  set_number: n,
  reps: "8",
  rpe: 7.5,
  rir: null,
  percent_1rm: null,
  rest_seconds: 120,
  tempo: null,
  is_warmup: false,
});

const docFor = (date: string) => ({
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
      date,
      week_order: 1,
      exercises: [
        {
          item_id: ITEM_ID,
          exercise_id: CATALOG_UUID,
          name: "Abductor Machine in piedi",
          sets: [rawSet(1), rawSet(2), rawSet(3)],
        },
        { item_id: "w1-s1-e2", name: "Plank senza catalogo", sets: [rawSet(1)] },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

let container: HTMLDivElement;
let root: Root;
let queryClient: QueryClient;

/** Flush effects + the promise chains behind mutations and queries. A
 *  macrotask hop per round (setTimeout 0): TanStack's observer
 *  notifications can be scheduled beyond the microtask queue, and a
 *  microtask-only flush leaves the render one beat behind the cache
 *  (measured: dataUpdateCount advanced, UI stale). */
async function flush(times = 4): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function renderPage(): Promise<void> {
  queryClient = new QueryClient({
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
  h.workoutLogInserts.length = 0;
  h.exerciseLogInserts.length = 0;
  h.sessionRows.length = 0;
  h.releaseDoc = docFor(localIsoDate(new Date()));
  h.nextInsertError = null;
  h.toastError.mockClear();
  h.toastPlain.mockClear();
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

async function tap(btn: HTMLButtonElement): Promise<void> {
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
}

async function openDrawerFor(name: string): Promise<void> {
  const btn = buttons().find(
    (b) => b.getAttribute("aria-label") === `Apri il registratore di serie per ${name}`,
  );
  if (!btn) throw new Error(`Card esercizio non trovata: ${name}`);
  await tap(btn);
}

function drawerInputs(): { weight: HTMLInputElement; reps: HTMLInputElement } {
  const inputs = container.querySelectorAll('section[aria-label="Logga la prossima serie"] input');
  if (inputs.length !== 2) throw new Error(`Attesi 2 input nel drawer, trovati ${inputs.length}`);
  return { weight: inputs[0] as HTMLInputElement, reps: inputs[1] as HTMLInputElement };
}

const nativeValueSetter = Object.getOwnPropertyDescriptor(
  window.HTMLInputElement.prototype,
  "value",
)!.set!;

async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
  await act(async () => {
    nativeValueSetter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function addSetButton(): HTMLButtonElement {
  const btn = buttons().find((b) => b.textContent?.includes("Aggiungi Set"));
  if (!btn) throw new Error("Bottone 'Aggiungi Set' non trovato");
  return btn;
}

// ---------------------------------------------------------------------------
// 1 — the id that reaches the INSERT is the catalog id (the red proof)
// ---------------------------------------------------------------------------

describe("confine documento→INSERT — quale id viaggia verso exercise_logs", () => {
  it("la serie confermata scrive il riferimento di catalogo, mai l'id locale del builder", async () => {
    await renderPage();
    await openDrawerFor("Abductor Machine in piedi");

    const { weight, reps } = drawerInputs();
    await typeInto(weight, "80");
    await typeInto(reps, "10");
    await tap(addSetButton());

    expect(h.exerciseLogInserts, "una sola INSERT su exercise_logs").toHaveLength(1);
    const payload = h.exerciseLogInserts[0];
    // THE assertion of the slice. If the wiring hands the drawer the local
    // item id, this fails naming the two ids and which one the DB accepts.
    expect(
      payload.exercise_id,
      `exercise_id nella INSERT deve essere il riferimento di catalogo "${CATALOG_UUID}" ` +
        `(FK exercise_logs.exercise_id → exercises.id: è l'unico id che il database accetta); ` +
        `l'id locale del builder "${ITEM_ID}" non risolve in exercises e la FK rifiuterebbe ogni riga`,
    ).toBe(CATALOG_UUID);
    expect(payload.exercise_id, "mai l'id locale").not.toBe(ITEM_ID);
    expect(payload.session_id, "la sessione avviata al mount").toBe("sess-1");
    expect(payload.set_number, "prima serie").toBe(1);
    expect(payload.weight).toBe(80);
    expect(payload.reps).toBe(10);

    // After the confirmed write: inputs empty again (CORE §0.8), count and
    // current-set prescription advance from the ROWS.
    const after = drawerInputs();
    expect(after.weight.value, "peso svuotato dopo la conferma").toBe("");
    expect(after.reps.value, "reps svuotate dopo la conferma").toBe("");
    expect(container.textContent).toContain("1/3 serie");
    expect(container.textContent, "prescrizione della serie corrente = la 2ª").toContain(
      "Serie 2 · 8 reps",
    );
  });

  it("la prescrizione mostrata all'apertura è quella della prima serie, dal documento", async () => {
    await renderPage();
    await openDrawerFor("Abductor Machine in piedi");
    expect(container.textContent).toContain("Serie 1 · 8 reps · RPE 7.5 · rec 120s");
  });
});

// ---------------------------------------------------------------------------
// 2 — the count comes from rows, not from local state
// ---------------------------------------------------------------------------

describe("due stati, due schermate — il conteggio viene dalle righe", () => {
  it("senza righe 0/3; con righe nel database il conteggio sale SENZA alcun tocco", async () => {
    await renderPage();
    expect(container.textContent, "nessuna riga → zero").toContain("0/3 serie");

    // Positive control: rows appear in the DB (no UI interaction at all) —
    // a locally-tallied counter could not see them, the row-derived one must.
    h.sessionRows.push(
      { id: "log-a", session_id: "sess-1", exercise_id: CATALOG_UUID, set_number: 1 },
      { id: "log-b", session_id: "sess-1", exercise_id: CATALOG_UUID, set_number: 2 },
    );
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ["session-sets", "sess-1"] });
    });
    await flush();
    expect(container.textContent, "le righe vere guidano il conteggio").toContain("2/3 serie");
  });
});

// ---------------------------------------------------------------------------
// 3 — unique violation: the interface says it (error path, not happy path)
// ---------------------------------------------------------------------------

describe("doppio tocco — il vincolo di unicità scatta e l'interfaccia lo dice", () => {
  it("INSERT rifiutata con 23505 → «Serie già registrata», niente finto successo", async () => {
    await renderPage();
    await openDrawerFor("Abductor Machine in piedi");

    const { weight, reps } = drawerInputs();
    await typeInto(weight, "80");
    await typeInto(reps, "10");
    h.nextInsertError = {
      code: "23505",
      message:
        'duplicate key value violates unique constraint "exercise_logs_session_id_exercise_id_set_number_key"',
    };
    await tap(addSetButton());

    // The attempt reached the DB and was rightly rejected: no second row.
    expect(h.exerciseLogInserts, "il tentativo è partito").toHaveLength(1);
    expect(h.sessionRows, "nessuna riga creata").toHaveLength(0);
    // The interface names the truth instead of staying silent or faking
    // success: dedicated toast, generic failure NOT shown, inputs kept.
    const errorTitles = h.toastError.mock.calls.map((c) => c[0]);
    expect(errorTitles, "il toast dedicato al vincolo").toContain("Serie già registrata");
    expect(errorTitles, "niente messaggio generico per il 23505").not.toContain(
      "Salvataggio serie fallito",
    );
    expect(drawerInputs().weight.value, "input NON svuotati: la serie non è stata salvata").toBe(
      "80",
    );
    expect(container.textContent, "il conteggio non finge").toContain("0/3 serie");
  });

  it("un errore diverso dal vincolo resta «Salvataggio serie fallito»", async () => {
    await renderPage();
    await openDrawerFor("Abductor Machine in piedi");

    const { weight, reps } = drawerInputs();
    await typeInto(weight, "80");
    await typeInto(reps, "10");
    h.nextInsertError = { code: "23503", message: "foreign key violation" };
    await tap(addSetButton());

    const errorTitles = h.toastError.mock.calls.map((c) => c[0]);
    expect(errorTitles).toContain("Salvataggio serie fallito");
    expect(errorTitles).not.toContain("Serie già registrata");
  });
});

// ---------------------------------------------------------------------------
// 4 — fields start empty and BOTH are required (CORE §0.8)
// ---------------------------------------------------------------------------

describe("i campi partono vuoti e la serie non parte senza peso e ripetizioni", () => {
  it("apertura: input vuoti, bottone disabilitato; un solo campo non basta", async () => {
    await renderPage();
    await openDrawerFor("Abductor Machine in piedi");

    const { weight, reps } = drawerInputs();
    expect(weight.value, "peso parte vuoto, mai 0 precompilato").toBe("");
    expect(reps.value, "reps partono vuote").toBe("");
    expect(addSetButton().disabled, "vuoto → non si registra").toBe(true);

    await typeInto(weight, "60");
    expect(addSetButton().disabled, "solo il peso non basta").toBe(true);

    await typeInto(reps, "8");
    expect(addSetButton().disabled, "entrambi compilati → si registra").toBe(false);

    // Nothing was written while the button was disabled.
    expect(h.exerciseLogInserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 5 — an exercise without a catalog reference: visible, not loggable, says why
// ---------------------------------------------------------------------------

describe("esercizio senza riferimento di catalogo", () => {
  it("si vede in scheda, dichiara il motivo, e non offre il registratore", async () => {
    await renderPage();

    expect(container.textContent, "l'esercizio NON è nascosto").toContain("Plank senza catalogo");
    expect(container.textContent, "il motivo è a schermo").toContain(
      "manca il riferimento di catalogo",
    );
    const opener = buttons().find(
      (b) =>
        b.getAttribute("aria-label") === "Apri il registratore di serie per Plank senza catalogo",
    );
    expect(opener, "nessun bottone di registrazione per la riga senza catalogo").toBeUndefined();
    expect(h.exerciseLogInserts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 6 — day selection goes through the same door (rest day renders as such)
// ---------------------------------------------------------------------------

describe("la seduta viene dal selettore condiviso", () => {
  it("documento senza seduta per oggi → «Nessuna seduta oggi», nessun esercizio inventato", async () => {
    h.releaseDoc = docFor("2000-01-01");
    await renderPage();

    expect(container.textContent).toContain("Nessuna seduta oggi");
    expect(container.textContent).not.toContain("Abductor Machine in piedi");
  });
});
