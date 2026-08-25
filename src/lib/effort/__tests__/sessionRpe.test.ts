// La scala di sessione è quella di Foster (CR-10 modificata) e i vuoti a
// 6, 8 e 9 sono il progetto della scala: questo test inchioda le ancore
// ratificate, prova che i vuoti NON portano parola, e che nessuna stringa
// della scala parla di «rep» — le etichette per-serie («3 reps massimo in
// più», «nessuna rep in tank») sono un'altra grandezza (Lezione 7).

import { describe, expect, it } from "vitest";
import {
  SESSION_RPE_ABSENT,
  SESSION_RPE_ANCHORS,
  SESSION_RPE_DEFINITION,
  SESSION_RPE_QUESTION,
  SESSION_RPE_TIMING,
  SESSION_RPE_TITLE,
  SESSION_RPE_VALUES,
} from "@/lib/effort/sessionRpe";

describe("la scala è la CR-10 modificata di Foster, tradotta", () => {
  it("i valori sono 1..10 (lo 0=Rest di Foster non è rappresentabile: CHECK 1..10)", () => {
    expect([...SESSION_RPE_VALUES]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("le ancore ratificate, gradino per gradino", () => {
    expect(SESSION_RPE_ANCHORS[1]).toBe("Molto, molto facile");
    expect(SESSION_RPE_ANCHORS[2]).toBe("Facile");
    expect(SESSION_RPE_ANCHORS[3]).toBe("Moderato");
    expect(SESSION_RPE_ANCHORS[4]).toBe("Abbastanza impegnativo");
    expect(SESSION_RPE_ANCHORS[5]).toBe("Impegnativo");
    expect(SESSION_RPE_ANCHORS[7]).toBe("Molto impegnativo");
    expect(SESSION_RPE_ANCHORS[10]).toBe("Massimale");
  });

  it("i vuoti a 6, 8 e 9 NON portano parola: sono il progetto della scala", () => {
    expect(SESSION_RPE_ANCHORS[6], "6 deve restare vuoto").toBeNull();
    expect(SESSION_RPE_ANCHORS[8], "8 deve restare vuoto").toBeNull();
    expect(SESSION_RPE_ANCHORS[9], "9 deve restare vuoto").toBeNull();
  });

  it("nessuna stringa della scala contiene «rep»: quelle sono le ancore per-serie", () => {
    const tutte = [
      SESSION_RPE_TITLE,
      SESSION_RPE_QUESTION,
      SESSION_RPE_DEFINITION,
      SESSION_RPE_TIMING,
      SESSION_RPE_ABSENT,
      ...Object.values(SESSION_RPE_ANCHORS).filter((a): a is string => a !== null),
    ];
    for (const s of tutte) {
      expect(s, `stringa con «rep»: «${s}»`).not.toMatch(/rep/i);
    }
  });

  it("la definizione separa la sessione dalla media delle serie, e l'assenza è un trattino", () => {
    expect(SESSION_RPE_DEFINITION).toBe(
      "È una valutazione globale della seduta, non la media delle serie.",
    );
    expect(SESSION_RPE_ABSENT).toBe("—");
  });
});
