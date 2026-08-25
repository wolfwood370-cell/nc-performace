// @vitest-environment jsdom
// =============================================================================
// WIRING boundary test (B-22, rivisto per lo slider «rpe-difendibile») —
// dal gesto dell'atleta al payload della UPDATE. Il seam resta il CLIENT
// Supabase, sotto la mutation (il difetto storico viveva nel literal della
// UPDATE): tutto ciò che sta in mezzo gira per davvero.
//
// Lo slider custom non ha pollice finché non si tocca (CORE §0.8): qui le
// interazioni passano dalla TASTIERA (frecce/Home/Canc) perché jsdom non ha
// geometrie (getBoundingClientRect = 0) e il percorso puntatore non è
// esercitabile — il modello a tastiera è parte del contratto (invariante 5)
// e da vuoto la prima freccia parte da 1.
//
// jsdom è per-file (questo pragma): la suite resta environment "node".
// =============================================================================
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SESSION_RPE_ANCHORS,
  SESSION_RPE_EMPTY_PROMPT,
  SESSION_RPE_SECTION_LABEL,
  SESSION_RPE_TIMING,
  SESSION_RPE_VALUES,
} from "@/lib/effort/sessionRpe";

const h = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
}));

// Generic thenable query builder: every chained call returns the builder,
// awaiting it resolves an empty happy result. `update` captures its payload
// and resolves it back as the row.
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

function slider(): HTMLElement {
  const el = container.querySelector('[role="slider"]');
  if (!el) throw new Error("Slider non trovato");
  return el as HTMLElement;
}

function sezioneRpe(): HTMLElement {
  const el = container.querySelector(`section[aria-label="${SESSION_RPE_SECTION_LABEL}"]`);
  if (!el) throw new Error("Sezione RPE non trovata");
  return el as HTMLElement;
}

function didascalia(): string {
  // The gap between number and dash is a CSS margin, not a text space:
  // normalize around the dash so the claim stays about WORDS, not layout.
  return (sezioneRpe().querySelector('p[aria-live="polite"]')?.textContent?.trim() ?? "").replace(
    /\s*—\s*/,
    " — ",
  );
}

async function premi(key: string, volte = 1): Promise<void> {
  const el = slider();
  el.focus();
  for (let i = 0; i < volte; i++) {
    await act(async () => {
      el.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    });
  }
}

/** Sceglie il valore n in modo deterministico: Home → 1, poi n-1 frecce. */
async function scegli(n: number): Promise<void> {
  await premi("Home");
  if (n > 1) await premi("ArrowRight", n - 1);
}

async function tapTesto(testo: string): Promise<void> {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(testo),
  );
  if (!btn) throw new Error(`Bottone non trovato: "${testo}"`);
  await act(async () => {
    btn.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function salva(): Promise<void> {
  await tapTesto("Salva e Torna alla Home");
}

describe("nessun cursore finché non si tocca — e la colonna resta NULL", () => {
  it("al primo render nessun valore è selezionato: niente aria-valuenow, prompt di vuoto", () => {
    // THE assertion della fetta: con un cursore posato (es. useState(5))
    // fallisce dicendo QUALE valore è comparso senza che nessuno l'abbia
    // scelto ("expected '5' to be null").
    expect(
      slider().getAttribute("aria-valuenow"),
      "valore comparso senza che nessuno l'abbia scelto",
    ).toBeNull();
    expect(didascalia()).toBe(SESSION_RPE_EMPTY_PROMPT);
  });

  it("salvare senza toccare lo slider → la UPDATE porta srpe = NULL", async () => {
    await salva();
    expect(h.updates, "una sola UPDATE").toHaveLength(1);
    expect(h.updates[0].srpe, "non risposto resta NULL").toBeNull();
    expect(Object.keys(h.updates[0])).not.toContain("rpe_global");
  });

  it("il primo gesto da vuoto parte da 1 (frecce), e Home/End coprono gli estremi", async () => {
    await premi("ArrowRight");
    expect(slider().getAttribute("aria-valuenow")).toBe("1");
    await premi("End");
    expect(slider().getAttribute("aria-valuenow")).toBe("10");
  });

  it("scelto 8 → la UPDATE porta srpe = 8 e rpe_global non viene scritta", async () => {
    await scegli(8);
    await salva();
    expect(h.updates, "una sola UPDATE").toHaveLength(1);
    expect(
      { srpe: h.updates[0].srpe, rpe_global: h.updates[0].rpe_global },
      "colonne di sforzo nel payload UPDATE",
    ).toEqual({ srpe: 8, rpe_global: undefined });
    // The data path is untouched by this slice: the rest of the payload
    // still carries what it always carried (review: these pins guard the
    // «percorso invariato» contract at the seam).
    expect(h.updates[0].duration_seconds, "durata reale dal timer").toBe(3723);
    expect(h.updates[0].status).toBe("completed");
  });

  it("la revoca: «Rimuovi risposta» torna a non risposto → NULL (e Canc fa lo stesso)", async () => {
    await scegli(7);
    expect(slider().getAttribute("aria-valuenow")).toBe("7");
    await tapTesto("Rimuovi risposta");
    expect(slider().getAttribute("aria-valuenow"), "risposta revocata").toBeNull();
    await salva();
    expect(h.updates[0].srpe, "dichiarazione revocata").toBeNull();

    // Anche da tastiera: scegli e cancella.
    await scegli(4);
    await premi("Delete");
    expect(slider().getAttribute("aria-valuenow")).toBeNull();
  });
});

describe("una parola alla volta, e mai un giudizio", () => {
  it.each([3, 6, 9])(
    "valore %i → la didascalia è ESATTAMENTE quel numero e la sua ancora",
    async (n) => {
      await scegli(n);
      const attesa = `${n} — ${SESSION_RPE_ANCHORS[n as keyof typeof SESSION_RPE_ANCHORS]}`;
      expect(didascalia()).toBe(attesa);
      // La scheda è chiusa: l'elenco delle dieci NON è nel testo visibile —
      // un'ancora di un ALTRO gradino non compare (campioni senza collisioni
      // di sottostringa col valore scelto).
      const testoSezione = sezioneRpe().textContent ?? "";
      const altre = [1, 2, 3, 6, 9].filter((v) => v !== n).slice(0, 2);
      for (const v of altre) {
        expect(testoSezione, `con ${n} scelto compare anche l'ancora di ${v}`).not.toContain(
          SESSION_RPE_ANCHORS[v as keyof typeof SESSION_RPE_ANCHORS],
        );
      }
      await premi("Delete");
    },
  );

  it("lo slider annuncia valore e ancora (aria-valuetext)", async () => {
    await scegli(6);
    expect(slider().getAttribute("aria-valuetext")).toBe("6 — Decisamente impegnativo");
  });
});

describe("la scheda «Come si valuta?» — sempre lì, tutta dal modulo", () => {
  it("si apre accanto alla domanda e porta le dieci ancore, l'avvertenza e gli esempi", async () => {
    await tapTesto("Come si valuta?");
    const testo = sezioneRpe().textContent ?? "";
    for (const n of SESSION_RPE_VALUES) {
      expect(testo, `ancora del gradino ${n} nella scheda`).toContain(SESSION_RPE_ANCHORS[n]);
    }
    expect(testo).toContain(SESSION_RPE_TIMING);
    expect(testo).toContain("3-4");
    expect(testo).toContain("7-8");
    expect(testo).toContain("con te stesso nel tempo");
  });

  it("nessuna stringa della scala vive nei componenti: la casa è il modulo", () => {
    const sorgenti = [
      join(process.cwd(), "src/pages/athlete/PostWorkoutDebrief.tsx"),
      join(process.cwd(), "src/components/athlete/SessionRpeGuide.tsx"),
    ].map((p) => readFileSync(p, "utf8"));
    const campioni = [
      "Molto, molto facile",
      "Decisamente impegnativo",
      "Estremamente impegnativo",
      "Quasi massimale",
      "finestra di normalizzazione",
      "con te stesso nel tempo",
      "non la media delle serie",
    ];
    for (const src of sorgenti) {
      for (const s of campioni) {
        expect(src, `stringa della scala scritta nel componente: «${s}»`).not.toContain(s);
      }
    }
  });
});
