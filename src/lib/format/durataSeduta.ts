/**
 * Session duration for the eye, derived from the ONE stored column
 * (workout_logs.duration_seconds — A-02). Rounding lives here, in the view
 * layer, never in the datum.
 *
 * An absence stays an absence: null/undefined → null, and the caller
 * renders NOTHING — never «0 min». A real sub-minute session rounds to 0
 * and would read as an absence-as-zero, so it says «<1 min» instead.
 */
export function formatDurataSeduta(durationSeconds: number | null | undefined): string | null {
  if (durationSeconds == null || !Number.isFinite(durationSeconds) || durationSeconds < 0) {
    return null;
  }
  const minuti = Math.round(durationSeconds / 60);
  return minuti < 1 ? "<1 min" : `${minuti} min`;
}
