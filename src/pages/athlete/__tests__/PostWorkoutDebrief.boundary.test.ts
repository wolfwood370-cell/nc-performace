// @vitest-environment jsdom
// =============================================================================
// WIRING boundary test (B-22) — from the athlete's tap to the UPDATE payload
// that reaches the database. The seam is the supabase CLIENT, deliberately
// BELOW useFinishSessionMutation: the defect this slice repairs lived in the
// update literal (rpe_global written for two years), so the mutation must run
// for REAL — a mock at the hook level would go green with the write in the
// wrong column reintroduced one hop lower.
//
// jsdom is per-file (this pragma): the suite default stays environment
// "node" (vitest.config.ts). createElement, no JSX.
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
}));

// Generic thenable query builder: every chained call returns the builder,
// awaiting it resolves an empty happy result. `update` captures its payload
// and resolves it back as the row — the ONE assertion surface of this file.
vi.mock("@/integrations/supabase/client", () => {
  function chain(result: unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ["select", "eq", "order", "limit", "gte", "lte", "not", "in"]) {
      c[m] = self;
    }
    c.single = self;
    c.maybeSingle = self;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return c;
  }
  return {
    supabase: {
      from: () => ({
        select: () => chain({ data: [], error: null }),
        update: (payload: Record<string, unknown>) => {
          h.updates.push(payload);
          return chain({ data: { id: "sess-1", ...payload }, error: null });
        },
      }),
    },
  };
});

// Not under test: the release document (hero title only).
vi.mock("@/hooks/athlete/useProgramRelease", () => ({
  useLatestReleaseQuery: () => ({ data: null, isPending: false, isError: false }),
}));

import PostWorkoutDebrief from "@/pages/athlete/PostWorkoutDebrief";
import { useAthleteWorkoutStore } from "@/stores/useAthleteWorkoutStore";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(async () => {
  h.updates.length = 0;
  useAthleteWorkoutStore.setState({
    activeSessionId: "sess-1",
    elapsedTime: 3723,
    startedAt: new Date(2026, 7, 20, 18, 30).getTime(),
  });
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
        createElement(MemoryRouter, null, createElement(PostWorkoutDebrief)),
      ),
    );
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

async function tapRpe(n: number): Promise<void> {
  const btn = buttons().find((b) => b.getAttribute("aria-label") === `RPE ${n}`);
  if (!btn) throw new Error(`Bottone non trovato: aria-label="RPE ${n}"`);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function tapSave(): Promise<void> {
  const btn = buttons().find((b) => b.textContent?.includes("Salva e Torna alla Home"));
  if (!btn) throw new Error("CTA di salvataggio non trovata");
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

describe("confine tocco→colonna — l'RPE di sessione finisce in srpe", () => {
  it("l'atleta sceglie 8 → la UPDATE porta srpe = 8 e rpe_global NON viene scritta", async () => {
    await tapRpe(8);
    await tapSave();

    expect(h.updates, "una sola UPDATE").toHaveLength(1);
    const update = h.updates[0];
    // THE assertion of the slice: both effort columns, side by side. With
    // the old write reintroduced (rpe_global: 8) this fails naming the two
    // columns and the two values.
    expect(
      { srpe: update.srpe, rpe_global: update.rpe_global },
      "colonne di sforzo nel payload UPDATE",
    ).toEqual({ srpe: 8, rpe_global: undefined });
    expect(Object.keys(update), "rpe_global non deve nemmeno comparire").not.toContain(
      "rpe_global",
    );
    // The rest of the payload still carries what it always carried.
    expect(update.duration_seconds, "durata reale dal timer").toBe(3723);
    expect(update.status).toBe("completed");
  });

  it("scala non toccata → srpe = NULL (controllo positivo: toccata, arriva il valore)", async () => {
    await tapSave();

    expect(h.updates, "una sola UPDATE").toHaveLength(1);
    expect(h.updates[0].srpe, "non risposto resta NULL").toBeNull();
    expect(Object.keys(h.updates[0])).not.toContain("rpe_global");
  });

  it("selezionare e RIMUOVERE (secondo tocco) torna a NULL: la dichiarazione è revocabile", async () => {
    await tapRpe(7);
    await tapRpe(7); // toggle off — fetta rpe-si-puo-togliere
    await tapSave();

    expect(h.updates[0].srpe, "dichiarazione revocata").toBeNull();
  });
});

describe("il form parla la scala di sessione", () => {
  function sezioneRpe(): HTMLElement {
    const el = container.querySelector('section[aria-label="Sforzo percepito della sessione"]');
    if (!el) throw new Error("Sezione RPE non trovata");
    return el as HTMLElement;
  }

  it("nessuna stringa del form contiene «rep», qualunque valore sia selezionato", async () => {
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
      await tapRpe(n);
      const testo = sezioneRpe().textContent ?? "";
      expect(testo, `con RPE ${n} selezionato`).not.toMatch(/rep/i);
    }
  });

  it("i vuoti di Foster restano vuoti: su 6, 8 e 9 la didascalia è il numero nudo", async () => {
    for (const n of [6, 8, 9]) {
      await tapRpe(n);
      const caption = sezioneRpe().querySelector('p[aria-live="polite"]');
      expect(caption?.textContent?.trim(), `didascalia con RPE ${n}`).toBe(String(n));
      await tapRpe(n); // toggle off before the next
    }
  });

  it("un gradino ancorato mostra la SUA parola di sessione: 5 → Impegnativo", async () => {
    await tapRpe(5);
    const caption = sezioneRpe().querySelector('p[aria-live="polite"]');
    expect(caption?.textContent).toContain("Impegnativo");
    expect(caption?.textContent).not.toMatch(/rep/i);
  });

  it("la domanda porta definizione e avvertenza sul momento, dal modulo", () => {
    const testo = sezioneRpe().textContent ?? "";
    expect(testo).toContain("valutazione globale della seduta, non la media delle serie");
    expect(testo).toContain("finestra");
  });
});
