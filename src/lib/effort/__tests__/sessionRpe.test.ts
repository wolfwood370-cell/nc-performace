// La scala di sessione è la NOSTRA variante dichiarata della CR-10
// modificata di Foster: questo test inchioda le dieci ancore ratificate
// (comprese le TRE nostre a 6/8/9, marcate come tali — non spacciate per
// Foster), la monotonia lessicale della famiglia, e che nessuna stringa
// della scala o della scheda parli di «rep» (le etichette per-serie sono
// un'altra grandezza). I testi della scheda di familiarizzazione vivono
// QUI: il componente non ne possiede nessuno.

import { describe, expect, it } from "vitest";
import {
  SESSION_RPE_ABSENT,
  SESSION_RPE_ANCHORS,
  SESSION_RPE_CLEAR_LABEL,
  SESSION_RPE_COMPARABILITY,
  SESSION_RPE_DEFINITION,
  SESSION_RPE_EMPTY_PROMPT,
  SESSION_RPE_EXAMPLES,
  SESSION_RPE_GUIDE_TITLE,
  SESSION_RPE_OWN_ANCHORS,
  SESSION_RPE_QUESTION,
  SESSION_RPE_SLIDER_LABEL,
  SESSION_RPE_TIMING,
  SESSION_RPE_TITLE,
  SESSION_RPE_UNANSWERED,
  SESSION_RPE_VALUES,
} from "@/lib/effort/sessionRpe";

describe("la scala completa, e le tre ancore nostre marcate come tali", () => {
  it("i valori sono 1..10 (lo 0=Rest di Foster non è rappresentabile: CHECK 1..10)", () => {
    expect([...SESSION_RPE_VALUES]).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it("le dieci ancore ratificate, gradino per gradino", () => {
    expect(SESSION_RPE_ANCHORS[1]).toBe("Molto, molto facile");
    expect(SESSION_RPE_ANCHORS[2]).toBe("Facile");
    expect(SESSION_RPE_ANCHORS[3]).toBe("Moderato");
    expect(SESSION_RPE_ANCHORS[4]).toBe("Abbastanza impegnativo");
    expect(SESSION_RPE_ANCHORS[5]).toBe("Impegnativo");
    expect(SESSION_RPE_ANCHORS[6]).toBe("Decisamente impegnativo");
    expect(SESSION_RPE_ANCHORS[7]).toBe("Molto impegnativo");
    expect(SESSION_RPE_ANCHORS[8]).toBe("Estremamente impegnativo");
    expect(SESSION_RPE_ANCHORS[9]).toBe("Quasi massimale");
    expect(SESSION_RPE_ANCHORS[10]).toBe("Massimale");
  });

  it("6, 8 e 9 sono NOSTRE e sono marcate: interpolazioni, non ancore di Foster", () => {
    expect([...SESSION_RPE_OWN_ANCHORS]).toEqual([6, 8, 9]);
    // E ogni gradino marcato porta davvero una parola (il vuoto non esiste più).
    for (const n of SESSION_RPE_OWN_ANCHORS) {
      expect(SESSION_RPE_ANCHORS[n], `ancora nostra al gradino ${n}`).toBeTruthy();
    }
  });

  it("nessuna stringa della scala o della scheda contiene «rep»", () => {
    const tutte = [
      SESSION_RPE_TITLE,
      SESSION_RPE_QUESTION,
      SESSION_RPE_DEFINITION,
      SESSION_RPE_TIMING,
      SESSION_RPE_COMPARABILITY,
      SESSION_RPE_UNANSWERED,
      SESSION_RPE_EMPTY_PROMPT,
      SESSION_RPE_CLEAR_LABEL,
      SESSION_RPE_GUIDE_TITLE,
      SESSION_RPE_SLIDER_LABEL,
      SESSION_RPE_ABSENT,
      ...Object.values(SESSION_RPE_ANCHORS),
      ...SESSION_RPE_EXAMPLES,
    ];
    for (const s of tutte) {
      expect(s, `stringa con «rep»: «${s}»`).not.toMatch(/rep/i);
    }
  });

  it("la definizione separa la sessione dalla media delle serie; l'assenza resta un trattino", () => {
    expect(SESSION_RPE_DEFINITION).toBe(
      "È una valutazione globale della seduta, non la media delle serie.",
    );
    expect(SESSION_RPE_ABSENT).toBe("—");
  });

  it("la scheda ha i suoi due esempi e la riga di confrontabilità", () => {
    expect(SESSION_RPE_EXAMPLES).toHaveLength(2);
    expect(SESSION_RPE_EXAMPLES[0]).toContain("3-4");
    expect(SESSION_RPE_EXAMPLES[1]).toContain("7-8");
    expect(SESSION_RPE_COMPARABILITY).toContain("con te stesso nel tempo");
  });
});
