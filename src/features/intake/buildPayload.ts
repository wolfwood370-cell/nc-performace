// =============================================================================
// src/features/intake/buildPayload.ts
// =============================================================================
// PURE mapping form-state -> submit-intake payload (contract: validate.ts).
// No I/O, no Date, no safety logic — the server recomputes every gate. The
// contract test asserts the output against the REAL server validator.
//
// Conventions verified against validate.ts / validateParts.ts:
//   - optional text/enum: omitted when empty (copySection skips "" anyway);
//   - forced booleans are passed through RAW (never coerced): an unanswered
//     question must fail validation, not silently become "no";
//   - texts are trimmed here because the server length-check runs pre-trim;
//   - cycle is omitted entirely for sex !== "femmina";
//   - nutrition is only included when the nutrition_advice consent is true;
//   - consents: exactly one row per CONSENT_TYPE, unchecked -> granted:false.
// =============================================================================

import { SCHEMA_VERSION } from "../../../supabase/functions/submit-intake/intake/validateSpec.ts";
import { CANONICAL_ZONES, CONSENT_TYPES, CONSENT_VERSION } from "./config/labels";
import type { IntakeFormState } from "./state";

export interface IntakePayload {
  schema_version: number;
  intake: Record<string, unknown>;
  consents: Array<{ type: string; granted: boolean }>;
  consent_version: string;
  injuries: Array<{ zone: string; status: string; injury_date?: string; note?: string }>;
  cycle?: { pregnancy: string; cycle_status?: string; cycle_since?: string };
}

/** Trimmed non-empty string, or undefined (omit). */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Comma-tolerant numeric parse ("82,5" -> 82.5). */
function num(value: string): number {
  return Number(String(value).trim().replace(",", "."));
}

/** Trims a flat text/enum section and drops empty keys; undefined if empty. */
function section(src: Record<string, string>): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(src)) {
    const v = text(value);
    if (v !== undefined) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function boolDetail(src: { has?: boolean; detail: string }): Record<string, unknown> {
  const out: Record<string, unknown> = { has: src.has };
  const detail = text(src.detail);
  if (src.has === true && detail !== undefined) out.detail = detail;
  return out;
}

export function buildIntakePayload(state: IntakeFormState): IntakePayload {
  const a = state.anagrafica;
  const anagrafica: Record<string, unknown> = {
    sex: a.sex,
    phone: a.phone.trim(),
    birth_date: a.birth_date,
    height_cm: num(a.height_cm),
    weight_kg: num(a.weight_kg),
  };
  const fullName = text(a.full_name);
  if (fullName !== undefined) anagrafica.full_name = fullName;
  if (a.pronoun) anagrafica.pronoun = a.pronoun;
  const taxCode = text(a.tax_code);
  if (taxCode !== undefined) anagrafica.tax_code = taxCode;
  const address = text(a.address);
  if (address !== undefined) anagrafica.address = address;

  const pain: Record<string, unknown> = {
    pain_now: state.pain.pain_now,
    pain_gesture: state.pain.pain_gesture,
  };
  const painWhere = text(state.pain.pain_where);
  if (state.pain.pain_now === true && painWhere !== undefined) pain.pain_where = painWhere;
  if (state.pain.pain_gesture === true) {
    const desc = text(state.pain.pain_gesture_desc);
    if (desc !== undefined) pain.pain_gesture_desc = desc;
    if ((CANONICAL_ZONES as readonly string[]).includes(state.pain.pain_gesture_zone)) {
      pain.pain_gesture_zone = state.pain.pain_gesture_zone;
    }
  }

  const intake: Record<string, unknown> = {
    anagrafica,
    parq: { ...state.parq },
    pain,
    weight_loss_unintentional: state.weight_loss_unintentional,
    condition: boolDetail(state.condition),
    medications: boolDetail(state.medications),
    safety_allergy: boolDetail(state.safety_allergy),
    dca: { ...state.dca },
    // goals is mandatory server-side even when only main_goal is filled.
    goals: section(state.goals) ?? {},
  };

  for (const name of ["lifestyle", "training", "logistics"] as const) {
    const out = section(state[name]);
    if (out !== undefined) intake[name] = out;
  }

  if (state.consents.nutrition_advice === true) {
    const nutrition = section(state.nutrition);
    if (nutrition !== undefined) intake.nutrition = nutrition;
  }

  const equipment: Record<string, unknown> = {};
  const equipmentText = text(state.equipment.text);
  if (equipmentText !== undefined) equipment.text = equipmentText;
  const items = state.equipment.items.map((item) => item.trim()).filter((item) => item !== "");
  if (items.length > 0) equipment.items = items;
  intake.equipment = equipment;

  if (
    typeof state.readiness.importance === "number" &&
    typeof state.readiness.confidence === "number"
  ) {
    intake.readiness = {
      importance: state.readiness.importance,
      confidence: state.readiness.confidence,
    };
  }

  if (state.objective) intake.objective = state.objective;

  if (Object.keys(state.neurotype).length > 0) {
    intake.neurotype_answers = { ...state.neurotype };
  }

  const payload: IntakePayload = {
    schema_version: SCHEMA_VERSION,
    intake,
    consents: CONSENT_TYPES.map((type) => ({ type, granted: state.consents[type] === true })),
    consent_version: CONSENT_VERSION,
    injuries: state.injuries
      .filter((injury) => injury.zone !== "" && injury.status !== "")
      .map((injury) => {
        const row: { zone: string; status: string; injury_date?: string; note?: string } = {
          zone: injury.zone,
          status: injury.status,
        };
        if (injury.injury_date) row.injury_date = injury.injury_date;
        const note = text(injury.note);
        if (note !== undefined) row.note = note;
        return row;
      }),
  };

  if (a.sex === "femmina") {
    const cycle: NonNullable<IntakePayload["cycle"]> = { pregnancy: state.cycle.pregnancy };
    if (state.cycle.cycle_status) cycle.cycle_status = state.cycle.cycle_status;
    const cycleSince = text(state.cycle.cycle_since);
    if (cycleSince !== undefined) cycle.cycle_since = cycleSince;
    payload.cycle = cycle;
  }

  // No mode parameter on purpose: coaching_mode only drives what the UI
  // collects; the server re-reads it from the profile and validates per-mode.
  return payload;
}
