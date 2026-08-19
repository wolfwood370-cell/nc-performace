// Deterministic gate for the AUTONOMOUS release — pure module: no I/O, no
// Date, no randomness. Order (CORE §0, slice 2026-07-15): consent (art. 22)
// -> full clinical sequence -> traffic light -> general-zone. The empty-week
// guard runs AFTER assembly (index.ts) but shares the STOP catalog here so
// every STOP escalates the same way. CORE §0.8 (solo-ALZA-cautela): gates act
// on STRUCTURED fields only — free text never lowers caution, only raises it.
//
// Consolidation (Nick 2026-07-15): safetyGate already covers the LIVE
// clearance/red_flags fields, and the persisted safety.level='red' derives
// from them at submit time — so red is gated on the live fields (a coach
// clearance that resets them re-opens the athlete). Yellow signals have no
// resolution mechanism yet: any yellow (or a yellow-carrying red snapshot)
// STOPS, because no coach reviews an autonomous athlete silently.

import { GATE_CLEARANCE_REASON, safetyGate } from "../../_shared/method/assembleWeek.ts";
import { missingReleaseConsents, REQUIRED_RELEASE_CONSENTS } from "./consents.ts";
import type { ConsentRow } from "./consents.ts";

// Consent rules live in consents.ts (import-free single source shared with
// the FE); re-exported here so gate consumers keep a single entry point.
export {
  missingReleaseConsents,
  REQUIRED_RELEASE_CONSENTS,
  resolveConsentState,
} from "./consents.ts";
export type { ConsentRow } from "./consents.ts";

export type StopReason =
  | "intake_incompleto"
  | "clearance_required"
  | "red_flags"
  | "semaforo_giallo"
  | "zona_general"
  | "settimana_vuota";

export type Severity = "high" | "medium" | "low";

interface StopSpec {
  severity: Severity;
  medicalReferral: boolean;
  /** Coach-facing alert text (IT), sanitized: signals THAT a gate fired, never clinical detail. */
  alertMessage: (name: string) => string;
}

export const STOP_CATALOG: Record<StopReason, StopSpec> = {
  intake_incompleto: {
    severity: "medium",
    medicalReferral: false,
    alertMessage: (n) =>
      `${n} (autonomo): intake assente o non conforme — rilascio automatico fermato, serve la tua revisione.`,
  },
  clearance_required: {
    severity: "high",
    medicalReferral: true,
    alertMessage: (n) =>
      `${n} (autonomo): rilascio automatico fermato — serve valutazione con clearance prima del programma.`,
  },
  red_flags: {
    severity: "high",
    medicalReferral: true,
    alertMessage: (n) =>
      `${n} (autonomo): rilascio automatico fermato — segnali dal questionario da valutare prima del programma.`,
  },
  semaforo_giallo: {
    severity: "high",
    medicalReferral: false,
    alertMessage: (n) =>
      `${n} (autonomo): rilascio automatico fermato — segnali gialli dall'intake, serve la tua revisione.`,
  },
  zona_general: {
    severity: "high",
    medicalReferral: true,
    alertMessage: (n) =>
      `${n} (autonomo): rilascio automatico fermato — esclusione grossolana dallo screening, rimando allo specialista.`,
  },
  settimana_vuota: {
    severity: "medium",
    medicalReferral: false,
    alertMessage: (n) =>
      `${n} (autonomo): rilascio automatico fermato — nessun esercizio fattibile in libreria (attrezzatura/zone escluse).`,
  },
};

export interface StopDecision {
  outcome: "stop";
  reason: StopReason;
  severity: Severity;
  medicalReferral: boolean;
}

export type GateDecision =
  | { outcome: "consent_required"; missing: string[] }
  | StopDecision
  | { outcome: "proceed"; safetyLevelSnapshot: string; yellowSignals: string[] };

/** Uniform STOP builder — shared by decideGate and the post-assembly empty-week guard. */
export function stopFor(reason: StopReason): StopDecision {
  const spec = STOP_CATALOG[reason];
  return {
    outcome: "stop",
    reason,
    severity: spec.severity,
    medicalReferral: spec.medicalReferral,
  };
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const SAFETY_LEVELS = ["green", "yellow", "red"] as const;

/**
 * Parses the persisted intake safety block (onboarding_data.intake.safety).
 * The WRITER (submit-intake/index.ts) persists the key `yellow`; the TS field
 * on SafetyResult is `yellowSignals` — read both, defensively.
 */
export function parseSafetyBlock(safety: unknown): { level: string; yellow: string[] } | null {
  if (!isObj(safety) || typeof safety.level !== "string") return null;
  const raw = Array.isArray(safety.yellow)
    ? safety.yellow
    : Array.isArray(safety.yellowSignals)
      ? safety.yellowSignals
      : [];
  return { level: safety.level, yellow: raw.filter((x): x is string => typeof x === "string") };
}

export interface DecideGateInput {
  /** Raw consents ledger rows for the athlete (any order). */
  consentRows: ConsentRow[];
  /** LIVE profile columns (a coach clearance resets them). */
  medicalClearanceRequired: boolean;
  redFlags: unknown;
  /** Persisted snapshot onboarding_data.intake.safety (unknown shape at the boundary). */
  safety: unknown;
  /** hasGeneralBlock(excludedZones) computed by the caller (needs injuries I/O). */
  generalBlock: boolean;
  requiredConsents?: readonly string[];
}

export function decideGate(input: DecideGateInput): GateDecision {
  // 1) Consent gate (art. 22) — BEFORE any clinical evaluation.
  const required = input.requiredConsents ?? REQUIRED_RELEASE_CONSENTS;
  const missing = missingReleaseConsents(input.consentRows, required);
  if (missing.length > 0) return { outcome: "consent_required", missing };

  // 2) Intake snapshot must exist and be well-formed (deny-by-default).
  const safety = parseSafetyBlock(input.safety);
  if (!safety || !(SAFETY_LEVELS as readonly string[]).includes(safety.level)) {
    return stopFor("intake_incompleto");
  }

  // 3) Live clinical gate — same semantics as the Coached path (safetyGate).
  const gate = safetyGate({
    medicalClearanceRequired: input.medicalClearanceRequired,
    redFlags: input.redFlags,
  });
  if (gate.blocked) {
    return stopFor(gate.reason === GATE_CLEARANCE_REASON ? "clearance_required" : "red_flags");
  }

  // 4) Traffic light: in autonomous mode ANY yellow signal stops (no coach
  //    reads it otherwise) — including yellows carried by a red snapshot
  //    whose live fields were since cleared.
  if (safety.level === "yellow" || safety.yellow.length > 0) {
    return stopFor("semaforo_giallo");
  }

  // 5) Coarse FMS 'general' exclusion — same referral as the Coached path.
  if (input.generalBlock) return stopFor("zona_general");

  return { outcome: "proceed", safetyLevelSnapshot: safety.level, yellowSignals: [] };
}

/** Coach alert payload for a STOP — maps onto the REAL coach_alerts columns. */
export function buildStopAlert(
  reason: StopReason,
  athleteName: string,
): { type: string; severity: Severity; message: string } {
  const spec = STOP_CATALOG[reason];
  const name = athleteName.trim() || "L'atleta";
  return {
    type: "autonomous_gate_stop",
    severity: spec.severity,
    message: spec.alertMessage(name),
  };
}

/**
 * Audit row for a consent-refused automated release (art. 22 compliance
 * trail) — maps onto the REAL audit_log columns; metadata is NOT NULL in
 * schema, so it is always an object here. index.ts inserts this row AS-IS
 * (no remapping) so the unit pin covers the exact persisted shape.
 */
export function buildConsentBlockedAudit(
  athleteId: string,
  missing: string[],
): {
  actor_id: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  metadata: { missing: string[] };
} {
  return {
    actor_id: athleteId,
    actor_role: "athlete",
    action: "autonomous_release_consent_blocked",
    entity_type: "profile",
    entity_id: athleteId,
    metadata: { missing },
  };
}
