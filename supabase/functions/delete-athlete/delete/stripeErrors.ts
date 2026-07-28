// Recognizes Stripe's "this id does not exist" failure without importing the SDK.
// stripe-node raises StripeInvalidRequestError with code 'resource_missing'
// (statusCode 404) when a subscription id is unknown. FAIL-CLOSED on purpose: only
// the exact code counts — any other error (auth, network, odd 404 without a code)
// must bubble up and abort the deletion, never be mistaken for "already gone".
// Both properties are optional in the SDK types, so probe defensively.
export function isResourceMissing(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  return (err as { code?: unknown }).code === "resource_missing";
}
