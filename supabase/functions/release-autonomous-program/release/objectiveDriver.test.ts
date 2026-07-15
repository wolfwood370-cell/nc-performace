// Falsifiable tests for the objective -> engine driver map (v1, declared).

import { assertEquals } from "jsr:@std/assert@1";
import { OBJECTIVES } from "../../submit-intake/intake/objective.ts";
import { goalForObjective, OBJECTIVE_TO_GOAL } from "./objectiveDriver.ts";

Deno.test("mappa v1: ogni objective dell'enum-8 ha il driver dichiarato", () => {
  // Exhaustive pin: a change to the map (or to the enum) must fail here.
  assertEquals(OBJECTIVE_TO_GOAL, {
    forza: "forza",
    powerlifting: "forza",
    performance_sport: "forza",
    estetica: "ipertrofia",
    dimagrimento: "ipertrofia",
    resistenza: "ipertrofia",
    generale: "ipertrofia",
    altro: "ipertrofia",
  });
  // Every enum value is covered (compile-time via Record, runtime re-check).
  for (const objective of OBJECTIVES) {
    assertEquals(typeof OBJECTIVE_TO_GOAL[objective], "string", objective);
  }
});

Deno.test("goalForObjective: NULL/sconosciuto -> default sicuro ipertrofia", () => {
  assertEquals(goalForObjective(null), "ipertrofia");
  assertEquals(goalForObjective(undefined), "ipertrofia");
  assertEquals(goalForObjective(""), "ipertrofia");
  assertEquals(goalForObjective("endurance"), "ipertrofia");
  assertEquals(goalForObjective("powerlifting"), "forza");
  assertEquals(goalForObjective("estetica"), "ipertrofia");
});
