// Regressione scoring neurotipo: i 3 validation_examples del JSON sorgente
// (nc-questionnaire src/lib/neurotipo-scoring.json) sono il contratto. Se
// questo test rompe, lo scoring NON e' piu' 1:1 con la fonte
// (Thibaudeau / scoring-neurotipo.py).

import { assert, assertEquals } from "jsr:@std/assert@1";
import { normalizeNeuroAnswers, NT_ORDER, scoreNeurotype } from "./neurotype.ts";
import { NT_RANGE_PER_TYPE, NT_VALIDATION_EXAMPLES } from "./neurotypeScoringData.ts";

Deno.test("i 3 esempi di validazione della fonte sono presenti", () => {
  assertEquals(NT_VALIDATION_EXAMPLES.length, 3);
});

for (const example of NT_VALIDATION_EXAMPLES) {
  Deno.test(`regressione vs scoring-neurotipo.py — ${example.nome}`, () => {
    const score = scoreNeurotype(normalizeNeuroAnswers(example.answers));
    for (const type of NT_ORDER) {
      assertEquals(score.totals[type], example.expected_totals[type], `totale ${type}`);
    }
    assertEquals(score.primary, example.expected_primary, "primario");
    assertEquals(score.secondary, example.expected_secondary, "secondario");
    assertEquals(score.margin, example.expected_margin, "margine");
  });
}

Deno.test("range per tipo: 6xE = -10, 6xA = 50 (esempio 2 tocca gli estremi)", () => {
  assertEquals(NT_RANGE_PER_TYPE.min, -10);
  assertEquals(NT_RANGE_PER_TYPE.max, 50);
  const ex2 = NT_VALIDATION_EXAMPLES[1];
  assertEquals(ex2.expected_totals["2B"], NT_RANGE_PER_TYPE.max);
  assertEquals(ex2.expected_totals["1A"], NT_RANGE_PER_TYPE.min);
});

Deno.test("tie-break deterministico: a parita' vince l'ordine 1A > 1B > 2A > 2B > 3", () => {
  const score = scoreNeurotype(Array(30).fill("C"));
  for (const type of NT_ORDER) assertEquals(score.totals[type], 12);
  assertEquals(score.primary, "1A");
  assertEquals(score.secondary, "1B");
  assertEquals(score.margin, 0);
  assert(score.closeCall);
});

Deno.test("normalizzazione: chiavi q1..q30 senza zero padding", () => {
  const src: Record<string, string> = {};
  for (let n = 1; n <= 30; n++) src[`q${n}`] = "A";
  assertEquals(normalizeNeuroAnswers(src), Array(30).fill("A"));
});

Deno.test("normalizzazione: numeri 1-5 (1=A .. 5=E) e minuscole", () => {
  const src: Record<string, unknown> = {};
  for (let n = 1; n <= 30; n++) src[`q${String(n).padStart(2, "0")}`] = n % 2 ? "b" : 5;
  const out = normalizeNeuroAnswers(src);
  assertEquals(out[0], "B");
  assertEquals(out[1], "E");
});

Deno.test("normalizzazione: valori assenti/invalidi -> stringa vuota (0 punti)", () => {
  const out = normalizeNeuroAnswers({ q01: "A", q02: "x", q03: 9 });
  assertEquals(out[0], "A");
  assertEquals(out[1], "");
  assertEquals(out[2], "");
  assertEquals(out.length, 30);
});
