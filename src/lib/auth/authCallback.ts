// =============================================================================
// src/lib/auth/authCallback.ts
// =============================================================================
// Reading of the Supabase auth redirect, as two PURE functions so the landing
// page stays a thin component (vitest runs in `environment: "node"`: a React
// component would not be testable at all here).
//
// Where the data is: the client runs the IMPLICIT flow (`flowType` is not set,
// and auth-js defaults to `implicit`), so a good link comes back with the
// tokens in the URL FRAGMENT and a failed one with `error`/`error_code` in the
// same fragment. `?code=` is the PKCE shape — parsed for robustness, today
// unreachable. Errors are read from BOTH fragment and query: which one carries
// them depends on the flow, and reading only one is how a page ends up mute.
//
// Note on lifetime: auth-js clears the fragment on SUCCESS but leaves it in
// place on error, so the caller must snapshot the URL at first render anyway —
// see Attiva.tsx.
// =============================================================================

export interface AuthCallbackParams {
  /** Implicit-flow success: the fragment carries an access token. */
  hasTokens: boolean;
  /** PKCE authorization code, when present. */
  code: string | null;
  /** e.g. `access_denied`. */
  error: string | null;
  /** e.g. `otp_expired`. */
  errorCode: string | null;
  /** Human-readable reason, already URL-decoded. */
  errorDescription: string | null;
}

const read = (params: URLSearchParams, key: string): string | null => {
  const value = params.get(key);
  return value && value.length > 0 ? value : null;
};

/**
 * Total: accepts the raw `window.location.hash` / `.search` with or without
 * their leading `#`/`?`, and never throws on garbage.
 */
export function parseAuthCallback(hash: string, search: string): AuthCallbackParams {
  const fragment = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
  const query = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);

  return {
    hasTokens: read(fragment, "access_token") !== null,
    code: read(query, "code"),
    error: read(fragment, "error") ?? read(query, "error"),
    errorCode: read(fragment, "error_code") ?? read(query, "error_code"),
    errorDescription: read(fragment, "error_description") ?? read(query, "error_description"),
  };
}

export type ActivationState =
  /** Auth-js has not finished with the URL yet — show a spinner, decide nothing. */
  | "pending"
  /** Session in hand: route to the role home. */
  | "ready"
  /** The link was already used or has timed out. */
  | "expired"
  /** Refused for another reason, or the tokens did not turn into a session. */
  | "denied"
  /** Nothing to work with: someone opened the page by hand. */
  | "invalid";

export interface ActivationInput {
  params: AuthCallbackParams;
  hasSession: boolean;
  /** True once the delayed `getSession()` check has run. */
  settled: boolean;
}

const EXPIRED_HINT = /expired/i;

/**
 * Order is the contract:
 *  1. A session wins over everything, INCLUDING a stale error in the fragment —
 *     someone who is already signed in must be let through, not lectured.
 *  2. An explicit error is honoured before any waiting: it is final, and
 *     spinning on it is what produced the mute `/auth` this slice removes.
 *  3. Only then may we still be waiting.
 */
export function describeActivation({
  params,
  hasSession,
  settled,
}: ActivationInput): ActivationState {
  if (hasSession) return "ready";

  if (params.error || params.errorCode || params.errorDescription) {
    const expired =
      params.errorCode === "otp_expired" ||
      EXPIRED_HINT.test(params.errorCode ?? "") ||
      EXPIRED_HINT.test(params.errorDescription ?? "");
    return expired ? "expired" : "denied";
  }

  if (!settled) return "pending";

  // Settled, no session, no error: if credentials were present they simply did
  // not become a session — that is a failure, not an empty page.
  return params.hasTokens || params.code ? "denied" : "invalid";
}
