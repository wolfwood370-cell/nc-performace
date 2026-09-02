// =============================================================================
// Il check-in legge la settimana e non la giudica: il cancello dell'aderenza
// in un punto solo, le sedute oltre soglia contate dagli avvisi del watchdog
// (distinte per seduta), la prosa del modello in gabbia da due lati — il
// prompt detta i numeri, il vaglio boccia ogni rapporto o percentuale che
// non sia nei dati e ogni parola d'azione sul carico. Fixture: la settimana
// vera del 24→30 agosto 2026 dell'atleta cfb31e82 (misura viva 28/08 e 01/09).
// =============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildWeekReport,
  type WeekLogRow,
  type WeekReport,
} from "../../../../supabase/functions/_shared/program/weekAdherence.ts";
import {
  ADHERENCE_DAYS_WORDING_BELOW,
  ADHERENCE_GATE_PCT,
  buildCheckinPrompt,
  countSessionsOverThreshold,
  overThresholdText,
  PROMPT_RULES,
  readingSourceFromSnapshot,
  vetSummary,
  weekReading,
  type WeekReadingSource,
} from "../../../../supabase/functions/_shared/program/checkinReading.ts";

// ---- fixture: documento v2 con le quattro date prescritte, come il 28/08 ----

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

const riga = (over: Partial<WeekLogRow>): WeekLogRow => ({
  status: null,
  completedDate: null,
  scheduledDate: null,
  totalLoadAu: null,
  srpe: null,
  ...over,
});

const FINESTRA = { fromIso: "2026-08-24", toIso: "2026-08-30", todayIso: "2026-08-28" };

/** Il report VERO della 24→30: 2 prescritti, 1 onorato con 4 sedute, 9,02 UA, sRPE 8,5. */
const reportVero: WeekReport = buildWeekReport({
  document: DOC_V2,
  ...FINESTRA,
  logs: [
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 3, srpe: 9 }),
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2.52, srpe: 8 }),
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 1.5, srpe: 9 }),
    riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2, srpe: 8 }),
  ],
});

/** Una sorgente di lettura scritta a mano: settimana chiusa salvo dove detto. */
function sorgente(
  prescribed: number,
  honoured: number,
  over: Partial<Pick<WeekReadingSource, "missedCount" | "remainingCount" | "totalVolume">> = {},
): WeekReadingSource {
  const remaining = over.remainingCount ?? 0;
  return {
    adherence: {
      prescribedCount: prescribed,
      honouredCount: honoured,
      compliancePct: prescribed === 0 ? null : Math.round((honoured / prescribed) * 100),
    },
    missedCount: over.missedCount ?? prescribed - honoured - remaining,
    remainingCount: remaining,
    totalVolume: over.totalVolume ?? null,
  };
}

const CTX = {
  athleteName: "Atleta Prova",
  dayName: "domenica",
  timeStr: "18:00",
  weekStartIso: "2026-08-24",
  weekEndIso: "2026-08-30",
  avgCalories: null,
  paceContext: "La settimana di allenamento è conclusa. Fornisci un riepilogo completo.",
};

// =============================================================================
// Acceptance 1 — weekReading: il cancello e la sua forma
// =============================================================================
describe("weekReading — il cancello dell'aderenza, in un punto solo", () => {
  it("le costanti sono dato esportato: 70% e 4 giorni", () => {
    expect(ADHERENCE_GATE_PCT).toBe(70);
    expect(ADHERENCE_DAYS_WORDING_BELOW).toBe(4);
  });

  it("1 su 2 (50%) → below, e la lettura è in giorni", () => {
    const r = weekReading(sorgente(2, 1), 0);
    expect(r.adherence.gate).toBe("below");
    expect(r.adherence.text).toBe("1 giorno prescritto su 2 non onorato");
  });

  it("il report VERO della 24→30 legge «1 giorno prescritto su 2 non onorato» e 9,02 UA", () => {
    const r = weekReading(reportVero, 2);
    expect(r.adherence.gate).toBe("below");
    expect(r.adherence.text).toBe("1 giorno prescritto su 2 non onorato");
    expect(r.load.ua).toBe(9.02);
    expect(r.load.text).toContain("9,02 UA");
    expect(r.overThresholdSessions).toBe(2);
    expect(r.attention).toBe(true);
  });

  it("3 su 4 (75%) → ok, in giorni", () => {
    const r = weekReading(sorgente(4, 3), 0);
    expect(r.adherence.gate).toBe("ok");
    expect(r.adherence.text).toBe("aderenza 75% (3 su 4)");
  });

  it("3 su 3 sotto i 4 prescritti → ok, in giorni onorati", () => {
    const r = weekReading(sorgente(3, 3), 0);
    expect(r.adherence.gate).toBe("ok");
    expect(r.adherence.text).toBe("3 giorni prescritti su 3 onorati");
  });

  it("0 prescritti → none, e il testo dichiara l'assenza senza numeri", () => {
    const r = weekReading(sorgente(0, 0), 0);
    expect(r.adherence.gate).toBe("none");
    expect(r.adherence.text).toBe("nessun giorno prescritto questa settimana");
    expect(r.adherence.text).not.toMatch(/\d/);
    expect(r.attention).toBe(false);
  });

  it("5 su 7 (71%) → ok, in percentuale", () => {
    const r = weekReading(sorgente(7, 5), 0);
    expect(r.adherence.gate).toBe("ok");
    expect(r.adherence.text).toBe("aderenza 71% (5 su 7)");
  });

  it("2 su 3 (67%) → below, in giorni", () => {
    const r = weekReading(sorgente(3, 2), 0);
    expect(r.adherence.gate).toBe("below");
    expect(r.adherence.text).toBe("1 giorno prescritto su 3 non onorato");
  });

  it("attention è vero con overThresholdSessions = 1 anche a gate ok", () => {
    const r = weekReading(sorgente(4, 3), 1);
    expect(r.adherence.gate).toBe("ok");
    expect(r.attention).toBe(true);
    expect(weekReading(sorgente(4, 3), 0).attention).toBe(false);
  });

  it("a metà settimana il cancello non giudica ciò che è ancora in programma", () => {
    // Martedì: 1 di 3 onorato, 0 saltati, 2 in arrivo → 33% oggi, ma 100% raggiungibile.
    const aperta = weekReading(sorgente(3, 1, { remainingCount: 2, missedCount: 0 }), 0);
    expect(aperta.adherence.gate).toBe("ok");
    expect(aperta.adherence.text).toBe("1 giorno prescritto su 3 onorato, 2 ancora in programma");
    expect(aperta.attention).toBe(false);
    // Giovedì: 0 di 4 onorati, 3 saltati, 1 in arrivo → al massimo 25%: già sotto.
    const persa = weekReading(sorgente(4, 0, { remainingCount: 1, missedCount: 3 }), 0);
    expect(persa.adherence.gate).toBe("below");
    expect(persa.adherence.text).toBe("aderenza 0% (0 su 4), 1 ancora in programma");
  });

  it("il carico assente resta assente: nessun «0 UA»", () => {
    const r = weekReading(sorgente(2, 2), 0);
    expect(r.load.ua).toBeNull();
    expect(r.load.text).not.toContain("0 UA");
    expect(r.load.text).toContain("non misurato");
  });

  it("le parole delle sedute oltre soglia: singolare e plurale, nessuna soglia numerica", () => {
    expect(overThresholdText(1)).toBe("1 seduta oltre la soglia d'attenzione");
    expect(overThresholdText(2)).toBe("2 sedute oltre la soglia d'attenzione");
    expect(overThresholdText(2)).not.toMatch(/9|10/);
  });
});

describe("readingSourceFromSnapshot — il frontend legge lo snapshot, non ricalcola", () => {
  it("lo snapshot vero della 24→30 dà la stessa lettura del report", () => {
    const daSnapshot = weekReading(readingSourceFromSnapshot(reportVero.snapshot), 2);
    const daReport = weekReading(reportVero, 2);
    expect(daSnapshot).toEqual(daReport);
  });

  it("chiavi assenti = assenza: gate none, carico null, mai uno zero fabbricato", () => {
    const r = weekReading(readingSourceFromSnapshot({ workouts_completed: 0 }), 0);
    expect(r.adherence.gate).toBe("none");
    expect(r.load.ua).toBeNull();
    expect(weekReading(readingSourceFromSnapshot(null), 0).adherence.gate).toBe("none");
  });
});

// =============================================================================
// Acceptance 5 — le sedute oltre soglia si contano DISTINTE per seduta
// =============================================================================
describe("countSessionsOverThreshold — gli avvisi del watchdog, contati per seduta", () => {
  const settimana = ["log-a", "log-b", "log-c"];

  it("due risk_alert sullo stesso workout_log_id → 1", () => {
    const n = countSessionsOverThreshold(
      [{ workout_log_id: "log-a" }, { workout_log_id: "log-a" }],
      settimana,
    );
    expect(n, "il watchdog può duplicare su UPDATE: una seduta, un conteggio").toBe(1);
  });

  it("due risk_alert su due sedute diverse della settimana → 2 (la misura viva del 25/08)", () => {
    expect(
      countSessionsOverThreshold(
        [{ workout_log_id: "log-a" }, { workout_log_id: "log-b" }],
        settimana,
      ),
    ).toBe(2);
  });

  it("un avviso su una seduta fuori settimana o senza workout_log_id non conta", () => {
    expect(
      countSessionsOverThreshold(
        [{ workout_log_id: "log-vecchio" }, { workout_log_id: null }],
        settimana,
      ),
    ).toBe(0);
    expect(countSessionsOverThreshold([], settimana)).toBe(0);
    expect(countSessionsOverThreshold([{ workout_log_id: "log-a" }], [])).toBe(0);
  });
});

// =============================================================================
// Acceptance 3 — il prompt: la lettura in testa, le regole testuali
// =============================================================================
describe("buildCheckinPrompt — la lettura precede i dati e le regole sono testuali", () => {
  const readingBelow = weekReading(reportVero, 2);
  const promptBelow = buildCheckinPrompt(readingBelow, reportVero, CTX);

  it("la riga dell'aderenza precede ogni riga sul carico", () => {
    const aderenza = promptBelow.indexOf(readingBelow.adherence.text);
    expect(aderenza).toBeGreaterThan(-1);
    for (const parola of ["Carico", "UA", "Volume totale"]) {
      expect(aderenza, `l'aderenza deve venire prima di «${parola}»`).toBeLessThan(
        promptBelow.indexOf(parola),
      );
    }
  });

  it("ordine della lettura: aderenza → sedute oltre soglia → carico → RPE medio come numero", () => {
    const iA = promptBelow.indexOf("- Aderenza:");
    const iS = promptBelow.indexOf("- Sedute oltre la soglia d'attenzione: 2");
    const iC = promptBelow.indexOf("- Carico:");
    const iR = promptBelow.indexOf("- RPE medio: 8.5");
    expect([iA, iS, iC, iR].every((i) => i > -1)).toBe(true);
    expect(iA).toBeLessThan(iS);
    expect(iS).toBeLessThan(iC);
    expect(iC).toBeLessThan(iR);
  });

  it("le regole (1)(2)(3)(5) sono presenti testualmente", () => {
    expect(promptBelow).toContain("Usa solo i numeri elencati, così come sono scritti.");
    expect(promptBelow).toContain(
      "Non comporre rapporti, frazioni o percentuali che non siano nell'elenco.",
    );
    expect(promptBelow).toContain(
      "Non proporre azioni sul carico: niente scarico, deload, alleggerire o aumentare.",
    );
    expect(promptBelow).toContain("Scrivi le date in lettere (24 agosto), mai con la barra.");
  });

  it("la regola (4) c'è con gate below e NON c'è con gate ok", () => {
    expect(promptBelow).toContain(PROMPT_RULES.belowGate);
    const okReport: WeekReport = {
      ...reportVero,
      adherence: { prescribedCount: 4, honouredCount: 3, offPlanCount: 0, compliancePct: 75 },
      missedCount: 1,
      remainingCount: 0,
    };
    const readingOk = weekReading(okReport, 0);
    expect(readingOk.adherence.gate).toBe("ok");
    expect(buildCheckinPrompt(readingOk, okReport, CTX)).not.toContain(PROMPT_RULES.belowGate);
  });

  it("il prompt non decide il carico al posto del coach e porta il contesto del chiamante", () => {
    expect(promptBelow).toContain(CTX.paceContext);
    expect(promptBelow).toContain("Atleta Prova");
    expect(promptBelow).toContain("Sedute oltre la soglia d'attenzione: 2");
    expect(promptBelow).not.toMatch(/valuta(re)? (uno )?scarico/i);
  });
});

// =============================================================================
// Acceptance 2 — il vaglio, sul report VERO della 24→30
// =============================================================================
describe("vetSummary — ogni rapporto e percentuale deve già essere nei dati", () => {
  it("boccia la frase viva del 30/08 nominando il 5 che non esiste", () => {
    const v = vetSummary(
      "Settimana conclusa: 4 sedute su 5 (50% compliance), 1 giorno saltato. Recupera il giorno perso.",
      reportVero,
    );
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("4 sedute su 5");
    expect(v.reasons.join(" ")).toContain("5");
  });

  it("boccia «valuta uno scarico» nominando la parola", () => {
    const v = vetSummary("Settimana faticosa: valuta uno scarico la prossima.", reportVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("scarico");
  });

  it("accetta «1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA, RPE medio 8.5»", () => {
    expect(
      vetSummary(
        "1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA, RPE medio 8.5",
        reportVero,
      ),
    ).toEqual({ ok: true });
  });

  it("accetta «Aderenza 1/2 (50%). RPE medio 8.5/10» — e anche la virgola italiana 8,5/10", () => {
    expect(vetSummary("Aderenza 1/2 (50%). RPE medio 8.5/10", reportVero)).toEqual({ ok: true });
    expect(vetSummary("RPE medio 8,5/10, aderenza 50%.", reportVero)).toEqual({ ok: true });
  });

  it("boccia un «9/10» assente dai dati", () => {
    const v = vetSummary("Sforzo percepito 9/10.", reportVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("9/10");
  });

  it("accetta la lettura stessa («1 giorno prescritto su 2 non onorato»)", () => {
    const testo = weekReading(reportVero, 2).adherence.text;
    expect(vetSummary(`${testo}. Carico 9,02 UA.`, reportVero)).toEqual({ ok: true });
  });

  it("è conservativo per disegno: una data con la barra (24/08) lo fa scattare", () => {
    const v = vetSummary("Sedute concluse il 24/08.", reportVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("24/08");
  });

  it("boccia «deload» e «alleggerire», in qualunque maiuscola", () => {
    for (const frase of ["Consiglio un DELOAD.", "Meglio Alleggerire il volume."]) {
      const v = vetSummary(frase, reportVero);
      expect(v.ok, frase).toBe(false);
    }
  });

  it("boccia una percentuale non presente nei dati", () => {
    const v = vetSummary("Aderenza al 75%.", reportVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("75%");
  });

  it("senza prescrizione nessun rapporto è ammesso, salvo RPE/10", () => {
    const assenza = buildWeekReport({
      document: null,
      ...FINESTRA,
      logs: [riga({ status: "completed", completedDate: "2026-08-25", totalLoadAu: 2, srpe: 7 })],
    });
    expect(vetSummary("Seduta 1 su 1 fatta.", assenza).ok).toBe(false);
    expect(vetSummary("RPE medio 7.0/10, 2 UA.", assenza)).toEqual({ ok: true });
  });

  it("una frase senza numeri né parole vietate passa", () => {
    expect(
      vetSummary("Settimana con una sola giornata onorata; buon controllo.", reportVero),
    ).toEqual({ ok: true });
  });
});

// =============================================================================
// Determinismo del modulo puro
// =============================================================================
describe("determinismo del modulo puro", () => {
  it("due esecuzioni con lo stesso input danno lo stesso output", () => {
    const uno = buildCheckinPrompt(weekReading(reportVero, 2), reportVero, CTX);
    const due = buildCheckinPrompt(weekReading(reportVero, 2), reportVero, CTX);
    expect(due).toBe(uno);
    expect(weekReading(reportVero, 2)).toEqual(weekReading(reportVero, 2));
  });

  it("il sorgente del modulo non contiene orologi, rete né casualità, né la soglia del watchdog", () => {
    const src = readFileSync(
      new URL("../../../../supabase/functions/_shared/program/checkinReading.ts", import.meta.url),
      "utf8",
    );
    // Pattern spezzati per non comparire come sottostringhe letterali qui.
    const vietati = ["Date.n" + "ow", "new Da" + "te(", "Math.ran" + "dom", "fet" + "ch("];
    for (const pattern of vietati) {
      expect(src.includes(pattern), `trovato ${pattern} nel modulo puro`).toBe(false);
    }
    // La soglia è del watchdog (srpe >= 9): qui si contano i suoi avvisi.
    expect(src).not.toMatch(/srpe\s*>=?\s*9/);
  });
});
