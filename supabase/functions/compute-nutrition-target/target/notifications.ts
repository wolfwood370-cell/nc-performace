// supabase/functions/compute-nutrition-target/target/notifications.ts
// Athlete-facing review notification for the nutrition loop: system rows on
// public.notifications written as service_role. Best-effort BY CONTRACT — a
// failure here is logged and never surfaces as a response error: the fail-loud
// safety channel stays coach_alerts (processAthlete.raiseAlert). The message
// is neutral and identical for every gate reason (art. 9: no clinical detail).

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const FN = "[compute-nutrition-target]";

/** Contract with the athlete UI: src/features/nutrition pins this same string
 * (NUTRITION_REVIEW_NOTIFICATION_TYPE) to switch the screen into pause. */
export const NUTRITION_REVIEW_NOTIFICATION_TYPE = "nutrition_review";
export const NUTRITION_REVIEW_MESSAGE =
  "Il tuo obiettivo nutrizionale è in revisione con il tuo coach. Riceverai presto un aggiornamento.";
export const NUTRITION_REVIEW_LINK_URL = "/athlete/nutrition";

/**
 * Neutral "target under review" notification for the athlete, raised on every
 * blocking gate that also alerts the coach (alertForGate !== null — consent
 * excluded by construction). Duplicate guard: one UNREAD nutrition_review per
 * athlete already carries the pause, so an existing one skips the insert; a
 * lookup error falls through to the insert instead (a duplicate beats a lost
 * pause — same policy as raiseAlert). Works as a pair with clearAthleteReview:
 * the clean-release clear is what re-arms this guard for the next block cycle.
 */
export async function notifyAthleteReview(admin: SupabaseClient, athleteId: string): Promise<void> {
  const { data: existing, error: lookupError } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", athleteId)
    .eq("type", NUTRITION_REVIEW_NOTIFICATION_TYPE)
    .eq("read", false)
    .limit(1);
  if (!lookupError && existing && existing.length > 0) return;
  const { error } = await admin.from("notifications").insert({
    user_id: athleteId,
    sender_id: null, // system notification: the engine speaks, not the coach
    type: NUTRITION_REVIEW_NOTIFICATION_TYPE,
    message: NUTRITION_REVIEW_MESSAGE,
    link_url: NUTRITION_REVIEW_LINK_URL,
    read: false,
  });
  if (error) {
    console.error(`${FN} review notification insert failed`, { code: error.code });
  }
}

/**
 * Marks the athlete's unread nutrition_review rows as read after a CLEAN
 * release: turns the pause off now that a fresh target exists and keeps the
 * duplicate guard honest across block cycles. Idempotent (filters on
 * read=false); best-effort — an error is logged and never voids the release.
 * Known residual risk of the simple guard (flagged at slice review): if this
 * clear fails, the now-stale unread row keeps suppressing future notifies
 * until the next clean release succeeds — during that window the UI pause
 * stays off (the stale row predates the latest released_at).
 */
export async function clearAthleteReview(admin: SupabaseClient, athleteId: string): Promise<void> {
  const { error } = await admin
    .from("notifications")
    .update({ read: true })
    .eq("user_id", athleteId)
    .eq("type", NUTRITION_REVIEW_NOTIFICATION_TYPE)
    .eq("read", false);
  if (error) {
    console.error(`${FN} review notification clear failed`, { code: error.code });
  }
}
