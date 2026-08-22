// Prova del MECCANISMO, non del valore: un test che chiedesse solo
// "il punteggio è 68" passerebbe anche con una costante 68. Qui due
// check-in diversi devono produrre punteggi diversi, e muovere UNA
// risposta deve muovere il numero nella direzione attesa — con una
// costante al posto della formula questi test falliscono nominando i
// due punteggi. I valori attesi dei casi reali sono calcolati A MANO
// nei commenti, mai ricalcolati dalla funzione sotto test.

import { describe, expect, it } from "vitest";
import {
  computeCheckinScore,
  sorenessScoreFromMap,
  subjectiveReadinessToScore,
} from "@/lib/math/readinessMath";

describe("computeCheckinScore — il punteggio viene dalle risposte", () => {
  it("due check-in con risposte diverse producono punteggi diversi", () => {
    const primo = computeCheckinScore({ sleep: 8, stress: 2, fatigue: 6, mood: 6, digestion: 8 });
    const secondo = computeCheckinScore({
      sleep: 6,
      stress: 8,
      fatigue: 6,
      mood: 4,
      digestion: null,
    });
    expect(primo).not.toBeNull();
    expect(secondo).not.toBeNull();
    expect(primo).not.toBe(secondo);
  });

  it("muovere una sola risposta muove il punteggio nella direzione attesa", () => {
    const base = { sleep: 6, stress: 4, fatigue: 4, mood: 6, digestion: 6 };
    const punteggioBase = computeCheckinScore(base);
    expect(punteggioBase).not.toBeNull();
    // Più stress → più basso (asse invertito).
    expect(computeCheckinScore({ ...base, stress: 9 })).toBeLessThan(punteggioBase ?? -Infinity);
    // Sonno migliore → più alto.
    expect(computeCheckinScore({ ...base, sleep: 9 })).toBeGreaterThan(punteggioBase ?? Infinity);
    // Più fatica → più basso (asse invertito).
    expect(computeCheckinScore({ ...base, fatigue: 9 })).toBeLessThan(punteggioBase ?? -Infinity);
  });

  it("caso reale 11/08: sonno 8 · stress 2 · fatica 6 · umore 6 · digestione 8 → 68", () => {
    // A mano: 30·(7/9) + 25·(4/9) + 20·(8/9) + 15·(5/9) + 10·(7/9)
    //       = 23.33 + 11.11 + 17.78 + 8.33 + 7.78 = 68.33 → 68
    expect(computeCheckinScore({ sleep: 8, stress: 2, fatigue: 6, mood: 6, digestion: 8 })).toBe(
      68,
    );
  });

  it("caso reale 01/08 (digestione assente): pesi ridistribuiti sulle quattro presenti → 41", () => {
    // A mano: (30·(5/9) + 25·(4/9) + 20·(2/9) + 15·(3/9)) / 90 · 100
    //       = (16.67 + 11.11 + 4.44 + 5.00) / 90 · 100 = 41.36 → 41
    expect(computeCheckinScore({ sleep: 6, stress: 8, fatigue: 6, mood: 4, digestion: null })).toBe(
      41,
    );
  });

  it("nessuna risposta → null, mai 0 né un valore di ripiego", () => {
    expect(computeCheckinScore({})).toBeNull();
    expect(
      computeCheckinScore({
        sleep: null,
        stress: null,
        fatigue: null,
        mood: null,
        digestion: null,
      }),
    ).toBeNull();
  });

  it("determinismo: stesso input → stesso output", () => {
    const input = { sleep: 7, stress: 3, fatigue: 5, mood: 8, digestion: 6 };
    expect(computeCheckinScore(input)).toBe(computeCheckinScore(input));
  });

  it("minimo raggiungibile col cursore attuale (solo valori pari): 2/10/10/2/2 → 6", () => {
    // Misura per il ritorno, non stima. A mano: (30+15+10)·(1/9) = 6.11 → 6.
    // Il brief stimava 11: la formula confermata dai due casi reali
    // (normalizzazione (v-1)/9 sul dominio 1-10) dà 6.
    expect(computeCheckinScore({ sleep: 2, stress: 10, fatigue: 10, mood: 2, digestion: 2 })).toBe(
      6,
    );
  });
});

describe("subjectiveReadinessToScore — una conversione sola per le due schermate del coach", () => {
  it("8 su 10 → 80 su 100, sopra la soglia Low Recovery (40/100)", () => {
    expect(subjectiveReadinessToScore(8)).toBe(80);
    // Prima della conversione OGNI valore 1-10 finiva sotto la soglia
    // `< 40` della vista rischio; convertito, 8 non deve segnalare.
    expect(subjectiveReadinessToScore(8)).toBeGreaterThanOrEqual(40);
  });

  it("estremi del dominio dichiarato: 1 → 10, 10 → 100", () => {
    expect(subjectiveReadinessToScore(1)).toBe(10);
    expect(subjectiveReadinessToScore(10)).toBe(100);
  });
});

describe("sorenessScoreFromMap — aggregato solo-display, mai dentro la media", () => {
  it("mappa vuota = risposta «niente indolenzito» → 10", () => {
    expect(sorenessScoreFromMap({})).toBe(10);
  });

  it("intensità note → 10 meno il costo medio (mild 2 · moderate 5 · severe 8)", () => {
    expect(sorenessScoreFromMap({ quads: "severe" })).toBe(2);
    expect(sorenessScoreFromMap({ quads: "mild", chest: "moderate" })).toBe(6.5);
  });

  it("mappa assente o illeggibile → null, mai un numero inventato", () => {
    expect(sorenessScoreFromMap(null)).toBeNull();
    expect(sorenessScoreFromMap(undefined)).toBeNull();
    expect(sorenessScoreFromMap("garbage")).toBeNull();
    expect(sorenessScoreFromMap(["mild"])).toBeNull();
    expect(sorenessScoreFromMap({ quads: 7 })).toBeNull();
  });
});
