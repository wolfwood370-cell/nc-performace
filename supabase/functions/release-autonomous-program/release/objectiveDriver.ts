// profiles.objective (enum-8, single source: submit-intake/intake/objective.ts)
// -> engine driver. The deterministic engine only knows forza|ipertrofia (S1
// PRESCRIPTIONS): values without a dedicated driver fold to the nearest one,
// DECLARED here in one point only (v1 map validated with Nick 2026-07-15).
// resistenza/generale -> ipertrofia is the safe default until an endurance
// driver exists; no new method numbers are introduced by this map.

import type { Objective } from "../../submit-intake/intake/objective.ts";

export type EngineGoal = "forza" | "ipertrofia";

export const OBJECTIVE_TO_GOAL: Record<Objective, EngineGoal> = {
  forza: "forza",
  powerlifting: "forza",
  performance_sport: "forza",
  estetica: "ipertrofia",
  dimagrimento: "ipertrofia",
  resistenza: "ipertrofia",
  generale: "ipertrofia",
  altro: "ipertrofia",
};

/** NULL/unknown objective -> safe default, same as the engine's normalizeGoal. */
export function goalForObjective(objective: string | null | undefined): EngineGoal {
  if (objective && objective in OBJECTIVE_TO_GOAL) {
    return OBJECTIVE_TO_GOAL[objective as Objective];
  }
  return "ipertrofia";
}
