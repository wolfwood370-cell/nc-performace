// =============================================================================
// src/features/intake/validation.ts
// =============================================================================
// Client-side UX validation ONLY: visibility resolution (mode + declarative
// conditions) and per-step required/range checks so the athlete gets
// immediate feedback. The server validator stays authoritative — nothing
// here weakens or replaces it (no gate/scoring logic).
// =============================================================================

import { isDateStr } from "../../../supabase/functions/submit-intake/intake/validateSpec.ts";
import { REQUIRED_CONSENTS } from "./config/labels";
import { appliesTo } from "./config/model";
import type { Condition, FieldDef, ModeFilter, StepDef } from "./config/model";
import { NEUROTYPE_TOTAL, neurotypeKey } from "./config/neurotypeItems";
import { getAtPath } from "./state";
import type { BoolDetailState, CoachingMode, IntakeFormState } from "./state";

const MSG_CHOOSE = "Scegli una risposta.";
const MSG_REQUIRED = "Campo obbligatorio.";

export function conditionMet(cond: Condition | undefined, state: IntakeFormState): boolean {
  if (!cond) return true;
  const value = getAtPath(state, cond.path);
  if (cond.equals !== undefined) return value === cond.equals;
  if (cond.oneOf !== undefined) return cond.oneOf.includes(value);
  return true;
}

export function fieldVisible(field: FieldDef, mode: CoachingMode, state: IntakeFormState): boolean {
  return appliesTo(field.visibleFor, mode) && conditionMet(field.visibleWhen, state);
}

export function stepVisible(step: StepDef, mode: CoachingMode, state: IntakeFormState): boolean {
  return appliesTo(step.visibleFor, mode) && conditionMet(step.visibleWhen, state);
}

export function visibleSteps(
  steps: StepDef[],
  mode: CoachingMode,
  state: IntakeFormState,
): StepDef[] {
  return steps.filter((step) => stepVisible(step, mode, state));
}

function isRequired(filter: ModeFilter | "none", mode: CoachingMode): boolean {
  return filter !== "none" && appliesTo(filter, mode);
}

/** Error message for a single visible field, or null when it is fine. */
export function fieldError(
  field: FieldDef,
  mode: CoachingMode,
  state: IntakeFormState,
): string | null {
  const value = getAtPath(state, field.path);
  const required = isRequired(field.requiredFor, mode);

  switch (field.kind) {
    case "bool":
      return required && typeof value !== "boolean" ? MSG_CHOOSE : null;
    case "boolDetail": {
      const v = value as BoolDetailState | undefined;
      if (required && typeof v?.has !== "boolean") return MSG_CHOOSE;
      if (v?.has === true && v.detail.trim() === "") return "Aggiungi qualche dettaglio.";
      return null;
    }
    case "enum":
      return required && !(value as string) ? MSG_CHOOSE : null;
    case "zone":
      return required && !(value as string) ? MSG_CHOOSE : null;
    case "scale":
      return required && typeof value !== "number" ? MSG_CHOOSE : null;
    case "date": {
      const s = ((value as string) ?? "").trim();
      if (s === "") return required ? MSG_REQUIRED : null;
      // Server-side isDateStr (single-source): format + year range 1900-2100.
      return isDateStr(s) ? null : "Data non valida.";
    }
    case "number": {
      const s = ((value as string) ?? "").trim();
      if (s === "") return required ? MSG_REQUIRED : null;
      const n = Number(s.replace(",", "."));
      if (!Number.isFinite(n)) return "Inserisci un numero.";
      if (field.min !== undefined && field.max !== undefined && (n < field.min || n > field.max)) {
        return `Inserisci un valore fra ${field.min} e ${field.max}.`;
      }
      return null;
    }
    case "stringList": {
      const items = ((value as string[]) ?? []).filter((item) => item.trim() !== "");
      return required && items.length === 0 ? "Aggiungi almeno una voce." : null;
    }
    case "text":
    case "longtext": {
      const s = ((value as string) ?? "").trim();
      return required && s === "" ? MSG_REQUIRED : null;
    }
  }
}

/**
 * Errors for a whole step, keyed by field path (or a synthetic key for the
 * non-field step kinds). Empty object = step complete.
 */
export function stepErrors(
  step: StepDef,
  mode: CoachingMode,
  state: IntakeFormState,
): Record<string, string> {
  const errors: Record<string, string> = {};

  if (step.kind === "fields") {
    for (const field of step.fields ?? []) {
      if (!fieldVisible(field, mode, state)) continue;
      const error = fieldError(field, mode, state);
      if (error) errors[field.path] = error;
    }
    return errors;
  }

  if (step.kind === "consents") {
    for (const type of REQUIRED_CONSENTS) {
      if (state.consents[type] !== true) {
        errors[`consents.${type}`] = "Consenso necessario per proseguire.";
      }
    }
    return errors;
  }

  if (step.kind === "injuries") {
    state.injuries.forEach((injury, index) => {
      const touched =
        injury.zone !== "" ||
        injury.status !== "" ||
        injury.injury_date !== "" ||
        injury.note !== "";
      if (!touched) return;
      if (injury.zone === "") errors[`injuries.${index}.zone`] = "Scegli la zona.";
      if (injury.status === "") errors[`injuries.${index}.status`] = "Scegli lo stato.";
      if (injury.injury_date !== "" && !isDateStr(injury.injury_date)) {
        errors[`injuries.${index}.injury_date`] = "Data non valida.";
      }
    });
    return errors;
  }

  // neurotype: every statement of the step's page range must be answered.
  const from = (step.page ?? 0) * 6 + 1;
  const to = Math.min(from + 5, NEUROTYPE_TOTAL);
  for (let n = from; n <= to; n++) {
    const key = neurotypeKey(n);
    if (!state.neurotype[key]) errors[`neurotype.${key}`] = MSG_CHOOSE;
  }
  return errors;
}
