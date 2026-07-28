// HTTP boundary of the athlete deletion. All the ordering — authorize, read the
// Stripe ids, cancel VERIFIED on Stripe, scrub stripe_events payloads, delete the
// profile (cascades), delete the login user — lives in delete/deleteAthlete.ts,
// pure orchestration over injected ports, tested with step-recorder fakes. This
// file only builds the real ports and maps outcomes to HTTP responses.
//
// Error contract (codes stable, user copy is the FE's job):
//   502 stripe_cancel_failed        → nothing was deleted, Stripe did not confirm
//   502 stripe_events_scrub_failed  → nothing was deleted, payload scrub failed
//   500 auth_user_deletion_failed   → profile IS deleted, login user is not
//                                     ({ profileDeleted: true } tells the FE)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";
import type { StripePort, SubscriptionRow } from "./delete/deleteAthlete.ts";
import { deleteAthlete } from "./delete/deleteAthlete.ts";
import { isResourceMissing } from "./delete/stripeErrors.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[DELETE-ATHLETE] ${step}${d}`);
};

// Lazily-built Stripe client: the key is only required when there is actually a
// subscription to cancel — and a missing key with work to do fails CLOSED
// (the module maps the throw to stripe_cancel_failed, nothing gets deleted).
function makeStripePort(): StripePort {
  let client: Stripe | null = null;
  const stripe = () => {
    if (!client) {
      const key = Deno.env.get("STRIPE_SECRET_KEY");
      if (!key) throw new Error("STRIPE_SECRET_KEY is not set");
      client = new Stripe(key, { apiVersion: "2025-08-27.basil" });
    }
    return client;
  };
  return {
    async retrieveSubscription(id) {
      try {
        const sub = await stripe().subscriptions.retrieve(id);
        return { kind: "found", status: sub.status };
      } catch (e) {
        if (isResourceMissing(e)) return { kind: "missing" };
        throw e;
      }
    },
    async cancelSubscription(id) {
      // Immediate cancellation, not at period end: the person is leaving now.
      await stripe().subscriptions.cancel(id);
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Not authenticated" }, 401);

    const userClient = createClient(SUPABASE_URL, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid session" }, 401);
    const callerId = userData.user.id;

    const { athlete_id } = await req.json();
    if (!athlete_id) return json({ error: "Missing athlete_id" }, 400);

    const admin = createClient(SUPABASE_URL, secretKey());

    const outcome = await deleteAthlete(
      {
        stripe: makeStripePort(),
        log: logStep,
        db: {
          async fetchProfile(athleteId) {
            const { data, error } = await admin
              .from("profiles")
              .select("id, coach_id")
              .eq("id", athleteId)
              .maybeSingle();
            if (error) throw new Error(`profile lookup failed: ${error.message}`);
            if (!data) return { found: false };
            return { found: true, coachId: data.coach_id };
          },
          async fetchSubscriptionRows(athleteId) {
            const { data, error } = await admin
              .from("athlete_subscriptions")
              .select("stripe_subscription_id, stripe_customer_id")
              .eq("athlete_id", athleteId);
            if (error) throw new Error(`athlete_subscriptions read failed: ${error.message}`);
            return (data ?? []) as SubscriptionRow[];
          },
          async scrubStripeEvents(filter) {
            const { data, error } = await admin
              .from("stripe_events")
              .update({ payload: {} })
              .contains("payload", filter)
              .select("id");
            // Only the code in the throw: payloads carry PII, messages could echo it.
            if (error) throw new Error(`stripe_events scrub failed: ${error.code ?? "unknown"}`);
            return data?.length ?? 0;
          },
          async deleteProfile(athleteId) {
            const { error } = await admin.from("profiles").delete().eq("id", athleteId);
            if (error) throw error;
          },
          async deleteAuthUser(athleteId) {
            // Contract with the module: NEVER throws — failures are data.
            try {
              const { error } = await admin.auth.admin.deleteUser(athleteId);
              if (!error) return { ok: true };
              if ((error as { status?: number }).status === 404) {
                return { ok: false, notFound: true };
              }
              logStep("auth user deletion failed", {
                status: (error as { status?: number }).status,
              });
              return { ok: false, notFound: false };
            } catch (e) {
              logStep("auth user deletion threw", {
                message: e instanceof Error ? e.message : String(e),
              });
              return { ok: false, notFound: false };
            }
          },
        },
      },
      callerId,
      athlete_id,
    );

    logStep("outcome", { athlete_id, kind: outcome.kind });

    switch (outcome.kind) {
      case "already_deleted":
        // Deliberate idempotency: a stale UI retrying must not see an error.
        return json({ success: true, alreadyDeleted: true });
      case "not_authorized":
        return json({ error: "Not authorized" }, 403);
      case "stripe_cancel_failed":
        return json({ error: "stripe_cancel_failed" }, 502);
      case "stripe_events_scrub_failed":
        return json({ error: "stripe_events_scrub_failed" }, 502);
      case "auth_user_deletion_failed":
        return json({ error: "auth_user_deletion_failed", profileDeleted: true }, 500);
      case "deleted":
        return json({
          success: true,
          subscriptionCanceled: outcome.subscriptionCanceled,
          stripeEventsScrubbed: outcome.stripeEventsScrubbed,
        });
    }
  } catch (e) {
    console.error("delete-athlete error:", e);
    return json({ error: (e as Error).message }, 500);
  }
});
