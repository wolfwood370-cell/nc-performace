// Falsifiable tests for the release builders — conservative first block,
// stable-id program document, boundary validation, safety context. The
// end-to-end case runs the REAL shared engine on the characterization
// library so document shape is pinned against real assembleWeek output.

import { assertEquals } from "jsr:@std/assert@1";
import { assembleWeek } from "../../_shared/method/assembleWeek.ts";
import { CHARACTERIZATION_LIBRARY } from "../../_shared/method/assembleWeek.characterization.fixture.ts";
import {
  applyConservativeFirstBlock,
  buildProgramDocument,
  buildSafetyContext,
  CONFIDENCE_CONSERVATIVE_THRESHOLD,
  CONSERVATIVE_MIN_SETS,
  isConservativeFirstBlock,
  PROGRAM_SCHEMA_VERSION,
  validateProgramDocument,
} from "./buildRelease.ts";
import type { ProgramDocument } from "./buildRelease.ts";

const engineInput = {
  focusGoal: "forza",
  daysPerWeek: 2,
  equipmentRaw: null,
  mode: "new" as const,
  experienceLevel: "intermedio",
  trainingAge: null,
  neurotype: null,
  excludedZones: [],
  oneRmData: null,
  candidates: CHARACTERIZATION_LIBRARY,
};

// --- conservative first block -------------------------------------------------

Deno.test("isConservativeFirstBlock: solo confidence <= soglia; 9-10 non carica di più", () => {
  assertEquals(CONFIDENCE_CONSERVATIVE_THRESHOLD, 3);
  assertEquals(isConservativeFirstBlock({ importance: 10, confidence: 0 }), true);
  assertEquals(isConservativeFirstBlock({ importance: 0, confidence: 3 }), true);
  assertEquals(isConservativeFirstBlock({ importance: 0, confidence: 4 }), false);
  assertEquals(isConservativeFirstBlock({ importance: 10, confidence: 10 }), false);
  // importance never drives the block; missing readiness -> standard.
  assertEquals(isConservativeFirstBlock({ importance: 0, confidence: null }), false);
  assertEquals(isConservativeFirstBlock(null), false);
});

Deno.test("applyConservativeFirstBlock: -1 set con pavimento 2; reps/rpe/load intatti", () => {
  const program = assembleWeek(engineInput);
  const conservative = applyConservativeFirstBlock(program);
  for (let d = 0; d < program.days.length; d++) {
    const before = program.days[d].exercises;
    const after = conservative.days[d].exercises;
    assertEquals(after.length, before.length);
    for (let e = 0; e < before.length; e++) {
      assertEquals(after[e].sets, Math.max(CONSERVATIVE_MIN_SETS, before[e].sets - 1));
      assertEquals(after[e].reps, before[e].reps);
      assertEquals(after[e].rpe, before[e].rpe);
      assertEquals(after[e].load, before[e].load);
      assertEquals(after[e].rest_seconds, before[e].rest_seconds);
    }
  }
  // Volume only SHRINKS: no exercise ever gains a set.
  const flatBefore = program.days.flatMap((d) => d.exercises.map((e) => e.sets));
  const flatAfter = conservative.days.flatMap((d) => d.exercises.map((e) => e.sets));
  for (let i = 0; i < flatBefore.length; i++) {
    assertEquals(flatAfter[i] <= flatBefore[i], true);
    assertEquals(flatAfter[i] >= CONSERVATIVE_MIN_SETS, true);
  }
  // The rationale declares the conservative start (IT).
  assertEquals(conservative.rationale.includes("Primo blocco conservativo"), true);
  // Input program is not mutated.
  assertEquals(program.rationale.includes("Primo blocco conservativo"), false);
});

Deno.test(
  "applyConservativeFirstBlock: mai un aumento — sets al/di sotto del pavimento invariati",
  () => {
    // Mutation guard (review 2026-07-15): a bare Math.max(2, sets-1) would RAISE
    // a 1-set prescription to 2 — the conservative block may only shrink.
    const ex = (sets: number) => ({
      exercise_id: "fx",
      name: "X",
      sets,
      reps: "8",
      load: "RPE 8",
      rpe: 8,
      rest_seconds: 60,
      notes: "n",
    });
    const program = {
      days: [{ day_index: 0, day_name: "Giorno 1", focus: "f", exercises: [ex(3), ex(2), ex(1)] }],
      rationale: "r",
    };
    const result = applyConservativeFirstBlock(program);
    assertEquals(
      result.days[0].exercises.map((e) => e.sets),
      [2, 2, 1],
    );
  },
);

// --- program document ------------------------------------------------------------

Deno.test("buildProgramDocument: ID stabili posizionali, version 1, contenuto preservato", () => {
  const program = assembleWeek(engineInput);
  const doc = buildProgramDocument(program, "forza");
  assertEquals(doc.version, PROGRAM_SCHEMA_VERSION);
  assertEquals(doc.goal, "forza");
  assertEquals(doc.rationale, program.rationale);
  assertEquals(doc.days.length, program.days.length);
  assertEquals(doc.days[0].session_id, "s1");
  assertEquals(doc.days[1].session_id, "s2");
  assertEquals(doc.days[0].exercises[0].item_id, "s1-e1");
  assertEquals(doc.days[1].exercises[2].item_id, "s2-e3");
  // Same engine content, only wrapped with ids.
  assertEquals(doc.days[0].exercises[0].exercise_id, program.days[0].exercises[0].exercise_id);
  assertEquals(doc.days[0].exercises[0].sets, program.days[0].exercises[0].sets);
  // Determinism: same input -> same document.
  assertEquals(doc, buildProgramDocument(assembleWeek(engineInput), "forza"));
});

Deno.test("validateProgramDocument: accetta il documento reale, rifiuta le forme rotte", () => {
  const doc = buildProgramDocument(assembleWeek(engineInput), "forza");
  assertEquals(validateProgramDocument(doc), true);

  const broken: unknown[] = [
    null,
    {},
    { ...doc, version: 2 },
    { ...doc, goal: "endurance" },
    { ...doc, rationale: "" },
    { ...doc, days: [] },
    { ...doc, days: doc.days.map((d) => ({ ...d, exercises: [] })) }, // empty week
    {
      ...doc,
      days: [
        {
          ...doc.days[0],
          exercises: [{ ...doc.days[0].exercises[0], sets: 0 }, ...doc.days[0].exercises.slice(1)],
        },
        ...doc.days.slice(1),
      ],
    },
    {
      ...doc,
      days: [
        {
          ...doc.days[0],
          exercises: [
            { ...doc.days[0].exercises[0], item_id: "" },
            ...doc.days[0].exercises.slice(1),
          ],
        },
        ...doc.days.slice(1),
      ],
    },
  ];
  for (const b of broken) {
    assertEquals(validateProgramDocument(b), false, JSON.stringify(b)?.slice(0, 80));
  }
});

Deno.test("validateProgramDocument: 7 giorni fuori telaio -> rifiutato", () => {
  const doc = buildProgramDocument(assembleWeek(engineInput), "forza");
  const seven: ProgramDocument = {
    ...doc,
    days: Array.from({ length: 7 }, (_, i) => ({ ...doc.days[0], day_index: i })),
  };
  assertEquals(validateProgramDocument(seven), false);
});

// --- safety context ------------------------------------------------------------

Deno.test("buildSafetyContext: forensics art.22 — input-gate e driver, codici macchina", () => {
  const ctx = buildSafetyContext({
    consentVersion: "hub-v1",
    safetyLevelSnapshot: "green",
    excludedZones: [{ zone: "anca", tier: "moderato" }],
    readiness: { importance: 8, confidence: 2 },
    conservativeApplied: true,
    objective: "powerlifting",
    goalDriver: "forza",
    daysPerWeek: 4,
    equipmentItems: ["bilanciere", "manubri"],
    experienceLevel: "intermedio",
    neurotype: "1A",
  });
  assertEquals(ctx, {
    schema: 1,
    consents: {
      required: ["health_required", "non_medical_disclaimer", "ai_processing"],
      all_granted: true,
      version: "hub-v1",
    },
    clinical: {
      medical_clearance_required: false,
      red_flags_blocking: false,
      safety_level_snapshot: "green",
      yellow_signals: [],
    },
    zones: { excluded: [{ zone: "anca", tier: "moderato" }], general_block: false },
    readiness: {
      importance: 8,
      confidence: 2,
      conservative_applied: true,
      confidence_threshold: 3,
    },
    engine: {
      objective: "powerlifting",
      goal_driver: "forza",
      days_per_week: 4,
      equipment_items: ["bilanciere", "manubri"],
      experience_level: "intermedio",
      neurotype: "1A",
      mode: "new",
    },
  });
});

Deno.test("buildSafetyContext: readiness assente registrata come null (mai inventata)", () => {
  const ctx = buildSafetyContext({
    consentVersion: null,
    safetyLevelSnapshot: "green",
    excludedZones: [],
    readiness: null,
    conservativeApplied: false,
    objective: null,
    goalDriver: "ipertrofia",
    daysPerWeek: 3,
    equipmentItems: [],
    experienceLevel: null,
    neurotype: null,
  }) as { readiness: Record<string, unknown> };
  assertEquals(ctx.readiness.importance, null);
  assertEquals(ctx.readiness.confidence, null);
  assertEquals(ctx.readiness.conservative_applied, false);
});
