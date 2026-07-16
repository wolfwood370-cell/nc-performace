// =============================================================================
// Contract tests: form-state -> payload -> REAL server validator.
// The strongest assertion here is parity: every payload the client builds
// must satisfy validateIntakePayload (the actual module deployed in the
// submit-intake edge function), per mode. Shape details are then pinned
// individually so a revert of buildPayload rules fails loudly (mutation
// lesson, zonemap v18 retro).
// =============================================================================

import { describe, expect, it } from "vitest";
import { validateIntakePayload } from "../../../../supabase/functions/submit-intake/intake/validate.ts";
import { buildIntakePayload } from "../buildPayload";
import { CONSENT_TYPES, PARQ_KEYS } from "../config/labels";
import { NEUROTYPE_TOTAL, neurotypeKey } from "../config/neurotypeItems";
import { createEmptyIntakeState } from "../state";
import type { IntakeFormState } from "../state";

function coachedState(): IntakeFormState {
  const s = createEmptyIntakeState();
  s.anagrafica = {
    full_name: "Mario Rossi",
    sex: "maschio",
    pronoun: "tu_lui",
    birth_date: "1990-04-12",
    phone: "3331234567",
    tax_code: "",
    address: "",
    height_cm: "178",
    weight_kg: "82,5",
  };
  for (const key of PARQ_KEYS) s.parq[key] = false;
  s.pain.pain_now = false;
  s.pain.pain_gesture = false;
  s.weight_loss_unintentional = false;
  s.condition = { has: false, detail: "" };
  s.medications = { has: true, detail: "Multivitaminico giornaliero" };
  s.safety_allergy = { has: false, detail: "" };
  s.dca = { q1: false, q2: false, q3: false };
  s.goals = { main_goal: "Rimettermi in forma dopo anni di stop" };
  s.training = { experience_level: "intermedio", max_days_week: "3" };
  s.lifestyle = { stress_level: "medio", sleep_quality: "buona" };
  s.equipment.text = "Palestra attrezzata vicino casa";
  s.consents = {
    health_required: true,
    non_medical_disclaimer: true,
    nutrition_advice: false,
    photos_measurements: false,
    medical_sharing: false,
    marketing: false,
    ai_processing: false,
  };
  return s;
}

function autonomousState(): IntakeFormState {
  const s = coachedState();
  s.anagrafica.full_name = "Giulia Bianchi";
  s.anagrafica.sex = "femmina";
  s.anagrafica.pronoun = "tu_lei";
  s.cycle = { pregnancy: "no", cycle_status: "regolare", cycle_since: "" };
  s.equipment.text = "";
  s.equipment.items = ["bilanciere", "manubri", "panca "];
  s.objective = "forza";
  s.readiness = { importance: 8, confidence: 7 };
  for (let n = 1; n <= NEUROTYPE_TOTAL; n++) s.neurotype[neurotypeKey(n)] = "C";
  return s;
}

describe("buildIntakePayload — parity with the server validator", () => {
  it("coached state builds a payload the REAL validator accepts", () => {
    const result = validateIntakePayload(buildIntakePayload(coachedState()), "coached");
    expect(result.ok).toBe(true);
  });

  it("autonomous state builds a payload the REAL validator accepts", () => {
    const result = validateIntakePayload(buildIntakePayload(autonomousState()), "autonomous");
    expect(result.ok).toBe(true);
  });

  it("a coached payload does NOT pass autonomous validation (per-mode contract)", () => {
    const result = validateIntakePayload(buildIntakePayload(coachedState()), "autonomous");
    expect(result.ok).toBe(false);
  });

  it("ai_processing not granted stays opt-in: the intake payload is still valid", () => {
    const s = autonomousState(); // ai_processing: false in the fixture
    const payload = buildIntakePayload(s);
    const rows = payload.consents;
    expect(rows).toHaveLength(CONSENT_TYPES.length);
    expect(rows.find((r) => r.type === "ai_processing")?.granted).toBe(false);
    expect(validateIntakePayload(payload, "autonomous").ok).toBe(true);
  });

  it("missing required consents is rejected by the validator", () => {
    const s = coachedState();
    s.consents.health_required = false;
    const result = validateIntakePayload(buildIntakePayload(s), "coached");
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "missing_required_consents" });
  });
});

describe("buildIntakePayload — pinned shape rules", () => {
  it("cycle is omitted entirely for sex=maschio and present for femmina", () => {
    expect(buildIntakePayload(coachedState()).cycle).toBeUndefined();
    const cycle = buildIntakePayload(autonomousState()).cycle;
    expect(cycle).toEqual({ pregnancy: "no", cycle_status: "regolare" });
  });

  it("consents: exactly one row per type, in CONSENT_TYPES order, unchecked -> false", () => {
    const s = coachedState();
    delete s.consents.marketing; // never answered
    const rows = buildIntakePayload(s).consents;
    expect(rows.map((r) => r.type)).toEqual([...CONSENT_TYPES]);
    expect(rows.find((r) => r.type === "marketing")?.granted).toBe(false);
    expect(rows.find((r) => r.type === "health_required")?.granted).toBe(true);
  });

  it("consent_version sent to the server is pinned literally to the legal copy (hub-v2)", () => {
    expect(buildIntakePayload(coachedState()).consent_version).toBe("hub-v2");
  });

  it("nutrition is dropped without the nutrition_advice consent", () => {
    const s = coachedState();
    s.nutrition = { meals_desc: "3 pasti al giorno" };
    expect(buildIntakePayload(s).intake.nutrition).toBeUndefined();
    s.consents.nutrition_advice = true;
    expect(buildIntakePayload(s).intake.nutrition).toEqual({ meals_desc: "3 pasti al giorno" });
    const result = validateIntakePayload(buildIntakePayload(s), "coached");
    expect(result.ok).toBe(true);
  });

  it("boolDetail sends detail only when has=true", () => {
    const payload = buildIntakePayload(coachedState());
    expect(payload.intake.condition).toEqual({ has: false });
    expect(payload.intake.medications).toEqual({
      has: true,
      detail: "Multivitaminico giornaliero",
    });
  });

  it("pain gesture zone is included only when canonical", () => {
    const s = coachedState();
    s.pain.pain_gesture = true;
    s.pain.pain_gesture_desc = "Panca piana";
    s.pain.pain_gesture_zone = "spalla";
    let pain = buildIntakePayload(s).intake.pain as Record<string, unknown>;
    expect(pain.pain_gesture_zone).toBe("spalla");

    s.pain.pain_gesture_zone = ""; // «Altra zona / non so»
    pain = buildIntakePayload(s).intake.pain as Record<string, unknown>;
    expect(pain.pain_gesture_zone).toBeUndefined();
    expect(validateIntakePayload(buildIntakePayload(s), "coached").ok).toBe(true);
  });

  it("numeric inputs tolerate the Italian comma decimal", () => {
    const anagrafica = buildIntakePayload(coachedState()).intake.anagrafica as Record<
      string,
      unknown
    >;
    expect(anagrafica.weight_kg).toBe(82.5);
    expect(anagrafica.height_cm).toBe(178);
  });

  it("neurotype answers are letters keyed q01..q30 (all 30) and items are trimmed", () => {
    const payload = buildIntakePayload(autonomousState());
    const answers = payload.intake.neurotype_answers as Record<string, string>;
    expect(Object.keys(answers)).toHaveLength(NEUROTYPE_TOTAL);
    expect(answers.q01).toBe("C");
    expect(answers.q30).toBe("C");
    expect((payload.intake.equipment as Record<string, unknown>).items).toEqual([
      "bilanciere",
      "manubri",
      "panca",
    ]);
  });

  it("incomplete injury rows are dropped; complete ones keep optional fields", () => {
    const s = coachedState();
    s.injuries = [
      { zone: "ginocchio", status: "recovered", injury_date: "2023-05-01", note: " menisco " },
      { zone: "", status: "chronic", injury_date: "", note: "" },
    ];
    const payload = buildIntakePayload(s);
    expect(payload.injuries).toEqual([
      { zone: "ginocchio", status: "recovered", injury_date: "2023-05-01", note: "menisco" },
    ]);
    expect(validateIntakePayload(payload, "coached").ok).toBe(true);
  });

  it("empty optional sections are omitted, goals always present", () => {
    const payload = buildIntakePayload(coachedState());
    expect(payload.intake.logistics).toBeUndefined();
    expect(payload.intake.goals).toEqual({ main_goal: "Rimettermi in forma dopo anni di stop" });
  });

  it("cycle gate is on SEX, not on data presence: maschio with a filled cycle state omits it", () => {
    const s = coachedState(); // sex=maschio
    s.cycle = { pregnancy: "no", cycle_status: "regolare", cycle_since: "" };
    const payload = buildIntakePayload(s);
    expect(payload.cycle).toBeUndefined();
    expect(validateIntakePayload(payload, "coached").ok).toBe(true);
  });

  it("retracted pain answers suppress their stale details (art. 9 minimization)", () => {
    const s = coachedState();
    s.pain.pain_now = false;
    s.pain.pain_where = "Spalla destra"; // written, then answer changed to No
    s.pain.pain_gesture = false;
    s.pain.pain_gesture_desc = "Panca piana";
    s.pain.pain_gesture_zone = "spalla";
    const pain = buildIntakePayload(s).intake.pain as Record<string, unknown>;
    expect(pain.pain_where).toBeUndefined();
    expect(pain.pain_gesture_desc).toBeUndefined();
    expect(pain.pain_gesture_zone).toBeUndefined();
  });

  it("trims section-mapped and anagrafica texts pre-send (server length-check runs pre-trim)", () => {
    const s = coachedState();
    s.anagrafica.full_name = "  Mario Rossi  ";
    s.anagrafica.phone = " 3331234567 ";
    s.goals = { main_goal: "  Rimettermi in forma  " };
    s.lifestyle = { ...s.lifestyle, work_desc: "   " }; // whitespace-only -> pruned
    const payload = buildIntakePayload(s);
    const anagrafica = payload.intake.anagrafica as Record<string, unknown>;
    expect(anagrafica.full_name).toBe("Mario Rossi");
    expect(anagrafica.phone).toBe("3331234567");
    expect(payload.intake.goals).toEqual({ main_goal: "Rimettermi in forma" });
    expect((payload.intake.lifestyle as Record<string, unknown>).work_desc).toBeUndefined();
  });
});
