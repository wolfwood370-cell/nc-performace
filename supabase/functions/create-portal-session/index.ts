import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { secretKey } from "../_shared/apiKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: unknown) => {
  const d = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-PORTAL] ${step}${d}`);
};

// Origin whitelist — prevents Stripe billing portal return_url being
// redirected to an attacker domain. Supabase Advisor warning: untrusted
// Origin header flows directly into Stripe portal session params.
const LOVABLE_PROJECT_ID = "e1c56229-82db-4ffc-8215-23b357d4c3a9";
const ALLOWED_HOSTS: string[] = [
  // Custom production domains can be added here.
];
const DEFAULT_ORIGIN = `https://id-preview--${LOVABLE_PROJECT_ID}.lovable.app`;

function isAllowedOrigin(origin: string): boolean {
  try {
    const u = new URL(origin);
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    if (u.protocol !== "https:") return false;
    if (
      u.hostname.endsWith(`--${LOVABLE_PROJECT_ID}.lovable.app`) ||
      u.hostname === `${LOVABLE_PROJECT_ID}.lovable.app`
    ) {
      return true;
    }
    return ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // Auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header");
    const token = authHeader.replace("Bearer ", "");

    // Key swap only: this client still does BOTH user-auth validation and
    // privileged reads (registered least-privilege debt, out of this slice).
    const supabaseClient = createClient(Deno.env.get("SUPABASE_URL") ?? "", secretKey(), {
      auth: { persistSession: false },
    });

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Auth error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated");
    logStep("User authenticated", { userId: user.id });

    // Try to find stripe_customer_id from athlete_subscriptions
    const { data: sub } = await supabaseClient
      .from("athlete_subscriptions")
      .select("stripe_customer_id")
      .eq("athlete_id", user.id)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id;

    // Fallback: lookup by email in Stripe
    if (!customerId) {
      logStep("No stored customer ID, looking up by email");
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const customers = await stripe.customers.list({ email: user.email, limit: 1 });
      if (customers.data.length > 0) {
        customerId = customers.data[0].id;
      }
    }

    if (!customerId) {
      throw new Error("No Stripe customer found for this user");
    }

    logStep("Found Stripe customer", { customerId });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    // Validate caller-provided Origin against whitelist (anti-redirect-hijack).
    const requestOrigin = req.headers.get("origin");
    const origin = requestOrigin && isAllowedOrigin(requestOrigin) ? requestOrigin : DEFAULT_ORIGIN;

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/athlete/profile`,
    });

    logStep("Portal session created", { url: portalSession.url });

    return new Response(JSON.stringify({ url: portalSession.url }), {
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
