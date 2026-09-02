// @vitest-environment jsdom
// =============================================================================
// La card dell'inbox non fabbrica il denominatore, l'assenza non accende
// l'attenzione, e il riquadro LEGGE la settimana invece di giudicarla: niente
// «Indici di rischio elevati», niente «Valutare scarico», la card RPE senza
// tinta. Le fixture NON scrivono lo snapshot a mano: lo derivano da
// buildWeekReport (il modulo condiviso che la edge usa davvero), così una
// mutazione del modulo — «: 0» al posto dell'assenza — propaga fino alla
// card e questi test muoiono con lei.
// =============================================================================
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  buildWeekReport,
  type WeekLogRow,
} from "../../../../supabase/functions/_shared/program/weekAdherence.ts";

const h = vi.hoisted(() => ({
  checkins: [] as unknown[],
}));

vi.mock("@/hooks/useWeeklyCheckins", () => ({
  useWeeklyCheckins: () => ({
    checkins: h.checkins,
    isLoading: false,
    error: null,
    generateCheckins: { mutate: () => {}, isPending: false },
    updateCheckin: { mutate: () => {}, isPending: false },
    approveAndSend: { mutate: () => {}, isPending: false },
  }),
}));

vi.mock("@/components/coach/CoachLayout", () => ({
  CoachLayout: (props: { children?: unknown }) =>
    createElement("div", null, props.children as never),
}));

vi.mock("@/components/MetaHead", () => ({ MetaHead: () => null }));

import CoachCheckinInbox from "@/pages/coach/CoachCheckinInbox";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// Radix ScrollArea legge ResizeObserver, che jsdom non ha.
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// ---- fixture derivate dal modulo condiviso ---------------------------------

const riga = (over: Partial<WeekLogRow>): WeekLogRow => ({
  status: null,
  completedDate: null,
  scheduledDate: null,
  totalLoadAu: null,
  srpe: null,
  ...over,
});

function giornoV2(sessionId: string, date: string, dayIndex: number) {
  return {
    session_id: sessionId,
    date,
    week_order: 1,
    day_index: dayIndex,
    day_name: `Seduta ${dayIndex + 1}`,
    focus: "",
    exercises: [
      {
        item_id: `${sessionId}-e1`,
        exercise_id: "cat-1",
        name: "Panca piana",
        order: 0,
        superset_id: null,
        coach_notes: "",
        sets: [
          {
            set_number: 1,
            reps: "5",
            rpe: 8,
            rir: null,
            percent_1rm: null,
            rest_seconds: 120,
            tempo: null,
            is_warmup: false,
          },
        ],
      },
    ],
  };
}

const DOC_V2 = {
  version: 2,
  source: { block_id: "b1", block_updated_at: "2026-08-22T10:00:00Z" },
  name: "Blocco C-15",
  goal: "Forza",
  start_date: "2026-08-22",
  rationale: "",
  days: [
    giornoV2("w1-s1", "2026-08-22", 0),
    giornoV2("w1-s2", "2026-08-23", 1),
    giornoV2("w1-s3", "2026-08-24", 2),
    giornoV2("w1-s4", "2026-08-25", 3),
  ],
};

const FINESTRA = { fromIso: "2026-08-24", toIso: "2026-08-30", todayIso: "2026-08-28" };

// Il caso del contratto: 2 prescritti, 1 onorato con 4 sedute, 9,02 UA, sRPE 8,5.
const reportContratto = buildWeekReport({
  document: DOC_V2,
  ...FINESTRA,
  logs: [
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 3, srpe: 9 }),
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2.52, srpe: 8 }),
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 1.5, srpe: 9 }),
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2, srpe: 8 }),
  ],
});

// L'assenza: nessun rilascio; sRPE sotto 8 come nella fixture storica, così
// resta falsificabile che la tinta non torni a dipendere dall'RPE medio.
const reportAssenza = buildWeekReport({
  document: null,
  ...FINESTRA,
  logs: [
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2.5, srpe: 7 }),
    riga({ status: "completed", completedDate: "2026-08-26", totalLoadAu: 1.5, srpe: 6 }),
  ],
});

function checkinCon(snapshot: object, id: string, nome: string, overThreshold: number) {
  return {
    id,
    coach_id: "coach-1",
    athlete_id: `ath-${id}`,
    week_start: "2026-08-24",
    status: "pending",
    ai_summary: "Riepilogo della settimana.",
    coach_notes: null,
    // sessions_over_threshold: il conteggio del watchdog, SEMPRE presente
    // (la edge lo scrive a ogni riga; qui la fixture lo dichiara).
    metrics_snapshot: {
      ...snapshot,
      sessions_over_threshold: overThreshold,
      avg_daily_calories: null,
    },
    created_at: "2026-08-28T08:00:00Z",
    updated_at: "2026-08-28T08:00:00Z",
    athlete: { full_name: nome, avatar_url: null },
  };
}

// ---- montaggio -------------------------------------------------------------

let root: Root | null = null;
let host: HTMLDivElement | null = null;

async function monta(): Promise<string> {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root!.render(createElement(CoachCheckinInbox));
  });
  // Macrotask hop di default (lezione 2026-08-27) anche senza query in volo:
  // l'auto-selezione della prima riga passa da un useEffect.
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  return host.textContent ?? "";
}

/** La card «Metriche Oggettive» con quell'etichetta: il contenitore arrotondato
 *  che porta la tinta (classi di MetricCard). */
function cardMetrica(label: string): HTMLElement {
  const etichetta = Array.from(host!.querySelectorAll("p")).find((p) => p.textContent === label);
  if (!etichetta) throw new Error(`card «${label}» non montata`);
  const card = etichetta.closest("div.rounded-2xl");
  if (!(card instanceof HTMLElement)) throw new Error(`contenitore di «${label}» non trovato`);
  return card;
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

// =============================================================================
describe("CoachCheckinInbox — la card non fabbrica il denominatore", () => {
  it("col denominatore vero rende 1/2, 50%, 9.02 UA e 8.5/10 — e la compliance non è sotto soglia", async () => {
    h.checkins = [checkinCon(reportContratto.snapshot, "c-1", "Atleta Contratto", 2)];
    const testo = await monta();
    const compatto = testo.replace(/\s+/g, "");
    // Ancora positiva: il workspace è montato con le metriche.
    expect(testo).toContain("Metriche Oggettive");
    expect(compatto).toContain("Sessioni1/2");
    expect(testo).toContain("50%");
    expect(compatto).toContain("9.02UA");
    expect(compatto).toContain("8.5/10");
    expect(testo).not.toContain("Compliance sotto soglia");
  });

  it("senza workouts_scheduled la card rende «—», mai un rapporto con denominatore zero", async () => {
    h.checkins = [checkinCon(reportAssenza.snapshot, "c-2", "Atleta Assenza", 0)];
    const testo = await monta();
    const compatto = testo.replace(/\s+/g, "");
    // Ancora positiva: la pagina è montata e la card Sessioni esiste.
    expect(testo).toContain("Metriche Oggettive");
    expect(compatto).toContain("Sessioni—");
    expect(testo).not.toMatch(/\d+\/0(?!\d)/);
    // Anche la Compliance resta un'assenza dichiarata.
    expect(compatto).toContain("Compliance—");
  });

  it("l'assenza non accende l'attenzione: nessun badge, la lettura dichiara l'assenza", async () => {
    h.checkins = [checkinCon(reportAssenza.snapshot, "c-3", "Atleta Assenza", 0)];
    const testo = await monta();
    // Ancora positiva: il workspace del check-in è montato davvero.
    expect(testo).toContain("Feedback Soggettivo");
    expect(testo).not.toContain("Indici di rischio elevati");
    expect(testo).not.toContain("Compliance sotto soglia");
    expect(testo).not.toContain("Attenzione");
    expect(testo).toContain("Lettura della settimana");
    expect(testo).toContain("essun giorno prescritto questa settimana");
    expect(testo).not.toContain("oltre la soglia");
  });
});

// =============================================================================
// Acceptance 4 — il riquadro legge, non giudica
// =============================================================================
describe("CoachCheckinInbox — la lettura della settimana al posto del verdetto", () => {
  it("con 50%, RPE 8.5 e 2 sedute oltre soglia: nessun verdetto, la lettura in tre righe, RPE senza tinta", async () => {
    h.checkins = [checkinCon(reportContratto.snapshot, "c-4", "Atleta Contratto", 2)];
    const testo = await monta();
    // Ancora positiva: il workspace è montato con le metriche.
    expect(testo).toContain("Metriche Oggettive");
    // Il verdetto è sparito, in ogni sua parola.
    expect(testo).not.toContain("Indici di rischio elevati");
    expect(testo).not.toContain("Valutare scarico");
    expect(testo.toLowerCase()).not.toContain("rischio");
    // La lettura: aderenza in giorni, sedute oltre soglia dal watchdog, carico in UA.
    expect(testo).toContain("Lettura della settimana");
    expect(testo).toContain("1 giorno prescritto su 2 non onorato");
    expect(testo).toContain("2 sedute oltre la soglia");
    expect(testo).toContain("9,02 UA");
    // L'attenzione è un tono warning col suo badge, non un rischio.
    expect(testo).toContain("Attenzione");
    // La card RPE medio non porta nessuna tinta; la compliance porta quella di attenzione.
    const rpe = cardMetrica("RPE medio");
    expect(rpe.className).not.toMatch(/destructive|error|warning/);
    const compliance = cardMetrica("Compliance");
    expect(compliance.className).toContain("warning");
    expect(compliance.className).not.toMatch(/destructive|error/);
  });

  it("una sola seduta oltre soglia a gate ok accende l'attenzione senza tingere la compliance", async () => {
    // 3 prescritti su 4 onorati (75%): gate ok; 1 seduta oltre soglia dal watchdog.
    const okReport = buildWeekReport({
      document: {
        ...DOC_V2,
        days: [
          giornoV2("w1-s3", "2026-08-24", 2),
          giornoV2("w1-s4", "2026-08-25", 3),
          giornoV2("w1-s5", "2026-08-26", 4),
          giornoV2("w1-s6", "2026-08-27", 5),
        ],
      },
      ...FINESTRA,
      logs: [
        riga({ status: "completed", completedDate: "2026-08-24", totalLoadAu: 3, srpe: 7 }),
        riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2, srpe: 9 }),
        riga({ status: "completed", completedDate: "2026-08-26", totalLoadAu: 2, srpe: 7 }),
      ],
    });
    expect(okReport.adherence.compliancePct).toBe(75);
    h.checkins = [checkinCon(okReport.snapshot, "c-5", "Atleta Ok", 1)];
    const testo = await monta();
    expect(testo).toContain("Attenzione");
    expect(testo).toContain("1 seduta oltre la soglia");
    expect(cardMetrica("Compliance").className).not.toMatch(/warning|destructive|error/);
  });
});
