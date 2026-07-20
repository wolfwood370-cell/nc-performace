// supabase/functions/_shared/billing.ts
// Single source of truth for the Stripe -> DB translation used by stripe-webhook.
// Everything here is PURE (values in, values out) and NEVER throws: the webhook
// answers Stripe, and a thrown error there means a 5xx and a retry storm.
//
// Three reasons this module exists at all:
//  1. ENUM SAFETY. Postgres has two distinct enums with different domains —
//     profiles.subscription_status {active,past_due,canceled,trial,none} and
//     athlete_subscriptions.status {active,past_due,canceled,incomplete,canceling}.
//     Stripe has EIGHT statuses that match neither. Writing a Stripe status
//     straight through produces a value outside the target enum; supabase-js
//     reports that as an error object, which the old code ignored, so the write
//     silently vanished. Both maps below are TOTAL and closed over their target.
//  2. API "BASIL" SHAPES. Invoice.subscription and Subscription.current_period_end
//     no longer exist where they used to (verified on the stripe@18.5.0 .d.ts).
//     The extractors accept BOTH the Basil and the legacy shape, because the
//     payload shape is decided by the API version configured on the webhook
//     ENDPOINT, not by the SDK version we import.
//  3. MULTI-ROW TRUTH. profiles caches ONE status per athlete, but an athlete can
//     own several athlete_subscriptions rows. Letting the last event win makes a
//     cancellation of an old plan switch off a freshly paid new one, so the cache
//     is recomputed from the whole set (resolveAccountState).
//
// Inputs are typed `unknown` on purpose: the module must stay testable without the
// Stripe SDK, and a malformed payload must degrade to null, never to a throw.

/** Domain of profiles.subscription_status. */
export type ProfileSubscriptionStatus = "active" | "past_due" | "canceled" | "trial" | "none";

/** Domain of athlete_subscriptions.status (enum billing_sub_status). */
export type RowSubscriptionStatus = "active" | "past_due" | "canceled" | "incomplete" | "canceling";

/** Domain of billing_plans.tier and profiles.tier (enum tier). */
export type PlanTier = "monthly" | "premium";

/** One athlete_subscriptions row, in the only two fields the resolution needs. */
export interface AccountRow {
  status: unknown;
  plan_id?: unknown;
  current_period_end?: unknown;
}

export interface AccountState {
  status: RowSubscriptionStatus;
  planId: string | null;
  periodEnd: string | null;
}

// ----------------------------------------------------------------- primitives

/** Safe property read: anything that is not a plain object yields undefined. */
function prop(source: unknown, key: string): unknown {
  if (typeof source !== "object" || source === null) return undefined;
  return (source as Record<string, unknown>)[key];
}

/** Stripe expandable field -> id. Accepts a raw id or an expanded object. */
function idOf(value: unknown): string | null {
  if (typeof value === "string") return value.length > 0 ? value : null;
  const id = prop(value, "id");
  return typeof id === "string" && id.length > 0 ? id : null;
}

/** Epoch seconds -> ISO string. Rejects non-finite, non-positive and out-of-range
 * values so the caller can never persist "Invalid Date" or 1970-01-01. */
function epochSecondsToIso(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(value * 1000);
  const time = date.getTime();
  if (!Number.isFinite(time)) return null;
  return date.toISOString();
}

// --------------------------------------------------------------- status maps

/**
 * PURE. Collapses the Stripe status plus the cancel_at_period_end flag into ONE
 * canonical label. `canceling` is ours, not Stripe's: Stripe keeps reporting
 * `active` for a subscription scheduled to end, and the distinction only matters
 * for what we display — commercially the athlete is still paying.
 * A non-string status yields "" so the maps below fall into their closed default.
 */
export function effectiveBillingStatus(stripeStatus: unknown, cancelAtPeriodEnd: unknown): string {
  const status = typeof stripeStatus === "string" ? stripeStatus : "";
  if (status === "active" && cancelAtPeriodEnd === true) return "canceling";
  return status;
}

/**
 * PURE, TOTAL. Canonical status -> profiles.subscription_status. Every branch
 * returns a value inside the enum; anything unknown falls back to "none", which
 * is the fail-closed answer (no access) rather than the permissive one.
 */
export function mapBillingStatusToProfile(billingStatus: unknown): ProfileSubscriptionStatus {
  switch (billingStatus) {
    // Paying and served.
    case "active":
      return "active";
    // Cancellation scheduled: paid through the end of the period, access stays on.
    case "canceling":
      return "active";
    // Trial IS access; the profile enum has a dedicated label for it.
    case "trialing":
      return "trial";
    // Payment failed, subscription still alive: access off, recoverable.
    case "past_due":
      return "past_due";
    // Dunning exhausted. Not a cancellation for Stripe, but for us it is past_due:
    // no access, and the row is still there to be recovered by a successful invoice.
    case "unpaid":
      return "past_due";
    // Terminal.
    case "canceled":
      return "canceled";
    // The first payment never went through: this subscription never started, so
    // "canceled" would overstate it — the athlete simply has no subscription.
    case "incomplete":
      return "none";
    // The incomplete window expired: terminal, and it did produce a dead subscription.
    case "incomplete_expired":
      return "canceled";
    // Collection paused by the merchant: alive but not serving.
    case "paused":
      return "none";
    // Unknown label (new Stripe status, typo, null, non-string): fail closed.
    default:
      return "none";
  }
}

/**
 * PURE, TOTAL. Canonical status -> athlete_subscriptions.status. Distinct from the
 * profile map because the row enum has `incomplete`/`canceling` but NO `trial`:
 * a trialing subscription is recorded as `active` (the athlete is being served),
 * and the trial nuance survives only on the profile cache.
 */
export function mapBillingStatusToRow(billingStatus: unknown): RowSubscriptionStatus {
  switch (billingStatus) {
    case "active":
      return "active";
    case "trialing":
      return "active"; // no 'trial' in billing_sub_status — see the doc comment
    case "canceling":
      return "canceling";
    case "past_due":
      return "past_due";
    case "unpaid":
      return "past_due";
    case "canceled":
      return "canceled";
    case "incomplete_expired":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "paused":
      return "incomplete";
    default:
      return "incomplete"; // fail closed: never invent an 'active' row
  }
}

// ------------------------------------------------------------------ plan tier

/**
 * PURE. Reads the tier from the billing_plans COLUMN — never from plan.name,
 * which is presentation text the coach can edit at will. An unusable value falls
 * back to the least privileged tier. The warning deliberately omits the plan name
 * and id: this runs in a shared log and the plan name is user-authored content.
 */
export function tierForPlan(plan: unknown): PlanTier {
  const tier = prop(plan, "tier");
  if (tier === "premium" || tier === "monthly") return tier;
  console.warn("[billing] billing_plans.tier assente o fuori dominio: uso il tier 'monthly'");
  return "monthly";
}

/**
 * PURE. Anti-downgrade guard for profiles.tier. The coach-facing UI does not write
 * billing_plans.tier yet, so every plan created there is born 'monthly' — including
 * one named "Premium". Without this guard, an athlete invited as premium who pays
 * for such a plan would silently lose fms, coach_messaging, cycle_optimization and
 * training_coached. A tier is therefore only ever raised by the webhook, never lowered:
 * lowering stays a deliberate human act (Cowork on the DB).
 */
export function nextProfileTier(currentTier: unknown, planTier: PlanTier): PlanTier {
  if (currentTier === "premium" && planTier === "monthly") {
    console.warn(
      "[billing] declassamento premium->monthly rifiutato: il piano non dichiara il tier premium",
    );
    return "premium";
  }
  return planTier;
}

// ------------------------------------------------------------ Stripe payloads

/**
 * PURE, never throws. Invoice -> subscription id.
 * Basil moved the field: `invoice.subscription` was REMOVED and now lives under
 * `invoice.parent.subscription_details.subscription`. Both shapes are read, new
 * one first. Note that `parent` is NOT a usable discriminated union — `parent.type`
 * does not narrow `subscription_details`, which is independently nullable — so the
 * narrowing happens on the FIELD.
 */
export function subscriptionIdFromInvoice(invoice: unknown): string | null {
  const basil = idOf(prop(prop(prop(invoice, "parent"), "subscription_details"), "subscription"));
  if (basil) return basil;
  return idOf(prop(invoice, "subscription"));
}

/**
 * PURE, never throws. Subscription -> end of the current period, as an ISO string.
 * Basil removed current_period_end from the subscription and moved it onto each
 * subscription ITEM; with several items the subscription is served until the last
 * of them ends, hence the max. Legacy top-level field read as a fallback.
 * Returns null rather than an unusable date.
 */
export function periodEndIso(subscription: unknown): string | null {
  const items = prop(prop(subscription, "items"), "data");
  if (Array.isArray(items)) {
    let latest: number | null = null;
    for (const item of items) {
      const seconds = prop(item, "current_period_end");
      if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds <= 0) continue;
      if (latest === null || seconds > latest) latest = seconds;
    }
    const fromItems = epochSecondsToIso(latest);
    if (fromItems) return fromItems;
  }
  return epochSecondsToIso(prop(subscription, "current_period_end"));
}

/**
 * PURE, never throws. Subscription -> the Stripe price id currently billed.
 * Needed because the Customer Portal can swap the price on the SAME subscription:
 * without re-resolving the plan from the price, athlete_subscriptions.plan_id keeps
 * pointing at the old plan and the profile inherits a stale tier.
 * Only single-price subscriptions are meaningful here (our plans are 1 line item):
 * with several items we return null so the caller can fail closed.
 */
export function priceIdFromSubscription(subscription: unknown): string | null {
  const items = prop(prop(subscription, "items"), "data");
  if (!Array.isArray(items) || items.length !== 1) return null;
  return idOf(prop(items[0], "price"));
}

// ------------------------------------------------------- multi-row resolution

/** Lower wins. Mirrors "how much access does this row grant, right now". */
const ROW_PRECEDENCE: Record<RowSubscriptionStatus, number> = {
  active: 0,
  canceling: 1,
  past_due: 2,
  incomplete: 3,
  canceled: 4,
};

/**
 * PURE. Given ALL the athlete_subscriptions rows of one athlete, returns the row
 * that decides the profile cache. WHY: profiles holds a single status/tier per
 * athlete while the rows are per plan. Letting the event being processed write the
 * cache directly means the `deleted` of a plan the athlete just left switches off
 * the plan they just bought. Deterministic by construction (no clock): precedence
 * first, then the furthest period end, then the input order.
 * Returns null for an empty/unusable set — the caller decides what "no rows" means.
 */
export function resolveAccountState(rows: unknown): AccountState | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  let best: AccountState | null = null;
  let bestRank = Number.POSITIVE_INFINITY;

  for (const row of rows as AccountRow[]) {
    const status = mapBillingStatusToRow(row?.status);
    const rank = ROW_PRECEDENCE[status];
    const planIdRaw = prop(row, "plan_id");
    const planId = typeof planIdRaw === "string" && planIdRaw.length > 0 ? planIdRaw : null;
    const periodEndRaw = prop(row, "current_period_end");
    const periodEnd = typeof periodEndRaw === "string" && periodEndRaw.length > 0
      ? periodEndRaw
      : null;

    if (rank < bestRank) {
      best = { status, planId, periodEnd };
      bestRank = rank;
      continue;
    }
    // Same access level: the row that keeps the athlete served the longest wins.
    // A row without a period end never beats one that has it.
    if (rank === bestRank && best !== null && periodEnd !== null) {
      if (best.periodEnd === null || periodEnd > best.periodEnd) {
        best = { status, planId, periodEnd };
      }
    }
  }

  return best;
}
