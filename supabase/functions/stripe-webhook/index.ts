import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { secretKey } from "../_shared/apiKeys.ts";

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${d}`);
};

/** Map a Stripe subscription to a profile-level status update */
async function syncProfileFromSubscription(
  adminClient: ReturnType<typeof createClient>,
  stripe: Stripe,
  subscriptionId: string,
  overrideStatus?: string,
) {
  // Find the athlete_subscription row to get athlete_id
  const { data: subRow } = await adminClient
    .from("athlete_subscriptions")
    .select("athlete_id, plan_id")
    .eq("stripe_subscription_id", subscriptionId)
    .maybeSingle();

  if (!subRow) {
    logStep("No athlete_subscription row found for profile sync", { subscriptionId });
    return;
  }

  // Determine tier from the billing plan
  const { data: plan } = await adminClient
    .from("billing_plans")
    .select("name, stripe_product_id")
    .eq("id", subRow.plan_id)
    .maybeSingle();

  const tier = plan?.name?.toLowerCase() ?? "free";
  const status = overrideStatus ?? "active";

  await adminClient
    .from("profiles")
    .update({ subscription_tier: tier, subscription_status: status })
    .eq("id", subRow.athlete_id);

  logStep("Profile synced", { athleteId: subRow.athlete_id, tier, status });
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
          logStep("Missing metadata, skipping");
          break;
        }

        // Idempotency
        if (subscriptionId) {
          const { data: alreadyActive } = await adminClient
            .from("athlete_subscriptions")
            .select("id")
            .eq("stripe_subscription_id", subscriptionId)
            .eq("status", "active")
            .maybeSingle();
          if (alreadyActive) {
            logStep("Idempotent skip: subscription already active", { subscriptionId });
            break;
          }
        }

        let periodEnd: string | null = null;
        if (subscriptionId) {
          const sub = await stripe.subscriptions.retrieve(subscriptionId);
          periodEnd = new Date(sub.current_period_end * 1000).toISOString();
        }

        const { data: existing } = await adminClient
          .from("athlete_subscriptions")
          .select("id")
          .eq("athlete_id", athleteId)
          .eq("plan_id", planId)
          .maybeSingle();

        if (existing) {
          await adminClient
            .from("athlete_subscriptions")
            .update({
              status: "active",
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId,
              current_period_end: periodEnd,
            })
            .eq("id", existing.id);
        } else {
          await adminClient.from("athlete_subscriptions").insert({
            athlete_id: athleteId,
            plan_id: planId,
            status: "active",
            stripe_subscription_id: subscriptionId,
            stripe_customer_id: customerId,
            current_period_end: periodEnd,
          });
        }

        // Sync profile
        if (subscriptionId) {
          await syncProfileFromSubscription(adminClient, stripe, subscriptionId, "active");
        }

        logStep("Subscription activated", { athleteId, planId });
        break;
      }

      // ── Invoice paid (renewal) ─────────────────────────────────
      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!subscriptionId) break;

        const { data: subRecord } = await adminClient
          .from("athlete_subscriptions")
          .select("id, status, current_period_end")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();
        if (!subRecord) break;

        const sub = await stripe.subscriptions.retrieve(subscriptionId);
        const periodEnd = new Date(sub.current_period_end * 1000).toISOString();

        if (subRecord.status === "active" && subRecord.current_period_end === periodEnd) {
          logStep("Idempotent skip: renewal already up to date", { subscriptionId });
          break;
        }

        await adminClient
          .from("athlete_subscriptions")
          .update({ status: "active", current_period_end: periodEnd })
          .eq("id", subRecord.id);

        await syncProfileFromSubscription(adminClient, stripe, subscriptionId, "active");
        logStep("Renewal updated", { subscriptionId, periodEnd });
        break;
      }

      // ── Invoice payment failed (card declined) ────────────────
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : null;
        if (!subscriptionId) break;

        const { data: subRecord } = await adminClient
          .from("athlete_subscriptions")
          .select("id, status")
          .eq("stripe_subscription_id", subscriptionId)
          .maybeSingle();

        if (!subRecord || subRecord.status === "past_due") {
          logStep("Idempotent skip: already past_due or not found", { subscriptionId });
          break;
        }

        await adminClient
          .from("athlete_subscriptions")
          .update({ status: "past_due" })
          .eq("id", subRecord.id);

        await syncProfileFromSubscription(adminClient, stripe, subscriptionId, "past_due");
        logStep("Payment failed → past_due", { subscriptionId });
        break;
      }

      // ── Subscription updated (plan change, cancel_at_period_end) ──
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;
        const stripeStatus = subscription.status;
        const cancelAtPeriodEnd = subscription.cancel_at_period_end;
        const periodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        let mappedStatus: string;
        if (cancelAtPeriodEnd && stripeStatus === "active") {
          mappedStatus = "canceling";
        } else if (stripeStatus === "active") {
          mappedStatus = "active";
        } else if (stripeStatus === "past_due") {
          mappedStatus = "past_due";
        } else if (stripeStatus === "canceled") {
          mappedStatus = "canceled";
        } else {
          mappedStatus = "incomplete";
        }

        const { data: updRecord } = await adminClient
          .from("athlete_subscriptions")
          .select("id, status, current_period_end")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (
          updRecord &&
          updRecord.status === mappedStatus &&
          updRecord.current_period_end === periodEnd
        ) {
          logStep("Idempotent skip: subscription already up to date", { subId, mappedStatus });
          break;
        }

        await adminClient
          .from("athlete_subscriptions")
          .update({ status: mappedStatus, current_period_end: periodEnd })
          .eq("stripe_subscription_id", subId);

        // Sync profile — downgrade to free if canceled
        const profileStatus = mappedStatus === "canceled" ? "past_due" : mappedStatus;
        await syncProfileFromSubscription(adminClient, stripe, subId, profileStatus);

        logStep("Subscription updated", { subId, status: mappedStatus, cancelAtPeriodEnd });
        break;
      }

      // ── Subscription deleted (final cancel) ───────────────────
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const subId = subscription.id;

        const { data: delRecord } = await adminClient
          .from("athlete_subscriptions")
          .select("id, status, athlete_id")
          .eq("stripe_subscription_id", subId)
          .maybeSingle();

        if (!delRecord || delRecord.status === "canceled") {
          logStep("Idempotent skip: already canceled or not found", { subId });
          break;
        }

        await adminClient
          .from("athlete_subscriptions")
          .update({ status: "canceled" })
          .eq("stripe_subscription_id", subId);

        // Downgrade profile to free
        await adminClient
          .from("profiles")
          .update({ subscription_tier: "free", subscription_status: "past_due" })
          .eq("id", delRecord.athlete_id);

        logStep("Subscription canceled → free tier", { subId, athleteId: delRecord.athlete_id });
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
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
