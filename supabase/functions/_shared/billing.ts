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
 * values so the caller can never persist "Invalid Date" or 1970-01-01.
 * Exported for the webhook's notification dedupe window (anchored on
 * invoice.created): a CONVERSION the I/O layer may use, not a rule. */
export function epochSecondsToIso(value: unknown): string | null {
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
 * PURE. Which profile statuses labelled the account as entitled. Kept here,
 * next to the map that produces them, so the two cannot drift. Since the
 * predicate flip (2026-07-26) ACCESS is decided by hasActiveAccess below, on
 * access_until: this set only classifies the subscription_status CACHE (webhook
 * tier writes, UI badges) and gates nothing anymore.
 */
export function grantsAccess(status: ProfileSubscriptionStatus): boolean {
  return status === "active" || status === "trial";
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

// ---------------------------------------------------------------- plan cadence

/**
 * The Stripe cadence of a billing_plans.billing_interval value, as a CLOSED
 * discriminated union. Deliberately NOT `recurring | null`: the map's own
 * "unsupported" answer is null, and two nulls with opposite meanings
 * (unsupported -> 400 vs one_time -> Checkout mode 'payment') would be one
 * inversion away from 400-ing every premium checkout. The `kind` tag keeps the
 * two outcomes impossible to confuse at the type level.
 */
export type StripeCadence =
  | {
      kind: "recurring";
      recurring: { interval: "week" | "month" | "year"; interval_count: number };
    }
  | { kind: "one_time" };

/**
 * PURE. The ONE translation billing_interval -> Stripe cadence: every consumer
 * (today only create-checkout-session) goes through here, so no local ternary
 * can silently disagree with the domain.
 *
 * UNIT NOTE: {week, 4} is a RECURRENCE of 4 weeks, not a duration of 28 days.
 * The authoritative days-per-block lives in the DB generated column
 * billing_plans.term_days (duration_blocks * 28) — no 28 belongs in this file.
 *
 * 'month' and 'year' are historic values (archived rows sold at those
 * cadences): true translations, kept representable on purpose. Anything
 * outside the four-value domain returns null — FAIL CLOSED, the caller turns
 * it into a 400. The old code mapped every unrecognized value to a silent
 * monthly price; that fallback is exactly the defect this map removes.
 */
export function stripeCadenceFor(billingInterval: unknown): StripeCadence | null {
  switch (billingInterval) {
    // The commercial block: a 4-week recurrence. NOT a month.
    case "block":
      return { kind: "recurring", recurring: { interval: "week", interval_count: 4 } };
    case "month":
      return { kind: "recurring", recurring: { interval: "month", interval_count: 1 } };
    case "year":
      return { kind: "recurring", recurring: { interval: "year", interval_count: 1 } };
    // One-off purchase: no recurrence, Checkout mode 'payment'.
    case "one_time":
      return { kind: "one_time" };
    default:
      return null;
  }
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
 * PURE, never throws. PREPAID term -> the instant access stops, as an ISO string.
 *
 * A one-off checkout (mode: payment) produces NO subscription, so there is no
 * Stripe period to read: the duration is a property of the PLAN
 * (billing_plans.term_days), which is why it arrives as a separate argument
 * rather than being dug out of the payload.
 *
 * The anchor is `session.created` — an instant FROZEN inside the signed event —
 * and deliberately never the wall clock. Stripe retries a delivery for up to 3
 * days, and `now() + term` would hand out a fresh term on every retry, turning
 * the handler into a read-modify-write and breaking invariant 2 of the webhook
 * (fixed-value writes, safe to re-run). With this anchor the tenth retry
 * computes exactly the same instant as the first.
 *
 * Returns null for an unusable term or anchor, so the caller can fail closed
 * (and loudly) rather than persist a date it cannot justify.
 */
export function prepaidTermEndIso(session: unknown, termDays: unknown): string | null {
  if (typeof termDays !== "number" || !Number.isInteger(termDays) || termDays <= 0) return null;
  const created = prop(session, "created");
  if (typeof created !== "number" || !Number.isFinite(created) || created <= 0) return null;
  return epochSecondsToIso(created + termDays * 86400);
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

// ------------------------------------------------------------- access_until

/** Row statuses that currently entitle to access. `canceling` still pays
 * through the end of the period; trialing is stored as `active`. */
const ACCESS_GRANTING_ROW: ReadonlySet<RowSubscriptionStatus> = new Set(["active", "canceling"]);

/** ISO string -> epoch ms, or null for anything unusable. Accepts both the `Z`
 * and the `+00:00` offset forms that Postgres/PostgREST and toISOString emit. */
function isoToMs(value: unknown): number | null {
  if (typeof value !== "string" || value.length === 0) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

// ------------------------------------------------ grace period (failed renewal)

/**
 * Days of access still owed after a RENEWAL payment fails, counted from the
 * invoice creation instant (frozen in the signed event — never the wall clock).
 * A code constant, not DB config, on purpose: it belongs to the access rule
 * itself, this module must stay pure (no config reads), and the SQL writer
 * (grant_athlete_access) reads the STORED grace_until — so the number exists in
 * exactly one place. Pinned literally by the tests: changing it is a deliberate
 * slice, not a knob.
 */
export const ACCESS_GRACE_DAYS = 14;

/**
 * The invoice.billing_reason value of a subscription RENEWAL, per the real
 * stripe@18.5.0 typings (BillingReason union): 'subscription_cycle' is "a
 * subscription advanced into a new period". The FIRST invoice of a
 * subscription is 'subscription_create' and earns NO grace (who never paid
 * gets none). Named so that, should the live payload ever disagree, the fix is
 * this constant — never the logic around it.
 */
export const RENEWAL_BILLING_REASON = "subscription_cycle";

/**
 * Outcome of the grace evaluation: the exact instant access is owed until, or
 * the reason no grace is due. `stale_after_recovery` is special to the caller:
 * the event arrived after a recovery was already recorded, so the right move
 * is to touch NOTHING at all.
 */
export type GraceDecision =
  | { grant: true; until: string }
  | {
      grant: false;
      reason: "unreadable_date" | "not_a_renewal" | "episode_open" | "stale_after_recovery";
    };

/**
 * PURE, TOTAL, no clock, never throws. Decides whether a failed invoice opens
 * the ACCESS_GRACE_DAYS window on the athlete's access. Every condition is a
 * MERIT check on durable data — re-running the same event against the same
 * rows yields the same answer — never an "already done" shortcut (webhook
 * invariant 2). In order:
 *  a. the window end is invoice.created + ACCESS_GRACE_DAYS: an unreadable
 *     anchor fails closed (unreadable_date) and is NEVER replaced by "now" —
 *     a wall-clock fallback would hand out a fresh window on every retry;
 *  b. only a RENEWAL earns grace: any other billing_reason — including
 *     'subscription_create', the first invoice, i.e. the never-paid case —
 *     is not_a_renewal, fail-closed on unknown/missing values;
 *  c. an open episode (row.grace_until not null) is never extended: a new one
 *     can only open after a successful payment cleared it (episode_open);
 *  d. a row still 'active' with a period end BEYOND the would-be window means
 *     a recovery was recorded after this invoice was emitted: the event is
 *     stale and must touch nothing (stale_after_recovery).
 */
export function graceDecision(invoice: unknown, row: unknown): GraceDecision {
  const created = prop(invoice, "created");
  if (typeof created !== "number" || !Number.isFinite(created) || created <= 0) {
    return { grant: false, reason: "unreadable_date" };
  }
  const until = epochSecondsToIso(created + ACCESS_GRACE_DAYS * 86400);
  if (until === null) return { grant: false, reason: "unreadable_date" };

  if (prop(invoice, "billing_reason") !== RENEWAL_BILLING_REASON) {
    return { grant: false, reason: "not_a_renewal" };
  }

  const openGrace = prop(row, "grace_until");
  if (openGrace !== null && openGrace !== undefined) {
    return { grant: false, reason: "episode_open" };
  }

  const periodEndMs = isoToMs(prop(row, "current_period_end"));
  const untilMs = isoToMs(until);
  if (
    prop(row, "status") === "active" &&
    periodEndMs !== null &&
    untilMs !== null &&
    periodEndMs > untilMs
  ) {
    return { grant: false, reason: "stale_after_recovery" };
  }

  return { grant: true, until };
}

/**
 * PURE. The ONE authority for access (slice F1; grace added by slice grazia-4a):
 *   access_until = max( furthest current_period_end among ACCESS-GRANTING
 *                       athlete_subscriptions rows,
 *                       grace_until of ALL rows (no status filter),
 *                       latest manual grant )
 *
 * Computed from durable rows, so BOTH writers (this webhook and the RPC
 * grant_athlete_access) converge on the same value and neither can wipe the
 * other's contribution:
 *   - a Stripe event can no longer null out a coach's manual grant;
 *   - an EXPIRED prepaid row (status 'active' forever, current_period_end in the
 *     past) can no longer switch off a 'canceling' subscription still paid: the
 *     max keeps the future date. resolveAccountState is precedence-first and
 *     would pick the 'active' past row, which is exactly the bug this avoids —
 *     hence access_until does NOT ride on resolveAccountState's single winner.
 *
 * `latestGrantIso` is the granted_until of the most recent access_grants row for
 * the athlete (null if none). Comparison is by epoch, not by string, because
 * the two inputs may arrive in different ISO spellings for the same instant.
 * Returns null when nothing grants access; a past result is deliberate and reads
 * as "no access" downstream (fail-closed). No clock is consulted.
 */
export function resolveAccessUntil(rows: unknown, latestGrantIso: unknown): string | null {
  let bestMs: number | null = null;
  const consider = (value: unknown) => {
    const ms = isoToMs(value);
    if (ms === null) return;
    if (bestMs === null || ms > bestMs) bestMs = ms;
  };

  if (Array.isArray(rows)) {
    for (const row of rows) {
      // Grace is deliberately NOT behind the ACCESS_GRANTING_ROW filter: the
      // 14 days are owed even when the row itself no longer grants access (a
      // canceled or past_due subscription keeps its open window). Still a max,
      // so grace can only extend access, never shorten it. Mirrors the third
      // GREATEST term of grant_athlete_access — the two writers must converge.
      consider(prop(row, "grace_until"));
      if (!ACCESS_GRANTING_ROW.has(mapBillingStatusToRow(prop(row, "status")))) continue;
      consider(prop(row, "current_period_end"));
    }
  }
  consider(latestGrantIso);

  return bestMs === null ? null : new Date(bestMs).toISOString();
}

/** The two profile fields the access rule reads. access_until is the
 * timestamptz ISO string written by the webhook / grant RPC (see above). */
export interface AccessProfile {
  coaching_mode?: string | null;
  access_until?: string | null;
}

/**
 * PURE. The one rule that answers "is this athlete's account currently entitled
 * to anything?" — the READER of access_until, exact mirror of resolveAccessUntil
 * above (the writer). It lives here so front-end and edge functions share ONE
 * definition: src/lib/billing/access.ts re-exports it unchanged, and
 * release-autonomous-program gates the paid release on it.
 *
 * Two ways in, and BOTH are needed:
 *   - coaching_mode === 'coached' -> the coach sells and bills the relationship
 *     off-platform; there is no Stripe subscription and access_until may well
 *     be null. Without this branch every coached athlete would be locked out of
 *     the features their tier grants them, which is the opposite of the intent.
 *   - access_until STRICTLY in the future -> the athlete pays for themselves;
 *     the instant covers subscription, prepaid term, payment-failure grace and
 *     manual grant at once, because resolveAccessUntil already folds them all
 *     into the max.
 *
 * Fail-closed everywhere else: a missing profile, a null/absent/unparsable
 * access_until, and an access_until exactly equal to `now` all read as "no
 * access". subscription_status is deliberately NOT consulted anymore — it stays
 * a display cache. `now` is injected and no clock is ever read in this module,
 * so the rule stays deterministic and testable. This is a COMMERCIAL barrier
 * and a UX one — the data defense stays RLS plus the server-side checks in the
 * edge functions.
 */
export function hasActiveAccess(profile: AccessProfile | null | undefined, now: Date): boolean {
  if (!profile) return false;
  if (profile.coaching_mode === "coached") return true;
  const ms = isoToMs(profile.access_until);
  if (ms === null) return false;
  return ms > now.getTime();
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
    const periodEnd =
      typeof periodEndRaw === "string" && periodEndRaw.length > 0 ? periodEndRaw : null;

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
