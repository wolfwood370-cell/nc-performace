// supabase/functions/stripe-webhook/index.ts
// Stripe -> DB, v22. Reads the signed event and reflects it onto
// athlete_subscriptions (one row per plan) and the profiles cache (one status per
// athlete). All the Stripe<->Postgres translation lives in _shared/billing.ts,
// pure and tested; this file is I/O and ordering only.
//
// Three invariants, each paid for by a real defect:
//
// 1. NEVER 2xx WITH FAILED DB WORK. A 2xx switches Stripe's retries off, so a lying
//    2xx is a subscription lost in silence. Every supabase-js result goes through
//    unwrap(): an error becomes a throw, hence a 500, hence a retry.
//
// 2. IDEMPOTENCY LIVES ON stripe_events.processed_at, NOWHERE ELSE. The previous
//    version guarded each handler with an early `break` ("row already active ->
//    skip"). That guard describes the FIRST effect, not the complete one: if the
//    profile write failed after the row write, the retry saw the row already
//    active, skipped, answered 200 — and the profile stayed unwritten forever.
//    Here the handlers are plain fixed-value writes, cheap and safe to re-run, and
//    the only gate is the event ledger.
//
// 3. THE PROFILE CACHE IS RECOMPUTED, NOT PATCHED. profiles holds one status/tier
//    per athlete while athlete_subscriptions holds one row per plan. Writing the
//    cache straight from the event in flight means the `deleted` of an old plan
//    switches off the plan the athlete just bought. syncProfileFromAthlete() always
//    re-reads every row of the athlete and resolves the winner.
//
// Slice F1 (2026-07-21) adds ONE output to the same machinery: profiles.access_until,
// the single authority for access, written as the MAX of two durable sources —
// the furthest access-granting subscription period end (a recurring renewal date,
// OR a PREPAID term stored in the same column, anchored on session.created so a
// retry recomputes the same instant from billing_plans.term_days) and the latest
// row of access_grants (the coach's manual grant, third source). Because both the
// webhook and the grant RPC recompute that max from durable rows, neither can wipe
// the other. access_until IS read since the 2026-07-26 predicate flip: hasActiveAccess (_shared/billing.ts) gates FE and release-autonomous-program on it.
//
// Slice grazia-4a (2026-07-28) folds ONE more durable source into that same max:
// athlete_subscriptions.grace_until — the 14-day window after a failed RENEWAL,
// opened here on invoice.payment_failed (decided by the pure graceDecision),
// cleared on invoice.payment_succeeded, counted with NO status filter so it
// survives the subscription's own closure. Same rule, mirrored by the third
// GREATEST term of grant_athlete_access: the two writers stay convergent.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import type { SupabaseClient } from "npm:@supabase/supabase-js@2.57.2";
import { secretKey } from "../_shared/apiKeys.ts";
import {
  effectiveBillingStatus,
  epochSecondsToIso,
  graceDecision,
  grantsAccess,
  mapBillingStatusToProfile,
  mapBillingStatusToRow,
  nextProfileTier,
  periodEndIso,
  prepaidTermEndIso,
  priceIdFromSubscription,
  resolveAccessUntil,
  resolveAccountState,
  subscriptionIdFromInvoice,
  tierForPlan,
} from "../_shared/billing.ts";

// Matches what createClient(url, key) actually returns for an untyped schema.
// `ReturnType<typeof createClient>` would pick the DEFAULT generics instead, which
// resolve the schema to `never` and make every row property unreachable.
type AdminClient = SupabaseClient<any, "public", "public", any, any>;

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${d}`);
};

/**
 * Invariant 1 in one place: a supabase-js error becomes a throw, and the request
 * catch turns it into a 500 so Stripe retries. Only the error CODE is logged —
 * messages can carry row content (art. 9 hygiene).
 */
function unwrap<T>(
  result: { data: T; error: { code?: string; message?: string } | null },
  step: string,
): T {
  if (result.error) {
    console.error(`[STRIPE-WEBHOOK] db error at ${step}`, { code: result.error.code });
    throw new Error(`db_error:${step}`);
  }
  return result.data;
}

/**
 * Recomputes the profiles cache from ALL the athlete's subscription rows
 * (invariant 3). The tier is written ONLY while the resolved state actually grants
 * access and the winning plan is a legitimate one; switching off is expressed by
 * the STATUS alone, never by inventing a lower tier.
 *
 * Plan legitimacy is checked HERE because create-checkout-session takes the plan_id
 * from the caller and does not verify it: now that the athlete-facing UI picks it,
 * an archived plan or another coach's plan must not be able to set a tier.
 *
 * Note: an athlete on a Stripe trial ends up with subscription_status 'active'
 * rather than 'trial' — billing_sub_status has no 'trial' label, so the nuance is
 * lost on the way through the row. Both values grant access, so nothing breaks.
 */
async function syncProfileFromAthlete(admin: AdminClient, athleteId: string): Promise<void> {
  const rows = unwrap(
    await admin
      .from("athlete_subscriptions")
      .select("status, plan_id, current_period_end, grace_until")
      .eq("athlete_id", athleteId),
    "athlete_subscriptions select for profile sync",
  );

  const state = resolveAccountState(rows);
  const subscriptionStatus = state ? mapBillingStatusToProfile(state.status) : "none";
  const entitled = grantsAccess(subscriptionStatus);

  // Latest manual grant: the SECOND durable source of access_until (the coach's
  // off-platform concession). Read here so the recompute below cannot wipe it —
  // the defect this architecture avoids. Ordered + limited, not maybeSingle: a
  // duplicate must never turn the webhook into a permanent 500. Missing/none -> null.
  const grantRows = unwrap(
    await admin
      .from("access_grants")
      .select("granted_until")
      .eq("athlete_id", athleteId)
      .order("created_at", { ascending: false })
      .limit(1),
    "access_grants latest select for sync",
  );
  const latestGrant = (grantRows?.[0]?.granted_until as string | null | undefined) ?? null;

  const profileRows = unwrap(
    await admin.from("profiles").select("tier, coach_id").eq("id", athleteId).limit(1),
    "profiles select for sync",
  );
  const profile = profileRows?.[0];
  if (!profile) {
    // The athlete_id came from Stripe metadata: a missing profile means the link is
    // broken, and silently doing nothing would hide it.
    console.error("[STRIPE-WEBHOOK] profile not found for sync", { athleteId });
    throw new Error("db_error:profile_missing");
  }

  const update: Record<string, unknown> = {
    subscription_status: subscriptionStatus,
    // access_until: the single authority for access (slice F1). It is NOT
    // resolveAccountState's single winner (which is precedence-first, so an
    // 'active' row with a PAST date would beat a 'canceling' one still paid, and
    // would ignore a coach grant). It is the MAX over the three durable sources —
    // furthest access-granting subscription period end, the grace window of ANY
    // row (grazia-4a, no status filter), and the latest manual
    // grant — computed by the pure resolveAccessUntil. Fixed value from durable
    // rows: safe to re-run (invariant 2), and neither writer can wipe the other.
    // A past/None result reads as no access downstream (fail-closed).
    access_until: resolveAccessUntil(rows, latestGrant),
  };

  if (entitled && state?.planId) {
    const planRows = unwrap(
      await admin
        .from("billing_plans")
        .select("tier, active, coach_id")
        .eq("id", state.planId)
        .limit(1),
      "billing_plans select for sync",
    );
    const plan = planRows?.[0];
    // Fail closed, including the no-coach case: an athlete with coach_id NULL has
    // no legitimate plan to point at (the "Athletes can view coach plans" policy
    // joins on that very column), so an unverifiable owner writes no tier at all.
    const ownershipOk = profile.coach_id !== null && plan?.coach_id === profile.coach_id;
    if (plan && plan.active === true && ownershipOk) {
      const tier = nextProfileTier(profile.tier, tierForPlan(plan));
      update.tier = tier;
      // Legacy text mirror: still read by the coach Business view (estimated MRR and
      // the tier column). Kept in sync with the canonical enum so that view keeps
      // behaving exactly as it does today.
      update.subscription_tier = tier;
    } else {
      logStep("Tier non scritto: piano archiviato o non del coach dell'atleta", {
        athleteId,
        planId: state.planId,
      });
    }
  }

  unwrap(
    await admin.from("profiles").update(update).eq("id", athleteId).select("id"),
    "profiles update",
  );
  logStep("Profile synced", { athleteId, subscriptionStatus, tier: update.tier ?? "invariato" });
}

/**
 * The athlete_subscriptions row linked to a Stripe subscription, or null. Ordered +
 * limited instead of maybeSingle(): a duplicate row must not turn the webhook into a
 * permanent 500 loop (the UNIQUE index makes it impossible, this is the belt to its
 * braces).
 */
async function rowForSubscription(admin: AdminClient, subscriptionId: string) {
  const rows = unwrap(
    await admin
      .from("athlete_subscriptions")
      .select("id, athlete_id, status, plan_id, grace_until")
      .eq("stripe_subscription_id", subscriptionId)
      .order("created_at", { ascending: false })
      .limit(1),
    "athlete_subscriptions select by stripe_subscription_id",
  );
  return rows?.[0] ?? null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY not set");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const body = await req.text();
    const signature = req.headers.get("Stripe-Signature");
    if (!signature) throw new Error("Missing Stripe-Signature header");

    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
    } catch (err) {
      logStep("Signature verification failed", { error: String(err) });
      return new Response(JSON.stringify({ error: "Invalid signature" }), { status: 400 });
    }

    logStep("Event received", { type: event.type, id: event.id });

    const adminClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    // ── Event ledger ────────────────────────────────────────────────────────
    // What this DOES guarantee: an event already carried to completion is never
    // executed twice — the upsert cannot insert, the lookup finds processed_at set,
    // and we answer 200 without side effects. That is the case Stripe actually
    // produces (a retry after a response was lost).
    // What it does NOT guarantee: mutual exclusion. Two deliveries arriving while
    // the first is still in flight both find processed_at NULL and both proceed, on
    // purpose — the alternative is stranding an event whose first run died halfway.
    // That is safe because the handlers are fixed-value writes (invariant 2), with
    // two residues: syncProfileFromAthlete is a read-modify-write, so concurrent runs
    // can interleave and leave the cache one recompute behind (self-healing on the
    // next event); and the payment_failed notice is a check-then-insert with no
    // UNIQUE behind it, so two OVERLAPPING deliveries of the same event can write
    // it twice (cosmetic: a duplicate bell entry, no effect on access or money —
    // sequential retries converge through the dedupe lookup). A real lease
    // (claimed_at + expiry) is the fix if either ever bites.
    const claimed = unwrap(
      await adminClient
        .from("stripe_events")
        .upsert(
          { stripe_event_id: event.id, type: event.type, payload: event },
          { onConflict: "stripe_event_id", ignoreDuplicates: true },
        )
        .select("id"),
      "stripe_events claim",
    );

    let eventRowId = claimed?.[0]?.id ?? null;
    if (!eventRowId) {
      const existing = unwrap(
        await adminClient
          .from("stripe_events")
          .select("id, processed_at")
          .eq("stripe_event_id", event.id)
          .limit(1),
        "stripe_events lookup",
      );
      const previous = existing?.[0];
      if (!previous) throw new Error("db_error:stripe_events_claim_lost");
      if (previous.processed_at) {
        logStep("Duplicate delivery, already processed", { id: event.id });
        return new Response(JSON.stringify({ received: true, duplicate: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      // processed_at NULL: a previous run died before closing. Re-running is safe —
      // the handlers below are fixed-value writes (invariant 2).
      logStep("Reprocessing an unfinished event", { id: event.id });
      eventRowId = previous.id;
    }

    switch (event.type) {
      // ── Checkout completed ─────────────────────────────────────
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const athleteId = session.metadata?.athlete_id;
        const planId = session.metadata?.plan_id;
        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : null;
        const customerId = typeof session.customer === "string" ? session.customer : null;

        logStep("checkout.session.completed", { athleteId, planId, subscriptionId });

        if (!athleteId || !planId) {
          // Not an idempotency skip: there is simply nothing to act on.
          logStep("Missing metadata, skipping");
          break;
        }

        let rowStatus = "active";
        let periodEnd: string | null = null;
        // A Stripe outage must not cost us the link between athlete, plan and
        // subscription — all of it is already in the SIGNED event. So the row is
        // written either way and the failure is re-raised afterwards: Stripe retries,
        // and the retry fills in the status and the renewal date.
        let enrichmentFailed = false;
        // Same shape for the prepaid misconfiguration below: write first, shout after.
        let prepaidTermMissing = false;
        if (subscriptionId) {
          try {
            const sub = await stripe.subscriptions.retrieve(subscriptionId);
            rowStatus = mapBillingStatusToRow(
              effectiveBillingStatus(sub.status, sub.cancel_at_period_end),
            );
            periodEnd = periodEndIso(sub);
          } catch (retrieveError) {
            enrichmentFailed = true;
            console.error("[STRIPE-WEBHOOK] subscription retrieve failed", {
              subscriptionId,
              message: retrieveError instanceof Error ? retrieveError.message : "unknown",
            });
          }
        } else {
          // PREPAID (mode: payment). There is no subscription and therefore no
          // Stripe period to read: the purchase buys a TERM, and the term is a
          // property of the plan (billing_plans.term_days, slice F1).
          //
          // The computed end is stored in the row's current_period_end — same
          // column, same meaning ("until when is this row serving the athlete"),
          // which is what lets resolveAccountState keep resolving the two shapes
          // identically, with no clock and no new branch. Before F1 this stayed
          // NULL, so a prepaid row was active FOREVER; now it fails closed by time.
          const planRows = unwrap(
            await adminClient.from("billing_plans").select("term_days").eq("id", planId).limit(1),
            "billing_plans select for prepaid term",
          );
          periodEnd = prepaidTermEndIso(session, planRows?.[0]?.term_days ?? null);
          if (!periodEnd) {
            // The plan is misconfigured (no usable term_days). Never guess a
            // duration and never grant an endless one: see the throw below.
            prepaidTermMissing = true;
            console.error("[STRIPE-WEBHOOK] prepaid plan without a usable term_days", { planId });
          }
        }

        // Upsert on the UNIQUE (athlete_id, plan_id): re-running the handler rewrites
        // the same values instead of racing a read-then-write. The two Stripe ids are
        // only included when present — a column absent from the payload is left out of
        // the ON CONFLICT update, so a session that does not expose them cannot erase
        // what create-checkout-session already stored (create-portal-session resolves
        // the customer from exactly that column).
        const row: Record<string, unknown> = {
          athlete_id: athleteId,
          plan_id: planId,
          status: rowStatus,
          current_period_end: periodEnd,
        };
        if (subscriptionId) row.stripe_subscription_id = subscriptionId;
        if (customerId) row.stripe_customer_id = customerId;

        unwrap(
          await adminClient
            .from("athlete_subscriptions")
            .upsert(row, { onConflict: "athlete_id,plan_id" })
            .select("id"),
          "athlete_subscriptions upsert",
        );

        await syncProfileFromAthlete(adminClient, athleteId);
        logStep("Subscription activated", { athleteId, planId, rowStatus });
        if (enrichmentFailed) {
          // The durable part is committed; fail loud so the retry completes the row.
          throw new Error("stripe_error:subscription_retrieve");
        }
        if (prepaidTermMissing) {
          // The row and the athlete<->plan<->payment link are committed, so nothing
          // is lost. Failing loud is deliberate: the alternative is a paid athlete
          // with no access and no alarm anywhere. This surfaces as a failing endpoint
          // in the Stripe dashboard, and once term_days is set on the plan the retry
          // (Stripe keeps trying for 3 days) completes the row on its own.
          throw new Error("config_error:plan_term_days");
        }
        break;
      }

      // ── Invoice paid (renewal) ─────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (!subscriptionId) {
          logStep("Invoice without subscription, skipping", { id: invoice.id });
          break;
        }

        const row = await rowForSubscription(adminClient, subscriptionId);
        if (!row) {
          logStep("No athlete_subscription linked to this subscription", { subscriptionId });
          break;
        }
        if (row.status === "canceled") {
          // Terminal state is absorbing: Stripe does not guarantee delivery order and
          // retries for up to 3 days, so a late invoice must not resurrect access.
          logStep("Subscription canceled: invoice ignored", { subscriptionId });
          break;
        }

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        unwrap(
          await adminClient
            .from("athlete_subscriptions")
            .update({
              status: mapBillingStatusToRow(
                effectiveBillingStatus(sub.status, sub.cancel_at_period_end),
              ),
              current_period_end: periodEndIso(sub),
              // A successful payment closes the grace episode; clearing it is
              // exactly what allows the next episode to open (grazia-4a).
              grace_until: null,
            })
            .eq("id", row.id)
            .select("id"),
          "athlete_subscriptions update on renewal",
        );

        await syncProfileFromAthlete(adminClient, row.athlete_id as string);
        logStep("Renewal recorded", { subscriptionId });
        break;
      }

      // ── Invoice payment failed (card declined) ────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = subscriptionIdFromInvoice(invoice);
        if (!subscriptionId) {
          logStep("Failed invoice without subscription, skipping", { id: invoice.id });
          break;
        }

        const row = await rowForSubscription(adminClient, subscriptionId);
        if (!row) {
          logStep("No athlete_subscription linked to this subscription", { subscriptionId });
          break;
        }
        if (row.status === "canceled") {
          logStep("Subscription canceled: failed invoice ignored", { subscriptionId });
          break;
        }

        // Every grace RULE lives in the pure graceDecision (_shared/billing.ts):
        // this branch only reads, writes and orders. Merit conditions, not
        // "already done" shortcuts: (a)(b)(c) read durable data, (d) reads the
        // authoritative CURRENT fact — is this invoice paid? That the outcome
        // flips after a recovery is the WANTED behavior (a failure re-delivered
        // after the customer paid must decide differently), not an idempotency
        // guard. The invoice is RELOADED from Stripe because the event snapshot
        // says 'open' forever and could never prove a recovery — and the row
        // cannot either: after a cycle rollover, fresh failure and recovery
        // leave it in the IDENTICAL state. Reloaded always, even on fresh
        // events: one signature beats a saved call. Stripe API down -> throw
        // -> 500 -> Stripe retries (invariant 1).
        const liveInvoice = await stripe.invoices.retrieve(invoice.id);
        const decision = graceDecision(liveInvoice, row);

        if (!decision.grant && decision.reason === "stale_after_recovery") {
          // An old event delivered after a recovery was already recorded:
          // anything written here would move truth backwards, so touch NOTHING.
          logStep("Grazia negata: evento stantio dopo incasso registrato", { subscriptionId });
          break;
        }

        // THE NOTICE COMES FIRST (Nick's call). Of the two writes, the one that
        // must never be missing is the NOTICE, not the grace: keeping access on
        // during grace costs nothing (the app and the content already exist),
        // while the only thing that truly costs — the coach's hours — is
        // protected only by the coach KNOWING. Were grace_until written first,
        // a crash before the insert would flip the retry to episode_open and
        // suppress the notice forever. Declared residue, not solved: if the row
        // update below failed PERMANENTLY after the notice went out, the coach
        // would be told of a grace never materialized — acceptable, because it
        // takes a selective and permanent DB failure, and the load-bearing fact
        // ("the payment failed") is true and delivered either way.
        if (decision.grant) {
          const profileRows = unwrap(
            await adminClient
              .from("profiles")
              .select("coach_id, full_name")
              .eq("id", row.athlete_id)
              .limit(1),
            "profiles select for payment_failed notice",
          );
          const athleteProfile = profileRows?.[0];
          const coachId = (athleteProfile?.coach_id as string | null | undefined) ?? null;
          if (!coachId) {
            // No recipient exists: throwing would make Stripe retry for days
            // over a notice that can never be delivered. Loud, then move on.
            console.error("[STRIPE-WEBHOOK] payment_failed notice without a coach", {
              athleteId: row.athlete_id,
            });
          } else {
            // The row id makes the dedupe key exact — an athlete can own
            // SEVERAL subscriptions (UNIQUE athlete_id+plan_id), so the
            // coach+athlete pair is not enough — and the window anchored on
            // the invoice emission separates one episode from the next.
            const linkUrl = `/coach/business?subscription=${row.id}`;
            const createdIso = epochSecondsToIso(liveInvoice.created);
            if (!createdIso) {
              // Unreachable by construction (grant implies a readable created):
              // a silent skip would degrade the dedupe, so fail loud instead.
              throw new Error("unreachable:grace_created_unreadable");
            }
            // Dedupe FAIL-CLOSED: a lookup error throws (500, Stripe retries),
            // never "insert just in case". Sequential retries converge here;
            // only OVERLAPPING deliveries of the same event can slip past this
            // check-then-insert and double the notice — declared residue, see
            // the ledger note above.
            const existing = unwrap(
              await adminClient
                .from("notifications")
                .select("id")
                .eq("user_id", coachId)
                .eq("type", "payment_failed")
                .eq("link_url", linkUrl)
                .gte("created_at", createdIso)
                .limit(1),
              "notifications dedupe lookup for payment_failed",
            );
            if (!existing?.[0]) {
              const fullNameRaw = athleteProfile?.full_name;
              const fullName =
                typeof fullNameRaw === "string" && fullNameRaw.trim().length > 0
                  ? fullNameRaw
                  : "un tuo atleta";
              // The date format is never a reason not to notify: the timezone
              // rendering is cosmetic, so it may fall back — never throw.
              let untilLabel: string;
              try {
                untilLabel = new Date(decision.until).toLocaleDateString("it-IT", {
                  timeZone: "Europe/Rome",
                  day: "2-digit",
                  month: "2-digit",
                  year: "numeric",
                });
              } catch (_formatError) {
                untilLabel = decision.until.slice(0, 10);
              }
              unwrap(
                await adminClient
                  .from("notifications")
                  .insert({
                    user_id: coachId,
                    sender_id: row.athlete_id,
                    type: "payment_failed",
                    message: `Pagamento non riuscito per ${fullName}. L'accesso resta attivo fino al ${untilLabel}.`,
                    link_url: linkUrl,
                    read: false,
                  })
                  .select("id"),
                "notifications insert for payment_failed",
              );
            }
          }
        }

        // Forced rather than derived: the business fact IS "a payment failed", and
        // Stripe may not have moved the subscription off 'active' yet. Fixed
        // values, safe to re-run (invariant 2): grace_until only on a granted
        // decision, untouched otherwise.
        const failureUpdate: Record<string, unknown> = { status: "past_due" };
        if (decision.grant) failureUpdate.grace_until = decision.until;
        unwrap(
          await adminClient
            .from("athlete_subscriptions")
            .update(failureUpdate)
            .eq("id", row.id)
            .select("id"),
          "athlete_subscriptions update on payment failure",
        );

        await syncProfileFromAthlete(adminClient, row.athlete_id as string);
        logStep("Payment failed, marked past_due", {
          subscriptionId,
          grace: decision.grant ? decision.until : decision.reason,
        });
        break;
      }

      // ── Subscription updated (plan change, cancel_at_period_end) ──
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        const row = await rowForSubscription(adminClient, subscriptionId);
        if (!row) {
          logStep("No athlete_subscription linked to this subscription", { subscriptionId });
          break;
        }
        if (row.status === "canceled") {
          // Same absorbing rule as the invoice branches, and for the same reason:
          // this payload is a SNAPSHOT of when it was emitted, so a retry arriving
          // after `deleted` would otherwise write 'active' back over a settled
          // cancellation — and no further event would ever correct it.
          logStep("Subscription canceled: update ignorato", { subscriptionId });
          break;
        }

        const update: Record<string, unknown> = {
          status: mapBillingStatusToRow(
            effectiveBillingStatus(subscription.status, subscription.cancel_at_period_end),
          ),
          current_period_end: periodEndIso(subscription),
        };

        // The Customer Portal can swap the price ON THE SAME subscription. Without
        // re-resolving the plan, plan_id keeps pointing at the old one and the profile
        // inherits a stale tier. An unmapped price writes no plan_id at all (fail
        // closed) rather than keeping a wrong one.
        const priceId = priceIdFromSubscription(subscription);
        if (priceId) {
          const planRows = unwrap(
            await adminClient
              .from("billing_plans")
              .select("id")
              .eq("stripe_price_id", priceId)
              .limit(1),
            "billing_plans select by price",
          );
          const planId = planRows?.[0]?.id;
          if (!planId) {
            logStep("Price non mappato a nessun piano: plan_id invariato", { subscriptionId });
          } else if (planId !== row.plan_id) {
            // Moving plan_id could collide with UNIQUE (athlete_id, plan_id): the
            // athlete may already own a row for the destination plan — an abandoned
            // checkout leaves exactly such a row behind. A 23505 here would be a
            // deterministic 500 on every retry, i.e. a webhook endpoint stuck for
            // days. A stale plan_id is the lesser harm, and it is logged.
            const clashing = unwrap(
              await adminClient
                .from("athlete_subscriptions")
                .select("id")
                .eq("athlete_id", row.athlete_id)
                .eq("plan_id", planId)
                .neq("id", row.id)
                .limit(1),
              "athlete_subscriptions clash check",
            );
            if (clashing?.[0]) {
              logStep("plan_id invariato: esiste gia' una riga dell'atleta per quel piano", {
                subscriptionId,
                planId,
              });
            } else {
              update.plan_id = planId;
            }
          }
        }

        unwrap(
          await adminClient
            .from("athlete_subscriptions")
            .update(update)
            .eq("id", row.id)
            .select("id"),
          "athlete_subscriptions update on subscription change",
        );

        await syncProfileFromAthlete(adminClient, row.athlete_id as string);
        logStep("Subscription updated", { subscriptionId, status: update.status });
        break;
      }

      // ── Subscription deleted (final cancel) ───────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subscriptionId = subscription.id;

        const row = await rowForSubscription(adminClient, subscriptionId);
        if (!row) {
          // Loud on purpose: a cancellation with no local row means the
          // checkout -> subscription link broke somewhere upstream.
          console.error("[STRIPE-WEBHOOK] deleted event with no local row", { subscriptionId });
          break;
        }

        unwrap(
          await adminClient
            .from("athlete_subscriptions")
            .update({ status: "canceled" })
            .eq("id", row.id)
            .select("id"),
          "athlete_subscriptions update on delete",
        );

        // Always re-synced, never guarded: switching off is the STATUS. The tier is
        // deliberately left alone — there is no 'free' tier to fall back to, and the
        // athlete keeps the tier the coach assigned them.
        await syncProfileFromAthlete(adminClient, row.athlete_id as string);
        logStep("Subscription canceled", { subscriptionId, athleteId: row.athlete_id });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    // Close the ledger entry. If THIS fails the work is already done and committed,
    // so answering 2xx is honest: a retry would find processed_at still NULL and
    // re-run handlers that are safe to re-run (invariant 2).
    const { error: closeError } = await adminClient
      .from("stripe_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", eventRowId);
    if (closeError) {
      console.error("[STRIPE-WEBHOOK] failed to close the event ledger", {
        code: closeError.code,
        id: event.id,
      });
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
