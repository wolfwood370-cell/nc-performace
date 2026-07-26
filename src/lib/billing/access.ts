// =============================================================================
// src/lib/billing/access.ts
// =============================================================================
// FE entry point for the ONE access rule. The predicate itself lives in
// supabase/functions/_shared/billing.ts, right next to resolveAccessUntil —
// the writer of the access_until value it reads — so the front-end and the
// edge functions (release-autonomous-program's payment gate) can never drift:
// this file only re-exports it, keeping every "@/lib/billing/access" import
// stable and the truth table in __tests__/access.test.ts pointed at the same
// function object the server runs.
//
// Since the 2026-07-26 flip the rule reads profiles.access_until (strictly
// future = entitled) with the coached shortcut on top — the coach bills those
// athletes off-platform, so no paid-for date exists for them by design.
// subscription_status is a display cache and is not consulted anymore. Full
// reasoning lives with the predicate in billing.ts.
// =============================================================================

export { hasActiveAccess } from "../../../supabase/functions/_shared/billing.ts";
export type { AccessProfile } from "../../../supabase/functions/_shared/billing.ts";
