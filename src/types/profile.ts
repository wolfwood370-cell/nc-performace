// =============================================================================
// src/types/profile.ts
// =============================================================================
// Strongly-typed contracts for the `profiles.settings` JSONB column.
//
// Why a separate file:
//   - Supabase generates `settings: Json` (free-form) in types.ts. That
//     forces every consumer to do `as any` / `as unknown as` casts, which
//     defeats type-checking and was flagged in the coach audit as C2.
//   - Keeping the shape here (instead of in types.ts) means it survives
//     `supabase gen types` regenerations without merge conflicts.
//
// Convention: every field is optional and nullable. The DB schema makes
// no individual-key guarantees on the JSONB blob — only the column-level
// "this is some JSON" — so consumers must defend with `??` defaults.
// =============================================================================

/** Coach-managed training-status flag on the athlete profile. */
type TrainingStatus = "active" | "paused" | "archived";

/** Coarse experience level used in onboarding + analytics defaults. */
type ExperienceLevel = "beginner" | "intermediate" | "advanced";

/**
 * Per-profile JSONB blob stored at `profiles.settings`. Used by both
 * the coach-facing AthleteDetail edits and any athlete-facing
 * personalisation. Add new keys here, NOT inline at the call site.
 */
export interface ProfileSettings {
  /** Whether the athlete is actively coached (vs paused / archived). */
  training_status?: TrainingStatus;
  /** Coarse experience band. */
  experience_level?: ExperienceLevel;
  /** Free-form notes the coach keeps about this athlete. */
  coach_notes?: string;
  /** Set true by `archive_athlete` RPC. Mirrored here for client checks. */
  archived?: boolean;
  /** ISO timestamp set alongside `archived = true`. */
  archived_at?: string | null;
}

/**
 * Single source of truth for the "archived athlete" check (roster filter,
 * header badge, settings card). The flag is written exclusively by the
 * `archive_athlete` / `unarchive_athlete` RPCs: strictly-boolean `true`
 * means archived; anything else (absent, false, malformed) means active.
 * NOTE: `settings.training_status === "archived"` is a different, legacy
 * enum value and is deliberately NOT part of this criterion.
 */
export function isArchived(settings: unknown): boolean {
  return settings != null && (settings as ProfileSettings).archived === true;
}

/** ISO timestamp of archiving, if present (set by `archive_athlete`). */
export function getArchivedAt(settings: unknown): string | null {
  if (settings == null) return null;
  const value = (settings as ProfileSettings).archived_at;
  return typeof value === "string" ? value : null;
}
