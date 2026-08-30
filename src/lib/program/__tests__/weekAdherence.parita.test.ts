// =============================================================================
// PARITÀ FRA LE DUE PORTE. prescribedDatesInWindow (modulo condiviso, letto
// dal check-in del coach) e sessionForDate (releaseView, letto dalle quattro
// schermate dell'atleta) rispondono alla stessa domanda: «questa data è
// prescritta?». Il test DERIVA entrambe le risposte dai sorgenti a ogni
// esecuzione — v1 e v2, ogni data di una finestra di 28 giorni — così le due
// implementazioni non possono divergere in silenzio (difetto D6). Se questo
// test muore, nomina la data del disaccordo.
// =============================================================================
import { describe, expect, it } from "vitest";
import { parseReleaseDocument, sessionForDate } from "@/lib/program/releaseView";
import { addDaysIso } from "../../../../supabase/functions/_shared/program/coachRelease.ts";
import { prescribedDatesInWindow } from "../../../../supabase/functions/_shared/program/weekAdherence.ts";

const DA = "2026-08-10";
const A = addDaysIso(DA, 27); // finestra di 28 giorni: 2026-08-10 → 2026-09-06

function setV2(n: number) {
  return {
    set_number: n,
    reps: "5",
    rpe: 8,
    rir: null,
    percent_1rm: null,
    rest_seconds: 120,
    tempo: null,
    is_warmup: false,
  };
}

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
        sets: [setV2(1)],
      },
    ],
  };
}

// v2: le quattro date vive di C-01 dentro la finestra + una fuori finestra
// (il ritaglio della finestra non deve rompere la parità sulle date interne).
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
    giornoV2("w2-s1", "2026-09-20", 0),
  ],
};

// v1: tre giorni senza data — la porta dell'atleta li mappa sul giorno
// della settimana (lun→Giorno 1). La semantica si eredita, non si riscrive.
const DOC_V1 = {
  version: 1,
  goal: "GPP",
  rationale: "",
  days: [
    { day_name: "Giorno 1", exercises: [{ name: "Squat", sets: 3, reps: "5" }] },
    { day_name: "Giorno 2", exercises: [{ name: "Panca", sets: 3, reps: "5" }] },
    { day_name: "Giorno 3", exercises: [{ name: "Stacco", sets: 3, reps: "5" }] },
  ],
};

function provaParita(doc: unknown) {
  const programma = parseReleaseDocument(doc);
  expect(
    programma,
    "fixture illeggibile per parseReleaseDocument: la parità non starebbe provando nulla",
  ).not.toBeNull();
  const prescritte = new Set(prescribedDatesInWindow(doc, DA, A));
  for (let giorno = DA; giorno <= A; giorno = addDaysIso(giorno, 1)) {
    const dalModulo = prescritte.has(giorno);
    const dallaPorta = sessionForDate(programma!, giorno) !== null;
    expect(
      dalModulo,
      `le due porte non sono d'accordo sulla data ${giorno}: prescribedDatesInWindow dice ${dalModulo}, sessionForDate dice ${dallaPorta}`,
    ).toBe(dallaPorta);
  }
}

describe("parità prescribedDatesInWindow ⇔ sessionForDate su 28 giorni", () => {
  it("documento v2 (date esplicite del coach)", () => {
    provaParita(DOC_V2);
  });

  it("documento v1 (mappatura giorno-della-settimana)", () => {
    provaParita(DOC_V1);
  });
});
