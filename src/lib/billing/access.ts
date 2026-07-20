// =============================================================================
// src/lib/billing/access.ts
// =============================================================================
// The one rule that answers "is this athlete's account currently entitled to
// anything?", kept apart from any hook so it can be pinned by a unit test.
//
// Two ways in, and BOTH are needed:
//
//   - coaching_mode === 'coached'  → the coach sells and bills the relationship
//     off-platform; there is no Stripe subscription to look for. Without this
//     branch every coached athlete would be locked out of the features their
//     tier grants them, which is the opposite of the intent.
//   - subscription_status ∈ {active, trial} → the athlete pays for themselves
//     (autonomous), so access follows the subscription.
//
// Fail-closed everywhere else: a missing profile, a null coaching_mode, a
// past_due/canceled/none status all read as "no access". This is a COMMERCIAL
// barrier and a UX one — the data defense stays RLS plus the server-side checks
// in the edge functions, never this predicate.
// =============================================================================

export interface AccessProfile {
  coaching_mode?: string | null;
  subscription_status?: string | null;
}

export function hasActiveAccess(profile: AccessProfile | null | undefined): boolean {
  if (!profile) return false;
  if (profile.coaching_mode === "coached") return true;
  return profile.subscription_status === "active" || profile.subscription_status === "trial";
}
