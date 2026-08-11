// =============================================================================
// src/lib/time/duration.ts
// =============================================================================
// Pure duration formatters for the athlete session flow.
//
//   - formatMMSS: chronometer-style "MM:SS" (zero-padded minutes, clamped
//     at 0). Single source for ActiveWorkout and ExitWorkoutDialog, which
//     used to carry byte-identical local copies.
//   - formatDurationHuman: summary-style "1h 15m" / "35m" / "34s" for the
//     post-workout debrief hero. Sub-hour durations drop seconds (same
//     granularity as the old static "1h 15m" label); sub-minute durations
//     show seconds only — a 34-second session reads "34s", never "1h 15m".
//
// Pure module on purpose: no page imports, so it stays testable under the
// node environment of vitest (no supabase client / localStorage at load).
// =============================================================================

export function formatMMSS(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function formatDurationHuman(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  if (h > 0) {
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
  }
  if (m > 0) {
    return `${m}m`;
  }
  return `${safe}s`;
}
