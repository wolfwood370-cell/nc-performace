// =============================================================================
// src/features/nutrition/types.ts
// Read-model types for the athlete "La tua nutrizione" screen (read-only
// slice). NutritionDocument / CappedBy are TYPE-ONLY imports from the
// engine's shared contract — single source, erased at build (same parity
// pattern as releaseView ↔ buildRelease).
// safety_context has NO server-side type (it is a literal object in
// compute-nutrition-target/target/processAthlete.ts): SafetyContextView
// mirrors the THREE keys this UI consumes, parsed defensively at runtime.
// =============================================================================

import type { Tables } from "@/integrations/supabase/types";
import type {
  CappedBy,
  NutritionDocument,
} from "../../../supabase/functions/_shared/nutrition/types.ts";

export type { CappedBy, NutritionDocument };

/** DB row (generated types). Named to avoid clashing with the engine's own
 *  NutritionReleaseRow (a narrower engine-internal shape). */
export type NutritionReleaseDbRow = Tables<"nutrition_releases">;

/** The safety_context keys the UI reads. Everything else in that jsonb
 *  (consent, evidence_kcal, config_*, confidence_components…) is forensic
 *  material for the coach side, never for the athlete UI. */
export interface SafetyContextView {
  capped_by: CappedBy[];
  lifecycle_referral_due: boolean;
  deficit_streak_weeks: number;
}

/** A release parsed defensively (invariant: a row written by another
 *  schema_version must degrade gracefully, never crash the screen). */
export interface ParsedRelease {
  document: NutritionDocument;
  safety: SafetyContextView;
  releasedAt: string; // ISO timestamptz (row column)
}

/**
 * Screen states, in precedence order (top wins):
 *  - safety-pause: ONLY on the real engine signal — an unread
 *    'nutrition_review' notification newer than the last release. Release
 *    AGE is NOT a pause trigger (Nick, 2026-07-17: weekly scheduling is not
 *    armed yet, an age heuristic would fake "coach reviewing" states).
 *  - empty: no release yet for this athlete.
 *  - unreadable: a release exists but its document fails the defensive parse.
 *  - release: normal render (cold_start shows as a badge, not a state).
 */
export type ScreenState =
  | { kind: "safety-pause"; lastRelease: ParsedRelease | null }
  | { kind: "empty" }
  | { kind: "unreadable" }
  | { kind: "release"; parsed: ParsedRelease };

export interface Badge {
  kind: "calibrazione" | "in-revisione";
  label: string;
}

export type BannerKind =
  | "calibrazione"
  | "solo-peso"
  | "minimo-sicurezza"
  | "graduale"
  | "graduale-fase"
  | "pausa-dieta"
  | "specialista";

export interface Banner {
  kind: BannerKind;
  text: string;
}

/** Everything the presentational components need — copy already resolved;
 *  technical flag names must never appear inside these strings. */
export interface ReleaseView {
  headline: {
    /** "Obiettivo di oggi", or "Ultimo obiettivo" when demoted in review —
     *  a paused target must never be re-labelled as today's (review finding). */
    kicker: string;
    kcal: number;
    /** "Taglio" | "Mantieni" | "Massa"; null on an unknown strategy value. */
    strategyLabel: string | null;
    dateLabel: string;
  };
  macros: { proteinG: number; carbsG: number; fatsG: number };
  badges: Badge[];
  banners: Banner[];
  details: {
    expenditureKcal: number;
    confidencePct: number;
    loggedDays: number;
    totalDays: number;
    weightKg: number;
  };
}
