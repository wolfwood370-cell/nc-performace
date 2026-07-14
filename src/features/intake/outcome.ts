// =============================================================================
// src/features/intake/outcome.ts
// =============================================================================
// PURE mapping of the submit-intake response body to a typed outcome — kept
// free of I/O imports so the dominance rules are unit-testable in isolation.
//
// Contract (submit-intake/index.ts): gate.routedOut === true is ALWAYS
// dominant, regardless of `ok` (ok:true + routedOut:true = pregnancy/DCA,
// data persisted, coach alerted — NOT a success). Only the minor case comes
// back ok:false with reasons ["minor"] and nothing persisted.
// =============================================================================

export interface GateInfo {
  level: "red" | "yellow" | "green";
  routedOut: boolean;
  reasons: string[];
  yellow?: string[];
}

export type SubmitOutcome =
  | { kind: "success" }
  | { kind: "routedOut"; reasons: string[]; persisted: boolean }
  | { kind: "alreadySubmitted" }
  | { kind: "invalidPayload"; field?: string }
  | { kind: "tooLarge" }
  | { kind: "missingConsents" }
  | { kind: "authError" }
  | { kind: "error" };

export interface SubmitResponseBody {
  ok?: boolean;
  gate?: GateInfo;
  error?: string;
  field?: string;
}

/** Pure mapping response-body -> outcome. routedOut dominates everything. */
export function outcomeFromBody(body: SubmitResponseBody | null): SubmitOutcome {
  if (!body) return { kind: "error" };

  if (body.gate?.routedOut === true) {
    const reasons = Array.isArray(body.gate.reasons) ? body.gate.reasons : [];
    return { kind: "routedOut", reasons, persisted: !reasons.includes("minor") };
  }

  if (body.ok === true) return { kind: "success" };

  switch (body.error) {
    case "already_submitted":
      return { kind: "alreadySubmitted" };
    case "invalid_payload":
    case "invalid_json":
      return { kind: "invalidPayload", field: body.field };
    case "payload_too_large":
      return { kind: "tooLarge" };
    case "missing_required_consents":
      return { kind: "missingConsents" };
    case "unauthorized":
    case "profile_not_found":
    case "athletes_only":
    case "invalid_athlete":
      return { kind: "authError" };
    default:
      return { kind: "error" };
  }
}
