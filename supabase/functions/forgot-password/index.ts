// =============================================================================
// supabase/functions/forgot-password/index.ts
// =============================================================================
// Sends a password recovery email WITHOUT going through Supabase's
// rate-limited default mailer. Uses admin.generateLink({ type: 'recovery' })
// to mint the recovery link, then delivers it via Resend.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { secretKey } from "../_shared/apiKeys.ts";
import { recoveryEmail } from "../_shared/email/templates.ts";

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

// Origin whitelist — prevents Open Redirect via unvalidated `redirectTo`.
// Supabase Auth Advisor warning: attacker could pass redirectTo=https://evil.com
// and the recovery email would steer the user to evil.com after auth.
//
// Allowed:
//   - production host (Vercel) listed in ALLOWED_HOSTS
//   - localhost (http) for local development
const ALLOWED_HOSTS = ["nc-performace-mu.vercel.app"];

function isAllowedRedirect(url: string): boolean {
  try {
    const u = new URL(url);
    // Allow http://localhost[:port] for dev workflows only.
    if (u.protocol === "http:" && (u.hostname === "localhost" || u.hostname === "127.0.0.1")) {
      return true;
    }
    // Require HTTPS for any non-localhost destination.
    if (u.protocol !== "https:") return false;
    return ALLOWED_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}

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

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !RESEND_API_KEY) {
      console.error("forgot-password: missing env vars");
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

    // Validate redirectTo against the Origin whitelist (anti Open Redirect).
    // Any non-whitelisted URL is silently dropped — Supabase falls back to
    // the project Site URL configured in the Auth dashboard.
    const redirectTo =
      typeof payload.redirectTo === "string" && isAllowedRedirect(payload.redirectTo)
        ? payload.redirectTo
        : undefined;

    const supabaseAdmin = createClient(SUPABASE_URL, secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: redirectTo ? { redirectTo } : undefined,
    });

    if (linkError) {
      const message = linkError.message ?? "";
      const lower = message.toLowerCase();
      // Don't leak whether the user exists — return success silently.
      if (lower.includes("not found") || lower.includes("user")) {
        return json({ success: true }, 200);
      }
      console.error("forgot-password: generateLink failed", linkError);
      return json({ error: message || "Failed to generate link" }, 500);
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      // Same — don't leak existence.
      return json({ success: true }, 200);
    }

    // NC-brand content from the shared pure template module.
    const { subject, html } = recoveryEmail({ actionLink });

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
      console.error("forgot-password: Resend send failed", resendResp.status, errBody);
      // Detail stays in the server log only: no provider internals to clients.
      return json({ error: "Failed to send email" }, 502);
    }

    return json({ success: true }, 200);
  } catch (err) {
    console.error("forgot-password: unexpected error", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
