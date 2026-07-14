// =============================================================================
// src/features/intake/state.ts
// =============================================================================
// Shape of the in-progress intake form state. Paths mirror the payload
// contract 1:1 (validate.ts), so the config's `path` works on both sides.
// Booleans start undefined on purpose: forced-choice questions have no
// default ("the empty answer is NOT a datum", contract §E). Numeric inputs
// are kept as strings while typing; buildPayload converts them.
// =============================================================================

import type { CanonicalZone, ConsentType, InjuryStatus, ParqKey } from "./config/labels";

export type CoachingMode = "coached" | "autonomous";

export interface BoolDetailState {
  has?: boolean;
  detail: string;
}

export interface InjuryDraft {
  zone: CanonicalZone | "";
  status: InjuryStatus | "";
  injury_date: string;
  note: string;
}

export interface IntakeFormState {
  anagrafica: {
    full_name: string;
    sex: string;
    pronoun: string;
    birth_date: string;
    phone: string;
    tax_code: string;
    address: string;
    height_cm: string;
    weight_kg: string;
  };
  parq: Partial<Record<ParqKey, boolean>>;
  pain: {
    pain_now?: boolean;
    pain_where: string;
    pain_gesture?: boolean;
    pain_gesture_desc: string;
    pain_gesture_zone: string;
  };
  weight_loss_unintentional?: boolean;
  condition: BoolDetailState;
  medications: BoolDetailState;
  safety_allergy: BoolDetailState;
  dca: { q1?: boolean; q2?: boolean; q3?: boolean };
  lifestyle: Record<string, string>;
  training: Record<string, string>;
  goals: Record<string, string>;
  logistics: Record<string, string>;
  nutrition: Record<string, string>;
  equipment: { text: string; items: string[] };
  readiness: { importance?: number; confidence?: number };
  objective: string;
  /** q01..q30 -> letter "A".."E" */
  neurotype: Record<string, string>;
  consents: Partial<Record<ConsentType, boolean>>;
  injuries: InjuryDraft[];
  cycle: { pregnancy: string; cycle_status: string; cycle_since: string };
}

export function createEmptyIntakeState(): IntakeFormState {
  return {
    anagrafica: {
      full_name: "",
      sex: "",
      pronoun: "",
      birth_date: "",
      phone: "",
      tax_code: "",
      address: "",
      height_cm: "",
      weight_kg: "",
    },
    parq: {},
    pain: { pain_where: "", pain_gesture_desc: "", pain_gesture_zone: "" },
    condition: { detail: "" },
    medications: { detail: "" },
    safety_allergy: { detail: "" },
    dca: {},
    lifestyle: {},
    training: {},
    goals: {},
    logistics: {},
    nutrition: {},
    equipment: { text: "", items: [] },
    readiness: {},
    objective: "",
    neurotype: {},
    consents: {},
    injuries: [],
    cycle: { pregnancy: "", cycle_status: "", cycle_since: "" },
  };
}

/** Reads a dot-path (e.g. "pain.pain_now") from the form state. */
export function getAtPath(state: IntakeFormState, path: string): unknown {
  let cur: unknown = state;
  for (const key of path.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/** Immutably writes a dot-path into the form state (2 levels max by contract). */
export function setAtPath(state: IntakeFormState, path: string, value: unknown): IntakeFormState {
  const keys = path.split(".");
  if (keys.length === 1) {
    return { ...state, [keys[0]]: value };
  }
  const [head, ...rest] = keys;
  const parent = (state as unknown as Record<string, unknown>)[head];
  const updatedChild =
    rest.length === 1
      ? { ...(parent as Record<string, unknown>), [rest[0]]: value }
      : setAtPath(parent as IntakeFormState, rest.join("."), value);
  return { ...state, [head]: updatedChild };
}
