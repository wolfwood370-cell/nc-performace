// Test falsificabili per assembleWeek.ts — fixtures in-memory, nessun DB.
// Coprono i 5 strati: gate (S0), goal/esperienza (S1), split (S2), numeri e
// %1RM dalla Tabella (S3), equipment/zone/selezione e rotazione (S4),
// più determinismo e contratto d'uscita.

import { assertEquals } from "jsr:@std/assert@1";
import {
  assembleWeek,
  buildExcludedZones,
  normalizeExperience,
  normalizeGoal,
  parseEquipment,
  safetyGate,
} from "./assembleWeek.ts";
import type { AssembleInput, CandidateRow } from "./assembleWeek.ts";
import { percent1RM } from "./rpeTable.ts";
import type { ExerciseRow } from "./types.ts";

// ---------------------------------------------------------------------------
// Fixtures: una libreria minima ma completa per i pattern usati dagli split.
// ---------------------------------------------------------------------------

function row(
  partial: Partial<ExerciseRow> & { id: string; os_id: string; name: string },
): CandidateRow {
  return {
    exercise_family: "forza",
    movement_pattern: null,
    patterns: null,
    equipment: null,
    execution_mode: null,
    suited_rep_range: null,
    fatigue_cost: null,
    technical_complexity: null,
    laterality: "bilaterale",
    stability_demand: null,
    body_position: null,
    lift_phase: null,
    muscles: null,
    secondary_muscles: null,
    ...partial,
  };
}

const backSquat = row({
  id: "id-squat-1",
  os_id: "OS-101",
  name: "Back Squat",
  movement_pattern: "squat",
  equipment: ["bilanciere"],
  execution_mode: "grind",
  suited_rep_range: "forza",
  stability_demand: "bassa",
  muscles: ["quadricipiti", "glutei"],
});
const gobletSquat = row({
  id: "id-squat-2",
  os_id: "OS-102",
  name: "Goblet Squat",
  movement_pattern: "squat",
  equipment: ["manubri"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  stability_demand: "media",
  muscles: ["quadricipiti", "glutei"],
});
const romanianDeadlift = row({
  id: "id-hinge-1",
  os_id: "OS-103",
  name: "Romanian Deadlift",
  movement_pattern: "hip hinge",
  equipment: ["bilanciere"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  muscles: ["femorali", "glutei"],
});
const kbSwing = row({
  id: "id-hinge-2",
  os_id: "OS-104",
  name: "Kettlebell Swing",
  exercise_family: "pliometrico",
  movement_pattern: "hip hinge",
  equipment: ["kettlebell"],
  execution_mode: "balistico",
  muscles: ["glutei", "femorali"],
});
const lunge = row({
  id: "id-lunge-1",
  os_id: "OS-105",
  name: "Walking Lunge",
  movement_pattern: "lunge",
  equipment: ["manubri"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  laterality: "unilaterale",
  muscles: ["quadricipiti", "glutei"],
});
const benchPress = row({
  id: "id-push-h-1",
  os_id: "OS-106",
  name: "Bench Press",
  movement_pattern: "push orizzontale",
  equipment: ["bilanciere", "panca"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  muscles: ["pettorali"],
  secondary_muscles: ["spalle", "tricipiti"],
});
const overheadPress = row({
  id: "id-push-v-1",
  os_id: "OS-107",
  name: "Overhead Press",
  movement_pattern: "push verticale",
  equipment: ["bilanciere"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  muscles: ["spalle"],
});
const barbellRow = row({
  id: "id-pull-h-1",
  os_id: "OS-108",
  name: "Barbell Row",
  movement_pattern: "pull orizzontale",
  equipment: ["bilanciere"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  muscles: ["dorsali"],
  secondary_muscles: ["bicipiti"],
});
const pullUp = row({
  id: "id-pull-v-1",
  os_id: "OS-109",
  name: "Pull-Up",
  movement_pattern: "pull verticale",
  equipment: ["sbarra"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  muscles: ["dorsali"],
});
const bicepsCurl = row({
  id: "id-iso-1",
  os_id: "OS-110",
  name: "Biceps Curl",
  movement_pattern: "isolamento",
  equipment: ["manubri"],
  execution_mode: "grind",
  suited_rep_range: "ipertrofia",
  muscles: ["bicipiti"],
});
const plank = row({
  id: "id-core-ae-1",
  os_id: "OS-111",
  name: "Plank",
  movement_pattern: "core anti-estensione",
  equipment: ["corpo libero"],
  execution_mode: "isometrico",
  muscles: ["core"],
});
const pallof = row({
  id: "id-core-ar-1",
  os_id: "OS-112",
  name: "Pallof Press",
  movement_pattern: "core anti-rotazione",
  equipment: ["cavi"],
  execution_mode: "isometrico",
  muscles: ["core"],
});
const farmersCarry = row({
  id: "id-carry-1",
  os_id: "OS-113",
  name: "Farmer's Carry",
  movement_pattern: "carry/locomozione",
  equipment: ["manubri"],
  execution_mode: "grind",
  muscles: ["core"],
  secondary_muscles: ["avambracci"],
});

const LIBRARY: CandidateRow[] = [
  backSquat,
  gobletSquat,
  romanianDeadlift,
  kbSwing,
  lunge,
  benchPress,
  overheadPress,
  barbellRow,
  pullUp,
  bicepsCurl,
  plank,
  pallof,
  farmersCarry,
];

function input(partial: Partial<AssembleInput> = {}): AssembleInput {
  return {
    focusGoal: "forza",
    daysPerWeek: 2,
    equipmentRaw: null,
    mode: "new",
    experienceLevel: "intermedio",
    neurotype: null,
    excludedZones: [],
    oneRmData: null,
    candidates: LIBRARY,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// S0 — gate e zone escluse
// ---------------------------------------------------------------------------

Deno.test("safetyGate: clearance richiesta o red_flags non vuoti bloccano", () => {
  assertEquals(safetyGate({ medicalClearanceRequired: true, redFlags: null }).blocked, true);
  assertEquals(
    safetyGate({ medicalClearanceRequired: false, redFlags: ["dolore toracico"] }).blocked,
    true,
  );
  assertEquals(
    safetyGate({ medicalClearanceRequired: false, redFlags: { nota: "x" } }).blocked,
    true,
  );
  assertEquals(
    safetyGate({ medicalClearanceRequired: false, redFlags: "ipertensione" }).blocked,
    true,
  );
  // Vuoti/assenti NON bloccano.
  assertEquals(safetyGate({ medicalClearanceRequired: false, redFlags: [] }).blocked, false);
  assertEquals(safetyGate({ medicalClearanceRequired: false, redFlags: {} }).blocked, false);
  assertEquals(safetyGate({ medicalClearanceRequired: false, redFlags: null }).blocked, false);
  assertEquals(safetyGate({ medicalClearanceRequired: false, redFlags: "" }).blocked, false);
  // La reason bloccante è in italiano e non vuota.
  const gate = safetyGate({ medicalClearanceRequired: true, redFlags: null });
  assertEquals(gate.reason.length > 0, true);
});

Deno.test("buildExcludedZones: unione normalizzata, dedupe, ordinata", () => {
  assertEquals(buildExcludedZones([" Spalle ", "ginocchio"], ["GINOCCHIO", "anca"]), [
    "anca",
    "ginocchio",
    "spalle",
  ]);
  assertEquals(buildExcludedZones(null, []), []);
  assertEquals(buildExcludedZones(undefined, ["  "]), []);
});

// ---------------------------------------------------------------------------
// S1 — goal ed esperienza
// ---------------------------------------------------------------------------

Deno.test("normalizeGoal: sinonimi -> canonico, default ipertrofia", () => {
  assertEquals(normalizeGoal("Potenza-Forza"), "forza");
  assertEquals(normalizeGoal("STRENGTH block"), "forza");
  assertEquals(normalizeGoal("Ricomposizione corporea"), "ipertrofia");
  assertEquals(normalizeGoal("massa muscolare"), "ipertrofia");
  assertEquals(normalizeGoal("boh"), "ipertrofia");
});

Deno.test("normalizeExperience: canonico > derivazione da training_age > default", () => {
  assertEquals(normalizeExperience("Avanzato", null), "avanzato");
  assertEquals(normalizeExperience("principiante", null), "principiante");
  assertEquals(normalizeExperience(null, "6 anni di palestra"), "avanzato");
  assertEquals(normalizeExperience(null, "3 mesi"), "principiante");
  assertEquals(normalizeExperience(null, "un po'"), "intermedio");
  assertEquals(normalizeExperience("expert", null), "intermedio");
});

// ---------------------------------------------------------------------------
// S2 — split e clamp
// ---------------------------------------------------------------------------

Deno.test(
  "split: N giorni -> N sedute, day_index sequenziale, slot pieni con libreria completa",
  () => {
    const expectedSlotCounts: Record<number, number[]> = {
      1: [5],
      2: [4, 5],
      3: [4, 4, 5],
      4: [4, 4, 4, 4],
      5: [4, 4, 4, 4, 4],
      6: [4, 4, 4, 4, 4, 4],
    };
    for (let n = 1; n <= 6; n++) {
      const result = assembleWeek(input({ daysPerWeek: n }));
      assertEquals(result.days.length, n, `attesi ${n} giorni`);
      assertEquals(
        result.days.map((d) => d.exercises.length),
        expectedSlotCounts[n],
        `slot pieni per ${n} giorni`,
      );
      assertEquals(
        result.days.map((d) => d.day_index),
        Array.from({ length: n }, (_, i) => i),
      );
    }
  },
);

Deno.test("daysPerWeek fuori range: aggancio a [1,6]", () => {
  assertEquals(assembleWeek(input({ daysPerWeek: 0 })).days.length, 1);
  assertEquals(assembleWeek(input({ daysPerWeek: 9 })).days.length, 6);
});

Deno.test("giorno 2-day: ordine slot da tabella (compound prima, accessori dopo)", () => {
  const result = assembleWeek(input({ daysPerWeek: 2 }));
  assertEquals(
    result.days[0].exercises.map((e) => e.name),
    ["Back Squat", "Romanian Deadlift", "Walking Lunge", "Pallof Press"],
  );
  assertEquals(result.days[0].day_name, "Giorno 1 · Lower");
  assertEquals(result.days[0].focus, "Forza · Lower");
});

// ---------------------------------------------------------------------------
// S3 — numeri, %1RM dalla Tabella, seed neurotipo
// ---------------------------------------------------------------------------

Deno.test("carico: %1RM SOLO dalla Tabella se esiste un 1RM per il movimento, else RPE", () => {
  const withRm = assembleWeek(
    input({ daysPerWeek: 1, oneRmData: { "Back Squat": { estimated_1rm: 140 } } }),
  );
  const day = withRm.days[0];
  // Primary forza: 4x4 @RPE7 -> percent1RM(7,4) = 86.2 (dalla Tabella, mai formule).
  assertEquals(day.exercises[0].name, "Back Squat");
  assertEquals(day.exercises[0].load, `${percent1RM(7, 4)}%`);
  assertEquals(day.exercises[0].load, "86.2%");
  assertEquals(day.exercises[0].sets, 4);
  assertEquals(day.exercises[0].reps, "4");
  assertEquals(day.exercises[0].rpe, 7);
  assertEquals(day.exercises[0].rest_seconds, 180);
  // Senza 1RM per il movimento -> prescrizione RPE pura.
  assertEquals(day.exercises[1].load, "RPE 7");

  const withoutRm = assembleWeek(input({ daysPerWeek: 1 }));
  assertEquals(withoutRm.days[0].exercises[0].load, "RPE 7");
});

Deno.test("numeri ipertrofia da tabella ruolo x goal", () => {
  const result = assembleWeek(input({ daysPerWeek: 1, focusGoal: "massa" }));
  const [primary, secondary, , , accessory] = result.days[0].exercises;
  assertEquals([primary.sets, primary.reps, primary.rpe, primary.rest_seconds], [3, "8", 8, 120]);
  assertEquals([secondary.sets, secondary.reps, secondary.rpe], [3, "12", 8]);
  assertEquals(
    [accessory.sets, accessory.reps, accessory.rpe, accessory.rest_seconds],
    [3, "15", 9, 45],
  );
});

Deno.test("seed neurotipo: restBias inclina i recuperi (lungo +30s, corto -15s, min 30s)", () => {
  // 1A: restBias 'lungo' -> forza primary 180+30=210.
  const r1a = assembleWeek(input({ daysPerWeek: 2, neurotype: "1A" }));
  assertEquals(r1a.days[0].exercises[0].rest_seconds, 210);
  // 2B: restBias 'corto' -> ipertrofia primary 120-15=105; accessory 45-15=30 (min rispettato).
  const r2b = assembleWeek(input({ daysPerWeek: 1, focusGoal: "ipertrofia", neurotype: "2B" }));
  assertEquals(r2b.days[0].exercises[0].rest_seconds, 105);
  assertEquals(r2b.days[0].exercises[4].rest_seconds, 30);
  // Neurotipo null: default di tabella, nessuna inclinazione.
  const rNull = assembleWeek(input({ daysPerWeek: 2, neurotype: null }));
  assertEquals(rNull.days[0].exercises[0].rest_seconds, 180);
});

// ---------------------------------------------------------------------------
// S4 — equipment, zone, rotazione, slot saltati
// ---------------------------------------------------------------------------

Deno.test(
  "parseEquipment: testo libero -> vocabolario; niente riconosciuto = tutto ammesso",
  () => {
    assertEquals(parseEquipment("Solo manubri e corpo libero, a casa"), [
      "corpo libero",
      "manubri",
    ]);
    assertEquals(parseEquipment("palestra super attrezzata!!"), []);
    assertEquals(parseEquipment(null), []);
    assertEquals(parseEquipment("   "), []);
  },
);

Deno.test("equipment limitato: il motore ripiega sugli esercizi fattibili", () => {
  const result = assembleWeek(input({ daysPerWeek: 2, equipmentRaw: "manubri e corpo libero" }));
  // Squat primary: Back Squat (bilanciere) non fattibile -> Goblet Squat (manubri).
  assertEquals(result.days[0].exercises[0].name, "Goblet Squat");
  assertEquals(result.days[0].exercises[0].exercise_id, "id-squat-2");
});

Deno.test("zona esclusa: gli slot senza candidati vengono saltati e annotati nel rationale", () => {
  const result = assembleWeek(input({ daysPerWeek: 2, excludedZones: ["spalle"] }));
  const upper = result.days[1];
  // Bench (secondary: spalle) e Overhead Press (muscles: spalle) fuori -> 2 slot saltati.
  const names = upper.exercises.map((e) => e.name);
  assertEquals(names.includes("Bench Press"), false);
  assertEquals(names.includes("Overhead Press"), false);
  assertEquals(names, ["Barbell Row", "Pull-Up", "Biceps Curl"]);
  assertEquals(result.rationale.includes("saltati"), true);
  assertEquals(result.rationale.includes("spalle"), true);
});

Deno.test(
  "slot ripetuti: rank successivo per non ripetere; varietà 'bassa' (tipo 3) ripete il gesto",
  () => {
    // 3 giorni: squat compare in G1 (primary) e G3 (secondary).
    const rotated = assembleWeek(input({ daysPerWeek: 3 }));
    const squatG1 = rotated.days[0].exercises[0];
    const squatG3 = rotated.days[2].exercises[0];
    assertEquals(squatG1.exercise_id, "id-squat-1");
    assertEquals(squatG3.exercise_id, "id-squat-2");

    // Neurotipo 3: varietyTolerance bassa -> stesso esercizio su entrambe le esposizioni.
    const repeated = assembleWeek(input({ daysPerWeek: 3, neurotype: "3" }));
    assertEquals(repeated.days[0].exercises[0].exercise_id, "id-squat-1");
    assertEquals(repeated.days[2].exercises[0].exercise_id, "id-squat-1");
  },
);

// ---------------------------------------------------------------------------
// Determinismo e contratto d'uscita
// ---------------------------------------------------------------------------

Deno.test("determinismo: doppia esecuzione e candidati shufflati -> stesso output", () => {
  const base = input({
    daysPerWeek: 4,
    neurotype: "2A",
    oneRmData: { "Back Squat": { estimated_1rm: 120 } },
  });
  const a = assembleWeek(base);
  const b = assembleWeek(base);
  const c = assembleWeek({ ...base, candidates: [...LIBRARY].reverse() });
  assertEquals(a, b);
  assertEquals(a, c);
});

Deno.test("contratto: ogni esercizio ha tutti i campi, note in italiano, exercise_id reale", () => {
  const result = assembleWeek(input({ daysPerWeek: 6 }));
  for (const day of result.days) {
    assertEquals(typeof day.day_name, "string");
    assertEquals(day.day_name.startsWith("Giorno "), true);
    for (const ex of day.exercises) {
      assertEquals(typeof ex.exercise_id, "string");
      assertEquals(ex.exercise_id.length > 0, true);
      assertEquals(ex.exercise_id.startsWith("id-"), true, "id dalla fixture, mai sentinel");
      assertEquals(typeof ex.name, "string");
      assertEquals(ex.sets > 0, true);
      assertEquals(typeof ex.reps, "string");
      assertEquals(typeof ex.load, "string");
      assertEquals(ex.rpe >= 1 && ex.rpe <= 10, true);
      assertEquals(ex.rest_seconds >= 30, true);
      assertEquals(ex.notes.length > 0, true);
    }
  }
  assertEquals(result.rationale.length > 0, true);
  assertEquals(result.rationale.includes("Riscaldamento funzionale"), true);
});

Deno.test("mode 'continue': il rationale segnala l'autoregolazione futura", () => {
  const result = assembleWeek(input({ mode: "continue" }));
  assertEquals(result.rationale.includes("progressione"), true);
});
