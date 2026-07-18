// =============================================================================
// supabase/functions/invite-athlete/index.ts
// =============================================================================
// Invites an athlete by email and embeds the inviting coach's id PLUS the
// coach-supplied full_name into the invitee's user metadata, so the
// `handle_new_user` trigger can both link the athlete to the coach and
// pre-populate the profile name on signup.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-info, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InvitePayload {
  athleteEmail?: string;
  firstName?: string;
  lastName?: string;
  coachingMode?: string;
  tier?: string;
}

// Whitelists for the F0 profile fields set at invite time. Optional payload
// fields (backwards-compatible contract): absent -> not written (NULL profile
// columns, treated as 'coached' downstream); invalid non-empty values -> 400.
const COACHING_MODES = ["coached", "autonomous"] as const;
const TIERS = ["premium", "monthly"] as const;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_MAX = 60;
// eslint-disable-next-line no-control-regex
const CTRL_CHARS = /[\x00-\x1F\x7F]/g;

function sanitizeNameField(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(CTRL_CHARS, "").trim().slice(0, NAME_MAX);
}

// Escape user-controlled text before interpolating it into the email HTML —
// names are coach-supplied and would otherwise allow arbitrary markup to be
// delivered from the verified sender domain (phishing vector).
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

    if (!SUPABASE_URL) {
      console.error("invite-athlete: missing Supabase env vars");
      return json({ error: "Server misconfigured" }, 500);
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing authorization header" }, 401);
    }

    const supabaseUser = createClient(SUPABASE_URL, publishableKey(), {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return json({ error: "Unauthorized" }, 401);
    }

    const coachId = user.id;

    const { data: profile, error: profileError } = await supabaseUser
      .from("profiles")
      .select("role")
      .eq("id", coachId)
      .single();

    if (profileError) {
      console.error("invite-athlete: profile lookup failed", profileError);
      return json({ error: "Could not verify caller role" }, 500);
    }

    if (!profile || profile.role !== "coach") {
      return json({ error: "Only coaches can invite athletes" }, 403);
    }

    let payload: InvitePayload;
    try {
      payload = (await req.json()) as InvitePayload;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const athleteEmail = payload.athleteEmail?.trim().toLowerCase();
    if (!athleteEmail || !EMAIL_RE.test(athleteEmail)) {
      return json({ error: "A valid `athleteEmail` is required" }, 400);
    }

    if (user.email && athleteEmail === user.email.toLowerCase()) {
      return json({ error: "You cannot invite yourself" }, 400);
    }

    const firstName = sanitizeNameField(payload.firstName);
    const lastName = sanitizeNameField(payload.lastName);

    if (!firstName) {
      return json({ error: "`firstName` is required" }, 400);
    }
    if (!lastName) {
      return json({ error: "`lastName` is required" }, 400);
    }

    const fullName = `${firstName} ${lastName}`.trim();

    let coachingMode: string | null = null;
    if (
      payload.coachingMode !== undefined &&
      payload.coachingMode !== null &&
      payload.coachingMode !== ""
    ) {
      if (!(COACHING_MODES as readonly string[]).includes(payload.coachingMode)) {
        return json({ error: "Invalid `coachingMode`" }, 400);
      }
      coachingMode = payload.coachingMode;
    }

    let tier: string | null = null;
    if (payload.tier !== undefined && payload.tier !== null && payload.tier !== "") {
      if (!(TIERS as readonly string[]).includes(payload.tier)) {
        return json({ error: "Invalid `tier`" }, 400);
      }
      tier = payload.tier;
    }

    const supabaseAdmin = createClient(SUPABASE_URL, secretKey(), {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")?.trim();
    if (!RESEND_API_KEY) {
      return json({ error: "Email service not configured" }, 500);
    }

    const userMetadata = {
      coach_id: coachId,
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      role: "athlete",
      invited_by: coachId,
      // Read by the extended handle_new_user trigger at signup (F0 columns).
      ...(coachingMode ? { coaching_mode: coachingMode } : {}),
      ...(tier ? { tier } : {}),
    };

    // Generate the invite link WITHOUT triggering Supabase's rate-limited mailer.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: athleteEmail,
      options: { data: userMetadata },
    });

    if (linkError) {
      const message = linkError.message ?? "Failed to generate invite link";
      const lower = message.toLowerCase();

      const isAlreadyExists =
        lower.includes("already been registered") ||
        lower.includes("already registered") ||
        lower.includes("user already exists") ||
        lower.includes("email address has already");

      if (isAlreadyExists) {
        // Idempotent path: find the existing user and attach to this coach
        // if they are an unassigned athlete.
        const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
          page: 1,
          perPage: 200,
        });

        const existing = list?.users?.find((u) => u.email?.toLowerCase() === athleteEmail);

        if (!listErr && existing) {
          const { data: existingProfile } = await supabaseAdmin
            .from("profiles")
            .select("id, role, coach_id, full_name")
            .eq("id", existing.id)
            .maybeSingle();

          if (!existingProfile) {
            // Auth user without profile → create one linked to this coach
            await supabaseAdmin.from("profiles").insert({
              id: existing.id,
              full_name: fullName,
              role: "athlete",
              coach_id: coachId,
              onboarding_completed: false,
              ...(coachingMode ? { coaching_mode: coachingMode } : {}),
              ...(tier ? { tier } : {}),
            });
            return json({ success: true, email: athleteEmail, attached: true }, 200);
          }

          if (existingProfile.role === "athlete" && !existingProfile.coach_id) {
            await supabaseAdmin
              .from("profiles")
              .update({
                coach_id: coachId,
                full_name: existingProfile.full_name ?? fullName,
                // Only set when supplied: never clobber existing values with NULL.
                ...(coachingMode ? { coaching_mode: coachingMode } : {}),
                ...(tier ? { tier } : {}),
              })
              .eq("id", existing.id);
            return json({ success: true, email: athleteEmail, attached: true }, 200);
          }

          if (existingProfile.role === "athlete" && existingProfile.coach_id === coachId) {
            return json({ success: true, email: athleteEmail, alreadyLinked: true }, 200);
          }
        }

        return json(
          {
            error: "An account with this email already exists",
            code: "user_already_exists",
          },
          409,
        );
      }

      console.error("invite-athlete: generateLink failed", linkError);
      return json({ error: message }, 500);
    }

    const actionLink = linkData?.properties?.action_link;
    if (!actionLink) {
      return json({ error: "No invite link generated" }, 500);
    }

    // Send via Resend directly — no Supabase mailer rate limit.
    const subject = `${firstName ? firstName + ", " : ""}il tuo coach ti ha invitato su NC Performance Hub`;
    const html = `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#0f172a;background:#ffffff;">
        <h1 style="font-size:22px;margin:0 0 16px;">Ciao ${escapeHtml(firstName)},</h1>
        <p style="font-size:15px;line-height:1.6;color:#334155;margin:0 0 24px;">
          Il tuo coach ti ha invitato su <strong>NC Performance Hub</strong>, la piattaforma per il tuo allenamento. Clicca sul pulsante qui sotto per attivare il tuo account.
        </p>
        <p style="margin:0 0 32px;">
          <a href="${actionLink}" style="display:inline-block;background:#003e62;color:#ffffff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;font-size:15px;">
            Accetta invito
          </a>
        </p>
        <p style="font-size:13px;color:#64748b;line-height:1.6;margin:0 0 8px;">
          Oppure copia e incolla questo link nel browser:
        </p>
        <p style="font-size:12px;color:#64748b;word-break:break-all;margin:0;">${actionLink}</p>
      </div>
    `;

    const resendResp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "NC Training Systems <noreply@mail.nctrainingsystems.com>",
        to: [athleteEmail],
        subject,
        html,
      }),
    });

    if (!resendResp.ok) {
      const errBody = await resendResp.text();
      console.error("invite-athlete: Resend send failed", resendResp.status, errBody);
      return json({ error: "Failed to send invite email", details: errBody }, 502);
    }

    return json(
      {
        success: true,
        email: athleteEmail,
        fullName,
      },
      200,
    );
  } catch (err) {
    console.error("invite-athlete: unexpected error", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return json({ error: message }, 500);
  }
});
