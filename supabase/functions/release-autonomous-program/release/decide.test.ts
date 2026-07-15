// Falsifiable tests for the autonomous gate (decide.ts) — pure fixtures.
// The persisted safety shapes mirror the REAL writer (submit-intake/index.ts
// persists the key `yellow`, lesson M2: open the writer, don't imagine data).

import { assertEquals } from "jsr:@std/assert@1";
import {
  buildStopAlert,
  decideGate,
  parseSafetyBlock,
  REQUIRED_RELEASE_CONSENTS,
  resolveConsentState,
  STOP_CATALOG,
  stopFor,
} from "./decide.ts";
import type { ConsentRow, DecideGateInput } from "./decide.ts";

// --- fixtures ---------------------------------------------------------------

const consent = (type: string, granted: boolean, created_at: string): ConsentRow => ({
  consent_type: type,
  granted,
  created_at,
});

/** All three release consents granted at intake time. */
const ALL_CONSENTS: ConsentRow[] = [
  consent("health_required", true, "2026-07-14T10:00:00.000Z"),
  consent("non_medical_disclaimer", true, "2026-07-14T10:00:00.000Z"),
  consent("ai_processing", true, "2026-07-14T10:00:00.000Z"),
  consent("marketing", false, "2026-07-14T10:00:00.000Z"),
];

/** Healthy athlete: the canonical 4-key red_flags object, green light. */
const HEALTHY_FLAGS = {
  medical_clearance_required: false,
  medical_yes_questions: [],
  fms_exclusion_zones: [],
  reduced_systemic_volume: false,
};

/** Persisted shape written by submit-intake (key `yellow`, not yellowSignals). */
const GREEN_SAFETY = { level: "green", routed_out: false, reasons: [], yellow: [] };

function input(partial: Partial<DecideGateInput> = {}): DecideGateInput {
  return {
    consentRows: ALL_CONSENTS,
    medicalClearanceRequired: false,
    redFlags: HEALTHY_FLAGS,
    safety: GREEN_SAFETY,
    generalBlock: false,
    ...partial,
  };
}

// --- consent gate (art. 22) --------------------------------------------------

Deno.test("consenso: tutti e 3 granted -> proceed", () => {
  assertEquals(decideGate(input()), {
    outcome: "proceed",
    safetyLevelSnapshot: "green",
    yellowSignals: [],
  });
});

Deno.test("consenso: ai_processing mancante -> consent_required, non uno STOP clinico", () => {
  const rows = ALL_CONSENTS.filter((c) => c.consent_type !== "ai_processing");
  assertEquals(decideGate(input({ consentRows: rows })), {
    outcome: "consent_required",
    missing: ["ai_processing"],
  });
});

Deno.test("consenso: ledger append-only — l'ultima riga vince (revoca e ri-concessione)", () => {
  const revoked = [...ALL_CONSENTS, consent("ai_processing", false, "2026-07-15T09:00:00.000Z")];
  assertEquals(decideGate(input({ consentRows: revoked })), {
    outcome: "consent_required",
    missing: ["ai_processing"],
  });
  const regranted = [...revoked, consent("ai_processing", true, "2026-07-15T11:00:00.000Z")];
  assertEquals(decideGate(input({ consentRows: regranted })).outcome, "proceed");
  // Order independence: shuffled rows resolve identically.
  assertEquals(decideGate(input({ consentRows: [...regranted].reverse() })).outcome, "proceed");
});

Deno.test("consenso: ledger vuoto -> mancano tutti e 3, in ordine di lista", () => {
  assertEquals(decideGate(input({ consentRows: [] })), {
    outcome: "consent_required",
    missing: [...REQUIRED_RELEASE_CONSENTS],
  });
});

Deno.test(
  "ordine: consenso valutato PRIMA della clinica (entrambi sporchi -> consent_required)",
  () => {
    const result = decideGate(input({ consentRows: [], medicalClearanceRequired: true }));
    assertEquals(result.outcome, "consent_required");
  },
);

Deno.test("resolveConsentState: parità di timestamp -> vince l'ultima riga letta", () => {
  const state = resolveConsentState([
    consent("ai_processing", false, "2026-07-15T09:00:00.000Z"),
    consent("ai_processing", true, "2026-07-15T09:00:00.000Z"),
  ]);
  assertEquals(state.get("ai_processing"), true);
});

// --- clinical sequence ---------------------------------------------------------

Deno.test("intake incompleto: safety assente/malformato -> STOP medium senza referral", () => {
  for (const safety of [null, undefined, {}, { level: 42 }, { level: "verde" }, "green"]) {
    const result = decideGate(input({ safety }));
    // Literal pin (not stopFor: it reads the same catalog it would verify).
    assertEquals(
      result,
      {
        outcome: "stop",
        reason: "intake_incompleto",
        severity: "medium",
        medicalReferral: false,
      },
      JSON.stringify(safety),
    );
  }
});

Deno.test("clearance viva -> STOP high con referral medico", () => {
  assertEquals(decideGate(input({ medicalClearanceRequired: true })), {
    outcome: "stop",
    reason: "clearance_required",
    severity: "high",
    medicalReferral: true,
  });
});

Deno.test("red_flags con yes_questions -> STOP red_flags high con referral", () => {
  const flags = { ...HEALTHY_FLAGS, medical_yes_questions: ["parq_heart"] };
  assertEquals(decideGate(input({ redFlags: flags })), {
    outcome: "stop",
    reason: "red_flags",
    severity: "high",
    medicalReferral: true,
  });
});

Deno.test("red_flags legacy (array non vuoto) -> STOP red_flags (conservativo)", () => {
  assertEquals(decideGate(input({ redFlags: ["dolore toracico"] })).outcome, "stop");
});

Deno.test("semaforo giallo: level=yellow -> STOP high senza referral", () => {
  const safety = { level: "yellow", routed_out: false, reasons: [], yellow: ["pain_gesture"] };
  assertEquals(decideGate(input({ safety })), {
    outcome: "stop",
    reason: "semaforo_giallo",
    severity: "high",
    medicalReferral: false,
  });
});

Deno.test(
  "semaforo: snapshot red con gialli MA campi vivi ripuliti (clearance data) -> STOP giallo, non passa",
  () => {
    // Red snapshot derived from a since-cleared clearance still carries
    // yellow signals nobody reviewed: the release must NOT go through.
    const safety = {
      level: "red",
      routed_out: false,
      reasons: ["parq_heart"],
      yellow: ["cycle_flag"],
    };
    assertEquals(decideGate(input({ safety })).outcome, "stop");
    assertEquals(decideGate(input({ safety })), stopFor("semaforo_giallo"));
  },
);

Deno.test("snapshot red senza gialli e campi vivi ripuliti -> proceed (clearance riapre)", () => {
  const safety = { level: "red", routed_out: false, reasons: ["parq_heart"], yellow: [] };
  assertEquals(decideGate(input({ safety })), {
    outcome: "proceed",
    safetyLevelSnapshot: "red",
    yellowSignals: [],
  });
});

Deno.test("zona general -> STOP high con referral", () => {
  assertEquals(decideGate(input({ generalBlock: true })), {
    outcome: "stop",
    reason: "zona_general",
    severity: "high",
    medicalReferral: true,
  });
});

Deno.test("determinismo: stesso input -> stessa decisione", () => {
  const i = input({ safety: { level: "yellow", yellow: ["pain_gesture"] } });
  assertEquals(decideGate(i), decideGate(i));
});

// --- parseSafetyBlock ---------------------------------------------------------

Deno.test(
  "parseSafetyBlock: legge la chiave persistita `yellow` e il fallback `yellowSignals`",
  () => {
    assertEquals(parseSafetyBlock({ level: "green", yellow: ["a"] }), {
      level: "green",
      yellow: ["a"],
    });
    assertEquals(parseSafetyBlock({ level: "green", yellowSignals: ["b"] }), {
      level: "green",
      yellow: ["b"],
    });
    // Non-string entries are dropped, never crash the gate.
    assertEquals(parseSafetyBlock({ level: "green", yellow: ["a", 3, null] }), {
      level: "green",
      yellow: ["a"],
    });
    assertEquals(parseSafetyBlock({ yellow: [] }), null);
  },
);

// --- STOP catalog / alerts ------------------------------------------------------

Deno.test("settimana_vuota nel catalogo: medium, senza referral (guard post-assemblaggio)", () => {
  assertEquals(stopFor("settimana_vuota"), {
    outcome: "stop",
    reason: "settimana_vuota",
    severity: "medium",
    medicalReferral: false,
  });
});

Deno.test("buildStopAlert: colonne reali, messaggio IT sanitizzato, fallback nome", () => {
  for (const reason of Object.keys(STOP_CATALOG) as (keyof typeof STOP_CATALOG)[]) {
    const alert = buildStopAlert(reason, "Giulia Rossi");
    assertEquals(alert.type, "autonomous_gate_stop");
    assertEquals(["high", "medium", "low"].includes(alert.severity), true);
    assertEquals(alert.message.includes("Giulia Rossi"), true);
    assertEquals(alert.message.length > 0, true);
    // Sanitized: no machine codes / clinical details leak into the message.
    assertEquals(alert.message.includes("parq"), false);
  }
  assertEquals(buildStopAlert("red_flags", "  ").message.startsWith("L'atleta"), true);
});
