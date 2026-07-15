// Parity test: the FE display-only mirror (deriveGateStatus) must agree with
// the AUTHORITATIVE edge gate (decideGate) on every structured-state scenario
// — review finding 2026-07-15: the first mirror blocked forever on a red
// snapshot whose live fields had been cleared, while the gate re-opens.

import { describe, expect, it } from "vitest";
import { decideGate } from "../../../../supabase/functions/release-autonomous-program/release/decide.ts";
import type { ConsentRow } from "../../../../supabase/functions/release-autonomous-program/release/consents.ts";
import { deriveGateStatus } from "../gateStatus";
import type { GateStatusProfile } from "../gateStatus";

const ALL_CONSENTS: ConsentRow[] = [
  { consent_type: "health_required", granted: true, created_at: "2026-07-14T10:00:00.000Z" },
  { consent_type: "non_medical_disclaimer", granted: true, created_at: "2026-07-14T10:00:00.000Z" },
  { consent_type: "ai_processing", granted: true, created_at: "2026-07-14T10:00:00.000Z" },
];

const HEALTHY_FLAGS = {
  medical_clearance_required: false,
  medical_yes_questions: [],
  fms_exclusion_zones: [],
  reduced_systemic_volume: false,
};

function profile(overrides: {
  medical_clearance_required?: boolean;
  red_flags?: unknown;
  safety?: unknown;
}): GateStatusProfile {
  return {
    coaching_mode: "autonomous",
    onboarding_completed: true,
    medical_clearance_required: overrides.medical_clearance_required ?? false,
    red_flags: overrides.red_flags ?? HEALTHY_FLAGS,
    onboarding_data: overrides.safety === undefined ? {} : { intake: { safety: overrides.safety } },
  };
}

/** True when the authoritative gate STOPS on clinical grounds. */
function gateStops(p: GateStatusProfile): boolean {
  const od = p.onboarding_data as { intake?: { safety?: unknown } };
  const decision = decideGate({
    consentRows: ALL_CONSENTS,
    medicalClearanceRequired: p.medical_clearance_required === true,
    redFlags: p.red_flags,
    safety: od.intake?.safety,
    generalBlock: false,
  });
  return decision.outcome === "stop";
}

describe("deriveGateStatus — parità col gate autorevole (pendingReview <=> STOP clinico)", () => {
  const scenarios: { name: string; p: GateStatusProfile }[] = [
    {
      name: "green pulito",
      p: profile({ safety: { level: "green", routed_out: false, reasons: [], yellow: [] } }),
    },
    {
      name: "clearance viva",
      p: profile({
        medical_clearance_required: true,
        safety: { level: "red", reasons: ["parq_heart"], yellow: [] },
      }),
    },
    {
      name: "red_flags bloccanti",
      p: profile({
        red_flags: { ...HEALTHY_FLAGS, medical_yes_questions: ["parq_heart"] },
        safety: { level: "red", reasons: ["parq_heart"], yellow: [] },
      }),
    },
    {
      name: "semaforo giallo",
      p: profile({ safety: { level: "yellow", reasons: [], yellow: ["pain_gesture"] } }),
    },
    {
      name: "snapshot red RIPULITO (clearance data) senza gialli -> riapre",
      p: profile({ safety: { level: "red", reasons: ["parq_heart"], yellow: [] } }),
    },
    {
      name: "snapshot red ripulito MA con gialli residui -> resta chiuso",
      p: profile({ safety: { level: "red", reasons: ["parq_heart"], yellow: ["cycle_flag"] } }),
    },
    {
      name: "gialli sotto chiave legacy yellowSignals",
      p: profile({ safety: { level: "green", yellowSignals: ["cycle_flag"] } }),
    },
    { name: "intake assente", p: profile({ safety: undefined }) },
    { name: "safety malformata", p: profile({ safety: { level: "verde" } }) },
  ];

  for (const { name, p } of scenarios) {
    it(name, () => {
      expect(deriveGateStatus(p, ALL_CONSENTS).pendingReview).toBe(gateStops(p));
    });
  }

  it("missingConsents rispecchia la lista del gate (ai_processing mancante)", () => {
    const partial = ALL_CONSENTS.filter((c) => c.consent_type !== "ai_processing");
    expect(deriveGateStatus(profile({}), partial).missingConsents).toEqual(["ai_processing"]);
    expect(deriveGateStatus(profile({}), ALL_CONSENTS).missingConsents).toEqual([]);
  });
});
