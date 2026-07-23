// =============================================================================
// supabase/functions/invite-athlete/index.ts
// =============================================================================
// Invites an athlete by email and embeds the inviting coach's id PLUS the
// coach-supplied full_name into the invitee's user metadata, so the
// `handle_new_user` trigger can both link the athlete to the coach and
// pre-populate the profile name on signup.
//
// If the auth user already exists (previous invite whose email failed, ended
// up in spam, or whose action link expired), the already-exists branch
// re-attaches when possible and re-sends the invite email with a fresh
// magiclink — unless the athlete has already completed onboarding: no
// coach-triggered sign-in links to active accounts. Which action runs is
// decided by the pure helper in invite/decision.ts.
// =============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { publishableKey, secretKey } from "../_shared/apiKeys.ts";
import { inviteEmail } from "../_shared/email/templates.ts";
import { resolveOriginFromEnv } from "../_shared/origins.ts";
import { decideAlreadyExists } from "./invite/decision.ts";

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

// Builds the NC-brand invite email from the shared pure template module and
// sends it via Resend — no Supabase mailer rate limit. Used by the primary
// invite path and by the already-exists re-send. Returns null on success, or
// the error Response the caller should reply with (502; the provider detail
// stays in the server log only, never in the client body).
async function sendInvite(opts: {
  apiKey: string;
  to: string;
  firstName: string;
  actionLink: string;
}): Promise<Response | null> {
  const { subject, html } = inviteEmail({
    firstName: opts.firstName,
    actionLink: opts.actionLink,
  });

  const resendResp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "NC Training Systems <noreply@mail.nctrainingsystems.com>",
      to: [opts.to],
      subject,
      html,
    }),
  });

  if (!resendResp.ok) {
    const errBody = await resendResp.text();
    console.error("invite-athlete: Resend send failed", resendResp.status, errBody);
    return json({ error: "Failed to send invite email" }, 502);
  }

  return null;
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

    // Where the athlete lands after clicking. Derived SERVER-side from the
    // caller Origin (validated, falling back to the project default) so the
    // request contract stays unchanged — no new payload field, and a coach
    // cannot steer the invitee's destination. `/attiva` captures the session
    // and routes on: no password step anywhere in the invite flow.
    const activationRedirect = `${resolveOriginFromEnv(req.headers.get("Origin"))}/attiva`;

    // Generate the invite link WITHOUT triggering Supabase's rate-limited mailer.
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "invite",
      email: athleteEmail,
      options: { data: userMetadata, redirectTo: activationRedirect },
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
        // Re-invite path: the auth user already exists (previous invite whose
        // email failed, went to spam, or whose link expired). The lookup is
        // READ-ONLY by design: listUsers only reads the user list, whereas a
        // generateLink-based lookup would rotate the target's recovery token
        // even on outcomes that send nothing (409 included). The fresh
        // magiclink is generated later — only on resend-bound outcomes, after
        // the decision and the profile writes.
        const LOOKUP_PER_PAGE = 1000;
        const MAX_LOOKUP_PAGES = 200;

        let existing: { id: string } | undefined;
        let page: number | null = 1;
        while (page !== null && page <= MAX_LOOKUP_PAGES) {
          const { data: list, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
            page,
            perPage: LOOKUP_PER_PAGE,
          });
          if (listErr) {
            console.error("invite-athlete: existing user lookup failed", listErr.message);
            return json({ error: "Could not verify existing account" }, 500);
          }
          existing = list?.users?.find((u) => u.email?.toLowerCase() === athleteEmail);
          if (existing) break;
          // Full pagination: trust the API's nextPage when present (robust to
          // server-side perPage clamping), else stop on a short page.
          const next = (list as { nextPage?: number | null } | null)?.nextPage;
          if (next !== undefined) {
            page = next;
          } else {
            page = (list?.users?.length ?? 0) < LOOKUP_PER_PAGE ? null : page + 1;
          }
        }

        if (!existing) {
          // The invite generateLink reported the email as taken, but the full
          // scan cannot see the user: fail explicitly, never fall through.
          console.error(
            "invite-athlete: existing user lookup failed",
            "user not found after full scan",
          );
          return json({ error: "Could not verify existing account" }, 500);
        }

        const { data: existingProfile, error: existingProfileError } = await supabaseAdmin
          .from("profiles")
          .select("role, coach_id, full_name, onboarding_completed")
          .eq("id", existing.id)
          .maybeSingle();

        if (existingProfileError) {
          // Without this check a failed lookup would fall through to the
          // create branch below even when a profile actually exists.
          console.error(
            "invite-athlete: existing profile lookup failed",
            existingProfileError.message,
          );
          return json({ error: "Could not verify existing account" }, 500);
        }

        const action = decideAlreadyExists({
          profile: existingProfile
            ? {
                role: existingProfile.role,
                coach_id: existingProfile.coach_id,
                onboarding_completed: existingProfile.onboarding_completed,
              }
            : null,
          coachId,
        });

        // Generates the fresh magiclink and re-sends the invite email, then
        // replies with the given success payload. Reached ONLY from the three
        // resend-bound outcomes below, after any profile write: the no-send
        // outcomes (attach-no-resend, no-resend-active, conflict) never touch
        // the target's auth state. Send failures mirror the primary path
        // (502); the coach's retry lands on resend-pending, idempotent.
        const resendInvite = async (successBody: Record<string, unknown>): Promise<Response> => {
          const { data: relink, error: relinkError } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email: athleteEmail,
            options: { redirectTo: activationRedirect },
          });
          const resendLink = relink?.properties?.action_link;
          if (relinkError || !resendLink) {
            console.error(
              "invite-athlete: magiclink generation failed",
              relinkError?.message ?? "no link returned",
            );
            return json({ error: "No invite link generated" }, 500);
          }
          const sendFailure = await sendInvite({
            apiKey: RESEND_API_KEY,
            to: athleteEmail,
            firstName,
            actionLink: resendLink,
          });
          if (sendFailure) return sendFailure;
          return json({ success: true, email: athleteEmail, resent: true, ...successBody }, 200);
        };

        if (action === "create-and-resend") {
          // Auth user without profile → create one linked to this coach.
          const { error: insertError } = await supabaseAdmin.from("profiles").insert({
            id: existing.id,
            full_name: fullName,
            role: "athlete",
            coach_id: coachId,
            onboarding_completed: false,
            // Only set when supplied: never clobber existing values with NULL.
            ...(coachingMode ? { coaching_mode: coachingMode } : {}),
            ...(tier ? { tier } : {}),
          });
          if (insertError) {
            console.error("invite-athlete: profile insert failed", insertError.message);
            return json({ error: "Failed to link athlete" }, 500);
          }
          return await resendInvite({ attached: true });
        }

        if (action === "attach-and-resend" || action === "attach-no-resend") {
          const { error: updateError } = await supabaseAdmin
            .from("profiles")
            .update({
              coach_id: coachId,
              full_name: existingProfile?.full_name ?? fullName,
              // Only set when supplied: never clobber existing values with NULL.
              ...(coachingMode ? { coaching_mode: coachingMode } : {}),
              ...(tier ? { tier } : {}),
            })
            .eq("id", existing.id);
          if (updateError) {
            console.error("invite-athlete: profile update failed", updateError.message);
            return json({ error: "Failed to link athlete" }, 500);
          }
          if (action === "attach-no-resend") {
            // Onboarded athlete: attach only — no sign-in link is ever
            // generated for an active account.
            return json({ success: true, email: athleteEmail, attached: true, resent: false }, 200);
          }
          return await resendInvite({ attached: true });
        }

        if (action === "resend-pending") {
          // Linked but never activated: the original invite email was lost,
          // marked as spam, or its link expired → re-send with the fresh
          // link. No profile write: a re-invite never overwrites state.
          return await resendInvite({ alreadyLinked: true });
        }

        if (action === "no-resend-active") {
          // Active athlete of this coach: nothing to attach, nothing to send.
          return json(
            { success: true, email: athleteEmail, alreadyLinked: true, resent: false },
            200,
          );
        }

        // action === "conflict": other coach's athlete or non-athlete role.
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

    // firstName is guaranteed non-empty here by the 400 guard above.
    const sendFailure = await sendInvite({
      apiKey: RESEND_API_KEY,
      to: athleteEmail,
      firstName,
      actionLink,
    });
    if (sendFailure) return sendFailure;

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
