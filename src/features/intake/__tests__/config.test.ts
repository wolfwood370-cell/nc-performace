// =============================================================================
// Config invariants: the form structure is data, so its integrity is pinned
// here — enum sources resolve, labels cover every machine value, paths are
// unique, the 30 neurotype items keep count/order (positional scoring), and
// server error fields map back to a step.
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  CONSENT_LABELS,
  CONSENT_TYPES,
  ENUM_LABELS,
  ENUMS,
  PARQ_KEYS,
  PARQ_LABELS,
  ZONE_LABELS,
  CANONICAL_ZONES,
} from "../config/labels";
import { INTAKE_STEPS, stepIdForServerField } from "../config/intakeForm";
import { enumValues } from "../config/model";
import {
  NEUROTYPE_ITEMS,
  NEUROTYPE_PAGES,
  NEUROTYPE_PER_PAGE,
  NEUROTYPE_SCALE,
  NEUROTYPE_TOTAL,
} from "../config/neurotypeItems";
import { INTAKE_DRAFT_STORAGE_KEY } from "../store";

describe("intake config invariants", () => {
  it("every enum field resolves to a non-empty single-source enum", () => {
    for (const step of INTAKE_STEPS) {
      for (const field of step.fields ?? []) {
        if (field.kind === "enum") {
          expect(field.enumKey, `${field.path} senza enumKey`).toBeTruthy();
          expect(enumValues(field.enumKey!).length, `${field.path}: enum vuoto`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("ENUM_LABELS covers exactly the machine values of every enum (both directions)", () => {
    for (const key of Object.keys(ENUMS)) {
      expect(ENUM_LABELS[key], `manca ENUM_LABELS.${key}`).toBeTruthy();
    }
    for (const [key, labels] of Object.entries(ENUM_LABELS)) {
      expect(new Set(Object.keys(labels))).toEqual(new Set(enumValues(key)));
    }
  });

  it("field paths are unique across all steps", () => {
    const paths = INTAKE_STEPS.flatMap((step) => (step.fields ?? []).map((field) => field.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("PAR-Q labels cover the 7 server keys; consents labels cover the 6 types; zones the 15", () => {
    expect(new Set(Object.keys(PARQ_LABELS))).toEqual(new Set(PARQ_KEYS));
    expect(new Set(Object.keys(CONSENT_LABELS))).toEqual(new Set(CONSENT_TYPES));
    expect(new Set(Object.keys(ZONE_LABELS))).toEqual(new Set(CANONICAL_ZONES));
  });

  it("neurotype: 30 items, 5 pages of 6, scale A-E", () => {
    expect(NEUROTYPE_ITEMS).toHaveLength(NEUROTYPE_TOTAL);
    expect(NEUROTYPE_PAGES * NEUROTYPE_PER_PAGE).toBe(NEUROTYPE_TOTAL);
    expect(NEUROTYPE_SCALE.map((s) => s.letter)).toEqual(["A", "B", "C", "D", "E"]);
  });

  it("neurotype: the FULL 30-item order is pinned (positional server scoring — any swap or rewording must fail here)", () => {
    expect([...NEUROTYPE_ITEMS]).toEqual([
      "Quando sono in gruppo voglio esserne il leader.",
      "Se il servizio al ristorante è cattivo, non ho problemi a farlo notare apertamente.",
      "Se so che qualcuno ha diffuso voci su di me, sento il bisogno di affrontarlo.",
      "Sento il bisogno di essere il migliore in ogni cosa; anche un gioco banale diventa una sfida.",
      "Se vedo un'opportunità la colgo sempre, anche oltre le mie capacità; preferisco rischiare.",
      "Se non riesco al primo colpo, significa solo che devo lavorare più duramente: ce la farò.",
      "Sono sempre stato agile e veloce, fin da piccolo.",
      "Nel traffico preferisco una deviazione piuttosto che stare in coda, anche se ci metto di più.",
      "In attesa di un appuntamento devo tenermi impegnato: non riesco a stare fermo a far nulla.",
      "Riesco a leggere con musica in sottofondo e trattenere le informazioni.",
      "Quando parlo, spesso cambio argomento a metà conversazione.",
      "Ho bisogno di nuove esperienze o attività spesso, altrimenti mi annoio.",
      'In una conversazione dico spesso "anch\'io", "la penso uguale", "so cosa intendi".',
      "Odio prendere decisioni: preferisco che altri scelgano film o ristorante.",
      'In situazioni adrenaliniche divento la versione "alfa" di me: più sicuro e carismatico.',
      "Rimando le cose fino all'ultimo (procrastino) ed è così che lavoro meglio.",
      "Senza fretta o pressione sono pigro, ma quando le cose si muovono divento molto produttivo.",
      "Sto attento a non ferire i sentimenti degli altri, anche quando la parte offesa sono io.",
      "Sono una persona emotiva: le mie reazioni sono facili e intense (positive o negative).",
      "Preferisco attività che conosco e mi piacciono piuttosto che provare cose nuove.",
      "Ho un cibo preferito che potrei mangiare tutto il giorno.",
      "Ho bisogno di sentirmi desiderato, amato e apprezzato per stare bene.",
      'Ho spesso conversazioni negative con me stesso ("non sono bravo", "non valgo").',
      "Do molto peso a ciò che gli altri pensano di me.",
      "Prendo decisioni basate sui fatti, non su emozioni e istinto.",
      "Non amo attività con fattori di rischio troppo alti.",
      "Mi preoccupo molto per cose che potrebbero andare male in futuro.",
      "Preferisco passare il tempo libero da solo (leggere, tv, gaming) piuttosto che uscire.",
      "Se il successo non arriva subito, mi sta bene un percorso più graduale e lento.",
      'Faccio fatica ad addormentarmi perché non riesco a "spegnere" il cervello.',
    ]);
  });

  it("the draft storage key removed by signOut (useAuth.tsx literal) matches the store", () => {
    expect(INTAKE_DRAFT_STORAGE_KEY).toBe("intake_draft_v1");
  });

  it("server error fields map back to the owning step", () => {
    expect(stepIdForServerField("intake.anagrafica.height_cm")).toBe("anagrafica");
    expect(stepIdForServerField("consents")).toBe("consensi");
    expect(stepIdForServerField("consent_version")).toBe("consensi");
    expect(stepIdForServerField("injuries")).toBe("infortuni");
    expect(stepIdForServerField("cycle.pregnancy")).toBe("ciclo");
    expect(stepIdForServerField("intake.neurotype_answers")).toBe("neurotipo-1");
    expect(stepIdForServerField("intake.equipment.items")).toBe("attrezzatura");
    expect(stepIdForServerField("intake.goals")).toBe("obiettivi");
    expect(stepIdForServerField("intake.readiness")).toBe("readiness");
    expect(stepIdForServerField("intake.parq.heart")).toBe("parq");
    expect(stepIdForServerField("intake.dca.q2")).toBe("salute");
    expect(stepIdForServerField("intake.weight_loss_unintentional")).toBe("salute");
    expect(stepIdForServerField("intake.objective")).toBe("obiettivi");
  });
});
