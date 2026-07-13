// objective -> arena seed: pin della tabella §1 + tie-break §2 di
// regola-obiettivo-arena.md. Ogni riga ha un assert che fallisce sul revert.

import { assertEquals, assertFalse } from "jsr:@std/assert@1";
import { deriveArena, isObjective, OBJECTIVES } from "./objective.ts";

const noCtx = {};

Deno.test("enum objective = 8 valori esatti della fonte", () => {
  assertEquals(
    [...OBJECTIVES],
    [
      "estetica",
      "dimagrimento",
      "forza",
      "powerlifting",
      "performance_sport",
      "resistenza",
      "generale",
      "altro",
    ],
  );
  assertFalse(isObjective("squat"));
});

Deno.test("mappature dirette della tabella §1", () => {
  assertEquals(deriveArena("estetica", noCtx).primaria, "ipertrofia");
  assertEquals(deriveArena("powerlifting", noCtx).primaria, "powerlifting");
  assertEquals(deriveArena("resistenza", noCtx).primaria, "condizionamento");
  const generale = deriveArena("generale", noCtx);
  assertEquals(generale.primaria, "forza-generale");
  assertEquals(generale.enfasi, "condizionamento");
});

Deno.test("dimagrimento: ipertrofia + enfasi condizionamento; novizio -> forza-generale", () => {
  const std = deriveArena("dimagrimento", { experienceLevel: "intermedio" });
  assertEquals(std.primaria, "ipertrofia");
  assertEquals(std.enfasi, "condizionamento");
  assertEquals(
    deriveArena("dimagrimento", { experienceLevel: "novizio" }).primaria,
    "forza-generale",
  );
});

Deno.test("forza: tie-break SBD solo su token espliciti", () => {
  const gara = deriveArena("forza", {
    barbellExperience: "ho gareggiato in una gara IPF nel 2024",
  });
  assertEquals(gara.primaria, "powerlifting");
  const palestra = deriveArena("forza", {
    barbellExperience: "mi alleno col bilanciere da 3 anni",
  });
  assertEquals(palestra.primaria, "forza-generale");
  assertEquals(palestra.confidence, "alta");
});

Deno.test("performance_sport senza sport -> flag [chiedi_sport], mai indovinare", () => {
  const senza = deriveArena("performance_sport", { currentSport: "", sportsHistory: "  " });
  assertEquals(senza.primaria, "prep-atletica");
  assertEquals(senza.flags, ["chiedi_sport"]);
  assertEquals(senza.confidence, "bassa");
  const con = deriveArena("performance_sport", { currentSport: "pallavolo" });
  assertEquals(con.flags, []);
  assertEquals(con.confidence, "alta");
});

Deno.test("altro -> forza-generale di default + flag [chiedi]", () => {
  const seed = deriveArena("altro", noCtx);
  assertEquals(seed.primaria, "forza-generale");
  assertEquals(seed.flags, ["chiedi"]);
  assertEquals(seed.confidence, "bassa");
});

Deno.test("determinismo: stesso input -> stesso output", () => {
  const ctx = { barbellExperience: "gara sbd", experienceLevel: "novizio" };
  assertEquals(
    JSON.stringify(deriveArena("forza", ctx)),
    JSON.stringify(deriveArena("forza", ctx)),
  );
});
