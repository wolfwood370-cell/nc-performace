// Parity test with the REAL release builder (lesson intake-form-fase2):
// the document written by release-autonomous-program/release/buildRelease.ts
// must round-trip through the athlete view parser — any drift between the
// edge writer and the FE reader fails here, in unit, without mocks.

import { describe, expect, it } from "vitest";
import { assembleWeek } from "../../../../supabase/functions/_shared/method/assembleWeek.ts";
import { CHARACTERIZATION_LIBRARY } from "../../../../supabase/functions/_shared/method/assembleWeek.characterization.fixture.ts";
import {
  applyConservativeFirstBlock,
  buildProgramDocument,
} from "../../../../supabase/functions/release-autonomous-program/release/buildRelease.ts";
import { dayForWeekday, parseReleaseDocument } from "../releaseView";

const engineInput = {
  focusGoal: "forza",
  daysPerWeek: 3,
  equipmentRaw: null,
  mode: "new" as const,
  experienceLevel: "intermedio",
  trainingAge: null,
  neurotype: null,
  excludedZones: [],
  oneRmData: { "Back Squat": { estimated_1rm: 140 } },
  candidates: CHARACTERIZATION_LIBRARY,
};

describe("parseReleaseDocument — parità col builder reale", () => {
  it("legge il documento del builder: giorni, id stabili, scheme composto", () => {
    const document = buildProgramDocument(assembleWeek(engineInput), "forza");
    const view = parseReleaseDocument(document);
    expect(view).not.toBeNull();
    expect(view!.days).toHaveLength(3);
    expect(view!.goal).toBe("forza");
    expect(view!.rationale).toBe(document.rationale);
    const first = view!.days[0];
    expect(first.sessionId).toBe("s1");
    expect(first.dayName).toBe(document.days[0].day_name);
    expect(first.exercises[0].id).toBe("s1-e1");
    expect(first.exercises[0].code).toBe("A1");
    expect(first.exercises[1].code).toBe("B1");
    // Scheme combines sets/reps/load exactly as prescribed by the engine.
    const ex0 = document.days[0].exercises[0];
    expect(first.exercises[0].scheme).toBe(`${ex0.sets} Serie × ${ex0.reps} Reps · ${ex0.load}`);
  });

  it("legge anche il documento del primo blocco conservativo", () => {
    const conservative = applyConservativeFirstBlock(assembleWeek(engineInput));
    const view = parseReleaseDocument(buildProgramDocument(conservative, "forza"));
    expect(view).not.toBeNull();
    expect(view!.rationale).toContain("Primo blocco conservativo");
  });

  it("rifiuta le forme rotte senza lanciare", () => {
    expect(parseReleaseDocument(null)).toBeNull();
    expect(parseReleaseDocument({})).toBeNull();
    expect(parseReleaseDocument({ version: 2, days: [] })).toBeNull();
    expect(parseReleaseDocument({ version: 1, days: "x" })).toBeNull();
    expect(parseReleaseDocument({ version: 1, days: [] })).toBeNull();
    expect(parseReleaseDocument({ version: 1, days: [{ exercises: [{ name: 3 }] }] })).toBeNull();
  });
});

describe("dayForWeekday", () => {
  const view = parseReleaseDocument(buildProgramDocument(assembleWeek(engineInput), "forza"))!;

  it("lun->Giorno 1, mer->Giorno 3, gio->riposo (programma da 3)", () => {
    expect(dayForWeekday(view, 0)?.sessionId).toBe("s1");
    expect(dayForWeekday(view, 2)?.sessionId).toBe("s3");
    expect(dayForWeekday(view, 3)).toBeNull();
    expect(dayForWeekday(view, 6)).toBeNull();
    expect(dayForWeekday(view, -1)).toBeNull();
  });
});
