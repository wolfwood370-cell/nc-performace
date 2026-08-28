// =============================================================================
// Il check-in conta la settimana che è successa davvero: il denominatore
// viene dai giorni prescritti del documento di rilascio, il numeratore da
// completed_at, e quando non c'è nulla da contare l'assenza RESTA assenza —
// la chiave non esiste, mai uno 0% fabbricato. Fixture modellata sulla
// misura viva del 2026-08-28 (atleta cfb31e82, finestra 24→30 agosto).
// =============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildWeekReport,
  completedLogsInWindow,
  fallbackSummaryText,
  prescribedDatesInWindow,
  weekAdherence,
  weekDataLines,
  weekPaceContext,
  type WeekLogRow,
} from "../../../../supabase/functions/_shared/program/weekAdherence.ts";

// ---- fixture: documento v2 con le quattro date prescritte di C-01 ----------

function giornoV2(sessionId: string, date: string, weekOrder: number, dayIndex: number) {
  return {
    session_id: sessionId,
    date,
    week_order: weekOrder,
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
    giornoV2("w1-s1", "2026-08-22", 1, 0),
    giornoV2("w1-s2", "2026-08-23", 1, 1),
    giornoV2("w1-s3", "2026-08-24", 1, 2),
    giornoV2("w1-s4", "2026-08-25", 1, 3),
  ],
};

// ---- fixture: le righe di workout_logs come sono DAVVERO (misura 28/08) ----
// scheduled_date NULL su tutte; 4 concluse il 25/08 (carico 9,02 UA, sRPE
// medio 8,5 — valori distinti di proposito), 2 concluse fuori finestra,
// 4 in_progress orfane senza completed_at.

const riga = (over: Partial<WeekLogRow>): WeekLogRow => ({
  status: null,
  completedDate: null,
  scheduledDate: null,
  totalLoadAu: null,
  srpe: null,
  ...over,
});

const LOGS: WeekLogRow[] = [
  riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 3, srpe: 9 }),
  riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2.52, srpe: 8 }),
  riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 1.5, srpe: 9 }),
  riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2, srpe: 8 }),
  riga({ status: "completed", completedDate: "2026-08-20", totalLoadAu: 5, srpe: 7 }),
  riga({ status: "completed", completedDate: "2026-08-21", totalLoadAu: 4, srpe: 6 }),
  riga({ status: "in_progress" }),
  riga({ status: "in_progress" }),
  riga({ status: "in_progress" }),
  riga({ status: "in_progress" }),
];

const FINESTRA = { fromIso: "2026-08-24", toIso: "2026-08-30", todayIso: "2026-08-28" };

// =============================================================================
// Acceptance 1 — la settimana vera
// =============================================================================
describe("la settimana vera: finestra 24→30, documento con date 22..25", () => {
  const report = buildWeekReport({ document: DOC_V2, ...FINESTRA, logs: LOGS });

  it("il denominatore viene dal documento: 2 giorni prescritti nella finestra", () => {
    expect(report.adherence.prescribedCount).toBe(2);
    expect(report.snapshot.workouts_scheduled).toBe(2);
  });

  it("le sedute concluse nella finestra sono 4, non 0", () => {
    expect(
      report.snapshot.sessions_completed,
      `attese 4 sedute concluse (le righe del 25/08), il filtro ne ha lasciate passare ${report.snapshot.sessions_completed}`,
    ).toBe(4);
  });

  it("il volume è 9.02 UA, non assente", () => {
    expect(
      report.snapshot.total_volume,
      `atteso total_volume 9.02, trovato ${String(report.snapshot.total_volume)}`,
    ).toBe(9.02);
  });

  it("compliance 50% (1/2), RPE medio 8.5, nessuna seduta fuori programma", () => {
    expect(report.adherence.honouredCount).toBe(1);
    expect(report.adherence.compliancePct).toBe(50);
    expect(report.snapshot.workouts_completed).toBe(1);
    expect(report.snapshot.avg_rpe).toBe("8.5");
    expect(report.adherence.offPlanCount).toBe(0);
    expect(report.snapshot.off_plan_sessions).toBe(0);
  });

  it("saltati e rimanenti derivano dal documento, non da status='scheduled'", () => {
    // 24/08 prescritto e non onorato, prima di oggi (28/08) -> saltato;
    // nessun giorno prescritto da oggi in poi -> 0 rimanenti.
    expect(report.snapshot.workouts_missed).toBe(1);
    expect(report.snapshot.workouts_remaining).toBe(0);
  });

  it("le righe della stringa-dati per il modello citano i numeri veri", () => {
    const dati = weekDataLines(report);
    expect(dati).toContain("Compliance attuale: 50% (1/2)");
    expect(dati).toContain("Sedute concluse: 4");
    expect(dati).toContain("Volume totale: 9.02 UA");
    expect(dati).toContain("RPE medio: 8.5");
  });
});

// =============================================================================
// L'aderenza si conta sui giorni, non sulle sedute
// =============================================================================
describe("aderenza per giorni prescritti onorati", () => {
  it("4 sedute su 1 dei 2 giorni prescritti → 50, mai 200", () => {
    const a = weekAdherence({
      prescribed: ["2026-08-24", "2026-08-25"],
      completedDates: ["2026-08-25", "2026-08-25", "2026-08-25", "2026-08-25"],
    });
    expect(a.compliancePct).toBe(50);
    expect(a.honouredCount).toBe(1);
    expect(a.prescribedCount).toBe(2);
    expect(a.offPlanCount).toBe(0);
  });

  it("acceptance 2: giorno onorato + seduta fuori programma → 100 e offPlan 1", () => {
    const a = weekAdherence({
      prescribed: ["2026-08-24"],
      completedDates: ["2026-08-24", "2026-08-26"],
    });
    expect(a.compliancePct).toBe(100);
    expect(a.offPlanCount).toBe(1);
    expect(a.honouredCount).toBe(1);
  });

  it("il rapporto non supera mai 100 nemmeno con più sedute che giorni", () => {
    const a = weekAdherence({
      prescribed: ["2026-08-24"],
      completedDates: ["2026-08-24", "2026-08-24", "2026-08-25", "2026-08-26"],
    });
    expect(a.compliancePct).toBe(100);
    expect(a.offPlanCount).toBe(2);
  });
});

// =============================================================================
// Acceptance 3 — l'assenza è assenza (chiave ASSENTE, mai 0, mai null)
// =============================================================================
describe("nessun giorno prescritto: l'assenza resta assenza", () => {
  // sRPE sotto 8 di proposito: questo snapshot deve restare fuori da OGNI
  // ramo di isAnomalous, non solo da quello della compliance.
  const LOGS_LIEVI: WeekLogRow[] = [
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2.5, srpe: 7 }),
    riga({ status: "completed", completedDate: "2026-08-26", totalLoadAu: 1.5, srpe: 6 }),
  ];
  const assenza = buildWeekReport({ document: null, ...FINESTRA, logs: LOGS_LIEVI });

  it("compliance_pct è una chiave ASSENTE dallo snapshot, non un valore", () => {
    expect(
      "compliance_pct" in assenza.snapshot,
      "senza prescrizioni la chiave compliance_pct NON deve esistere nello snapshot",
    ).toBe(false);
    expect(
      "workouts_scheduled" in assenza.snapshot,
      "senza prescrizioni la chiave workouts_scheduled NON deve esistere nello snapshot",
    ).toBe(false);
  });

  it("anche il JSON serializzato non porta le due chiavi", () => {
    const roundTrip = JSON.parse(JSON.stringify(assenza.snapshot));
    expect("compliance_pct" in roundTrip).toBe(false);
    expect("workouts_scheduled" in roundTrip).toBe(false);
  });

  it("le sedute fatte restano dichiarate: 2 concluse, entrambe fuori programma", () => {
    expect(assenza.snapshot.sessions_completed).toBe(2);
    expect(assenza.snapshot.off_plan_sessions).toBe(2);
    expect(assenza.adherence.compliancePct).toBeNull();
  });

  it("rilascio fuori finestra = stessa assenza", () => {
    const r = buildWeekReport({
      document: DOC_V2,
      fromIso: "2026-09-07",
      toIso: "2026-09-13",
      todayIso: "2026-09-10",
      logs: [],
    });
    expect("compliance_pct" in r.snapshot).toBe(false);
    expect("workouts_scheduled" in r.snapshot).toBe(false);
  });

  it("le stringhe per il modello non contengono 0% né (0/0) e dichiarano l'assenza", () => {
    const testo = [
      weekDataLines(assenza),
      weekPaceContext({ prescribedCount: 0, remainingCount: 0, weekClosed: false }),
      fallbackSummaryText(assenza),
    ].join("\n");
    expect(testo, "un'assenza non si scrive 0%").not.toContain("0%");
    expect(testo, "un'assenza non si scrive (0/0)").not.toContain("(0/0)");
    expect(testo.toLowerCase()).toContain("nessuna seduta programmata");
  });
});

// =============================================================================
// prescribedDatesInWindow — le due versioni del documento
// =============================================================================
describe("prescribedDatesInWindow", () => {
  it("v2: le date del documento nella finestra, ordinate e senza duplicati", () => {
    expect(prescribedDatesInWindow(DOC_V2, "2026-08-24", "2026-08-30")).toEqual([
      "2026-08-24",
      "2026-08-25",
    ]);
    expect(prescribedDatesInWindow(DOC_V2, "2026-08-01", "2026-09-30")).toEqual([
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
    ]);
  });

  it("v1: eredita la mappatura giorno-della-settimana (3 giorni → lun/mar/mer)", () => {
    const docV1 = {
      version: 1,
      goal: "GPP",
      days: [
        { day_name: "Giorno 1", exercises: [{ name: "Squat", sets: 3, reps: "5" }] },
        { day_name: "Giorno 2", exercises: [{ name: "Panca", sets: 3, reps: "5" }] },
        { day_name: "Giorno 3", exercises: [{ name: "Stacco", sets: 3, reps: "5" }] },
      ],
    };
    // 24/08/2026 è lunedì: la settimana 24→30 prescrive lun/mar/mer.
    expect(prescribedDatesInWindow(docV1, "2026-08-24", "2026-08-30")).toEqual([
      "2026-08-24",
      "2026-08-25",
      "2026-08-26",
    ]);
  });

  it("documento illeggibile o versione ignota → [], mai una data inventata", () => {
    expect(prescribedDatesInWindow(null, "2026-08-24", "2026-08-30")).toEqual([]);
    expect(prescribedDatesInWindow(undefined, "2026-08-24", "2026-08-30")).toEqual([]);
    expect(prescribedDatesInWindow("spazzatura", "2026-08-24", "2026-08-30")).toEqual([]);
    expect(prescribedDatesInWindow({ version: 3, days: [] }, "2026-08-24", "2026-08-30")).toEqual(
      [],
    );
    expect(prescribedDatesInWindow({ version: 2, days: [] }, "2026-08-24", "2026-08-30")).toEqual(
      [],
    );
    // v2 con un giorno senza data: il parser dell'atleta lo rifiuta, qui = assenza.
    const senzaData = { ...DOC_V2, days: [{ ...DOC_V2.days[0], date: undefined }] };
    expect(prescribedDatesInWindow(senzaData, "2026-08-24", "2026-08-30")).toEqual([]);
  });

  it("finestra rovesciata o non-ISO → []", () => {
    expect(prescribedDatesInWindow(DOC_V2, "2026-08-30", "2026-08-24")).toEqual([]);
    expect(prescribedDatesInWindow(DOC_V2, "24/08/2026", "2026-08-30")).toEqual([]);
  });
});

// =============================================================================
// Il filtro onesto — completed_at, mai scheduled_date
// =============================================================================
describe("completedLogsInWindow", () => {
  it("seleziona per giorno civile di conclusione: 4 dentro, 2 fuori, orfane escluse", () => {
    const dentro = completedLogsInWindow(LOGS, "2026-08-24", "2026-08-30");
    expect(dentro).toHaveLength(4);
    expect(dentro.every((l) => l.completedDate === "2026-08-25")).toBe(true);
  });

  it("una riga completed senza completedDate non conta (assenza, non zero)", () => {
    const soleOrfane = [riga({ status: "completed", completedDate: null, totalLoadAu: 3 })];
    expect(completedLogsInWindow(soleOrfane, "2026-08-24", "2026-08-30")).toHaveLength(0);
  });
});

// =============================================================================
// Acceptance 6 — determinismo
// =============================================================================
describe("determinismo del modulo puro", () => {
  it("due esecuzioni con lo stesso input danno lo stesso output", () => {
    const uno = buildWeekReport({ document: DOC_V2, ...FINESTRA, logs: LOGS });
    const due = buildWeekReport({ document: DOC_V2, ...FINESTRA, logs: LOGS });
    expect(due).toEqual(uno);
    expect(prescribedDatesInWindow(DOC_V2, "2026-08-01", "2026-09-30")).toEqual(
      prescribedDatesInWindow(DOC_V2, "2026-08-01", "2026-09-30"),
    );
  });

  it("il sorgente del modulo non contiene orologi né casualità", () => {
    const src = readFileSync(
      new URL("../../../../supabase/functions/_shared/program/weekAdherence.ts", import.meta.url),
      "utf8",
    );
    // I tre pattern vietati sono spezzati per non comparire come sottostringhe
    // letterali in QUESTO file: il grep dell'acceptance resta pulito.
    const vietati = ["Date.n" + "ow", "new Da" + "te(", "Math.ran" + "dom"];
    for (const pattern of vietati) {
      expect(src.includes(pattern), `trovato ${pattern} nel modulo puro`).toBe(false);
    }
  });
});
