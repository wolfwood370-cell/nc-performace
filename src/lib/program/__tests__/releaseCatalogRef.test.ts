// =============================================================================
// releaseCatalogRef — the view carries BOTH ids, with names that cannot be
// confused (slice A-03). The release document names two identifiers per
// exercise: item_id ("w1-s1-e1", builder-local, resolves to NOTHING in the
// exercises table) and exercise_id (the catalog UUID, the only value the
// exercise_logs FK accepts). Before this slice the parser kept only item_id:
// wiring the set logger to it would have had EVERY insert rejected by the FK.
// These tests pin the mapping for both document versions, and pin that a
// MISSING catalog reference degrades to null — never dropped, never faked
// from the local id.
// =============================================================================
import { describe, expect, it } from "vitest";
import { parseReleaseDocument } from "../releaseView";

const CATALOG_UUID = "ce6ea5a8-7d71-4ffe-8cdf-2dbb0996ca1f";

const v2Set = {
  set_number: 1,
  reps: "8",
  rpe: 7,
  rir: null,
  percent_1rm: null,
  rest_seconds: 90,
  tempo: null,
  is_warmup: false,
};

const v2Doc = (exercise: Record<string, unknown>) => ({
  version: 2,
  goal: "forza",
  rationale: "",
  name: "Blocco 1",
  days: [
    {
      session_id: "s1",
      day_index: 0,
      day_name: "Giorno 1",
      focus: "",
      date: "2026-08-25",
      week_order: 1,
      exercises: [exercise],
    },
  ],
});

const v1Doc = (exercise: Record<string, unknown>) => ({
  version: 1,
  goal: "forza",
  rationale: "",
  days: [
    {
      session_id: "s1",
      day_index: 0,
      day_name: "Giorno 1",
      focus: "",
      exercises: [exercise],
    },
  ],
});

describe("v2 — i due id viaggiano insieme e restano distinguibili", () => {
  it("id = item_id (locale) e catalog_exercise_id = exercise_id (catalogo)", () => {
    const view = parseReleaseDocument(
      v2Doc({
        item_id: "w1-s1-e1",
        exercise_id: CATALOG_UUID,
        name: "Abductor Machine in piedi",
        sets: [v2Set],
      }),
    )!;
    const ex = view.days[0].exercises[0];
    expect(ex.id, "id locale per le chiavi di render").toBe("w1-s1-e1");
    expect(ex.catalog_exercise_id, "riferimento di catalogo per il database").toBe(CATALOG_UUID);
    expect(ex.catalog_exercise_id, "i due id non devono mai coincidere per caso").not.toBe(ex.id);
  });

  it("senza exercise_id l'esercizio resta in scheda con riferimento null, mai l'id locale", () => {
    const view = parseReleaseDocument(
      v2Doc({ item_id: "w1-s1-e2", name: "Plank", sets: [v2Set] }),
    )!;
    const ex = view.days[0].exercises[0];
    expect(ex.name, "l'esercizio non sparisce dalla scheda").toBe("Plank");
    expect(ex.catalog_exercise_id, "nessun riferimento inventato").toBeNull();
  });

  it("exercise_id vuoto o non-stringa degrada a null", () => {
    for (const bad of ["", 42, null, { id: "x" }]) {
      const view = parseReleaseDocument(
        v2Doc({ item_id: "w1-s1-e3", exercise_id: bad, name: "Row", sets: [v2Set] }),
      )!;
      expect(
        view.days[0].exercises[0].catalog_exercise_id,
        `exercise_id malformato (${JSON.stringify(bad)})`,
      ).toBeNull();
    }
  });
});

describe("v1 — stesso contratto del documento-motore", () => {
  it("il builder v1 emette exercise_id e la vista lo porta accanto all'id locale", () => {
    const view = parseReleaseDocument(
      v1Doc({
        item_id: "w1-s1-e1",
        exercise_id: "fx-squat-1",
        name: "Back Squat",
        sets: 4,
        reps: "6",
        load: "80%",
        rpe: 8,
      }),
    )!;
    const ex = view.days[0].exercises[0];
    expect(ex.id).toBe("w1-s1-e1");
    expect(ex.catalog_exercise_id).toBe("fx-squat-1");
  });

  it("senza exercise_id: esercizio reso, riferimento null", () => {
    const view = parseReleaseDocument(
      v1Doc({ item_id: "w1-s1-e2", name: "Bench Press", sets: 3, reps: "8", rpe: 7 }),
    )!;
    const ex = view.days[0].exercises[0];
    expect(ex.name).toBe("Bench Press");
    expect(ex.catalog_exercise_id).toBeNull();
  });
});
