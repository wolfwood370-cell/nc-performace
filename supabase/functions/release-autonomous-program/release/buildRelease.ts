// Pure builders for the immutable autonomous release (CORE §3.2) — no I/O,
// no Date, no randomness. index.ts assembles the week via the SHARED engine
// (_shared/method), then these builders shape the ledger row parts:
// conservative first block, program_document with STABLE ids, safety_context
// (art. 22 forensics) and the boundary validation of the document shape.

import type { AiProgramResult } from "../../_shared/method/assembleWeek.ts";
import type { EngineGoal } from "./objectiveDriver.ts";
import { REQUIRED_RELEASE_CONSENTS } from "./decide.ts";

/** program_document shape version — the program_releases.schema_version column. */
export const PROGRAM_SCHEMA_VERSION = 1;

/**
 * Nominal config version (program_releases.config_version). Wiring the real
 * method_config profile is DECLARED DEBT (CORE §7/B2): parameters below are
 * named in one point so the future config slice replaces them, not hunts them.
 */
export const CONFIG_VERSION = "v1";

/**
 * Readiness rule v1 (Nick 2026-07-15): psychological signals NEVER drive
 * absolute load. The only deterministic influence — and it can only SHRINK —
 * is a conservative first block when self-efficacy is very low.
 */
export const CONFIDENCE_CONSERVATIVE_THRESHOLD = 3;
export const CONSERVATIVE_MIN_SETS = 2;

export interface ReadinessSnapshot {
  importance: number | null;
  confidence: number | null;
}

export function isConservativeFirstBlock(
  readiness: ReadinessSnapshot | null,
  threshold: number = CONFIDENCE_CONSERVATIVE_THRESHOLD,
): boolean {
  return typeof readiness?.confidence === "number" && readiness.confidence <= threshold;
}

/**
 * Conservative first block: one set less per exercise, floor at
 * CONSERVATIVE_MIN_SETS. Volume only shrinks — RPE, reps and load are
 * untouched (no new method numbers). confidence 4-10 is standard: trust is
 * not capacity, a 9-10 never loads MORE.
 */
export function applyConservativeFirstBlock(program: AiProgramResult): AiProgramResult {
  return {
    days: program.days.map((day) => ({
      ...day,
      exercises: day.exercises.map((ex) => ({
        ...ex,
        // Never INCREASE volume: at or below the floor the prescription stays.
        sets: ex.sets <= CONSERVATIVE_MIN_SETS ? ex.sets : ex.sets - 1,
      })),
    })),
    rationale:
      program.rationale +
      " Primo blocco conservativo: volume ridotto per iniziare con margine (fiducia dichiarata bassa).",
  };
}

export interface ProgramDocumentExercise {
  /** Stable positional id (e.g. "s1-e2") — flows into workout/exercise logs. */
  item_id: string;
  exercise_id: string;
  name: string;
  sets: number;
  reps: string;
  load: string;
  rpe: number;
  rest_seconds: number;
  notes: string;
}

export interface ProgramDocumentDay {
  /** Stable positional id (e.g. "s1") — flows into workout logs. */
  session_id: string;
  day_index: number;
  day_name: string;
  focus: string;
  exercises: ProgramDocumentExercise[];
}

export interface ProgramDocument {
  version: number;
  goal: EngineGoal;
  days: ProgramDocumentDay[];
  rationale: string;
}

/** Engine output -> immutable snapshot with stable session/exercise ids. */
export function buildProgramDocument(program: AiProgramResult, goal: EngineGoal): ProgramDocument {
  return {
    version: PROGRAM_SCHEMA_VERSION,
    goal,
    days: program.days.map((day, dayIdx) => ({
      session_id: `s${dayIdx + 1}`,
      day_index: day.day_index,
      day_name: day.day_name,
      focus: day.focus,
      exercises: day.exercises.map((ex, exIdx) => ({
        item_id: `s${dayIdx + 1}-e${exIdx + 1}`,
        exercise_id: ex.exercise_id,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        load: ex.load,
        rpe: ex.rpe,
        rest_seconds: ex.rest_seconds,
        notes: ex.notes,
      })),
    })),
    rationale: program.rationale,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Boundary validation (invariant D3): the row is refused if the document does
 * not match PROGRAM_SCHEMA_VERSION's shape. A failure here is an internal bug
 * — the caller must NOT insert and must answer with a sanitized 500.
 */
export function validateProgramDocument(doc: unknown): doc is ProgramDocument {
  if (!isObj(doc)) return false;
  if (doc.version !== PROGRAM_SCHEMA_VERSION) return false;
  if (doc.goal !== "forza" && doc.goal !== "ipertrofia") return false;
  if (typeof doc.rationale !== "string" || doc.rationale.length === 0) return false;
  if (!Array.isArray(doc.days) || doc.days.length < 1 || doc.days.length > 6) return false;
  let totalExercises = 0;
  for (const day of doc.days) {
    if (!isObj(day)) return false;
    if (typeof day.session_id !== "string" || day.session_id.length === 0) return false;
    if (typeof day.day_index !== "number" || !Number.isInteger(day.day_index)) return false;
    if (typeof day.day_name !== "string" || typeof day.focus !== "string") return false;
    if (!Array.isArray(day.exercises)) return false;
    for (const ex of day.exercises) {
      if (!isObj(ex)) return false;
      if (typeof ex.item_id !== "string" || ex.item_id.length === 0) return false;
      if (typeof ex.exercise_id !== "string" || ex.exercise_id.length === 0) return false;
      if (typeof ex.name !== "string" || ex.name.length === 0) return false;
      if (typeof ex.sets !== "number" || !Number.isInteger(ex.sets) || ex.sets < 1) return false;
      if (typeof ex.reps !== "string" || typeof ex.load !== "string") return false;
      if (typeof ex.rpe !== "number" || ex.rpe < 1 || ex.rpe > 10) return false;
      if (typeof ex.rest_seconds !== "number" || ex.rest_seconds < 0) return false;
      if (typeof ex.notes !== "string") return false;
      totalExercises += 1;
    }
  }
  return totalExercises > 0;
}

export interface SafetyContextInput {
  consentVersion: string | null;
  safetyLevelSnapshot: string;
  excludedZones: { zone: string; tier: string }[];
  readiness: ReadinessSnapshot | null;
  conservativeApplied: boolean;
  objective: string | null;
  goalDriver: EngineGoal;
  daysPerWeek: number;
  equipmentItems: string[];
  experienceLevel: string | null;
  neurotype: string | null;
}

/**
 * safety_context (art. 22 forensics): the gate inputs and engine drivers as
 * EVALUATED at release time — enough to reconstruct the automated decision.
 * Machine codes only, no free text.
 */
export function buildSafetyContext(input: SafetyContextInput): Record<string, unknown> {
  return {
    schema: 1,
    consents: {
      required: [...REQUIRED_RELEASE_CONSENTS],
      all_granted: true,
      version: input.consentVersion,
    },
    clinical: {
      medical_clearance_required: false,
      red_flags_blocking: false,
      safety_level_snapshot: input.safetyLevelSnapshot,
      yellow_signals: [],
    },
    zones: {
      excluded: input.excludedZones,
      general_block: false,
    },
    readiness: {
      importance: input.readiness?.importance ?? null,
      confidence: input.readiness?.confidence ?? null,
      conservative_applied: input.conservativeApplied,
      confidence_threshold: CONFIDENCE_CONSERVATIVE_THRESHOLD,
    },
    engine: {
      objective: input.objective,
      goal_driver: input.goalDriver,
      days_per_week: input.daysPerWeek,
      equipment_items: input.equipmentItems,
      experience_level: input.experienceLevel,
      neurotype: input.neurotype,
      mode: "new",
    },
  };
}
