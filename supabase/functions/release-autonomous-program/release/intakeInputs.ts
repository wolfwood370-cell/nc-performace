// Pure parser: onboarding_data (profiles jsonb) -> engine/gate inputs for the
// autonomous release. PROFILE-DRIVEN by design (invariant D1/security): the
// athlete never posts load/objective parameters — everything comes from the
// persisted intake, whose shapes are defined by the submit-intake writer
// (validate.ts whitelists + index.ts finalRecord). Defensive at every key:
// a malformed blob degrades to safe defaults, never crashes the gate.

import type { ReadinessSnapshot } from "./buildRelease.ts";

export const DEFAULT_DAYS_PER_WEEK = 3;

export interface IntakeInputs {
  /** True when onboarding_data.intake exists as an object. */
  intakePresent: boolean;
  /** Raw persisted intake.safety — parsed/judged by decideGate, not here. */
  safety: unknown;
  /** intake.readiness {importance, confidence} (0-10 ints) or null. */
  readiness: ReadinessSnapshot | null;
  /** intake.equipment.items (autonomous contract) — sanitized strings. */
  equipmentItems: string[];
  /** Free-text feed for the engine's parseEquipment (items joined, text fallback). */
  equipmentRaw: string | null;
  /** intake.training.max_days_week ("2".."6") -> int, default 3. */
  daysPerWeek: number;
  /** Legacy wizard fallback consumed by normalizeExperience. */
  trainingAge: string | null;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const isScore = (v: unknown): v is number =>
  typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 10;

export function parseIntakeInputs(onboardingData: unknown): IntakeInputs {
  const od = isObj(onboardingData) ? onboardingData : {};
  const intake = isObj(od.intake) ? od.intake : null;

  let readiness: ReadinessSnapshot | null = null;
  const r = intake && isObj(intake.readiness) ? intake.readiness : null;
  if (r && isScore(r.importance) && isScore(r.confidence)) {
    readiness = { importance: r.importance, confidence: r.confidence };
  }

  const equipment = intake && isObj(intake.equipment) ? intake.equipment : null;
  const equipmentItems = (Array.isArray(equipment?.items) ? equipment.items : [])
    .filter((i): i is string => typeof i === "string" && i.trim() !== "")
    .map((i) => i.trim());
  const equipmentText =
    typeof equipment?.text === "string" && equipment.text.trim() !== ""
      ? equipment.text.trim()
      : null;
  const equipmentRaw = equipmentItems.length > 0 ? equipmentItems.join(", ") : equipmentText;

  const training = intake && isObj(intake.training) ? intake.training : null;
  const daysParsed =
    typeof training?.max_days_week === "string" ? Number.parseInt(training.max_days_week, 10) : NaN;
  const daysPerWeek =
    Number.isInteger(daysParsed) && daysParsed >= 2 && daysParsed <= 6
      ? daysParsed
      : DEFAULT_DAYS_PER_WEEK;

  return {
    intakePresent: intake !== null,
    safety: intake?.safety,
    readiness,
    equipmentItems,
    equipmentRaw,
    daysPerWeek,
    trainingAge: typeof od.training_age === "string" ? od.training_age : null,
  };
}
