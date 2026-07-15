// =============================================================================
// src/lib/program/gateStatus.ts
// =============================================================================
// Display-only mirror of the autonomous release gate (pure, no React/IO).
// It mirrors decideGate (release-autonomous-program/release/decide.ts) on the
// same structured fields so the page can label the athlete's state without
// calling the edge function — which stays the single AUTHORITATIVE gate.
// Semantics kept 1:1 with the gate (parity-tested against it in vitest):
// - red is judged on the LIVE fields (a coach clearance re-opens the athlete;
//   the immutable snapshot level alone never blocks);
// - any yellow signal blocks (yellow level OR yellow[] carried by a red
//   snapshot), reading the persisted key `yellow` with the `yellowSignals`
//   fallback exactly like parseSafetyBlock.
// No clinical detail leaves this module (art. 9): booleans only.
// =============================================================================

import { missingReleaseConsents } from "../../../supabase/functions/release-autonomous-program/release/consents.ts";
import type { ConsentRow } from "../../../supabase/functions/release-autonomous-program/release/consents.ts";

export interface AthleteGateStatus {
  coachingMode: "coached" | "autonomous" | null;
  onboardingCompleted: boolean;
  /** Release consents not currently granted (display-only mirror of the gate). */
  missingConsents: string[];
  /** Structured clinical/gate signals present -> a review is pending. */
  pendingReview: boolean;
}

export interface GateStatusProfile {
  coaching_mode: string | null;
  onboarding_completed: boolean | null;
  medical_clearance_required: boolean | null;
  red_flags: unknown;
  onboarding_data: unknown;
}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const SAFETY_LEVELS = ["green", "yellow", "red"];

export function deriveGateStatus(
  profile: GateStatusProfile,
  consents: ConsentRow[],
): AthleteGateStatus {
  // Live clinical fields — same semantics as safetyGate (clearance re-opens).
  const flags = isObj(profile.red_flags) ? profile.red_flags : {};
  const redFlagsBlocking =
    flags.medical_clearance_required === true ||
    (Array.isArray(flags.medical_yes_questions) && flags.medical_yes_questions.length > 0);

  // Persisted intake snapshot — same reading as parseSafetyBlock.
  const od = isObj(profile.onboarding_data) ? profile.onboarding_data : {};
  const intake = isObj(od.intake) ? od.intake : null;
  const safety = intake && isObj(intake.safety) ? intake.safety : null;
  const level = typeof safety?.level === "string" ? safety.level : null;
  const yellowRaw = Array.isArray(safety?.yellow)
    ? safety.yellow
    : Array.isArray(safety?.yellowSignals)
      ? safety.yellowSignals
      : [];
  const yellow = yellowRaw.filter((x): x is string => typeof x === "string");

  const pendingReview =
    profile.medical_clearance_required === true ||
    redFlagsBlocking ||
    intake === null ||
    level === null ||
    !SAFETY_LEVELS.includes(level) ||
    level === "yellow" ||
    yellow.length > 0;

  return {
    coachingMode:
      profile.coaching_mode === "autonomous" || profile.coaching_mode === "coached"
        ? profile.coaching_mode
        : null,
    onboardingCompleted: profile.onboarding_completed === true,
    missingConsents: missingReleaseConsents(consents),
    pendingReview,
  };
}
