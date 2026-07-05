// Test falsificabili per neurotypeSeed.ts (asset Cowork, committato così com'è).
// Il seed è feed-forward: inclina i default, il dato misurato comanda sempre.

import { assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { NEUROTYPE_SEED, NEUTRAL_SEED, neurotypeSeed } from "./neurotypeSeed.ts";

const CODES = ["1A", "1B", "2A", "2B", "3"] as const;

Deno.test("i 5 codici neurotipo ritornano il seed corrispondente", () => {
  for (const code of CODES) {
    const seed = neurotypeSeed(code);
    assertStrictEquals(seed, NEUROTYPE_SEED[code]);
    assertEquals(seed.type, code);
    assertEquals(seed.label.length > 0, true, `label vuota per ${code}`);
  }
});

Deno.test("null / undefined / ignoto -> NEUTRAL_SEED, senza lanciare", () => {
  assertStrictEquals(neurotypeSeed(null), NEUTRAL_SEED);
  assertStrictEquals(neurotypeSeed(undefined), NEUTRAL_SEED);
  assertStrictEquals(neurotypeSeed(""), NEUTRAL_SEED);
  assertStrictEquals(neurotypeSeed("4C"), NEUTRAL_SEED);
  // Il dato canonico in profiles.neurotype è maiuscolo: il lookup è case-sensitive.
  assertStrictEquals(neurotypeSeed("1a"), NEUTRAL_SEED);
});

Deno.test("il seed neutro non inclina nulla", () => {
  assertEquals(NEUTRAL_SEED.type, null);
  assertEquals(NEUTRAL_SEED.methodPref, []);
  assertEquals(NEUTRAL_SEED.avoid, []);
  assertEquals(NEUTRAL_SEED.frequencyBias, "media");
  assertEquals(NEUTRAL_SEED.volumeBias, "medio");
  assertEquals(NEUTRAL_SEED.intensityBias, "media");
  assertEquals(NEUTRAL_SEED.restBias, "medio");
  assertEquals(NEUTRAL_SEED.varietyTolerance, "media");
});

Deno.test("ogni seed è completo (nessun campo vuoto dove serve una direzione)", () => {
  for (const code of CODES) {
    const s = NEUROTYPE_SEED[code];
    assertEquals(typeof s.frequencyBias, "string");
    assertEquals(typeof s.volumeBias, "string");
    assertEquals(typeof s.intensityBias, "string");
    assertEquals(typeof s.restBias, "string");
    assertEquals(typeof s.varietyTolerance, "string");
    assertEquals(s.note.length > 0, true, `note vuota per ${code}`);
    assertEquals(Array.isArray(s.methodPref), true);
    assertEquals(Array.isArray(s.avoid), true);
  }
});
