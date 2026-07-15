// Characterization test (golden master): assembleWeek must reproduce the
// pinned outputs byte-for-byte. The expected file was generated from the
// pre-extraction code (commit base ffb73b4): it proves the _shared/ move —
// and any future refactor — is behaviour-preserving. If a change is
// INTENTIONAL, regenerate the expected file and say so in the commit.

import { assertEquals } from "jsr:@std/assert@1";
import { assembleWeek } from "./assembleWeek.ts";
import { CHARACTERIZATION_SCENARIOS } from "./assembleWeek.characterization.fixture.ts";
import expected from "./assembleWeek.characterization.expected.json" with { type: "json" };

Deno.test("characterization: output pinnato, byte-identico su ogni scenario", () => {
  assertEquals(CHARACTERIZATION_SCENARIOS.length, expected.length);
  for (let i = 0; i < CHARACTERIZATION_SCENARIOS.length; i++) {
    const scenario = CHARACTERIZATION_SCENARIOS[i];
    assertEquals(scenario.name, expected[i].name);
    const actual = assembleWeek(scenario.input);
    // Deep first (readable diff), then strict string equality (byte-identical).
    assertEquals(actual, expected[i].result, `drift semantico: ${scenario.name}`);
    assertEquals(
      JSON.stringify(actual),
      JSON.stringify(expected[i].result),
      `drift di serializzazione: ${scenario.name}`,
    );
  }
});
