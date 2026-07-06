// Test falsificabili per exerciseSelection.ts — fixtures in-memory, nessun DB.
// Coprono: filtri duri (pattern, equipment, complessità, zone), punteggio pesato,
// NULL = mai esclusione, tie-break e determinismo.

import { assertEquals } from "jsr:@std/assert@1";
import { hardFilterReasons, rankExercises, WEIGHTS } from "./exerciseSelection.ts";
import { NEUTRAL_SEED, neurotypeSeed } from "./neurotypeSeed.ts";
import type { ExerciseRow, SelectionCriteria } from "./types.ts";

// ---------------------------------------------------------------------------
// Fixtures: righe finte ma con la forma REALE di public.exercises.
// ---------------------------------------------------------------------------

function row(partial: Partial<ExerciseRow> & { os_id: string; name: string }): ExerciseRow {
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
  os_id: "OS-001",
  name: "Back squat",
  movement_pattern: "squat",
  equipment: ["bilanciere"],
  execution_mode: "grind",
  suited_rep_range: "forza",
  fatigue_cost: "alto",
  technical_complexity: "media",
  stability_demand: "bassa",
  muscles: ["quadricipiti", "glutei"],
  secondary_muscles: ["core"],
});

const gobletSquat = row({
  os_id: "OS-002",
  name: "Goblet squat",
  movement_pattern: "squat",
  equipment: ["manubri"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  fatigue_cost: "basso",
  technical_complexity: "bassa",
  stability_demand: "media",
  muscles: ["quadricipiti", "glutei"],
});

// Pattern coperto SOLO via patterns[] (movement_pattern null).
const jumpSquat = row({
  os_id: "OS-003",
  name: "Jump squat",
  exercise_family: "pliometrico",
  patterns: ["squat"],
  equipment: ["corpo libero"],
  execution_mode: "balistico",
  technical_complexity: "media",
  muscles: ["quadricipiti"],
});

const pistolSquat = row({
  os_id: "OS-004",
  name: "Pistol squat",
  movement_pattern: "squat",
  equipment: ["corpo libero"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  technical_complexity: "alta",
  laterality: "unilaterale",
  stability_demand: "alta",
  muscles: ["quadricipiti", "glutei"],
});

// Import "MM*": enum arricchiti tutti NULL = sconosciuto, mai esclusione.
const mmSquat = row({
  os_id: "OS-005",
  name: "MM squat import",
  movement_pattern: "squat",
  equipment: [],
});

const legExtension = row({
  os_id: "OS-006",
  name: "Leg extension",
  movement_pattern: "isolamento",
  equipment: ["macchina"],
  muscles: ["quadricipiti"],
});

const benchPress = row({
  os_id: "OS-007",
  name: "Panca piana",
  movement_pattern: "push orizzontale",
  equipment: ["bilanciere", "panca"],
  execution_mode: "grind",
  suited_rep_range: "entrambi",
  muscles: ["pettorali"],
  secondary_muscles: ["spalle", "tricipiti"],
});

const SQUAT_POOL = [backSquat, gobletSquat, jumpSquat, pistolSquat, mmSquat, legExtension];

function criteria(partial: Partial<SelectionCriteria> = {}): SelectionCriteria {
  return {
    pattern: "squat",
    availableEquipment: [],
    experienceLevel: "intermedio",
    goalRepRange: "forza",
    neurotype: NEUTRAL_SEED,
    excludedZones: [],
    ...partial,
  };
}

const osIds = (ranked: ReturnType<typeof rankExercises>) => ranked.map((r) => r.exercise.os_id);

// ---------------------------------------------------------------------------
// Filtri duri
// ---------------------------------------------------------------------------

Deno.test("pattern: matcha movement_pattern O patterns[]; gli altri sono esclusi", () => {
  const ranked = rankExercises(SQUAT_POOL, criteria());
  const ids = osIds(ranked);
  assertEquals(ids.includes("OS-003"), true, "jump squat copre 'squat' via patterns[]");
  assertEquals(ids.includes("OS-006"), false, "leg extension (isolamento) fuori");
  assertEquals(hardFilterReasons(legExtension, criteria()).length > 0, true);
});

Deno.test("equipment: subset degli attrezzi disponibili; vuoto = tutto ammesso", () => {
  // Solo manubri + corpo libero: il bilanciere non c'è.
  const limited = criteria({ availableEquipment: ["manubri", "corpo libero"] });
  const ids = osIds(rankExercises(SQUAT_POOL, limited));
  assertEquals(ids.includes("OS-001"), false, "back squat richiede bilanciere");
  assertEquals(ids.includes("OS-002"), true);
  assertEquals(ids.includes("OS-003"), true);
  assertEquals(ids.includes("OS-005"), true, "equipment [] = nessun attrezzo richiesto");

  // Lista vuota = palestra completa.
  const full = osIds(rankExercises(SQUAT_POOL, criteria()));
  assertEquals(full.includes("OS-001"), true);
});

Deno.test("complessità alta esclusa per principiante; NULL non esclude MAI", () => {
  const beginner = criteria({ experienceLevel: "principiante" });
  const ids = osIds(rankExercises(SQUAT_POOL, beginner));
  assertEquals(ids.includes("OS-004"), false, "pistol (alta) fuori per principiante");
  assertEquals(ids.includes("OS-005"), true, "complessità NULL resta dentro");
  // Per intermedio il pistol è fattibile.
  assertEquals(osIds(rankExercises(SQUAT_POOL, criteria())).includes("OS-004"), true);
});

Deno.test("zone escluse: ponte zonaMap (alias spalle->spalla, tier aggressivo)", () => {
  // spalle -> spalla; la panca (push orizzontale) cade sul pattern-cautela (tier aggressivo).
  const c = criteria({
    pattern: "push orizzontale",
    excludedZones: [{ zone: "spalle", tier: "aggressivo" }],
  });
  assertEquals(osIds(rankExercises([benchPress], c)), []);
  const reasons = hardFilterReasons(benchPress, c);
  assertEquals(reasons.length, 1);
  // Il motivo cita la zona CANONICA ('spalla'), non l'alias grezzo.
  assertEquals(reasons[0].includes("spalla"), true);

  // Zona non mappata che matcha il pattern stesso -> fallback sottostringa.
  const noSquat = criteria({ excludedZones: [{ zone: "squat", tier: "aggressivo" }] });
  assertEquals(osIds(rankExercises(SQUAT_POOL, noSquat)), []);

  // Nessuna zona = nessuna esclusione.
  assertEquals(hardFilterReasons(benchPress, criteria({ pattern: "push orizzontale" })), []);
});

// ---------------------------------------------------------------------------
// Punteggio (pesi documentati in WEIGHTS)
// ---------------------------------------------------------------------------

Deno.test("scoring per obiettivo forza: rep-range, esecuzione, stabilità", () => {
  const c = criteria({ preferredExecution: "grind" });
  const ranked = rankExercises(SQUAT_POOL, c);
  const byId = Object.fromEntries(ranked.map((r) => [r.exercise.os_id, r]));

  // Back squat: +2 (forza) +1 (grind) +1 (stabilità bassa su forza) = 4.
  assertEquals(
    byId["OS-001"].score,
    WEIGHTS.repRangeFit + WEIGHTS.executionMatch + WEIGHTS.stabilityFitForza,
  );
  // Goblet: +2 ('entrambi') +1 (grind) + 0 (stabilità media) = 3.
  assertEquals(byId["OS-002"].score, WEIGHTS.repRangeFit + WEIGHTS.executionMatch);
  // Pistol: +2 ('entrambi') +1 (grind) -1 (stabilità alta su forza) = 2.
  assertEquals(
    byId["OS-004"].score,
    WEIGHTS.repRangeFit + WEIGHTS.executionMatch + WEIGHTS.stabilityMismatchForza,
  );
  // MM import: tutti NULL = 0, ma dentro.
  assertEquals(byId["OS-005"].score, 0);
  // Ordine: back(4) > goblet(3) > pistol(2) > {jump, MM} a 0.
  assertEquals(osIds(ranked).slice(0, 3), ["OS-001", "OS-002", "OS-004"]);
});

Deno.test("scoring per obiettivo ipertrofia: fatigue_cost basso premiato, alto penalizzato", () => {
  const c = criteria({ goalRepRange: "ipertrofia" });
  const ranked = rankExercises(SQUAT_POOL, c);
  const byId = Object.fromEntries(ranked.map((r) => [r.exercise.os_id, r]));

  // Goblet: +2 ('entrambi') +1 (fatica bassa) = 3.
  assertEquals(byId["OS-002"].score, WEIGHTS.repRangeFit + WEIGHTS.fatigueFitIpertrofia);
  // Back squat: suited 'forza' non fitta 'ipertrofia' (0), fatica alta -1 = -1.
  assertEquals(byId["OS-001"].score, WEIGHTS.fatigueMismatchIpertrofia);
  // Su ipertrofia la stabilità non pesa: pistol = +2 e basta.
  assertEquals(byId["OS-004"].score, WEIGHTS.repRangeFit);
});

Deno.test("neurotipo: 1B premia il balistico (sinonimo 'esplosivo'), 2B lo penalizza", () => {
  // 1B: methodPref contiene 'balistico/esplosivo' -> jump squat +1.
  const c1b = criteria({ neurotype: neurotypeSeed("1B") });
  const jump1b = rankExercises([jumpSquat], c1b)[0];
  assertEquals(jump1b.score, WEIGHTS.neuroPref);
  assertEquals(
    jump1b.reasons.some((r) => r.includes("balistico/esplosivo")),
    true,
  );

  // 2B: avoid contiene 'esplosivo' -> sinonimo di 'balistico' -> jump squat -1.
  const c2b = criteria({ neurotype: neurotypeSeed("2B") });
  const jump2b = rankExercises([jumpSquat], c2b)[0];
  assertEquals(jump2b.score, WEIGHTS.neuroAvoid);

  // 1A: avoid 'alto volume di isolamento' matcha il pattern 'isolamento'.
  const c1a = criteria({ pattern: "isolamento", neurotype: neurotypeSeed("1A") });
  const leg1a = rankExercises([legExtension], c1a)[0];
  assertEquals(
    leg1a.reasons.some((r) => r.includes("isolamento")),
    true,
  );

  // Seed neutro: nessuna inclinazione.
  const jumpNeutral = rankExercises([jumpSquat], criteria())[0];
  assertEquals(jumpNeutral.score, 0);
});

// ---------------------------------------------------------------------------
// Determinismo
// ---------------------------------------------------------------------------

Deno.test("tie-break: a pari punteggio vince os_id ascendente", () => {
  const ranked = rankExercises(SQUAT_POOL, criteria());
  // jump (OS-003) e MM (OS-005) sono entrambi a 0 -> ordine per os_id.
  const zeros = ranked.filter((r) => r.score === 0).map((r) => r.exercise.os_id);
  assertEquals(zeros, ["OS-003", "OS-005"]);
});

Deno.test("determinismo: input shufflato e doppia esecuzione -> stesso output", () => {
  const c = criteria({ preferredExecution: "grind" });
  const shuffled = [...SQUAT_POOL].reverse();
  assertEquals(osIds(rankExercises(shuffled, c)), osIds(rankExercises(SQUAT_POOL, c)));
  assertEquals(rankExercises(SQUAT_POOL, c), rankExercises(SQUAT_POOL, c));
});

Deno.test("reasons: tracciano inclusione e provenienza del punteggio", () => {
  const c = criteria({ preferredExecution: "grind" });
  const top = rankExercises(SQUAT_POOL, c)[0];
  assertEquals(top.exercise.os_id, "OS-001");
  assertEquals(top.reasons[0].includes("incluso"), true);
  // 1 riga di inclusione + 3 voci di punteggio.
  assertEquals(top.reasons.length, 4);
});
