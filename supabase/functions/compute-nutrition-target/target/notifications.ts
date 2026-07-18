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
/** COALESCE floor for the release-aware guard: with no release yet, any
 * unread pause notification dedupes (first block cycle). */
const NO_RELEASE_FLOOR = "1970-01-01T00:00:00Z";

/**
 * Latest released_at for the athlete, the anchor of the release-aware guard.
 * null = no release yet, or lookup error: the guard then degrades to "any
 * unread suppresses" (the pre-release-aware behavior) — conservative toward
 * duplicates, never toward spam.
 */
export async function fetchLatestReleasedAt(
  admin: SupabaseClient,
  athleteId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("nutrition_releases")
    .select("released_at")
    .eq("athlete_id", athleteId)
    .order("released_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error(`${FN} latest release lookup failed`, { code: error.code });
    return null;
  }
  return data?.released_at ?? null;
}

/**
 * Neutral "target under review" notification for the athlete, raised on every
 * blocking gate that also alerts the coach (alertForGate !== null — consent
 * excluded by construction). RELEASE-AWARE duplicate guard: the insert is
 * skipped only when an UNREAD nutrition_review NEWER than the latest release
 * exists — the same predicate the athlete UI uses for the pause. A stale
 * unread left behind by a failed clear (created_at older than the release)
 * does NOT suppress: the notification restarts on the next block cycle. A
 * lookup error falls through to the insert (a duplicate beats a lost pause —
 * same policy as raiseAlert). clearAthleteReview remains the bell hygiene.
 */
export async function notifyAthleteReview(
  admin: SupabaseClient,
  athleteId: string,
  latestReleasedAt: string | null,
): Promise<void> {
  const { data: existing, error: lookupError } = await admin
    .from("notifications")
    .select("id")
    .eq("user_id", athleteId)
    .eq("type", NUTRITION_REVIEW_NOTIFICATION_TYPE)
    .eq("read", false)
    .gt("created_at", latestReleasedAt ?? NO_RELEASE_FLOOR)
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
 * release: bell hygiene — no "in review" left hanging once the review is
 * over. Since the guard above is release-aware, this clear is no longer the
 * only defense: even if it fails, the stale unread cannot suppress the next
 * block cycle's notification. Idempotent (filters on read=false);
 * best-effort — an error is logged and never voids the release.
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
