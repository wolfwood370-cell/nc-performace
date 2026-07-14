// =============================================================================
// src/features/intake/config/intakeForm.ts
// =============================================================================
// Entry point of the config-driven intake form: assembles the CORE steps
// (both modes) and the profile/autonomous steps, and maps server validation
// errors back to the owning step. Model types/helpers live in ./model,
// Italian copy + single-source machine values in ./labels.
// =============================================================================

import { CORE_STEPS } from "./stepsCore";
import { PROFILE_STEPS } from "./stepsProfile";
import type { StepDef } from "./model";

export const INTAKE_STEPS: StepDef[] = [...CORE_STEPS, ...PROFILE_STEPS];

/**
 * Maps a server validation error field (e.g. "intake.anagrafica.height_cm",
 * "consents", "cycle.pregnancy") to the step that owns it, for error jumps.
 * Returns null when the field cannot be attributed to a step.
 */
export function stepIdForServerField(field: string): string | null {
  const path = field.startsWith("intake.") ? field.slice("intake.".length) : field;
  if (path.startsWith("consents") || path.startsWith("consent_version")) return "consensi";
  if (path.startsWith("injuries")) return "infortuni";
  if (path.startsWith("cycle")) return "ciclo";
  if (path.startsWith("neurotype_answers")) return "neurotipo";
  for (const step of INTAKE_STEPS) {
    for (const fieldDef of step.fields ?? []) {
      if (path === fieldDef.path || path.startsWith(`${fieldDef.path}.`)) return step.id;
    }
  }
  const section = path.split(".")[0];
  for (const step of INTAKE_STEPS) {
    if ((step.fields ?? []).some((fieldDef) => fieldDef.path.startsWith(`${section}.`))) {
      return step.id;
    }
  }
  return null;
}
