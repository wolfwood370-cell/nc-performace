// supabase/functions/compute-nutrition-target/target/cronAuth.ts
// Caller-service gate for compute-nutrition-target: the x-cron-secret header
// is compared timing-safe against the dedicated CRON_SECRET env. A DB key
// NEVER doubles as the caller's auth secret (the legacy pattern this
// replaces). Pure module: env/header reads stay in index.ts so every branch
// is unit-testable (index.ts calls serve() top-level and cannot be imported).

import { timingSafeEqualStr } from "../../_shared/apiKeys.ts";

/** Header the scheduled job sends; pinned literally by cronAuth.test.ts. */
export const CRON_SECRET_HEADER = "x-cron-secret";

export type CronGate = { ok: true } | { ok: false; status: 401 | 403 | 500; error: string };

/**
 * Fail-closed mapping: missing/empty server secret -> 500 (misconfig),
 * missing/empty header -> 401, mismatch -> 403. Exact match only — no trim,
 * no Bearer prefix.
 */
export function gateCronRequest(provided: string | null, cronSecret: string | undefined): CronGate {
  if (!cronSecret) return { ok: false, status: 500, error: "server_misconfigured" };
  if (!provided) return { ok: false, status: 401, error: "unauthorized" };
  if (!timingSafeEqualStr(provided, cronSecret)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true };
}
