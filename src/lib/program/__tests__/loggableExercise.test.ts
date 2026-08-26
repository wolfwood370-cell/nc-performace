// =============================================================================
// The ONE predicate for "can this exercise log sets?" (slice update-safe).
// Pins the contract that repaired the 2026-08-25 defect: `undefined` (field
// ABSENT — the shape a cache persisted by an older build rehydrates) must
// behave exactly like `null` (field present, no reference). Any drift between
// the two is the drift that made a row clickable while the drawer stayed dead.
// =============================================================================
import { describe, expect, it } from "vitest";
import { isLoggableExercise } from "@/lib/program/loggableExercise";
import { parseReleaseDocument } from "@/lib/program/releaseView";
import type { ReleaseExerciseView } from "@/lib/program/releaseView";

/** Old-cache shape: the field does not exist AT ALL on the rehydrated JSON.
 *  The cast is the point — the runtime object lies about its static type. */
const absentField = { id: "e1", name: "Panca piana" } as unknown as ReleaseExerciseView;

describe("isLoggableExercise — il predicato unico di «registrabile»", () => {
  it("null (riferimento dichiarato mancante) → non registrabile", () => {
    expect(isLoggableExercise({ catalog_exercise_id: null })).toBe(false);
  });

  it("undefined esplicito → non registrabile", () => {
    expect(isLoggableExercise({ catalog_exercise_id: undefined as unknown as string | null })).toBe(
      false,
    );
  });

  it("campo ASSENTE (cache scritta da un build precedente) → non registrabile", () => {
    expect(isLoggableExercise(absentField)).toBe(false);
  });

  it("riferimento di catalogo presente → registrabile", () => {
    expect(
      isLoggableExercise({ catalog_exercise_id: "ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f" }),
    ).toBe(true);
  });

  it("undefined e null si comportano IDENTICAMENTE (acceptance 6)", () => {
    const withNull = isLoggableExercise({ catalog_exercise_id: null });
    const withUndefined = isLoggableExercise({
      catalog_exercise_id: undefined as unknown as string | null,
    });
    const withAbsent = isLoggableExercise(absentField);
    expect(
      withUndefined,
      "undefined deve dare lo stesso esito di null: è il disaccordo che il 25/08 " +
        "ha reso una riga cliccabile col drawer che non si montava",
    ).toBe(withNull);
    expect(withAbsent, "campo assente = undefined = null").toBe(withNull);
  });

  it("parità col parser: un documento senza exercise_id produce un esercizio non registrabile", () => {
    // The parser is the ONLY door that maps NIL/absent references to null;
    // the predicate must agree with its output, not re-implement it.
    const program = parseReleaseDocument({
      version: 1,
      goal: "forza",
      rationale: "",
      days: [
        {
          session_id: "s1",
          day_index: 0,
          day_name: "Giorno 1",
          focus: "",
          exercises: [{ item_id: "e1", name: "Plank", sets: 3, reps: "8", rpe: 7 }],
        },
      ],
    });
    expect(program).not.toBeNull();
    const exercise = program!.days[0].exercises[0];
    expect(exercise.catalog_exercise_id).toBeNull();
    expect(isLoggableExercise(exercise)).toBe(false);
  });
});
