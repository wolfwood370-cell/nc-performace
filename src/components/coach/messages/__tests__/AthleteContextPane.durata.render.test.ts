// @vitest-environment jsdom
// =============================================================================
// La durata che il coach vede è DERIVATA dai secondi (l'unica colonna,
// A-02) e un'assenza resta un'assenza: niente a schermo, mai «0 min».
// Il seam sta al client Supabase mockato — la query del pane gira per
// davvero e seleziona duration_seconds; il payload decide il caso.
// =============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({
  durationSeconds: null as number | null,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "coach-1" } }),
}));

vi.mock("@/integrations/supabase/client", () => {
  function chain(resolveResult: () => unknown) {
    const c: Record<string, unknown> = {};
    const self = () => c;
    for (const m of ["select", "eq", "order", "limit", "gte", "lte", "single"]) c[m] = self;
    c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resolveResult()).then(resolve);
    return c;
  }
  return {
    supabase: {
      from: (table: string) => ({
        select: (cols: string) => {
          const inner = chain(() => {
            if (table === "workout_logs" && cols.includes("srpe")) {
              return {
                data: {
                  id: "log-1",
                  scheduled_date: "2026-08-25",
                  completed_at: "2026-08-25T18:00:00Z",
                  srpe: 7,
                  duration_seconds: h.durationSeconds,
                  workout: { title: "Upper A" },
                },
                error: null,
              };
            }
            return { data: [], error: null };
          });
          return inner;
        },
      }),
    },
  };
});

import { AthleteContextPane } from "@/components/coach/messages/AthleteContextPane";
import type { ChatRoom } from "@/hooks/useChatRooms";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Radix ScrollArea reads ResizeObserver, che jsdom non ha.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const room = {
  id: "room-1",
  type: "direct",
  participants: [
    { user_id: "coach-1", profile: { full_name: "Coach Uno" } },
    { user_id: "ath-1", profile: { full_name: "Atleta Prova" } },
  ],
} as unknown as ChatRoom;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function monta(): Promise<string> {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(
      createElement(
        MemoryRouter,
        null,
        createElement(
          QueryClientProvider,
          { client: qc },
          createElement(AthleteContextPane, { room, isOpen: true, onClose: () => {} }),
        ),
      ),
    );
  });
  // Let the three chained queries settle: the queryFn awaits THREE times in
  // sequence, so a single microtask hop is not enough (measured — the first
  // version of this file went green by timing luck). Macrotask hops, like
  // ActiveWorkout.updateCache.boundary.test.ts.
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return host.textContent ?? "";
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe("AthleteContextPane — la durata dell'ultima seduta", () => {
  it("con 3120 secondi il coach legge «52 min», derivato dalla vista", async () => {
    h.durationSeconds = 3120;
    const testo = await monta();
    expect(testo).toContain("52 min");
  });

  it("senza durata non compare nulla: assenza dichiarata, mai «0 min»", async () => {
    h.durationSeconds = null;
    const testo = await monta();
    // La riga della seduta c'è (controllo positivo): è la durata a mancare.
    expect(testo).toContain("Upper A");
    expect(testo).not.toContain("0 min");
    expect(testo).not.toContain(" min");
  });
});
