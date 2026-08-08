// =============================================================================
// Pins the route-state contract and the display formatting of the athlete
// Exercise Preview. Two families of guards, both anti-revert:
//   1. Parser: missing / malformed state → null (the page redirects);
//      a valid payload passes through UNTOUCHED — no default merged in.
//   2. Formatters: values the payload does not carry — or that the
//      release parser (releaseView.ts) coerced to "" / 0 — render as "—",
//      never as a number the coach did not write.
// Pure module, node-env only (no jsdom — decision 2026-07-14).
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  formatRestDisplay,
  formatVariableCells,
  lockedTableSetCount,
  readExerciseFromLocationState,
  type PreviewExercise,
} from "../previewExercise";

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

// ---------------------------------------------------------------------------
// Formatters — mai numeri che il coach non ha scritto.
// ---------------------------------------------------------------------------

const base: PreviewExercise = { id: "a1", name: "Back Squat", type: "standard" };

describe("formatVariableCells", () => {
  it("payload reale (senza weightKg/tut): Peso e TUT '—', il resto passa", () => {
    const cells = formatVariableCells(trainingState.exercise);
    expect(cells).toEqual({
      sets: "4",
      reps: "6-8",
      weight: "—",
      tut: "—",
      rpe: "8",
    });
  });

  it("campi assenti → tutti '—'", () => {
    expect(formatVariableCells(base)).toEqual({
      sets: "—",
      reps: "—",
      weight: "—",
      tut: "—",
      rpe: "—",
    });
  });

  it("coercizioni del parser release (sets 0, reps '', rpe 0) → '—', mai '0'", () => {
    const cells = formatVariableCells({ ...base, sets: 0, reps: "", rpe: 0 });
    expect(cells.sets).toBe("—");
    expect(cells.reps).toBe("—");
    expect(cells.rpe).toBe("—");
  });

  it("weightKg 0 esplicito → 'BW'; weightKg positivo → 'N kg'", () => {
    expect(formatVariableCells({ ...base, weightKg: 0 }).weight).toBe("BW");
    expect(formatVariableCells({ ...base, weightKg: 100 }).weight).toBe("100 kg");
  });
});

describe("lockedTableSetCount", () => {
  it("sets reale → conteggio; sets assente o 0-coercizzato → null (tabella nascosta)", () => {
    expect(lockedTableSetCount({ ...base, sets: 4 })).toBe(4);
    expect(lockedTableSetCount(base)).toBeNull();
    expect(lockedTableSetCount({ ...base, sets: 0 })).toBeNull();
  });
});

describe("formatRestDisplay", () => {
  it("90 → '90s'; assente → '—'", () => {
    expect(formatRestDisplay(90)).toBe("90s");
    expect(formatRestDisplay(undefined)).toBe("—");
  });
});
