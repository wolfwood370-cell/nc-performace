import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";
import { stripeCadenceFor } from "../_shared/billing.ts";
import { resolveOriginFromEnv } from "../_shared/origins.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${d}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    // Inside the try on purpose: publishableKey() is fail-fast and the catch
    // below turns a missing/ambiguous key env into a clean JSON 500.
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", publishableKey());

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Parse body
    const { plan_id, athlete_id } = await req.json();
    if (!plan_id) throw new Error("plan_id is required");
    logStep("Request body", { plan_id, athlete_id });

    // The athlete_id is used when a coach generates a checkout link for an athlete
    const targetAthleteId = athlete_id || user.id;

    // Ownership check: if creating for someone else, caller must be that athlete's coach.
    if (targetAthleteId !== user.id) {
      const userClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", publishableKey(), {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: isCoach, error: rpcError } = await userClient.rpc("is_coach_of_athlete", {
        p_athlete_id: targetAthleteId,
      });
      if (rpcError || !isCoach) {
        logStep("Ownership check failed", { targetAthleteId, rpcError });
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // Fetch billing plan using service role to bypass RLS
    const adminClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey());

    const { data: plan, error: planError } = await adminClient
      .from("billing_plans")
      .select("*")
      .eq("id", plan_id)
      .single();

    if (planError || !plan) throw new Error("Plan not found");
    logStep("Plan fetched", { planName: plan.name, amount: plan.price_amount });

    // The ONE billing_interval -> Stripe cadence translation (shared map,
    // fail-closed): a plan whose cadence this build does not know is a 400,
    // never a silent monthly price. Resolved BEFORE any Stripe call so no
    // product is ever created for a sale we cannot price.
    const cadence = stripeCadenceFor(plan.billing_interval);
    if (cadence === null) {
      logStep("Unsupported billing_interval", { planId: plan.id });
      return new Response(JSON.stringify({ error: "plan_interval_unsupported" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Init Stripe
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Get or create Stripe Price
    let stripePriceId = plan.stripe_price_id;

    if (!stripePriceId) {
      logStep("No stripe_price_id, creating product + price on Stripe");

      // Create Stripe product
      const product = await stripe.products.create({
        name: plan.name,
        description: plan.description || undefined,
        metadata: { plan_id: plan.id, coach_id: plan.coach_id },
      });

      // Create Stripe price. Cadence comes ONLY from the shared map above:
      // the old local ternary silently priced every unknown interval as
      // monthly, which is exactly the defect the map removed.
      const priceParams: Stripe.PriceCreateParams = {
        product: product.id,
        unit_amount: plan.price_amount,
        currency: plan.currency,
      };

      if (cadence.kind === "recurring") {
        priceParams.recurring = cadence.recurring;
      }

      const price = await stripe.prices.create(priceParams);
      stripePriceId = price.id;

      // Save back to DB
      await adminClient
        .from("billing_plans")
        .update({ stripe_price_id: price.id, stripe_product_id: product.id })
        .eq("id", plan.id);

      logStep("Stripe product/price created", { productId: product.id, priceId: price.id });
    }

    // Get athlete email for checkout
    const { data: athleteProfile } = await adminClient
      .from("profiles")
      .select("full_name")
      .eq("id", targetAthleteId)
      .single();

    // Find or lookup Stripe customer by athlete's auth email
    const {
      data: { user: athleteUser },
    } = await adminClient.auth.admin.getUserById(targetAthleteId);
    const athleteEmail = athleteUser?.email;

    let customerId: string | undefined;
    if (athleteEmail) {
      const customers = await stripe.customers.list({ email: athleteEmail, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    // Create Checkout session
    // Origin whitelist rationale: see _shared/origins.ts (anti-redirect-hijack).
    const origin = resolveOriginFromEnv(req.headers.get("origin"));

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      customer_email: customerId ? undefined : athleteEmail || undefined,
      line_items: [{ price: stripePriceId!, quantity: 1 }],
      mode: cadence.kind === "recurring" ? "subscription" : "payment",
      success_url: `${origin}/athlete/dashboard?payment=success`,
      cancel_url: `${origin}/athlete/profile?payment=cancelled`,
      metadata: {
        athlete_id: targetAthleteId,
        plan_id: plan.id,
        coach_id: plan.coach_id,
      },
    };

    const session = await stripe.checkout.sessions.create(sessionParams);
    logStep("Checkout session created", { sessionId: session.id, url: session.url });

    // Placeholder row for the pending checkout. Idempotent by construction now that
    // athlete_subscriptions carries UNIQUE (athlete_id, plan_id): a double click (or a
    // second tab) hits the conflict and does nothing, where the previous
    // read-then-insert had no transaction and could produce two rows — enough to make
    // every later lookup ambiguous and, with the fail-fast webhook, to turn a paid
    // subscription into a 500 loop.
    // ignoreDuplicates rather than a merge: an existing row may already be 'active',
    // and restarting a checkout must never push it back to 'incomplete'.
    const { error: placeholderError } = await adminClient.from("athlete_subscriptions").upsert(
      {
        athlete_id: targetAthleteId,
        plan_id: plan.id,
        status: "incomplete",
        stripe_customer_id: customerId || null,
      },
      { onConflict: "athlete_id,plan_id", ignoreDuplicates: true },
    );
    // Logged, not thrown: the Stripe session already exists and the athlete must get
    // its URL. The row is a convenience — the webhook writes the real one on payment.
    if (placeholderError) {
      logStep("Placeholder subscription row not written", { code: placeholderError.code });
    }

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: msg });
    return new Response(JSON.stringify({ error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
