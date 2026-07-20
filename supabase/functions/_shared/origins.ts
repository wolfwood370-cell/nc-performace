// supabase/functions/_shared/origins.ts
// Single source of truth for the Stripe redirect-origin whitelist shared by
// create-checkout-session and create-portal-session. WHY: the caller-supplied
// Origin header flows into Stripe session params (success_url / cancel_url /
// return_url) — reflecting it unchecked would let an attacker point the
// post-payment redirect at their own domain (Supabase Advisor warning).
// Matching is by EXACT hostname on a closed list — NEVER by pattern/suffix:
// endsWith(".vercel.app") would admit anyone's Vercel deploy. Resolution is
// fail-safe by design: a missing/malformed env or Origin NEVER throws, falls
// back to the project default, and no code path returns an unverified Origin.

/** Project defaults (deterministic, in code). */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = [
  "nc-performace-mu.vercel.app",
  "nc-performace-nicolos-projects-7012398b.vercel.app",
  "nc-performace-git-main-nicolos-projects-7012398b.vercel.app",
];
export const DEFAULT_ORIGIN = "https://nc-performace-mu.vercel.app";

export interface OriginConfig {
  /** Closed list of exact hostnames (lowercase). */
  allowedHosts: readonly string[];
  /** Full https origin used whenever the caller Origin is not trusted. */
  defaultOrigin: string;
}

/** A bare hostname iff prefixing a scheme parses back to the exact same
 * (already lowercased) string — rejects schemes, ports, paths, spaces. */
function isValidHostname(entry: string): boolean {
  try {
    return new URL(`https://${entry}`).hostname === entry;
  } catch {
    return false;
  }
}

/**
 * PURE, never throws. Builds the runtime config from the two OPTIONAL env
 * values (injected as strings so tests need no Deno.env):
 * - `allowedHostsRaw` (ALLOWED_ORIGIN_HOSTS): comma-separated hostnames,
 *   processed trim → lowercase → validation (in this order, so uppercase
 *   entries survive). Empties are dropped silently; invalid entries are
 *   dropped with ONE console.warn listing ONLY the discarded values (no
 *   secrets here); valid ones are ADDED to the defaults, never replacing.
 * - `defaultOriginRaw` (DEFAULT_ORIGIN_URL): full https origin replacing the
 *   default; its hostname is implicitly allowed (set by the operator, not by
 *   the caller). Invalid/non-https → console.warn + in-code default.
 */
export function buildOriginConfig(
  allowedHostsRaw: string | undefined,
  defaultOriginRaw: string | undefined,
): OriginConfig {
  const allowedHosts = [...DEFAULT_ALLOWED_HOSTS];
  if (allowedHostsRaw) {
    const discarded: string[] = [];
    for (const rawEntry of allowedHostsRaw.split(",")) {
      const entry = rawEntry.trim().toLowerCase();
      if (entry.length === 0) continue; // artifact of stray commas
      if (isValidHostname(entry)) {
        if (!allowedHosts.includes(entry)) allowedHosts.push(entry);
      } else {
        discarded.push(entry);
      }
    }
    if (discarded.length > 0) {
      console.warn(
        `[origins] ALLOWED_ORIGIN_HOSTS: voci scartate (non sono hostname): ${discarded.join(", ")}`,
      );
    }
  }

  let defaultOrigin = DEFAULT_ORIGIN;
  const rawDefault = defaultOriginRaw?.trim();
  if (rawDefault) {
    let candidate: URL | undefined;
    try {
      candidate = new URL(rawDefault);
    } catch {
      candidate = undefined;
    }
    if (candidate && candidate.protocol === "https:") {
      defaultOrigin = candidate.origin;
      if (!allowedHosts.includes(candidate.hostname)) allowedHosts.push(candidate.hostname);
    } else {
      console.warn(
        `[origins] DEFAULT_ORIGIN_URL scartata (serve un'origin https valida): ${rawDefault}`,
      );
    }
  }

  return { allowedHosts, defaultOrigin };
}

/**
 * PURE. True only for: http + hostname localhost/127.0.0.1 (any port — local
 * dev parity), or https + EXACT hostname match on the closed list. Malformed
 * origins are false, never a throw.
 */
export function isAllowedOrigin(origin: string, allowedHosts: readonly string[]): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    if (u.protocol !== "https:") return false;
    return allowedHosts.includes(u.hostname);
  } catch {
    return false;
  }
}

/**
 * PURE, never throws. Missing/untrusted/malformed caller Origin → the project
 * default; allowed Origin → reflected normalized (URL#origin, so default
 * ports are stripped). No code path returns an unverified Origin.
 */
export function resolveOrigin(requestOrigin: string | null, config: OriginConfig): string {
  if (!requestOrigin) return config.defaultOrigin;
  if (!isAllowedOrigin(requestOrigin, config.allowedHosts)) return config.defaultOrigin;
  return new URL(requestOrigin).origin;
}

/** The single impure read-point (mirrors apiKeys.ts): env in, resolution out. */
export function resolveOriginFromEnv(requestOrigin: string | null): string {
  return resolveOrigin(
    requestOrigin,
    buildOriginConfig(Deno.env.get("ALLOWED_ORIGIN_HOSTS"), Deno.env.get("DEFAULT_ORIGIN_URL")),
  );
}
