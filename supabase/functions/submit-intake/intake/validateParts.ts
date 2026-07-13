// Sub-validators for the non-intake blocks of the submit payload
// (consents, injuries, cycle, equipment, forced safety signals).
// Each returns Invalid on the first violation, or the sanitized value.

import { isCanonicalZone, isInjuryStatus } from "./zones.ts";
import {
  CONSENT_TYPES,
  ENUMS,
  fail,
  isBool,
  isDateStr,
  isObj,
  isText,
  LONG,
  SHORT,
} from "./validateSpec.ts";
import type { Invalid } from "./validateSpec.ts";

export interface ConsentRow {
  type: string;
  granted: boolean;
}

export function validateConsents(
  body: Record<string, unknown>,
): Invalid | { consents: ConsentRow[]; consentVersion: string } {
  const src = body.consents;
  if (!Array.isArray(src) || src.length !== CONSENT_TYPES.length) return fail("consents");
  const consents: ConsentRow[] = [];
  const seen = new Set<string>();
  for (const c of src) {
    if (!isObj(c) || typeof c.type !== "string" || !isBool(c.granted)) return fail("consents");
    if (!(CONSENT_TYPES as readonly string[]).includes(c.type) || seen.has(c.type)) {
      return fail("consents");
    }
    seen.add(c.type);
    consents.push({ type: c.type, granted: c.granted });
  }
  const granted = (t: string) => consents.some((c) => c.type === t && c.granted);
  // Cancello: senza salute + disclaimer l'intake non prosegue. Marketing mai
  // in pacchetto: e' una riga granulare come le altre.
  if (!granted("health_required") || !granted("non_medical_disclaimer")) {
    return { ok: false, error: "missing_required_consents" };
  }
  if (!isText(body.consent_version, 40) || (body.consent_version as string).trim() === "") {
    return fail("consent_version");
  }
  return { consents, consentVersion: (body.consent_version as string).trim() };
}

export interface InjuryRow {
  zone: string;
  status: string;
  injury_date?: string;
  note?: string;
}

export function validateInjuries(
  body: Record<string, unknown>,
): Invalid | { injuries: InjuryRow[] } {
  const src = body.injuries ?? [];
  if (!Array.isArray(src) || src.length > 30) return fail("injuries");
  const injuries: InjuryRow[] = [];
  for (const inj of src) {
    if (!isObj(inj) || !isCanonicalZone(inj.zone) || !isInjuryStatus(inj.status)) {
      return fail("injuries");
    }
    const row: InjuryRow = { zone: inj.zone, status: inj.status };
    if (inj.injury_date !== undefined && inj.injury_date !== null && inj.injury_date !== "") {
      if (!isDateStr(inj.injury_date)) return fail("injuries");
      row.injury_date = inj.injury_date;
    }
    if (inj.note !== undefined && inj.note !== null && inj.note !== "") {
      if (!isText(inj.note, 500)) return fail("injuries");
      row.note = (inj.note as string).trim();
    }
    injuries.push(row);
  }
  return { injuries };
}

export interface CycleBlock {
  pregnancy: string;
  cycle_status?: string;
  cycle_since?: string;
}

export function validateCycle(
  body: Record<string, unknown>,
  sex: string,
): Invalid | { cycle?: CycleBlock } {
  let cycle: CycleBlock | undefined;
  if (body.cycle !== undefined) {
    const c = body.cycle;
    if (!isObj(c)) return fail("cycle");
    if (typeof c.pregnancy !== "string" || !ENUMS.pregnancy.includes(c.pregnancy)) {
      return fail("cycle.pregnancy");
    }
    cycle = { pregnancy: c.pregnancy };
    if (c.cycle_status !== undefined && c.cycle_status !== null && c.cycle_status !== "") {
      if (typeof c.cycle_status !== "string" || !ENUMS.cycle_status.includes(c.cycle_status)) {
        return fail("cycle.cycle_status");
      }
      cycle.cycle_status = c.cycle_status;
    }
    if (c.cycle_since !== undefined && c.cycle_since !== null && c.cycle_since !== "") {
      if (!isText(c.cycle_since, SHORT)) return fail("cycle.cycle_since");
      cycle.cycle_since = (c.cycle_since as string).trim();
    }
    if (sex !== "femmina" && (cycle.pregnancy !== "na" || cycle.cycle_status !== undefined)) {
      return fail("cycle");
    }
  }
  // B2: sezione ciclo obbligatoria per le donne (popolazioni speciali §0).
  if (sex === "femmina" && (cycle === undefined || cycle.cycle_status === undefined)) {
    return fail("cycle");
  }
  return { cycle };
}

/** Equipment: contract free text (coached) and/or structured list (autonomous). */
export function validateEquipment(
  intake: Record<string, unknown>,
  mode: "coached" | "autonomous",
): Invalid | { equipment: Record<string, unknown> } {
  const equip = intake.equipment;
  if (!isObj(equip)) return fail("intake.equipment");
  const out: Record<string, unknown> = {};
  if (equip.text !== undefined && equip.text !== null && equip.text !== "") {
    if (!isText(equip.text, LONG)) return fail("intake.equipment.text");
    out.text = (equip.text as string).trim();
  }
  if (equip.items !== undefined) {
    if (
      !Array.isArray(equip.items) ||
      equip.items.length > 30 ||
      !equip.items.every((i) => isText(i, 60) && (i as string).trim() !== "")
    ) {
      return fail("intake.equipment.items");
    }
    out.items = equip.items.map((i) => (i as string).trim());
  }
  if (mode === "autonomous") {
    if (!Array.isArray(out.items) || out.items.length === 0) return fail("intake.equipment.items");
  } else if (out.text === undefined) {
    return fail("intake.equipment.text");
  }
  return { equipment: out };
}

export interface ForcedSignal {
  has: boolean;
  detail?: string;
}

/**
 * Forced yes/no + detail signals: the empty answer is NOT a datum (§E).
 * condition = diagnosed pathology (gate) · medications = note, never a gate ·
 * safety_allergy = coach data.
 */
export function validateForcedSignal(
  intake: Record<string, unknown>,
  key: "condition" | "medications" | "safety_allergy",
): Invalid | { signal: ForcedSignal } {
  const src = intake[key];
  if (!isObj(src) || !isBool(src.has)) return fail(`intake.${key}.has`);
  const signal: ForcedSignal = { has: src.has };
  if (src.has) {
    if (!isText(src.detail, LONG) || (src.detail as string).trim() === "") {
      return fail(`intake.${key}.detail`);
    }
    signal.detail = (src.detail as string).trim();
  }
  return { signal };
}
