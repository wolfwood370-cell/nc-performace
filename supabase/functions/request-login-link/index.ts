// =============================================================================
// supabase/functions/request-login-link/index.ts
// =============================================================================
// Passwordless sign-in for EXISTING accounts: mints a magic link + its 6-digit
// code with admin.generateLink({ type: 'magiclink' }) and delivers both in one
// NC-brand email through Resend — same shape as `forgot-password`, so the
// Supabase mailer rate limit is never in the way and the sender is our own
// verified domain.
//
// INVITO-ONLY, ENFORCED IN CODE. The account existence check runs BEFORE any
// link is generated: an address with no account gets `{success:true}` and
// nothing else — no email, no user created. This does not lean on the
// "Allow new users to sign up" dashboard toggle, because
// `generateLink({type:'magiclink'})` on an unknown address has GoTrue-side
// behaviour we refuse to assume for a PUBLIC endpoint.
//
// ANTI-ENUMERATION: unknown address and delivered email return the exact same
// body. Only three things can produce a non-200: a malformed request (400), the
// rate limit (429), and a server/provider failure (5xx) — none of which depend
// on whether the account exists. The unknown branch is also padded to the
// latency the known branch is currently showing, so the two cannot be told
// apart with a stopwatch either (see timingEqualizer.ts).
//
// ⚠ KNOWN, ACCEPTED SIDE EFFECT: `generateLink(magiclink)` rotates the target's
// `recovery_token` (magiclink and recovery share that slot in GoTrue — the
// major behind fix `b41f3f4`). So requesting a login link invalidates a pending
// password-reset link FOR THE SAME USER. Acceptable here and only here: the
// action is triggered by the account holder typing their own address, and the
// existence check above means we never touch the auth state of an address that
// has no account.
//
// LOGGING: never the address, never the link, never the code — message only.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { secretKey } from "../_shared/apiKeys.ts";
import { loginLinkEmail } from "../_shared/email/templates.ts";
import { buildOriginConfig } from "../_shared/origins.ts";
import { isAllowedRedirectUrl } from "../_shared/auth/redirect.ts";
import { findUserByEmail } from "../_shared/auth/findUserByEmail.ts";
import {
  createRateLimiter,
  INSTANCE_KEY,
  PER_EMAIL_LIMIT,
  PER_INSTANCE_LIMIT,
} from "./rateLimit.ts";
import { createTimingEqualizer } from "./timingEqualizer.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Module scope on purpose: the counters must survive between requests handled
// by the same isolate. Best-effort by construction — see rateLimit.ts.
const emailLimiter = createRateLimiter(PER_EMAIL_LIMIT);
const instanceLimiter = createRateLimiter(PER_INSTANCE_LIMIT);

// Same reason: the latency target is learned across requests of one isolate.
const timing = createTimingEqualizer();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface Payload {
  email?: string;
  redirectTo?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // Both branches are measured from the same point, so the pad below compares
  // like with like.
  const startedAt = Date.now();

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !RESEND_API_KEY) {
      console.error("request-login-link: missing env vars");
      return json({ error: "Server misconfigured" }, 500);
    }

    let payload: Payload;
    try {
      payload = (await req.json()) as Payload;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const email = payload.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) {
      return json({ error: "Email non valida" }, 400);
    }

    // Instance ceiling first: when it trips, the per-address budget is left
    // untouched, so a flood of other addresses cannot burn a real user's quota.
    if (!instanceLimiter.allow(INSTANCE_KEY, startedAt) || !emailLimiter.allow(email, startedAt)) {
      return json({ error: "Troppe richieste. Riprova tra qualche minuto." }, 429);
    }

    // Same closed host list as the Stripe redirects (host unification, see
    // _shared/auth/redirect.ts). A non-allowed value is dropped silently:
    // Supabase then falls back to the project Site URL — never an open redirect.
    const originConfig = buildOriginConfig(
      Deno.env.get("ALLOWED_ORIGIN_HOSTS"),
      Deno.env.get("DEFAULT_ORIGIN_URL"),
    );
    const redirectTo =
      typeof payload.redirectTo === "string" &&
      isAllowedRedirectUrl(payload.redirectTo, originConfig.allowedHosts)
        ? payload.redirectTo
        : undefined;

    const supabaseAdmin = createClient(SUPABASE_URL, secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Read-only, BEFORE minting anything: no account → no link, no email, no
    // auth-state side effect. This is what makes the endpoint invite-only.
    const lookup = await findUserByEmail(
      (params) => supabaseAdmin.auth.admin.listUsers(params),
      email,
    );

    if (!lookup.ok) {
      // Fail-closed: an incomplete scan must never be read as "no account",
      // which would silently swallow a real user's login email.
      console.error("request-login-link: user lookup failed", lookup.error);
      return json({ error: "Could not verify account" }, 500);
    }

    if (!lookup.user) {
      // This branch skips BOTH generateLink and Resend, so without a pad it
      // answers measurably sooner than the known one and the stopwatch says
      // what the body refuses to. Padding happens here only: the known branch
      // is already slow and must not be slowed further.
      await sleep(timing.padMs(Date.now() - startedAt, Math.random));
      return json({ success: true }, 200);
    }

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (linkError) {
      console.error("request-login-link: generateLink failed", linkError.message);
      return json({ error: "Could not generate login link" }, 500);
    }

    const actionLink = linkData?.properties?.action_link;
    const code = linkData?.properties?.email_otp;
    if (!actionLink || !code) {
      // The account exists, so this is a server-side failure, not enumeration:
      // reporting it is honest and leaks nothing a caller could not already
      // trigger against any address.
      console.error("request-login-link: generateLink returned no action_link or no email_otp");
      return json({ error: "Could not generate login link" }, 500);
    }

    const { subject, html } = loginLinkEmail({ actionLink, code });

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NC Training Systems <noreply@mail.nctrainingsystems.com>",
        to: [email],
        subject,
        html,
      }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.text();
      console.error("request-login-link: Resend send failed", resendResp.status, errBody);
      // Provider detail stays in the server log: no internals to clients.
      return json({ error: "Failed to send email" }, 502);
    }

    // The sample the unknown branch pads itself to. Only completed successes
    // feed it: a 502 has its own timing and would drag the target off the
    // shape of the normal path.
    timing.observe(Date.now() - startedAt);

    return json({ success: true }, 200);
  } catch (err) {
    console.error(
      "request-login-link: unexpected error",
      err instanceof Error ? err.message : "unknown",
    );
    return json({ error: "Internal error" }, 500);
  }
});
