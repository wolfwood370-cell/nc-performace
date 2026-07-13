// Port of nc-questionnaire src/lib/neurotipo-scoring.json (schema
// nc-neurotipo-scoring/v1). Source of the weights: Appendice Neurotipo
// (Thibaudeau / Ballistic Management Inc., 2019), applied by the coach
// script scoring-neurotipo.py. VALUES ARE VERBATIM — do not edit without
// Nicolo; correctness is pinned by the validation examples below (regression
// tests in neurotype.test.ts).
//
// Scoring is NOT uniform (not A=2..E=-2): points depend on the question
// importance band (alta/media/bassa). Each type has 6 statements in FIXED
// order — 1st = alta, 2nd-3rd = media, 4th-6th = bassa — and the band depends
// on the position, so the q01..q30 order is binding:
// q01-06 = 1A · q07-12 = 1B · q13-18 = 2A · q19-24 = 2B · q25-30 = 3.

export type NeuroTypeCode = "1A" | "1B" | "2A" | "2B" | "3";
export type NeuroBand = "alta" | "media" | "bassa";
export type NeuroLetter = "A" | "B" | "C" | "D" | "E";

export const NT_BANDS: Record<NeuroBand, Record<NeuroLetter, number>> = {
  alta: { A: 15, B: 12, C: 2, D: 0, E: -3 },
  media: { A: 10, B: 8, C: 2, D: 0, E: -2 },
  bassa: { A: 5, B: 4, C: 2, D: 0, E: -1 },
};

const TYPE_BLOCKS: readonly NeuroTypeCode[] = ["1A", "1B", "2A", "2B", "3"];
const BLOCK_BANDS: readonly NeuroBand[] = ["alta", "media", "media", "bassa", "bassa", "bassa"];

/**
 * q01..q30 -> {type, band}, derived from the fixed block rule above (the same
 * rule the JSON `map` encodes entry-by-entry). The validation examples pin
 * the equivalence.
 */
export const NT_MAP: Record<string, { type: NeuroTypeCode; band: NeuroBand }> = {};
for (let n = 1; n <= 30; n++) {
  NT_MAP[`q${String(n).padStart(2, "0")}`] = {
    type: TYPE_BLOCKS[Math.floor((n - 1) / 6)],
    band: BLOCK_BANDS[(n - 1) % 6],
  };
}

/** Per-type total range: 6xE = -10, 6xA = 50. */
export const NT_RANGE_PER_TYPE = { min: -10, max: 50 } as const;

export interface NeuroValidationExample {
  nome: string;
  answers: Record<string, string>;
  expected_totals: Record<NeuroTypeCode, number>;
  expected_primary: NeuroTypeCode;
  expected_secondary: NeuroTypeCode;
  expected_margin: number;
}

/** The 3 validation_examples of the JSON, verbatim (regression contract). */
export const NT_VALIDATION_EXAMPLES: readonly NeuroValidationExample[] = [
  {
    nome: "Esempio 1 — profilo misto",
    answers: {
      q01: "A",
      q02: "B",
      q03: "C",
      q04: "D",
      q05: "E",
      q06: "A",
      q07: "E",
      q08: "E",
      q09: "D",
      q10: "D",
      q11: "C",
      q12: "C",
      q13: "B",
      q14: "B",
      q15: "B",
      q16: "A",
      q17: "A",
      q18: "A",
      q19: "C",
      q20: "C",
      q21: "C",
      q22: "C",
      q23: "C",
      q24: "C",
      q25: "D",
      q26: "D",
      q27: "D",
      q28: "E",
      q29: "E",
      q30: "E",
    },
    expected_totals: { "1A": 29, "1B": -1, "2A": 43, "2B": 12, "3": -3 },
    expected_primary: "2A",
    expected_secondary: "1A",
    expected_margin: 14,
  },
  {
    nome: "Esempio 2 — 2B netto",
    answers: {
      q01: "E",
      q02: "E",
      q03: "E",
      q04: "E",
      q05: "E",
      q06: "E",
      q07: "E",
      q08: "E",
      q09: "E",
      q10: "E",
      q11: "E",
      q12: "E",
      q13: "E",
      q14: "E",
      q15: "E",
      q16: "E",
      q17: "E",
      q18: "E",
      q19: "A",
      q20: "A",
      q21: "A",
      q22: "A",
      q23: "A",
      q24: "A",
      q25: "E",
      q26: "E",
      q27: "E",
      q28: "E",
      q29: "E",
      q30: "E",
    },
    expected_totals: { "1A": -10, "1B": -10, "2A": -10, "2B": 50, "3": -10 },
    expected_primary: "2B",
    expected_secondary: "1A",
    expected_margin: 60,
  },
  {
    nome: "Esempio 3 — testa a testa (margine piccolo)",
    answers: {
      q01: "A",
      q02: "A",
      q03: "A",
      q04: "A",
      q05: "A",
      q06: "A",
      q07: "E",
      q08: "E",
      q09: "E",
      q10: "E",
      q11: "E",
      q12: "E",
      q13: "A",
      q14: "A",
      q15: "A",
      q16: "A",
      q17: "A",
      q18: "B",
      q19: "E",
      q20: "E",
      q21: "E",
      q22: "E",
      q23: "E",
      q24: "E",
      q25: "E",
      q26: "E",
      q27: "E",
      q28: "E",
      q29: "E",
      q30: "E",
    },
    expected_totals: { "1A": 50, "1B": -10, "2A": 49, "2B": -10, "3": -10 },
    expected_primary: "1A",
    expected_secondary: "2A",
    expected_margin: 1,
  },
];
