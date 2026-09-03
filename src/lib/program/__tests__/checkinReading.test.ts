// =============================================================================
// Il check-in legge la settimana e non la giudica: il cancello dell'aderenza
// in un punto solo, le sedute oltre soglia contate dagli avvisi del watchdog
// (distinte per seduta), la prosa del modello in gabbia da due lati — il
// prompt detta i numeri e DÀ la data di oggi, il vaglio boccia ogni rapporto
// o percentuale che non sia nei dati, ogni parola d'azione sul carico e ogni
// numero che il prompt non abbia dato (letto dal blocco-dati del prompt
// stesso, una sorgente sola). Sulla settimana VUOTA (zero prescritti E zero
// sedute concluse) il modello non si chiama: una frase sola, deterministica.
// Fixture: la settimana vera del 24→30 agosto 2026 dell'atleta cfb31e82
// (misura viva 28/08 e 01/09) e la settimana vuota del 31/08→06/09 (misura
// viva di Cowork, 02/09 alle 15:03).
// =============================================================================
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildWeekReport,
  fallbackSummaryText,
  weekPaceContext,
  type WeekLogRow,
  type WeekReport,
} from "../../../../supabase/functions/_shared/program/weekAdherence.ts";
import {
  ADHERENCE_DAYS_WORDING_BELOW,
  ADHERENCE_GATE_PCT,
  buildCheckinPrompt,
  chooseSummary,
  countSessionsOverThreshold,
  EMPTY_WEEK_TEXT,
  emptyWeekText,
  isEmptyWeek,
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
  todayIso: "2026-08-30",
  weekStartIso: "2026-08-24",
  weekEndIso: "2026-08-30",
  avgCalories: null,
  paceContext: "La settimana di allenamento è conclusa. Fornisci un riepilogo completo.",
};

/** Il prompt della 24→30 come la edge lo manda: il vaglio legge i numeri da QUI. */
const promptVero = buildCheckinPrompt(weekReading(reportVero, 2), reportVero, CTX);

// ---- fixture: la settimana VUOTA del 31/08→06/09 (misura di Cowork, 02/09 h 15:03) ----
// Il documento del 22/08 prescrive i giorni 22–25/08: nessuno nella finestra;
// zero log. «Analizza» ha scritto «A oggi mercoledì 3 settembre» — era il 2.

const reportVuoto: WeekReport = buildWeekReport({
  document: DOC_V2,
  fromIso: "2026-08-31",
  toIso: "2026-09-06",
  todayIso: "2026-09-02",
  logs: [],
});

const CTX_VUOTA = {
  athleteName: "Atleta Prova",
  dayName: "mercoledì",
  timeStr: "15:03",
  todayIso: "2026-09-02",
  weekStartIso: "2026-08-31",
  weekEndIso: "2026-09-06",
  avgCalories: null,
  paceContext: weekPaceContext({ prescribedCount: 0, remainingCount: 0, weekClosed: false }),
};

const promptVuoto = buildCheckinPrompt(weekReading(reportVuoto, 0), reportVuoto, CTX_VUOTA);

/** La frase viva del 02/09 (edge v35, 15:03): il «3» non sta in nessun dato. */
const FRASE_VIVA_0209 =
  "Settimana 31 agosto 2026–6 settembre 2026: nessuna seduta programmata e sedute concluse: 0. A oggi mercoledì 3 settembre, non risultano allenamenti registrati. Mantieni continuità e riparti con regolarità.";

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
  const promptBelow = promptVero.text;

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
    expect(buildCheckinPrompt(readingOk, okReport, CTX).text).not.toContain(PROMPT_RULES.belowGate);
  });

  it("il prompt non decide il carico al posto del coach e porta il contesto del chiamante", () => {
    expect(promptBelow).toContain(CTX.paceContext);
    expect(promptBelow).toContain("Atleta Prova");
    expect(promptBelow).toContain("Sedute oltre la soglia d'attenzione: 2");
    expect(promptBelow).not.toMatch(/valuta(re)? (uno )?scarico/i);
  });
});

// =============================================================================
// Coda del 02/09 — il prompt DÀ la data di oggi, in lettere, dalla tabella dei mesi
// =============================================================================
describe("buildCheckinPrompt — la data di oggi la dà il prompt, il modello non la calcola", () => {
  it("(e) con todayIso 2026-09-02 il contesto temporale dice «mercoledì 2 settembre 2026»", () => {
    expect(promptVuoto.text).toContain("mercoledì 2 settembre 2026");
    expect(promptVuoto.text).toContain(
      "Contesto temporale: Oggi è mercoledì 2 settembre 2026, ore 15:03 (fuso orario: Europe/Rome). Settimana dal 2026-08-31 al 2026-09-06.",
    );
  });

  it("i dodici mesi vengono dalla tabella: gennaio e dicembre agli estremi, giorno senza zero", () => {
    const gennaio = buildCheckinPrompt(weekReading(reportVuoto, 0), reportVuoto, {
      ...CTX_VUOTA,
      dayName: "lunedì",
      todayIso: "2026-01-05",
    });
    expect(gennaio.text).toContain("Oggi è lunedì 5 gennaio 2026");
    const dicembre = buildCheckinPrompt(weekReading(reportVuoto, 0), reportVuoto, {
      ...CTX_VUOTA,
      dayName: "giovedì",
      todayIso: "2026-12-31",
    });
    expect(dicembre.text).toContain("Oggi è giovedì 31 dicembre 2026");
  });

  it("una todayIso che non è una data di calendario resta com'è: nessuna data inventata", () => {
    const rotta = buildCheckinPrompt(weekReading(reportVuoto, 0), reportVuoto, {
      ...CTX_VUOTA,
      todayIso: "2026-02-30",
    });
    expect(rotta.text).toContain("Oggi è mercoledì 2026-02-30, ore 15:03");
    expect(rotta.text).not.toContain("undefined");
  });
});

// =============================================================================
// Acceptance 2 (coda) — una sorgente sola: il blocco-dati del vaglio è nel prompt verbatim
// =============================================================================
describe("CheckinPrompt — il blocco-dati che il vaglio legge compare verbatim nel testo inviato", () => {
  it("il blocco-dati compare verbatim nel prompt costruito con gli stessi argomenti", () => {
    for (const p of [promptVero, promptVuoto]) {
      expect(p.dataBlock.length).toBeGreaterThan(0);
      expect(p.text).toContain(p.dataBlock);
    }
  });

  it("il blocco porta contesto temporale, lettura, dati settimana, calorie e passo", () => {
    expect(promptVero.dataBlock).toContain("Contesto temporale: Oggi è domenica 30 agosto 2026");
    expect(promptVero.dataBlock).toContain("- Aderenza: 1 giorno prescritto su 2 non onorato");
    expect(promptVero.dataBlock).toContain("- Compliance attuale: 50% (1/2)");
    expect(promptVero.dataBlock).toContain("- Calorie medie giornaliere: Non registrate");
    expect(promptVero.dataBlock).toContain(CTX.paceContext);
  });

  it("il blocco NON porta la nota, le regole né l'istruzione finale: 24 e 280 restano fuori", () => {
    for (const p of [promptVero, promptVuoto]) {
      expect(p.dataBlock).not.toContain("NOTA IMPORTANTE");
      expect(p.dataBlock).not.toContain("24 ore");
      expect(p.dataBlock).not.toContain("Regole:");
      expect(p.dataBlock).not.toContain("24 agosto");
      expect(p.dataBlock).not.toContain("280 caratteri");
      // …e il testo completo li porta tutti, dopo il blocco.
      expect(p.text).toContain("24 ore");
      expect(p.text).toContain("24 agosto");
      expect(p.text).toContain("280 caratteri");
    }
    // Sulla settimana vuota 24 e 280 non sono dati: il vaglio li boccia nominandoli.
    const v24 = vetSummary("Ripartenza fissata per il 24 agosto.", reportVuoto, promptVuoto);
    expect(v24.ok).toBe(false);
    if (v24.ok !== false) return;
    expect(v24.reasons).toEqual(["numero «24» assente dal prompt"]);
    const v280 = vetSummary("Report di 280 caratteri.", reportVuoto, promptVuoto);
    expect(v280.ok).toBe(false);
    if (v280.ok !== false) return;
    expect(v280.reasons).toEqual(["numero «280» assente dal prompt"]);
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
      promptVero,
    );
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("4 sedute su 5");
    expect(v.reasons.join(" ")).toContain("5");
    // (c) della coda: il controllo dei numeri lo nomina a sua volta, da solo.
    expect(v.reasons).toContain("numero «5» assente dal prompt");
    expect(v.reasons.filter((r) => r.startsWith("numero"))).toHaveLength(1);
  });

  it("boccia «valuta uno scarico» nominando la parola", () => {
    const v = vetSummary(
      "Settimana faticosa: valuta uno scarico la prossima.",
      reportVero,
      promptVero,
    );
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("scarico");
  });

  it("accetta «1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA, RPE medio 8.5»", () => {
    expect(
      vetSummary(
        "1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA, RPE medio 8.5",
        reportVero,
        promptVero,
      ),
    ).toEqual({ ok: true });
  });

  it("accetta «Aderenza 1/2 (50%). RPE medio 8.5/10» — e anche la virgola italiana 8,5/10", () => {
    expect(vetSummary("Aderenza 1/2 (50%). RPE medio 8.5/10", reportVero, promptVero)).toEqual({
      ok: true,
    });
    expect(vetSummary("RPE medio 8,5/10, aderenza 50%.", reportVero, promptVero)).toEqual({
      ok: true,
    });
  });

  it("(d) «RPE medio 8.5/10» passa: 8.5 è nel prompt e 10 è la scala", () => {
    expect(vetSummary("RPE medio 8.5/10", reportVero, promptVero)).toEqual({ ok: true });
  });

  it("boccia un «9/10» assente dai dati", () => {
    const v = vetSummary("Sforzo percepito 9/10.", reportVero, promptVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("9/10");
  });

  it("accetta la lettura stessa («1 giorno prescritto su 2 non onorato»)", () => {
    const testo = weekReading(reportVero, 2).adherence.text;
    expect(vetSummary(`${testo}. Carico 9,02 UA.`, reportVero, promptVero)).toEqual({ ok: true });
  });

  it("è conservativo per disegno: una data con la barra (24/08) lo fa scattare", () => {
    const v = vetSummary("Sedute concluse il 24/08.", reportVero, promptVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons.join(" ")).toContain("24/08");
  });

  it("boccia «deload», «alleggerire» e «aumentare», in qualunque maiuscola", () => {
    for (const frase of [
      "Consiglio un DELOAD.",
      "Meglio Alleggerire il volume.",
      "Puoi aumentare il carico la prossima settimana.",
    ]) {
      const v = vetSummary(frase, reportVero, promptVero);
      expect(v.ok, frase).toBe(false);
    }
    // Le quattro parole della regola (3) del prompt sono tutte fermate dal vaglio.
    for (const parola of ["scarico", "deload", "alleggerire", "aumentare"]) {
      expect(PROMPT_RULES.noLoadActions).toContain(parola);
      expect(vetSummary(`Ti suggerisco di ${parola}.`, reportVero, promptVero).ok, parola).toBe(
        false,
      );
    }
  });

  it("boccia una percentuale non presente nei dati", () => {
    const v = vetSummary("Aderenza al 75%.", reportVero, promptVero);
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
    const promptAssenza = buildCheckinPrompt(weekReading(assenza, 0), assenza, CTX);
    expect(vetSummary("Seduta 1 su 1 fatta.", assenza, promptAssenza).ok).toBe(false);
    expect(vetSummary("RPE medio 7.0/10, 2 UA.", assenza, promptAssenza)).toEqual({ ok: true });
  });

  it("una frase senza numeri né parole vietate passa", () => {
    expect(
      vetSummary(
        "Settimana con una sola giornata onorata; buon controllo.",
        reportVero,
        promptVero,
      ),
    ).toEqual({ ok: true });
  });
});

// =============================================================================
// Coda del 02/09 — nessun numero che il prompt non abbia dato
// =============================================================================
describe("vetSummary — ogni numero del candidato deve essere fra quelli che il prompt ha dato", () => {
  it("(a) boccia la frase viva del 02/09 nominando il «3»: oggi era il 2", () => {
    const v = vetSummary(FRASE_VIVA_0209, reportVuoto, promptVuoto);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons).toEqual(["numero «3» assente dal prompt"]);
  });

  it("(b) la stessa frase con «2 settembre» passa: 31, 2026, 6, 0 e 2 stanno nel prompt", () => {
    const onesta = FRASE_VIVA_0209.replace("3 settembre", "2 settembre");
    expect(onesta).not.toBe(FRASE_VIVA_0209);
    expect(vetSummary(onesta, reportVuoto, promptVuoto)).toEqual({ ok: true });
  });

  it("l'ora è un token solo: i minuti di «15:03» non regalano il 3", () => {
    // Lo stesso prompt del caso (a) porta «ore 15:03»; scritta intera, l'ora passa.
    expect(vetSummary("Analisi delle ore 15:03.", reportVuoto, promptVuoto)).toEqual({ ok: true });
    // Spezzata, no: né il 15 né il 3 sono dati.
    const v = vetSummary("Alle 15 e al minuto 3.", reportVuoto, promptVuoto);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons).toEqual(["numero «15» assente dal prompt", "numero «3» assente dal prompt"]);
  });

  it("«06» e «6», «8,5» e «8.5» e «8.50» sono lo stesso numero", () => {
    expect(vetSummary("Fino al 6 settembre.", reportVuoto, promptVuoto)).toEqual({ ok: true });
    expect(vetSummary("RPE medio 8,50.", reportVero, promptVero)).toEqual({ ok: true });
  });

  it("«1.000» è mille, non 1: tre cifre dopo il separatore restano letterali (passata 02/09)", () => {
    // Sulla 24→30 il 1 c'è («1 giorno prescritto»): senza la guardia «1.000 kcal» passerebbe.
    const v = vetSummary("Circa 1.000 kcal al giorno.", reportVero, promptVero);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons).toEqual(["numero «1.000» assente dal prompt"]);
    expect(vetSummary("Circa 2.000 kcal.", reportVuoto, promptVuoto).ok).toBe(false);
    expect(vetSummary("Circa 1,000 kcal.", reportVero, promptVero).ok).toBe(false);
    // Il dato vero passa com'è scritto nel prompt; riscritto con le migliaia è bocciato
    // (conservativo per disegno: la cautela può solo salire).
    const conCalorie = buildCheckinPrompt(weekReading(reportVero, 2), reportVero, {
      ...CTX,
      avgCalories: 2500,
    });
    expect(conCalorie.dataBlock).toContain("Calorie medie giornaliere: 2500 kcal");
    expect(vetSummary("Circa 2500 kcal al giorno.", reportVero, conCalorie)).toEqual({ ok: true });
    expect(vetSummary("Circa 2.500 kcal al giorno.", reportVero, conCalorie).ok).toBe(false);
  });

  it("un numero estraneo è nominato una volta sola, anche se ricorre", () => {
    const v = vetSummary("Il 3 settembre e ancora il 3.", reportVuoto, promptVuoto);
    expect(v.ok).toBe(false);
    if (v.ok !== false) return;
    expect(v.reasons).toEqual(["numero «3» assente dal prompt"]);
  });

  it("il conteggio del passo («Ci sono ancora 2 allenamenti») è un dato del prompt", () => {
    const aperta = buildWeekReport({
      document: DOC_V2,
      fromIso: "2026-08-24",
      toIso: "2026-08-30",
      todayIso: "2026-08-24",
      logs: [],
    });
    const ctx = {
      ...CTX,
      dayName: "lunedì",
      todayIso: "2026-08-24",
      paceContext: weekPaceContext({
        prescribedCount: aperta.adherence.prescribedCount,
        remainingCount: aperta.remainingCount,
        weekClosed: false,
      }),
    };
    const p = buildCheckinPrompt(weekReading(aperta, 0), aperta, ctx);
    expect(p.dataBlock).toContain("Ci sono ancora 2 allenamenti in programma");
    expect(vetSummary("Restano 2 allenamenti in programma.", aperta, p)).toEqual({ ok: true });
  });

  it("chooseSummary manda la frase viva del 02/09 sulla riga deterministica, con la ragione", () => {
    const r = chooseSummary(FRASE_VIVA_0209, reportVuoto, promptVuoto);
    expect(r.text).toBe(fallbackSummaryText(reportVuoto));
    expect(r.reason).toBe("numero «3» assente dal prompt");
  });
});

// =============================================================================
// Determinismo del modulo puro
// =============================================================================
describe("determinismo del modulo puro", () => {
  it("due esecuzioni con lo stesso input danno lo stesso output", () => {
    const uno = buildCheckinPrompt(weekReading(reportVero, 2), reportVero, CTX);
    const due = buildCheckinPrompt(weekReading(reportVero, 2), reportVero, CTX);
    expect(due).toEqual(uno);
    expect(due.text).toBe(uno.text);
    expect(weekReading(reportVero, 2)).toEqual(weekReading(reportVero, 2));
  });

  it("il sorgente del modulo non contiene orologi, rete, casualità né Intl, né la soglia del watchdog", () => {
    const src = readFileSync(
      new URL("../../../../supabase/functions/_shared/program/checkinReading.ts", import.meta.url),
      "utf8",
    );
    // Pattern spezzati per non comparire come sottostringhe letterali qui.
    const vietati = [
      "Date.n" + "ow",
      "new Da" + "te(",
      "Math.ran" + "dom",
      "fet" + "ch(",
      "Intl" + ".",
    ];
    for (const pattern of vietati) {
      expect(src.includes(pattern), `trovato ${pattern} nel modulo puro`).toBe(false);
    }
    // La soglia è del watchdog (srpe >= 9): qui si contano i suoi avvisi.
    expect(src).not.toMatch(/srpe\s*>=?\s*9/);
  });
});

// =============================================================================
// chooseSummary — ciò che arriva in ai_summary: il testo vagliato o la riga
// deterministica; il vuoto è un'assenza e prende la strada della bocciatura
// =============================================================================
describe("chooseSummary — mai un vuoto in ai_summary", () => {
  const riga = fallbackSummaryText(reportVero);

  it("vuoto → la riga deterministica, con la ragione «riepilogo IA vuoto»", () => {
    expect(riga.length).toBeGreaterThan(0);
    expect(chooseSummary("", reportVero, promptVero)).toEqual({
      text: riga,
      reason: "riepilogo IA vuoto",
    });
  });

  it("solo spazi → la riga deterministica", () => {
    expect(chooseSummary("  \n\t ", reportVero, promptVero)).toEqual({
      text: riga,
      reason: "riepilogo IA vuoto",
    });
  });

  it("testo che passa il vaglio → il testo, senza ragione", () => {
    const onesto = "1 giorno su 2 non onorato, 4 sedute concluse, 9.02 UA, RPE medio 8.5";
    expect(chooseSummary(`  ${onesto}  `, reportVero, promptVero)).toEqual({
      text: onesto,
      reason: null,
    });
  });

  it("testo bocciato → la riga deterministica, con la ragione del vaglio", () => {
    const r = chooseSummary(
      "Settimana conclusa: 4 sedute su 5, valuta uno scarico.",
      reportVero,
      promptVero,
    );
    expect(r.text).toBe(riga);
    expect(r.reason).toContain("4 sedute su 5");
    expect(r.reason).toContain("scarico");
  });
});

// =============================================================================
// Coda del 02/09, seconda — la settimana vuota non chiama il modello: zero
// giorni prescritti E zero sedute concluse, letti dal report; una frase sola
// =============================================================================
describe("isEmptyWeek — vuota se e solo se zero prescritti E zero sedute concluse", () => {
  it("(a) la 31/08→06/09 col documento del 22/08 (giorni solo ad agosto) e zero log → true", () => {
    expect(reportVuoto.adherence.prescribedCount).toBe(0);
    expect(reportVuoto.snapshot.sessions_completed).toBe(0);
    expect(isEmptyWeek(reportVuoto)).toBe(true);
  });

  it("(b) lo stesso documento sulla 24→30/08 senza log: 2 prescritti, 0 concluse → false", () => {
    const prescrittaNonEseguita = buildWeekReport({ document: DOC_V2, ...FINESTRA, logs: [] });
    expect(prescrittaNonEseguita.adherence.prescribedCount).toBe(2);
    expect(prescrittaNonEseguita.snapshot.sessions_completed).toBe(0);
    expect(isEmptyWeek(prescrittaNonEseguita), "prescritta ma non eseguita: i dati ci sono").toBe(
      false,
    );
  });

  it("(c) sulla 31/08→06/09 una seduta conclusa il 02/09 fuori programma → false", () => {
    const fuoriProgramma = buildWeekReport({
      document: DOC_V2,
      fromIso: "2026-08-31",
      toIso: "2026-09-06",
      todayIso: "2026-09-02",
      logs: [riga({ status: "completed", completedDate: "2026-09-02", totalLoadAu: 2, srpe: 7 })],
    });
    expect(fuoriProgramma.adherence.prescribedCount).toBe(0);
    expect(fuoriProgramma.snapshot.sessions_completed).toBe(1);
    expect(fuoriProgramma.adherence.offPlanCount).toBe(1);
    expect(isEmptyWeek(fuoriProgramma), "fuori programma: la seduta è un dato").toBe(false);
  });

  // I due vicini che un «se e solo se» letto male confonderebbe (passata 02/09):
  // una settimana non ancora iniziata e una seduta senza numeri.
  it("(b') la 24→30/08 vista dal lunedì 24: 2 prescritti tutti avanti, 0 saltati, 0 concluse → false", () => {
    const nonIniziata = buildWeekReport({
      document: DOC_V2,
      ...FINESTRA,
      todayIso: "2026-08-24",
      logs: [],
    });
    expect(nonIniziata.adherence.prescribedCount).toBe(2);
    expect(nonIniziata.missedCount).toBe(0);
    expect(nonIniziata.remainingCount).toBe(2);
    expect(isEmptyWeek(nonIniziata), "prescritta e non ancora iniziata: c'è un programma").toBe(
      false,
    );
  });

  it("(c') una seduta conclusa SENZA carico né sRPE è ancora una seduta → false", () => {
    const senzaNumeri = buildWeekReport({
      document: DOC_V2,
      fromIso: "2026-08-31",
      toIso: "2026-09-06",
      todayIso: "2026-09-02",
      logs: [riga({ status: "completed", completedDate: "2026-09-02" })],
    });
    expect(senzaNumeri.snapshot.sessions_completed).toBe(1);
    expect(senzaNumeri.totalVolume).toBeNull();
    expect(senzaNumeri.avgRpe).toBe("N/A");
    expect(isEmptyWeek(senzaNumeri), "la seduta è un dato anche senza numero").toBe(false);
  });

  it("(d) emptyWeekText() è la costante esportata: una frase sola, né cifre né «N/A»", () => {
    const testo = emptyWeekText();
    expect(testo).toBe(EMPTY_WEEK_TEXT);
    expect(testo).toBe("Nessun giorno prescritto e nessuna seduta conclusa questa settimana.");
    expect(testo).not.toMatch(/\d/);
    expect(testo).not.toContain("N/A");
    // La riga della bocciatura sulla stessa settimana porta due «N/A»: è la
    // strada delle settimane CON dati (weekAdherence.ts), e resta com'è.
    expect(fallbackSummaryText(reportVuoto)).toContain("N/A");
    expect(fallbackSummaryText(reportVuoto)).not.toBe(testo);
  });

  /** L'indice della graffa che chiude l'INTERO if/else aperto a `from`,
   *  contando le graffe: la `}` di «} else {» non chiude, riapre. */
  function fineIfElse(src: string, from: number): number {
    let depth = 0;
    for (let i = src.indexOf("{", from); i < src.length; i++) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") {
        depth--;
        if (depth === 0 && !src.startsWith("} else {", i)) return i;
      }
    }
    return -1;
  }

  it("la edge chiama il modello solo nel ramo non-vuoto: la guardia, poi «else», poi il fetch, poi la chiusura", () => {
    // La edge non ha test: questo lega il suo sorgente alla guardia del modulo.
    // I commenti a riga intera sono tolti prima di leggere: una guardia che
    // sopravvive solo in un commento non è una guardia.
    const edge = readFileSync(
      new URL("../../../../supabase/functions/generate-batch-checkins/index.ts", import.meta.url),
      "utf8",
    ).replace(/^\s*\/\/.*$/gm, "");
    const guardia = edge.indexOf("if (isEmptyWeek(report))");
    expect(guardia, "la edge non chiede isEmptyWeek(report)").toBeGreaterThan(-1);
    const chiamata = edge.indexOf("https://api.openai.com/v1/chat/completions");
    expect(chiamata).toBeGreaterThan(-1);
    const ramoNonVuoto = edge.indexOf("} else {", guardia);
    expect(ramoNonVuoto).toBeGreaterThan(guardia);
    // «Dopo l'else» non basta: un fetch spostato DOPO la chiusura dell'if/else
    // (chiamata incondizionata, settimana vuota compresa) avrebbe ancora un
    // indice maggiore di «} else {» — passata indipendente del 02/09. Il
    // fetch deve stare fra l'«else» e la graffa che chiude l'intero if/else.
    const chiusura = fineIfElse(edge, guardia);
    expect(chiusura).toBeGreaterThan(ramoNonVuoto);
    expect(chiamata, "il fetch a OpenAI deve stare DENTRO il ramo non-vuoto").toBeGreaterThan(
      ramoNonVuoto,
    );
    expect(chiamata, "il fetch a OpenAI deve stare DENTRO il ramo non-vuoto").toBeLessThan(
      chiusura,
    );
    // Il ramo vuoto: la frase e il log, nessuna attesa e nessuna chiave.
    const ramoVuoto = edge.slice(guardia, ramoNonVuoto);
    expect(ramoVuoto).toContain("aiSummary = emptyWeekText()");
    expect(ramoVuoto).toContain("nessuna chiamata al modello");
    expect(ramoVuoto).not.toContain("await");
    expect(ramoVuoto).not.toContain("openaiKey");
    // La chiave, dalla guardia in poi, si usa SOLO dentro il ramo non-vuoto:
    // vale anche per una chiamata che non si chiamasse «fetch».
    for (
      let i = edge.indexOf("openaiKey", guardia);
      i !== -1;
      i = edge.indexOf("openaiKey", i + 1)
    ) {
      expect(i, "openaiKey usata fuori dal ramo non-vuoto").toBeGreaterThan(ramoNonVuoto);
      expect(i, "openaiKey usata fuori dal ramo non-vuoto").toBeLessThan(chiusura);
    }
    // Una chiamata sola al modello in tutto il file: quella dentro il ramo.
    expect(edge.split("fetch(").length - 1).toBe(1);
  });
});
