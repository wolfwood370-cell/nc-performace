// =============================================================================
// supabase/functions/_shared/auth/redirect.ts
// =============================================================================
// Anti open-redirect guard for the `redirectTo` of Supabase auth action links.
//
// A caller-supplied `redirectTo` flows into the email link: reflected
// unchecked, an attacker could send `redirectTo=https://evil.test` and the
// magic link would hand the session fragment to their domain. So the URL's
// ORIGIN is checked against the same closed host list already used for the
// Stripe redirects (`_shared/origins.ts`) — host unification decided with
// Nick on 2026-07-22, so there is ONE operational config surface
// (`ALLOWED_ORIGIN_HOSTS` / `DEFAULT_ORIGIN_URL`) instead of two that drift.
//
// This module only ADDS the URL→origin step; `origins.ts` is imported, never
// modified. Matching stays exact-hostname on a closed list — never by suffix.
// PURE and total: a malformed URL is `false`, never a throw.
// =============================================================================

import { isAllowedOrigin } from "../origins.ts";

/**
 * True only when `url` parses AND its origin is allowed (https + exact
 * hostname match, or http on localhost/127.0.0.1 for dev parity).
 * Non-http(s) schemes (`javascript:`, `data:`) have an opaque origin and are
 * rejected by `isAllowedOrigin`.
 */
export function isAllowedRedirectUrl(url: string, allowedHosts: readonly string[]): boolean {
  try {
    return isAllowedOrigin(new URL(url).origin, allowedHosts);
  } catch {
    return false;
  }
}
