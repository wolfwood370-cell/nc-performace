// Orchestration of the athlete deletion, extracted from index.ts so the ORDER —
// the actual contract of this function — is testable with injected fakes
// (pattern: compute-nutrition-target/target/processAthlete.ts).
//
// Mandatory order, fail-closed at every step (spec 2026-07-28):
//   authorize → read subscription rows → cancel Stripe (verified) → scrub
//   stripe_events payloads → delete profile (cascades) → delete auth user.
// Nothing is deleted before Stripe confirms the cancellation: better a customer
// not deleted than a customer deleted and still charged.

export type SubscriptionRow = {
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
};

export type SubscriptionLookup = { kind: "found"; status: string } | { kind: "missing" };

/** Stripe I/O. Both calls throw on any error other than a missing subscription. */
export interface StripePort {
  retrieveSubscription(id: string): Promise<SubscriptionLookup>;
  cancelSubscription(id: string): Promise<void>;
}

/** Database I/O. Every method throws on a DB error, EXCEPT deleteAuthUser (see doc). */
export interface DbPort {
  fetchProfile(
    athleteId: string,
  ): Promise<{ found: false } | { found: true; coachId: string | null }>;
  fetchSubscriptionRows(athleteId: string): Promise<SubscriptionRow[]>;
  /** UPDATE stripe_events SET payload='{}' on rows whose payload CONTAINS `filter`; returns rows touched. */
  scrubStripeEvents(filter: Record<string, unknown>): Promise<number>;
  deleteProfile(athleteId: string): Promise<void>;
  /** NEVER throws: failures come back as { ok:false }. notFound=true means the login user was already gone (idempotent success). */
  deleteAuthUser(athleteId: string): Promise<{ ok: true } | { ok: false; notFound: boolean }>;
}

export interface DeleteDeps {
  db: DbPort;
  stripe: StripePort;
  log: (step: string, details?: unknown) => void;
}

export type DeleteAthleteOutcome =
  | { kind: "already_deleted" }
  | { kind: "not_authorized" }
  | { kind: "stripe_cancel_failed" }
  | { kind: "stripe_events_scrub_failed" }
  | {
      kind: "auth_user_deletion_failed";
      subscriptionCanceled: boolean;
      stripeEventsScrubbed: number;
    }
  | { kind: "deleted"; subscriptionCanceled: boolean; stripeEventsScrubbed: number };

/** Stripe statuses that mean "this subscription can never charge again". */
export const TERMINAL_STRIPE_STATUSES: ReadonlySet<string> = new Set([
  "canceled",
  "incomplete_expired",
]);

/**
 * The jsonb containment filters that reach every stored Stripe payload of this
 * person. PostgREST forbids casts in filters (no payload::text LIKE), so the
 * scrub is N targeted containments instead of one text match:
 *  - data.object.customer = cus  → checkout.session / invoice / subscription / charge events
 *  - data.object.id       = cus  → customer.* events (the object IS the customer)
 *  - data.object.metadata.athlete_id → PREPAID checkout sessions, where
 *    session.customer can be null but create-checkout-session always stamps the
 *    athlete_id in metadata (approved extension, 2026-07-28).
 * A scrubbed row (payload '{}') matches none of these again: re-runs are idempotent
 * and summing the per-filter counts never counts a row twice.
 */
export function scrubFilters(customerIds: string[], athleteId: string): Record<string, unknown>[] {
  const filters: Record<string, unknown>[] = [];
  for (const cus of customerIds) {
    filters.push({ data: { object: { customer: cus } } });
    filters.push({ data: { object: { id: cus } } });
  }
  filters.push({ data: { object: { metadata: { athlete_id: athleteId } } } });
  return filters;
}

function distinctNonNull(values: (string | null)[]): string[] {
  return [...new Set(values.filter((v): v is string => v !== null && v !== ""))];
}

export async function deleteAthlete(
  deps: DeleteDeps,
  callerId: string,
  athleteId: string,
): Promise<DeleteAthleteOutcome> {
  // 1. Authorization — unchanged from v23: the athlete's coach, or the athlete
  //    themselves. Profile already gone → success, so a stale UI retrying never
  //    sees an error (deliberate idempotency).
  const profile = await deps.db.fetchProfile(athleteId);
  if (!profile.found) return { kind: "already_deleted" };

  const isCoachOfAthlete = profile.coachId === callerId;
  const isSelf = callerId === athleteId;
  if (!isCoachOfAthlete && !isSelf) return { kind: "not_authorized" };

  // 2. Read and KEEP the Stripe identifiers BEFORE deleting anything: the profile
  //    cascade removes athlete_subscriptions, so after step 5 nobody knows what to
  //    cancel anymore. One athlete can hold N rows (UNIQUE is athlete_id+plan_id),
  //    with NULL Stripe ids on placeholder rows.
  const rows = await deps.db.fetchSubscriptionRows(athleteId);
  const subscriptionIds = distinctNonNull(rows.map((r) => r.stripe_subscription_id));
  const customerIds = distinctNonNull(rows.map((r) => r.stripe_customer_id));

  // 3. Cancel on Stripe, immediately (the person is leaving NOW, not at period
  //    end), and VERIFY by re-reading. Idempotent by construction: an already
  //    terminal subscription is skipped, so a coach's retry never double-cancels.
  //    Any failure — including a missing STRIPE_SECRET_KEY when there is work to
  //    do — stops everything BEFORE any deletion.
  let subscriptionCanceled = false;
  try {
    for (const subId of subscriptionIds) {
      const before = await deps.stripe.retrieveSubscription(subId);
      if (before.kind === "missing") continue;
      if (TERMINAL_STRIPE_STATUSES.has(before.status)) continue;

      await deps.stripe.cancelSubscription(subId);

      const after = await deps.stripe.retrieveSubscription(subId);
      if (after.kind !== "found" || after.status !== "canceled") {
        deps.log("stripe cancel not confirmed", { subId, after });
        return { kind: "stripe_cancel_failed" };
      }
      subscriptionCanceled = true;
    }
  } catch (e) {
    deps.log("stripe cancel failed", { message: e instanceof Error ? e.message : String(e) });
    return { kind: "stripe_cancel_failed" };
  }

  // 4. Empty the payload of this person's stripe_events. What survives — id,
  //    stripe_event_id, type, processed_at — is exactly what the webhook's
  //    anti-double-processing needs; name and email go. Declared residue: the
  //    events EMITTED BY the cancellation itself land after this scrub (measured,
  //    not just declared, in the E2E acceptance).
  let stripeEventsScrubbed = 0;
  try {
    for (const filter of scrubFilters(customerIds, athleteId)) {
      stripeEventsScrubbed += await deps.db.scrubStripeEvents(filter);
    }
  } catch (e) {
    deps.log("stripe_events scrub failed", {
      message: e instanceof Error ? e.message : String(e),
    });
    return { kind: "stripe_events_scrub_failed" };
  }

  // 5. Delete the profile. The cascades now do what the old comment merely
  //    claimed: every row keyed to the athlete dies here (athlete_subscriptions,
  //    nutrition_plans, weekly_checkins, habits, notifications, badges,
  //    leaderboard, AI usage, support tickets, and the pre-existing cascades).
  //    Survivors BY DESIGN (decisione Nick 2026-07-28): the rows of the two
  //    append-only release ledgers — program_releases and nutrition_releases —
  //    whose athlete_id keeps a uuid that no longer points at anyone; and the
  //    scrubbed stripe_events rows. A DB error here throws: the caller answers
  //    500 and NOTHING has been deleted (the cascade is atomic with this DELETE).
  await deps.db.deleteProfile(athleteId);

  // 6. Delete the login user. No longer "not fatal": an account that can log in
  //    with no profile behind it is a broken state the coach must be told about.
  const auth = await deps.db.deleteAuthUser(athleteId);
  if (!auth.ok && !auth.notFound) {
    return { kind: "auth_user_deletion_failed", subscriptionCanceled, stripeEventsScrubbed };
  }

  return { kind: "deleted", subscriptionCanceled, stripeEventsScrubbed };
}
