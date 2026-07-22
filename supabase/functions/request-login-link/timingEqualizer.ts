// =============================================================================
// supabase/functions/request-login-link/timingEqualizer.ts
// =============================================================================
// Closes the TIMING side of anti-enumeration.
//
// The body of the two answers is already identical, but the work behind them
// is not: an address WITH an account costs a `generateLink` round-trip plus a
// Resend round-trip, an address WITHOUT one returns immediately after the
// lookup. Measuring the response time therefore still tells the two apart —
// enumeration by stopwatch instead of by payload.
//
// The fix pads ONLY the unknown branch, up to the latency the known branch is
// actually showing. Deliberately NOT a fixed floor applied to both: that would
// slow down the real users, who are already on the slow path. The target is
// learned (EWMA over completed known-branch requests) instead of hard-coded,
// so it follows whatever Resend and GoTrue are doing today rather than a
// number that silently goes stale.
//
// Jitter is part of the point: with a constant pad the unknown branch would
// have a suspiciously flat latency while the known one varies, and the
// VARIANCE would leak what the mean no longer does.
//
// ⚠ Not a constant-time guarantee — nothing short of a fixed floor is. It
// pushes the remaining signal below the noise of a network round-trip, and
// probing is separately bounded by the rate limiter (3 per address / 15 min).
//
// PURE: no clock and no randomness inside — both are injected by the caller.
// =============================================================================

/** Target used by a cold isolate, before any known-branch sample exists. */
export const SEED_TARGET_MS = 900;

/** EWMA weight of the newest sample. Low enough to ignore single outliers. */
export const EWMA_ALPHA = 0.2;

/** Upper bound on a single pad: never hold an isolate hostage to a bad target. */
export const MAX_PAD_MS = 3000;

/** Pad is drawn within ±15% of the target. */
export const JITTER_RATIO = 0.15;

export interface TimingEqualizer {
  /** Feed the total duration of a COMPLETED known-branch request. */
  observe(durationMs: number): void;
  /** Milliseconds the unknown branch should still wait, given its own elapsed time. */
  padMs(elapsedMs: number, random: () => number): number;
  /** Current learned target — exposed for the pins. */
  target(): number;
}

export function createTimingEqualizer(seedTargetMs: number = SEED_TARGET_MS): TimingEqualizer {
  let targetMs = seedTargetMs;

  return {
    observe(durationMs) {
      // A negative or non-finite sample would poison the average for every
      // later request: drop it rather than let one bad clock read through.
      if (!Number.isFinite(durationMs) || durationMs < 0) return;
      targetMs = EWMA_ALPHA * durationMs + (1 - EWMA_ALPHA) * targetMs;
    },

    padMs(elapsedMs, random) {
      const elapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;
      const jittered = targetMs * (1 + JITTER_RATIO * (2 * random() - 1));
      const pad = jittered - elapsed;
      if (!(pad > 0)) return 0;
      return Math.min(pad, MAX_PAD_MS);
    },

    target() {
      return targetMs;
    },
  };
}
