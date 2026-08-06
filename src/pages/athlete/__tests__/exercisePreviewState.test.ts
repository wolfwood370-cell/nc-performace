// =============================================================================
// Pins the route-state contract of ExercisePreview: the page must never
// invent an exercise. Missing / malformed state → null (the page then
// redirects to /athlete/training); a valid payload passes through
// UNTOUCHED — no default merged in, no fields injected.
// The parser is pure, so this stays a node-env unit test (no jsdom,
// decision 2026-07-14).
// =============================================================================

import { describe, expect, it } from "vitest";
import { readExerciseFromLocationState } from "../ExercisePreview";

// Mirror of the REAL payload built by AthleteTraining.tsx
// (handleSelectExercise): the exact key set that reaches the page today.
// Note what is absent: weightKg, restSeconds, tut, meta.
const trainingState = {
  exercise: {
    id: "s1-e1",
    code: "A1",
    name: "Back Squat",
    scheme: "4 Serie × 6-8 Reps · 86.2%",
    type: "standard" as const,
    sets: 4,
    reps: "6-8",
    rpe: 8,
  },
};

describe("readExerciseFromLocationState — payload reale", () => {
  it("restituisce il payload di AthleteTraining così com'è, stessa reference", () => {
    const result = readExerciseFromLocationState(trainingState);
    // toBe (not toEqual): any spread/merge with a default would fail here.
    expect(result).toBe(trainingState.exercise);
  });

  it("non inietta i campi assenti dal payload (weightKg/restSeconds/tut)", () => {
    const result = readExerciseFromLocationState(trainingState);
    expect(result).not.toBeNull();
    expect(result!.weightKg).toBeUndefined();
    expect(result!.restSeconds).toBeUndefined();
    expect(result!.tut).toBeUndefined();
  });

  it("accetta type 'emom' (percorso WorkoutPhaseDetail)", () => {
    const result = readExerciseFromLocationState({
      exercise: { id: "b1", name: "Kettlebell Swings", type: "emom" },
    });
    expect(result).not.toBeNull();
    expect(result!.type).toBe("emom");
  });
});

describe("readExerciseFromLocationState — stato assente o malformato", () => {
  it.each([
    ["stato assente", undefined],
    ["stato null", null],
    ["oggetto senza exercise", {}],
    ["exercise null", { exercise: null }],
    ["exercise non-oggetto", { exercise: "a1" }],
  ])("%s → null", (_label, state) => {
    expect(readExerciseFromLocationState(state)).toBeNull();
  });

  it("candidate senza id → null", () => {
    expect(
      readExerciseFromLocationState({
        exercise: { name: "Back Squat", type: "standard" },
      }),
    ).toBeNull();
  });

  it("candidate senza name → null", () => {
    expect(
      readExerciseFromLocationState({
        exercise: { id: "a1", type: "standard" },
      }),
    ).toBeNull();
  });

  it.each(["intensity", "isometric", "superset", ""])(
    "type '%s' (variante ritirata o ignota) → null",
    (type) => {
      expect(
        readExerciseFromLocationState({
          exercise: { id: "a1", name: "Back Squat", type },
        }),
      ).toBeNull();
    },
  );
});
