// =============================================================================
// src/features/intake/submit.ts
// =============================================================================
// I/O boundary of the intake form: posts the payload to the submit-intake
// edge function and maps the response to a typed outcome the UI can RENDER.
// No safety logic here — the server gate is authoritative.
//
// Response contract (submit-intake/index.ts):
//   - gate.routedOut === true is ALWAYS dominant, regardless of `ok`: an
//     ok:true + routedOut:true (pregnancy/DCA — data persisted, coach
//     alerted) is NOT a success. Only the minor case comes back ok:false
//     with reasons ["minor"] and nothing persisted.
//   - non-2xx statuses arrive as FunctionsHttpError: the JSON body must be
//     read from error.context (a Response), not from `data`.
// Art. 9 hygiene: never log payload values or gate reasons — machine error
// codes only.
// =============================================================================

import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/logger";
import type { IntakePayload } from "./buildPayload";

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
  | { kind: "missingConsents" }
  | { kind: "authError" }
  | { kind: "error" };

interface SubmitResponseBody {
  ok?: boolean;
  gate?: GateInfo;
  error?: string;
  field?: string;
}

async function bodyFromError(error: unknown): Promise<SubmitResponseBody | null> {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    try {
      return (await context.json()) as SubmitResponseBody;
    } catch {
      return null;
    }
  }
  return null;
}

export async function submitIntake(payload: IntakePayload): Promise<SubmitOutcome> {
  let body: SubmitResponseBody | null = null;
  try {
    // The Supabase client attaches the session JWT by itself.
    const { data, error } = await supabase.functions.invoke("submit-intake", { body: payload });
    body = error ? await bodyFromError(error) : (data as SubmitResponseBody | null);
  } catch (err) {
    log.error("submit-intake: request failed", err instanceof Error ? err.message : "unknown");
    return { kind: "error" };
  }

  if (!body) return { kind: "error" };

  // routedOut dominates every other signal, including ok:true.
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
    case "payload_too_large":
      log.warn("submit-intake: invalid payload", { field: body.field });
      return { kind: "invalidPayload", field: body.field };
    case "missing_required_consents":
      return { kind: "missingConsents" };
    case "unauthorized":
    case "profile_not_found":
    case "athletes_only":
    case "invalid_athlete":
      return { kind: "authError" };
    default:
      log.error("submit-intake: unexpected error code", { code: body.error });
      return { kind: "error" };
  }
}
