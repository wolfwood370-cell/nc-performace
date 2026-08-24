// Prova del MECCANISMO del modulo-proprietario: la formula è sRPE × durata
// e BASTA (niente 0, niente 5, niente rpe_global al posto dell'sRPE), la
// finestra minima è una data (ACWR_BASELINE_DAYS) e non un conteggio di
// sedute, l'assenza porta il motivo e i numeri veri. "Oggi" è un argomento:
// nessun orologio, stessi input → stesso esito su qualunque macchina.
// I valori attesi sono calcolati A MANO nei commenti.

import { describe, expect, it } from "vitest";
import {
  ACWR_BAND_LABELS,
  ACWR_CAVEAT,
  acwrAbsenceText,
  acwrLookbackStartIso,
  computeAcwr,
  type AcwrSessionInput,
} from "@/lib/math/acwr";
import { ACWR_BASELINE_DAYS } from "@/lib/math/constants";

const TODAY = "2026-08-24";

/** ISO date `n` calendar days before TODAY — pure UTC arithmetic. */
function daysAgo(n: number): string {
  return new Date(Date.UTC(2026, 7, 24) - n * 86_400_000).toISOString().slice(0, 10);
}

function seduta(
  age: number,
  srpe: number | null,
  durationSeconds: number | null,
): AcwrSessionInput {
  return { completedAt: daysAgo(age), srpe, durationSeconds };
}

describe("computeAcwr — formula e fasce", () => {
  it("caso a mano: acuto 51.43 / cronico 37.5 → 1.37, fascia 'sopra'", () => {
    // Copertura: seduta a 30 giorni (fuori dalla finestra dei 28, conta
    // solo come storia). Nella finestra: 6×60' = 360 (2gg fa, acuta),
    // 7×30' = 210 (10gg), 8×60' = 480 (20gg).
    // Acuto = 360/7 = 51.43 · Cronico = (360+210+480)/28 = 37.5
    // Ratio = 51.43/37.5 = 1.3714 → 1.37 → sopra (>1.3).
    const r = computeAcwr(
      [seduta(30, 5, 3600), seduta(2, 6, 3600), seduta(10, 7, 1800), seduta(20, 8, 3600)],
      TODAY,
    );
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.ratio).toBe(1.37);
    expect(r.band).toBe("sopra");
    expect(r.acuteLoad).toBe(51);
    expect(r.chronicLoad).toBe(38);
    expect(r.daysCovered).toBe(30);
    expect(r.daysRequired).toBe(ACWR_BASELINE_DAYS);
    expect(r.excludedCount).toBe(0);
  });

  it("muovere l'sRPE di una seduta recente muove il ratio nella direzione attesa", () => {
    const base = [seduta(30, 1, 60), seduta(3, 5, 3600), seduta(15, 5, 3600)];
    const r1 = computeAcwr(base, TODAY);
    const r2 = computeAcwr([seduta(30, 1, 60), seduta(3, 9, 3600), seduta(15, 5, 3600)], TODAY);
    expect(r1.available && r2.available).toBe(true);
    if (!r1.available || !r2.available) return;
    expect(r2.ratio).toBeGreaterThan(r1.ratio);
  });

  it("i confini descrittivi: 0.79 → sotto · 0.8 e 1.3 → in linea · 1.32 → sopra", () => {
    // srpe 1 × (load×60)s = load AU esatti. Cronico fisso: 2800/28 = 100.
    // La seduta-storia (30gg, 1 AU) è fuori finestra: non tocca le somme.
    const conAcuto = (acuteAu: number) =>
      computeAcwr(
        [seduta(30, 1, 60), seduta(10, 1, (2800 - acuteAu) * 60), seduta(3, 1, acuteAu * 60)],
        TODAY,
      );
    const sotto = conAcuto(553); // 553/7=79 → 0.79
    const bordoBasso = conAcuto(560); // 560/7=80 → 0.80
    const bordoAlto = conAcuto(910); // 910/7=130 → 1.30
    const sopra = conAcuto(924); // 924/7=132 → 1.32
    expect(sotto.available && sotto.band === "sotto").toBe(true);
    expect(bordoBasso.available && bordoBasso.band === "in_linea").toBe(true);
    expect(bordoAlto.available && bordoAlto.band === "in_linea").toBe(true);
    expect(sopra.available && sopra.band === "sopra").toBe(true);
  });
});

describe("computeAcwr — il dato mancante non entra, mai", () => {
  it("una seduta senza sRPE è esclusa e contata, non vale 0 né un default", () => {
    // Solo la seduta con sRPE entra: cronico = 480/28, acuto = 0 → ratio 0.
    // Se la seduta senza sRPE valesse 0 il risultato non cambierebbe (per
    // questo il conteggio è parte del contratto); se valesse 5 (default
    // inventato) il cronico crescerebbe. Qui si prova il CONTEGGIO.
    const r = computeAcwr([seduta(30, 8, 3600), seduta(2, null, 3600)], TODAY);
    expect(r.excluded.senzaSrpe).toBe(1);
    expect(r.excludedCount).toBe(1);
  });

  it("senza durata o senza data: esclusa col suo motivo (il primo mancante vince)", () => {
    const r = computeAcwr(
      [
        seduta(30, 5, 3600),
        seduta(4, 7, null), // senza durata
        { completedAt: null, srpe: 6, durationSeconds: 1800 }, // senza data
        { completedAt: null, srpe: null, durationSeconds: null }, // senza data E senza sRPE → conta 1 sola volta
      ],
      TODAY,
    );
    expect(r.excluded).toEqual({ senzaData: 2, senzaSrpe: 0, senzaDurata: 1 });
    expect(r.excludedCount).toBe(3);
  });

  it("nessuna seduta utilizzabile → assenza col conteggio, mai un numero", () => {
    const r = computeAcwr(
      [seduta(20, null, 3600), seduta(10, null, 1800), seduta(2, null, 3600)],
      TODAY,
    );
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(r.reason).toBe("nessuna_seduta_utilizzabile");
      expect(r.daysCovered).toBe(0);
      expect(acwrAbsenceText(r)).toBe(
        "Nessuna seduta con RPE di sessione registrato (3 sedute escluse: 3 senza RPE di sessione)",
      );
    }
  });
});

describe("computeAcwr — la finestra minima è una data, e uccide il numero", () => {
  it("prima seduta utilizzabile a 15 giorni → assenza 'storia troppo corta' 15/28", () => {
    const r = computeAcwr([seduta(15, 6, 3600), seduta(3, 7, 3600)], TODAY);
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(r.reason).toBe("storia_troppo_corta");
      expect(r.daysCovered).toBe(15);
      expect(r.daysRequired).toBe(28);
      expect(acwrAbsenceText(r)).toBe("Storico troppo corto: 15 giorni coperti su 28 richiesti");
    }
  });

  it("controllo positivo: stessa storia ma prima seduta a 30 giorni → il ratio esiste", () => {
    const r = computeAcwr([seduta(30, 6, 3600), seduta(15, 6, 3600), seduta(3, 7, 3600)], TODAY);
    expect(r.available).toBe(true);
  });

  it("una seduta senza sRPE NON apre la finestra: la storia si misura sulle utilizzabili", () => {
    // La seduta vecchia c'è ma è inutilizzabile → copertura = 15 giorni.
    const r = computeAcwr([seduta(40, null, 3600), seduta(15, 6, 3600)], TODAY);
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(r.reason).toBe("storia_troppo_corta");
      expect(r.daysCovered).toBe(15);
    }
  });

  it("finestra coperta ma zero carico dentro: assenza 'carico abituale zero', non una divisione", () => {
    const r = computeAcwr([seduta(35, 6, 3600), seduta(30, 5, 1800)], TODAY);
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(r.reason).toBe("carico_abituale_zero");
      expect(acwrAbsenceText(r)).toBe("Nessun carico registrato negli ultimi 28 giorni");
    }
  });

  it("l'assenza con esclusioni porta ANCHE il conteggio nel testo", () => {
    const r = computeAcwr([seduta(15, 6, 3600), seduta(2, null, 3600)], TODAY);
    expect(r.available).toBe(false);
    if (r.available === false) {
      expect(acwrAbsenceText(r)).toBe(
        "Storico troppo corto: 15 giorni coperti su 28 richiesti (1 seduta esclusa: 1 senza RPE di sessione)",
      );
    }
  });
});

describe("computeAcwr — determinismo", () => {
  it("il giorno viene dal prefisso della data, non dall'orologio della macchina", () => {
    // Stessa data di calendario con orari e offset diversi → stesso esito.
    const a = computeAcwr(
      [
        { completedAt: `${daysAgo(30)}T23:59:00+02:00`, srpe: 5, durationSeconds: 3600 },
        { completedAt: `${daysAgo(3)}T00:01:00`, srpe: 6, durationSeconds: 3600 },
      ],
      TODAY,
    );
    const b = computeAcwr(
      [
        { completedAt: `${daysAgo(30)}T04:00:00`, srpe: 5, durationSeconds: 3600 },
        { completedAt: `${daysAgo(3)}T18:30:00-05:00`, srpe: 6, durationSeconds: 3600 },
      ],
      TODAY,
    );
    expect(a).toEqual(b);
  });

  it("una data 'oggi' non valida è un errore del chiamante, non un esito", () => {
    expect(() => computeAcwr([], "24/08/2026")).toThrow(TypeError);
  });

  it("acwrLookbackStartIso: confine di GIORNO, 42 giorni indietro (a mano: 24/08 − 42gg = 13/07)", () => {
    expect(acwrLookbackStartIso("2026-08-24")).toBe("2026-07-13");
    expect(() => acwrLookbackStartIso("24/08/2026")).toThrow(TypeError);
  });
});

describe("le parole sono descrizioni, non verdetti", () => {
  it("le tre fasce descrivono il confronto col carico abituale", () => {
    expect(ACWR_BAND_LABELS.sopra).toBe("Carico recente sopra l'abituale");
    expect(ACWR_BAND_LABELS.in_linea).toBe("Carico recente in linea con l'abituale");
    expect(ACWR_BAND_LABELS.sotto).toBe("Carico recente sotto l'abituale");
  });

  it("il caveat dice cos'è: una lente, non una previsione", () => {
    expect(ACWR_CAVEAT).toBe("Lente di consapevolezza, non una previsione di infortunio.");
  });
});
