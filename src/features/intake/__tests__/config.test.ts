// =============================================================================
// Config invariants: the form structure is data, so its integrity is pinned
// here — enum sources resolve, labels cover every machine value, paths are
// unique, the 30 neurotype items keep count/order (positional scoring), and
// server error fields map back to a step.
// =============================================================================

import { describe, expect, it } from "vitest";
import {
  CONSENT_LABELS,
  CONSENT_TYPES,
  ENUM_LABELS,
  ENUMS,
  PARQ_KEYS,
  PARQ_LABELS,
  ZONE_LABELS,
  CANONICAL_ZONES,
} from "../config/labels";
import { INTAKE_STEPS, stepIdForServerField } from "../config/intakeForm";
import { enumValues } from "../config/model";
import {
  NEUROTYPE_ITEMS,
  NEUROTYPE_PAGES,
  NEUROTYPE_PER_PAGE,
  NEUROTYPE_SCALE,
  NEUROTYPE_TOTAL,
} from "../config/neurotypeItems";

describe("intake config invariants", () => {
  it("every enum field resolves to a non-empty single-source enum", () => {
    for (const step of INTAKE_STEPS) {
      for (const field of step.fields ?? []) {
        if (field.kind === "enum") {
          expect(field.enumKey, `${field.path} senza enumKey`).toBeTruthy();
          expect(enumValues(field.enumKey!).length, `${field.path}: enum vuoto`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("ENUM_LABELS covers exactly the machine values of every enum (both directions)", () => {
    for (const key of Object.keys(ENUMS)) {
      expect(ENUM_LABELS[key], `manca ENUM_LABELS.${key}`).toBeTruthy();
    }
    for (const [key, labels] of Object.entries(ENUM_LABELS)) {
      expect(new Set(Object.keys(labels))).toEqual(new Set(enumValues(key)));
    }
  });

  it("field paths are unique across all steps", () => {
    const paths = INTAKE_STEPS.flatMap((step) => (step.fields ?? []).map((field) => field.path));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("PAR-Q labels cover the 7 server keys; consents labels cover the 6 types; zones the 15", () => {
    expect(new Set(Object.keys(PARQ_LABELS))).toEqual(new Set(PARQ_KEYS));
    expect(new Set(Object.keys(CONSENT_LABELS))).toEqual(new Set(CONSENT_TYPES));
    expect(new Set(Object.keys(ZONE_LABELS))).toEqual(new Set(CANONICAL_ZONES));
  });

  it("neurotype: 30 items, 5 pages of 6, scale A-E, order checksums", () => {
    expect(NEUROTYPE_ITEMS).toHaveLength(NEUROTYPE_TOTAL);
    expect(NEUROTYPE_PAGES * NEUROTYPE_PER_PAGE).toBe(NEUROTYPE_TOTAL);
    expect(NEUROTYPE_SCALE.map((s) => s.letter)).toEqual(["A", "B", "C", "D", "E"]);
    // Positional checksums (scoring is by position — order is binding).
    expect(NEUROTYPE_ITEMS[0]).toBe("Quando sono in gruppo voglio esserne il leader.");
    expect(NEUROTYPE_ITEMS[29]).toBe(
      'Faccio fatica ad addormentarmi perché non riesco a "spegnere" il cervello.',
    );
  });

  it("server error fields map back to the owning step", () => {
    expect(stepIdForServerField("intake.anagrafica.height_cm")).toBe("anagrafica");
    expect(stepIdForServerField("consents")).toBe("consensi");
    expect(stepIdForServerField("consent_version")).toBe("consensi");
    expect(stepIdForServerField("injuries")).toBe("infortuni");
    expect(stepIdForServerField("cycle.pregnancy")).toBe("ciclo");
    expect(stepIdForServerField("intake.neurotype_answers")).toBe("neurotipo");
    expect(stepIdForServerField("intake.equipment.items")).toBe("attrezzatura");
    expect(stepIdForServerField("intake.goals")).toBe("obiettivi");
    expect(stepIdForServerField("intake.readiness")).toBe("readiness");
    expect(stepIdForServerField("intake.parq.heart")).toBe("parq");
    expect(stepIdForServerField("intake.dca.q2")).toBe("salute");
    expect(stepIdForServerField("intake.weight_loss_unintentional")).toBe("salute");
    expect(stepIdForServerField("intake.objective")).toBe("obiettivi");
  });
});
