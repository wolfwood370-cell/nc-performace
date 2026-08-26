// =============================================================================
// src/lib/program/loggableExercise.ts
// =============================================================================
// THE one predicate for "can this exercise log sets?". Every surface that
// decides loggability — the list row affordance AND the drawer mount — reads
// this function: two call sites answering on their own is exactly how they
// disagreed on 2026-08-25 (`!== null` said clickable, `?? null` said no
// drawer) and the row promised an action the page then refused in silence.
//
// `undefined` counts as absent exactly like `null`. The type says
// `string | null`, but the persisted TanStack cache is an UNTYPED boundary:
// JSON written by an older build rehydrates with the field missing entirely,
// and a missing reference must degrade to "sola consultazione" — never to a
// promise. (The NIL sentinel of unlinked AI exercises is already mapped to
// null by the parser — catalogRef in releaseView — and gets no second guard
// here: one door per rule.)
// =============================================================================

import type { ReleaseExerciseView } from "./releaseView";

/**
 * True only when the exercise carries a catalog reference the database
 * accepts (exercise_logs.exercise_id FK) — the only case where sets can be
 * logged. A plain boolean ON PURPOSE, not a type guard: with this repo's
 * `strict: false` (no strictNullChecks) `string | null` collapses to
 * `string`, a `T & { catalog_exercise_id: string }` guard becomes identical
 * to `T`, and the false branch narrows to `never`.
 */
export function isLoggableExercise(
  exercise: Pick<ReleaseExerciseView, "catalog_exercise_id">,
): boolean {
  return exercise.catalog_exercise_id !== null && exercise.catalog_exercise_id !== undefined;
}
