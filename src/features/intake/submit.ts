// =============================================================================
// src/features/intake/submit.ts
// =============================================================================
// I/O boundary of the intake form: posts the payload to the submit-intake
// edge function and maps the response to a typed outcome the UI can RENDER.
// No safety logic here — the server gate is authoritative. The pure body ->
// outcome mapping lives in ./outcome.ts (unit-tested); this file only adds
// the transport: non-2xx statuses arrive as FunctionsHttpError and the JSON
// body must be read from error.context (a Response), not from `data`.
// Art. 9 hygiene: never log payload values or gate reasons — machine error
// codes only.
// =============================================================================

import { supabase } from "@/integrations/supabase/client";
import { log } from "@/lib/logger";
import type { IntakePayload } from "./buildPayload";
import { outcomeFromBody } from "./outcome";
import type { SubmitOutcome, SubmitResponseBody } from "./outcome";

export { outcomeFromBody };
export type { GateInfo, SubmitOutcome, SubmitResponseBody } from "./outcome";

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

  const outcome = outcomeFromBody(body);
  if (outcome.kind === "invalidPayload") {
    log.warn("submit-intake: invalid payload", { field: outcome.field });
  } else if (outcome.kind === "error" && body?.error) {
    log.error("submit-intake: unexpected error code", { code: body.error });
  }
  return outcome;
}
