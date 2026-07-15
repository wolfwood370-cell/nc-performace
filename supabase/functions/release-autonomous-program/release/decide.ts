// Deterministic gate for the AUTONOMOUS release — pure module: no I/O, no
// Date, no randomness. Order (CORE §0, slice 2026-07-15): consent (art. 22)
// -> full clinical sequence -> traffic light -> general-zone. The empty-week
// guard runs AFTER assembly (index.ts) but shares the STOP catalog here so
// every STOP escalates the same way. Gates act on STRUCTURED fields only:
// free text never lowers caution.
//
// Consolidation (Nick 2026-07-15): safetyGate already covers the LIVE
// clearance/red_flags fields, and the persisted safety.level='red' derives
// from them at submit time — so red is gated on the live fields (a coach
// clearance that resets them re-opens the athlete). Yellow signals have no
// resolution mechanism yet: any yellow (or a yellow-carrying red snapshot)
// STOPS, because no coach reviews an autonomous athlete silently.

import { safetyGate, GATE_CLEARANCE_REASON } from "../../_shared/method/assembleWeek.ts";

/**
 * Consents required BEFORE an automated release (art. 22 GDPR — CORE §6
 * requires explicit consent for the autonomous automated decision).
 * ai_processing exists in the DB enum but is still parked in the intake
 * collection (validateSpec.ts CONSENT_TYPES): un-parking it is a declared
 * GO-LIVE blocker of this slice, tracked in HANDOFF.
 */
export const REQUIRED_RELEASE_CONSENTS = [
  "health_required",
  "non_medical_disclaimer",
  "ai_processing",
] as const;

/** Raw ledger row (consents table): current state = latest row per type. */
export interface ConsentRow {
  consent_type: string;
  granted: boolean;
  created_at: string;
}

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

/**
 * Current consent state from the append-only ledger: latest row per type wins
 * (ISO timestamps compare lexicographically). Missing type = not granted.
 */
export function resolveConsentState(rows: ConsentRow[]): Map<string, boolean> {
  const latest = new Map<string, { granted: boolean; created_at: string }>();
  for (const row of rows) {
    const prev = latest.get(row.consent_type);
    if (!prev || row.created_at >= prev.created_at) {
      latest.set(row.consent_type, { granted: row.granted, created_at: row.created_at });
    }
  }
  return new Map([...latest.entries()].map(([type, s]) => [type, s.granted]));
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
  const state = resolveConsentState(input.consentRows);
  const missing = required.filter((type) => state.get(type) !== true);
  if (missing.length > 0) return { outcome: "consent_required", missing: [...missing] };

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
