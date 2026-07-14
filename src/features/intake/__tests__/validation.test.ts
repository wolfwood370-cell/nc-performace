// =============================================================================
// Mode-awareness and UX-validation tests: which steps/fields each
// coaching_mode sees, condition gating (sex, consents), and the per-step
// required checks — including the 5 neurotype pages (6 statements each).
// =============================================================================

import { describe, expect, it } from "vitest";
import { INTAKE_STEPS } from "../config/intakeForm";
import { neurotypeKey } from "../config/neurotypeItems";
import { createEmptyIntakeState } from "../state";
import { fieldVisible, stepErrors, visibleSteps } from "../validation";

const stepById = (id: string) => {
  const step = INTAKE_STEPS.find((s) => s.id === id);
  if (!step) throw new Error(`step ${id} non trovato`);
  return step;
};

describe("visibility per coaching_mode", () => {
  it("coached does NOT see readiness/neurotype; autonomous does not see logistica", () => {
    const state = createEmptyIntakeState();
    const coachedIds = visibleSteps(INTAKE_STEPS, "coached", state).map((s) => s.id);
    const autonomousIds = visibleSteps(INTAKE_STEPS, "autonomous", state).map((s) => s.id);

    expect(coachedIds).not.toContain("readiness");
    expect(coachedIds).not.toContain("neurotipo-1");
    expect(coachedIds).toContain("logistica");

    expect(autonomousIds).toContain("readiness");
    for (let page = 1; page <= 5; page++) expect(autonomousIds).toContain(`neurotipo-${page}`);
    expect(autonomousIds).not.toContain("logistica");
  });

  it("ciclo appears only for sex=femmina; nutrizione only with the consent", () => {
    const state = createEmptyIntakeState();
    expect(visibleSteps(INTAKE_STEPS, "coached", state).map((s) => s.id)).not.toContain("ciclo");
    state.anagrafica.sex = "femmina";
    expect(visibleSteps(INTAKE_STEPS, "coached", state).map((s) => s.id)).toContain("ciclo");

    expect(visibleSteps(INTAKE_STEPS, "coached", state).map((s) => s.id)).not.toContain(
      "nutrizione",
    );
    state.consents.nutrition_advice = true;
    expect(visibleSteps(INTAKE_STEPS, "coached", state).map((s) => s.id)).toContain("nutrizione");
  });

  it("equipment: text only for coached, items only for autonomous", () => {
    const state = createEmptyIntakeState();
    const step = stepById("attrezzatura");
    const text = step.fields!.find((f) => f.path === "equipment.text")!;
    const items = step.fields!.find((f) => f.path === "equipment.items")!;
    expect(fieldVisible(text, "coached", state)).toBe(true);
    expect(fieldVisible(text, "autonomous", state)).toBe(false);
    expect(fieldVisible(items, "coached", state)).toBe(false);
    expect(fieldVisible(items, "autonomous", state)).toBe(true);
  });
});

describe("stepErrors", () => {
  it("forced booleans have no default: unanswered PAR-Q blocks the step", () => {
    const state = createEmptyIntakeState();
    const errors = stepErrors(stepById("parq"), "coached", state);
    expect(Object.keys(errors)).toHaveLength(7);
  });

  it("boolDetail requires the detail only when the answer is Sì", () => {
    const state = createEmptyIntakeState();
    state.condition = { has: true, detail: "" };
    state.medications = { has: false, detail: "" };
    state.safety_allergy = { has: false, detail: "" };
    state.weight_loss_unintentional = false;
    state.dca = { q1: false, q2: false, q3: false };
    const errors = stepErrors(stepById("salute"), "coached", state);
    expect(errors["condition"]).toBeTruthy();
    expect(errors["medications"]).toBeUndefined();
  });

  it("required consents gate the consensi step", () => {
    const state = createEmptyIntakeState();
    state.consents.health_required = true;
    const errors = stepErrors(stepById("consensi"), "coached", state);
    expect(Object.keys(errors)).toEqual(["consents.non_medical_disclaimer"]);
  });

  it("neurotype pages require exactly their own 6 statements", () => {
    const state = createEmptyIntakeState();
    for (let n = 1; n <= 6; n++) state.neurotype[neurotypeKey(n)] = "B";
    expect(stepErrors(stepById("neurotipo-1"), "autonomous", state)).toEqual({});
    const page2 = stepErrors(stepById("neurotipo-2"), "autonomous", state);
    expect(Object.keys(page2)).toHaveLength(6);
    expect(page2[`neurotype.${neurotypeKey(7)}`]).toBeTruthy();
  });

  it("touched injury rows must be complete; untouched rows do not block", () => {
    const state = createEmptyIntakeState();
    state.injuries = [
      { zone: "spalla", status: "", injury_date: "", note: "" },
      { zone: "", status: "", injury_date: "", note: "" },
    ];
    const errors = stepErrors(stepById("infortuni"), "coached", state);
    expect(errors["injuries.0.status"]).toBeTruthy();
    expect(errors["injuries.1.zone"]).toBeUndefined();
  });

  it("objective is required only in autonomous", () => {
    const state = createEmptyIntakeState();
    state.goals = { main_goal: "Stare meglio" };
    const coached = stepErrors(stepById("obiettivi"), "coached", state);
    const autonomous = stepErrors(stepById("obiettivi"), "autonomous", state);
    expect(coached["objective"]).toBeUndefined();
    expect(autonomous["objective"]).toBeTruthy();
  });
});
